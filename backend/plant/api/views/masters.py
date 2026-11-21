"""Settings pages: machine, shift and parameter masters, users and role permissions, audit trail."""
import base64
import binascii
import re

from django.conf import settings
from django.db import transaction
from django.db.models import Max
from django.utils import timezone
from rest_framework.decorators import api_view

from integrations.fanuc.euromap77 import from_euromap

from ...services import logic, params
from ...services import shift_master as shift_times
from ..authentication import end_sessions
from ...services.logic import Refused
from ...models import (
    PERMISSION_KEYS,
    ROLES,
    AuditEntry,
    Machine,
    MachineImage,
    Mold,
    Part,
    Recipe,
    RecipeVersion,
    Role,
    Setting,
    Shift,
    User,
)
from .auth import images_doc, matrix_doc, shift_master_doc
from .common import body, ok, require, require_admin, whole_number

# ---------- Machines ----------

MACHINE_ID = re.compile(r'^[A-Z0-9][A-Z0-9-]{1,15}$', re.I)


def clean_machine(data):
    if not MACHINE_ID.match(str(data.get('id', ''))):
        raise Refused('Machine code: letters, digits and "-", e.g. J10-73')
    if not str(data.get('name', '')).strip():
        raise Refused('Give the machine a name')
    try:
        if int(data.get('clamp')) <= 0 or int(data.get('bay')) <= 0:
            raise ValueError
    except (TypeError, ValueError):
        raise Refused('Tonnage and bay must be positive numbers')
    if data.get('dataSource', 'manual') not in ('manual', 'auto'):
        raise Refused('Data source is manual or auto')
    check_mold_and_part(data['id'], str(data.get('mold') or ''), str(data.get('partNo') or ''))
    return data


def check_mold_and_part(machine_id, mold_no, part_no):
    """The current mold and part must be in the masters (blank = nothing mounted), and a mold that
    lists its machines must list this one — the same choices the Machine Master screen offers."""
    if mold_no:
        mold = Mold.objects.filter(no=mold_no).first()
        if not mold:
            raise Refused(f'{machine_id}: mold {mold_no} is not in the mold master. Add the mold first.')
        if mold.machines and machine_id not in mold.machines:
            raise Refused(f'{machine_id}: mold {mold_no} is set up for {", ".join(mold.machines)} only.')
    if part_no and not Part.objects.filter(part_no=part_no).exists():
        raise Refused(f'{machine_id}: part {part_no} is not in the parts master. Add the part first.')


@api_view(['GET', 'POST'])
def machines(request):
    if request.method == 'GET':
        return ok(logic.machine_dicts(logic.machines_for(request.user))[0])
    require(request.user, 'machineMaster')
    data = clean_machine(request.data)
    if Machine.objects.filter(id=data['id']).exists():
        raise Refused(f"{data['id']} already exists", 409)
    m = Machine(id=data['id'], position=(Machine.objects.aggregate(p=Max('position'))['p'] or 0) + 1, status='off')
    m.set_fields(data, Machine.MASTER_FIELDS)
    m.save()
    return ok(logic.machine_dicts([m])[0][0], 201)


@api_view(['PUT'])
def machine(request, machine_id):
    require(request.user, 'machineMaster')
    m = Machine.objects.filter(id=machine_id).first()
    if not m:
        raise Refused(f'{machine_id} is not in the machine master', 404)
    data = clean_machine({**m.to_dict(), **request.data, 'id': machine_id})
    m.set_fields(data, Machine.MASTER_FIELDS)
    m.save()
    return ok(logic.machine_dicts([m])[0][0])


@api_view(['POST'])
def machines_bulk(request):
    """Excel upload: add or update many machines at once."""
    require(request.user, 'machineMaster')
    items = request.data.get('machines') or []
    with transaction.atomic():
        top = Machine.objects.aggregate(p=Max('position'))['p'] or 0
        saved = []
        for data in items:
            clean_machine(data)
            m = Machine.objects.filter(id=data['id']).first()
            if not m:
                top += 1
                m = Machine(id=data['id'], position=top, status='off')
            m.set_fields(data, Machine.MASTER_FIELDS)
            m.save()
            saved.append(m)
    return ok(logic.machine_dicts(saved)[0])


@api_view(['POST'])
def telemetry(request, machine_id):
    """Live values from the OPC UA gateway (or any data collector) for one machine.
    Needs a staff account, e.g. one made with `manage.py createsuperuser`."""
    if not request.user.is_staff:
        raise Refused('Only a data-collector (staff) account may send telemetry.', 403)
    m = Machine.objects.filter(id=machine_id).first()
    if not m:
        raise Refused(f'{machine_id} is not in the machine master', 404)
    # EUROMAP 77 names (CycleTime, InjectionTime, MachineMode …) and MPCR's own field names
    # are both accepted; an MPCR name sent alongside wins.
    data = {**from_euromap(request.data), **{k: v for k, v in request.data.items() if k in Machine.TELEMETRY_FIELDS}}
    m.set_fields(data, Machine.TELEMETRY_FIELDS)
    m.telemetry_at = timezone.now()
    m.save()
    return ok(logic.machine_dicts([m])[0][0])


@api_view(['GET'])
def live(request):
    """What the dashboard polls: telemetry, last log and today's deviations for each machine, and the Shift Master (so a changed shift reaches every open screen)."""
    machines, summary = logic.machine_dicts(logic.machines_for(request.user))
    return ok({'date': summary['date'].isoformat(), 'machines': machines, 'deviations': summary['deviations'], 'shiftMaster': shift_master_doc()})


# A photo as the image dialog stores it: a base64 data URL of a JPEG, PNG or WEBP.
# (No SVG: it can carry script.) The bytes must really be that kind of image.
PHOTO_URL = re.compile(r'^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$')
MAGIC = {'jpeg': [b'\xff\xd8\xff'], 'png': [b'\x89PNG\r\n\x1a\n'], 'webp': [b'RIFF']}


def clean_photo(image):
    """{ src, fit } → cleaned copy; null means "removed" (show the upload box)."""
    if image is None:
        return None
    if not isinstance(image, dict):
        raise Refused('A photo is { src, fit } or null')
    fit = image.get('fit') or 'cover'
    if fit not in ('cover', 'contain'):
        raise Refused('fit is cover or contain')
    src = image.get('src')
    match = PHOTO_URL.match(src) if isinstance(src, str) else None
    if not match:
        raise Refused('A photo must be a JPEG, PNG or WEBP image (data:image/…;base64,…)')
    limit = settings.MAX_PHOTO_BYTES
    if len(match.group(2)) * 3 // 4 > limit:
        raise Refused(f'The photo is larger than {limit // (1024 * 1024)} MB')
    try:
        raw = base64.b64decode(match.group(2), validate=True)
    except (binascii.Error, ValueError):
        raise Refused('The photo is not valid base64')
    kind = match.group(1)
    if not any(raw.startswith(m) for m in MAGIC[kind]) or (kind == 'webp' and raw[8:12] != b'WEBP'):
        raise Refused(f'The photo’s content is not a {kind.upper()} image')
    return {'src': src, 'fit': fit}


def image_target(item):
    scope, key = item.get('scope'), item.get('key')
    if scope not in ('machine', 'model') or not isinstance(key, str) or not key or len(key) > 60:
        raise Refused('Each photo needs scope machine or model and a key')
    return scope, key


@api_view(['POST'])
def images(request):
    """{ set: [{ scope, key, image: { src, fit } | null }], drop: [{ scope, key }] }
    Photos are machine-master data: changing them needs "Machine master"."""
    require(request.user, 'machineMaster')
    data = body(request)
    drops, sets = data.get('drop') or [], data.get('set') or []
    if not isinstance(drops, list) or not isinstance(sets, list) or not all(isinstance(i, dict) for i in drops + sets):
        raise Refused('“set” and “drop” are lists of { scope, key, … }')
    # Check everything first, so a bad photo saves nothing.
    cleaned = [(*image_target(item), clean_photo(item.get('image'))) for item in sets]
    gone = [image_target(item) for item in drops]
    with transaction.atomic():
        for scope, key in gone:
            MachineImage.objects.filter(scope=scope, key=key).delete()
        for scope, key, image in cleaned:
            MachineImage.objects.update_or_create(scope=scope, key=key, defaults={'src': image and image['src'], 'fit': image['fit'] if image else 'cover'})
    return ok(images_doc())


# ---------- Parts & molds ----------


@api_view(['POST'])
def parts_bulk(request):
    require(request.user, 'parameters', 'machineMaster')
    for p in request.data.get('parts') or []:
        if not str(p.get('partNo') or '').strip():
            continue
        defaults = {k: p[c] or '' for c, k in [('partName', 'part_name'), ('material', 'material'), ('customer', 'customer')] if c in p}
        Part.objects.update_or_create(part_no=str(p['partNo']).strip(), defaults=defaults)
    return ok([p.to_dict() for p in Part.objects.all()])


@api_view(['POST'])
def molds_bulk(request):
    require(request.user, 'parameters', 'machineMaster')
    for m in request.data.get('molds') or []:
        if not str(m.get('no') or '').strip():
            continue
        defaults = {k: m[c] for c, k in [('description', 'description'), ('cavities', 'cavities'), ('partNo', 'part_no'), ('machines', 'machines'), ('life', 'life')] if c in m}
        if 'cavities' in defaults:
            defaults['cavities'] = int(defaults['cavities'] or 1)
        Mold.objects.update_or_create(no=str(m['no']).strip(), defaults=defaults)
    return ok([m.to_dict() for m in Mold.objects.all()])


# ---------- Shift master ----------


# The choices the Shift Master screen offers (src/data/shiftMaster.js).
INTERVALS = [30, 60, 120, 240]
GRACE_OPTIONS = [0, 5, 10, 15, 30]
RULE_FLAGS = ['firstAtStart', 'grace', 'overdueAlert', 'backDated']


def is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def clean_shift_master(data):
    """{ shifts: [...], rules: {...} } → cleaned copies, or Refused naming the first problem."""
    shifts, rules = data.get('shifts'), data.get('rules', {})
    if not isinstance(shifts, list) or not shifts:
        raise Refused('Keep at least one shift')
    if not isinstance(rules, dict):
        raise Refused('“rules” must be an object')
    out, codes = [], set()
    for n, s in enumerate(shifts, 1):
        if not isinstance(s, dict):
            raise Refused(f'Shift {n} must be an object')
        code = str(s.get('code') or '').strip().upper()
        where = f'Shift {code or n}'
        if not re.fullmatch(r'[A-Z0-9]', code):
            raise Refused(f'{where}: code must be one letter or digit, e.g. "A" (Shift_Master.Shift_Code)')
        if code in codes:
            raise Refused(f'{where}: the code is used twice')
        codes.add(code)
        name = str(s.get('name') or '').strip()
        if not name or len(name) > 40:
            raise Refused(f'{where}: give it a name (up to 40 characters)')
        for f in ('start', 'end'):
            if not is_int(s.get(f)) or not 0 <= s[f] < 24 * 60:
                raise Refused(f'{where}: {f} must be a time of day (minutes 0 … 1439)')
        if s['start'] == s['end']:
            raise Refused(f'{where}: start and end are the same time')
        interval, grace = s.get('interval', 60), s.get('grace', 10)
        if interval not in INTERVALS or not is_int(interval):
            raise Refused(f'{where}: readings every {", ".join(map(str, INTERVALS))} minutes')
        if grace not in GRACE_OPTIONS or not is_int(grace):
            raise Refused(f'{where}: grace is one of {", ".join(map(str, GRACE_OPTIONS))} minutes')
        if not isinstance(s.get('active', True), bool):
            raise Refused(f'{where}: active is true or false')
        supervisor = str(s.get('supervisor') or '')
        if supervisor and not User.objects.filter(username=supervisor).exists():
            raise Refused(f'{where}: supervisor {supervisor} is not a user')
        unit_code = str(s.get('unitCode') or '').strip()
        if len(unit_code) > 10:
            raise Refused(f'{where}: unit code is up to 10 characters')
        out.append({'code': code, 'name': name, 'unit_code': unit_code, 'start': s['start'], 'end': s['end'], 'interval': interval, 'grace': grace, 'supervisor': supervisor, 'active': s.get('active', True)})
    clean_rules = {}
    for k, v in rules.items():
        if k in RULE_FLAGS:
            if not isinstance(v, bool):
                raise Refused(f'Rule {k} is true or false')
        elif k == 'overdueMinutes':
            if not is_int(v) or not 0 <= v <= 240:
                raise Refused('overdueMinutes must be 0 … 240')
        else:
            raise Refused(f'Unknown rule {k}')
        clean_rules[k] = v
    return out, clean_rules


@api_view(['GET', 'PUT'])
def shift_master(request):
    if request.method == 'PUT':
        require(request.user, 'shiftMaster')
        shifts, rules = clean_shift_master(body(request))
        with transaction.atomic():
            codes = [s['code'] for s in shifts]
            Shift.objects.exclude(code__in=codes).delete()
            shift_times.keep_only(codes)
            for i, s in enumerate(shifts):
                # Times → Shift_Master; reading settings → Shift (start/end kept there as a copy).
                shift_times.save_times(s['code'], s['start'], s['end'], s['unit_code'])
                Shift.objects.update_or_create(code=s['code'], defaults={**{f: s[f] for f in Shift.FIELDS if f != 'code'}, 'position': i})
            Setting.put('shiftRules', rules)
    return ok(shift_master_doc())


# ---------- Users & role permissions ----------

USER_FIELDS = {'name': 'name', 'email': 'email', 'employeeId': 'employee_id', 'role': 'role', 'shift': 'shift', 'access': 'access', 'status': 'status', 'canLogin': 'can_login', 'forceReset': 'force_reset'}


def check_editor(editor, u, data, is_new):
    """Who may change whom. Holding "User management" lets a Manager look after the plant's
    accounts, but never reach the Admin level: only an Admin creates, edits or appoints admins.
    Nobody changes their own role or switches their own login off."""
    becomes_admin = data.get('role') == 'Admin'
    if editor.role != 'Admin' and (becomes_admin or (not is_new and u.role == 'Admin')):
        raise Refused('Only an admin may create, change or appoint admin accounts.', 403)
    if not is_new and u.pk == editor.pk:
        if 'role' in data and data['role'] != u.role:
            raise Refused('You can’t change your own role.', 403)
        if data.get('canLogin') is False:
            raise Refused('You can’t switch off your own login.', 403)


def save_user(u, data, is_new, editor):
    for key, field in USER_FIELDS.items():
        if key in data:
            setattr(u, field, data[key])
    if u.role not in ROLES:
        raise Refused(f'Unknown role {u.role}')
    for field, label in [('email', 'Email'), ('employee_id', 'Employee ID')]:
        if User.objects.filter(**{f'{field}__iexact': getattr(u, field)}).exclude(pk=u.pk).exists():
            raise Refused(f'{label} {getattr(u, field)} is already used by another account', 409)
    password = data.get('password')
    if password:
        if len(password) < 6:
            raise Refused('Access codes are at least 6 characters.')
        u.set_password(password)
        # A code set by someone else is temporary: its owner picks their own at the next sign-in.
        u.force_reset = u.pk != editor.pk and bool(data.get('forceReset', True))
    # A new access code, or an explicit unlock, ends a lock from too many wrong sign-ins.
    if password or data.get('unlock') is True:
        u.failed_logins, u.locked_until = 0, None
    if not password and is_new:
        u.set_unusable_password()  # can't sign in until an admin sets one
    # Keep at least one admin who can sign in.
    if not (u.role == 'Admin' and u.can_login) and not User.objects.filter(role='Admin', can_login=True).exclude(pk=u.pk).exists():
        raise Refused('Keep at least one admin who can log in.')
    u.save()
    # A new access code set by an admin signs the person out everywhere: whoever knew the old one is out.
    if password and not is_new:
        end_sessions(u)
    return u


@api_view(['GET', 'POST'])
def users(request):
    if request.method == 'GET':
        return ok(logic.user_directory(request.user))
    require(request.user, 'users')
    username = str(request.data.get('username') or '').strip().lower()
    if not re.match(r'^[a-z0-9._-]{2,40}$', username):
        raise Refused('Username: 2–40 letters, digits, ".", "_" or "-"')
    if User.objects.filter(username__iexact=username).exists():
        raise Refused(f'{username} already exists', 409)
    data = body(request)
    check_editor(request.user, None, data, True)
    return ok(save_user(User(username=username), data, True, request.user).to_dict(), 201)


@api_view(['PUT'])
def user(request, username):
    require(request.user, 'users')
    u = User.objects.filter(username__iexact=username).first()
    if not u:
        raise Refused(f'No user {username}', 404)
    data = body(request)
    check_editor(request.user, u, data, False)
    return ok(save_user(u, data, False, request.user).to_dict())


@api_view(['PUT'])
def roles(request):
    """{ matrix: { Admin: [...], Manager: [...] } } — admins only: the matrix decides what every
    role may do, so whoever edits it could otherwise grant themselves anything."""
    require_admin(request.user)
    matrix = body(request).get('matrix') or {}
    if not isinstance(matrix, dict) or not all(isinstance(v, list) for v in matrix.values()):
        raise Refused('“matrix” maps each role to a list of permissions')
    with transaction.atomic():
        for role in ROLES:
            if role in matrix:
                keys = [k for k in matrix[role] if k in PERMISSION_KEYS]
                if role == 'Admin' and 'users' not in keys:
                    keys.append('users')  # an admin can always get back into user management
                Role.objects.update_or_create(key=role, defaults={'permissions': keys})
    logic.forget_roles()
    return ok(matrix_doc())


# ---------- Parameter master ----------


def recipe_or_404(recipe_id):
    r = Recipe.objects.filter(id=recipe_id).prefetch_related('versions').first()
    if not r:
        raise Refused(f'No recipe {recipe_id}', 404)
    return r


def clean_rows(rows):
    if not isinstance(rows, list) or not rows:
        raise Refused('A recipe needs its parameter rows')
    out, codes = [], set()
    for r in rows:
        if not isinstance(r, dict) or not params.def_of(str(r.get('code'))):
            raise Refused(f"Unknown parameter code {r.get('code') if isinstance(r, dict) else r}")
        if r['code'] in codes:
            raise Refused(f"{r['code']} is listed twice")
        codes.add(r['code'])
        if r.get('check') not in ('RANGE', 'EXACT', 'MAX ONLY', 'MIN ONLY', 'TEXT', 'NA'):
            raise Refused(f"{r['code']}: unknown check type {r.get('check')}")
        row = {k: r.get(k) for k in ('code', 'check', 'lower', 'std', 'upper', 'applies')}
        check_limits(row)
        out.append(row)
    return out


def is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def check_limits(r):
    """The limit rules the Excel template states (and the import applies, src/data/recipes.js parseRow)."""
    code, check, lower, std, upper = r['code'], r['check'], r['lower'], r['std'], r['upper']
    if check == 'NA' or not r.get('applies'):
        return
    if check == 'TEXT':
        if not isinstance(std, str) or not std.strip():
            raise Refused(f'{code}: TEXT needs a standard value')
        return
    if not is_number(std):
        raise Refused(f'{code}: the standard value must be a number')
    for name, v in (('lower', lower), ('upper', upper)):
        if v is not None and not is_number(v):
            raise Refused(f'{code}: the {name} limit must be a number')
    if check == 'EXACT' and (lower not in (None, std) or upper not in (None, std)):
        raise Refused(f'{code}: EXACT has no tolerance; lower and upper equal the standard')
    if check == 'RANGE' and (lower is None or upper is None):
        raise Refused(f'{code}: RANGE needs lower and upper limits')
    if check == 'MAX ONLY' and (upper is None or lower is not None):
        raise Refused(f'{code}: MAX ONLY needs an upper limit and no lower limit')
    if check == 'MIN ONLY' and (lower is None or upper is not None):
        raise Refused(f'{code}: MIN ONLY needs a lower limit and no upper limit')
    if (lower is not None and lower > std) or (upper is not None and upper < std):
        raise Refused(f'{code}: the standard {std} is outside its own limits ({lower if lower is not None else "—"} … {upper if upper is not None else "—"})')


def stamp(user):
    return {'created_by': user.username.lower(), 'created_at': timezone.localdate()}


def save_draft(recipe, rows, user, note):
    draft = recipe.versions.filter(status='draft').first()
    if draft:
        draft.rows, draft.note = rows, note or draft.note
        for k, v in stamp(user).items():
            setattr(draft, k, v)
        draft.save()
    else:
        latest = recipe.versions.order_by('-v').first()
        RecipeVersion.objects.create(recipe=recipe, v=(latest.v if latest else 0) + 1, status='draft', rows=rows, note=note, **stamp(user))


def next_recipe_id():
    top = max([int(r[2:]) for r in Recipe.objects.values_list('id', flat=True) if r[2:].isdigit()] or [0])
    return f'R-{top + 1:03d}'


@api_view(['POST'])
def recipes(request):
    """New recipe for a Machine + Part + Mold, as draft v1 — or a draft on the one that exists (copy)."""
    require(request.user, 'parameters')
    d = request.data
    combo = {'machine_id': d.get('machineId'), 'part_no': d.get('partNo'), 'mold': d.get('mold')}
    if not all(combo.values()):
        raise Refused('Machine, part no. and mold are all needed')
    rows = clean_rows(d.get('rows'))
    with transaction.atomic():
        recipe = Recipe.objects.filter(**combo).first()
        if recipe:
            save_draft(recipe, rows, request.user, d.get('note', ''))
        else:
            wanted = d.get('id')
            rid = wanted if wanted and not Recipe.objects.filter(id=wanted).exists() else next_recipe_id()
            recipe = Recipe.objects.create(id=rid, **combo)
            RecipeVersion.objects.create(recipe=recipe, v=1, status='draft', rows=rows, note=d.get('note', ''), **stamp(request.user))
    return ok(recipe_or_404(recipe.id).to_dict(), 201)


@api_view(['POST'])
def recipe_draft(request, recipe_id):
    require(request.user, 'parameters')
    recipe = recipe_or_404(recipe_id)
    with transaction.atomic():
        save_draft(recipe, clean_rows(request.data.get('rows')), request.user, request.data.get('note', ''))
    return ok(recipe_or_404(recipe_id).to_dict())


@api_view(['POST'])
def recipe_approve(request, recipe_id):
    require_admin(request.user)
    recipe = recipe_or_404(recipe_id)
    draft = recipe.versions.filter(status='draft').first()
    if not draft:
        raise Refused('There is no draft to approve')
    today = timezone.localdate()
    with transaction.atomic():
        recipe.versions.filter(status='active').update(status='archived')
        draft.status, draft.approved_by, draft.approved_at, draft.effective_from = 'active', request.user.username.lower(), today, today
        draft.save()
    return ok(recipe_or_404(recipe_id).to_dict())


@api_view(['POST'])
def recipe_reject(request, recipe_id):
    require_admin(request.user)
    recipe = recipe_or_404(recipe_id)
    draft = recipe.versions.filter(status='draft').first()
    if not draft:
        raise Refused('There is no draft to reject')
    draft.status, draft.approved_by, draft.approved_at = 'rejected', request.user.username.lower(), timezone.localdate()
    draft.note = request.data.get('note') or draft.note
    draft.save()
    return ok(recipe_or_404(recipe_id).to_dict())


# ---------- Audit trail ----------


# Area → the permissions that make changes there (any one of them).
AUDIT_AREAS = {
    'Shift master': ['shiftMaster'],
    'Machine master': ['machineMaster'],
    'Parameter master': ['parameters', 'approve', 'approveFinal'],  # a final approval may propose a new standard
    'User management': ['users'],
    'Deviation': ['approve', 'approveFinal'],
    'Parameter log': ['record', 'editAfterSubmit'],
}


@api_view(['GET', 'POST'])
def audit_trail(request):
    if request.method == 'POST':
        # The screens report the change they just made; the server stamps who and when, and only
        # accepts an entry for an area the user may change (a Viewer can't write any).
        data = body(request)
        area, text = str(data.get('area') or ''), str(data.get('text') or '').strip()
        if area not in AUDIT_AREAS:
            raise Refused(f'Unknown audit area “{area[:40]}”')
        if not text or len(text) > 2000:
            raise Refused('An audit entry needs a text of up to 2000 characters')
        require(request.user, *AUDIT_AREAS[area])
        AuditEntry.objects.create(by=request.user.username.upper(), role=request.user.role, area=area, text=text)
        return ok(None, 201)
    require(request.user, 'audit')
    limit = whole_number(request.query_params.get('limit'), 'limit', 500, 0, 5000)
    return ok([a.to_dict() for a in AuditEntry.objects.all()[:limit]])
