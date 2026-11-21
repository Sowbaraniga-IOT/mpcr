"""Rules shared by the API views and the simulator: who may do what, which standards apply,
and what happens to a deviation at each step of its two-level approval."""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from . import params
from ..models import (
    ADMIN_ONLY,
    CHANGE_PERMISSIONS,
    READ_ONLY_ROLES,
    Deviation,
    Machine,
    Notification,
    ParameterLog,
    Recipe,
    Role,
    Setting,
    User,
    slot_key,
    slot_label,
)

class Refused(Exception):
    """A request the rules don't allow; the message is shown to the user."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


class PasswordChangeRequired(Refused):
    """The account must pick a new access code before it can do anything else."""

    def __init__(self):
        super().__init__('Choose a new access code to continue.', 403)


# ---------- Plant clock ----------
# The production day starts at 06:00, so 02:00 still belongs to yesterday (hour 26).


def local_now():
    return timezone.localtime()


def production_date(now=None):
    now = now or local_now()
    return (now - timedelta(days=1)).date() if now.hour < 6 else now.date()


def shift_hour(now=None):
    now = now or local_now()
    hour = now.hour + now.minute / 60
    return hour + 24 if hour < 6 else hour


def clock(now=None):
    return (now or local_now()).strftime('%H:%M')


# ---------- Shifts and reading slots (Shift Master) ----------
# A slot is an hour of the production day: 6 … <30, so 06:30 is 6.5 and 02:00 after midnight is 26.
# The same calculation is in src/data/shifts.js.
DAY_MINUTES = 24 * 60
DAY_START = 6 * 60


def to_production_hour(minute_of_day):
    return (minute_of_day + DAY_MINUTES if minute_of_day < DAY_START else minute_of_day) / 60


def parse_slot(text):
    try:
        hour = float(text)
    except (TypeError, ValueError):
        raise Refused(f'“{text}” is not a reading time')
    return int(hour) if hour.is_integer() else hour


def shift_rules():
    return Setting.get('shiftRules', {}) or {}


def active_shifts():
    """The shifts readings are due in, with their times from Shift_Master."""
    from .shift_master import with_master_times

    return with_master_times(active_only=True)


def duration_of(shift):
    return (shift.end - shift.start) % DAY_MINUTES or DAY_MINUTES


def in_shift(shift, hour):
    return (round(hour * 60) - shift.start) % DAY_MINUTES < duration_of(shift)


def shift_of(hour, shifts=None):
    """The active shift a slot falls in, or None."""
    return next((s for s in (active_shifts() if shifts is None else shifts) if in_shift(s, hour)), None)


def slots_of(shift, rules=None):
    """One slot per interval from the shift start (or from the first interval, if "first reading at
    shift start" is off), never at or past the shift end."""
    rules = shift_rules() if rules is None else rules
    first = 0 if rules.get('firstAtStart', True) else shift.interval
    return sorted(to_production_hour((shift.start + t) % DAY_MINUTES) for t in range(first, duration_of(shift), shift.interval))


def plant_slots(shifts=None, rules=None):
    """Every reading slot of the production day, across the active shifts."""
    rules = shift_rules() if rules is None else rules
    return sorted({h for s in (active_shifts() if shifts is None else shifts) for h in slots_of(s, rules)})


def next_slot(now_hour, slots):
    return next((s for s in slots if s > now_hour), None)


# ---------- Permissions ----------

_roles_cache = {'at': None, 'map': {}}


def role_permissions():
    """The role matrix, re-read at most every 2 s (it changes rarely, and is checked on every request)."""
    now = timezone.now()
    if not _roles_cache['at'] or (now - _roles_cache['at']).total_seconds() > 2:
        _roles_cache['map'] = {r.key: set(r.permissions) for r in Role.objects.all()}
        _roles_cache['at'] = now
    return _roles_cache['map']


def forget_roles():
    _roles_cache['at'] = None


def can(user, permission):
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if user.role in READ_ONLY_ROLES and permission in CHANGE_PERMISSIONS:
        return False
    if permission in ADMIN_ONLY and user.role != 'Admin':
        return False
    if permission in ADMIN_ONLY:
        return True
    return permission in role_permissions().get(user.role, set())


def can_access_machine(user, machine_id):
    return user.access == 'all' or not user.access or machine_id in user.access


def name_of(user):
    return user.username.lower()


# ---------- Standards ----------


def recipe_for(machine):
    return Recipe.objects.filter(machine_id=machine.id, part_no=machine.part_no, mold=machine.mold).first()


def active_rows_for(machine):
    recipe = recipe_for(machine)
    active = recipe and recipe.versions.filter(status='active').first()
    return active.rows if active else params.default_rows(machine)


def rows_for(machine):
    """Resolved rows (limits, digits) the machine's readings are checked against."""
    return params.sections(active_rows_for(machine))


# ---------- Notifications ----------
# perms — everyone holding one of these permissions for the machine; users — named people.
# Holders of 'monitor' see every event. Nobody is told about their own action.


def user_key(name):
    n = str(name or '').lower()
    hit = User.objects.filter(username__iexact=n).first() or User.objects.filter(name__iexact=n).first()
    return hit.username if hit else n


def notify(kind, log, d, row, actor=None, note=''):
    author = [user_key(d.by)] if d.by else []
    l1 = [user_key(d.l1['by'])] if d.l1 and d.l1.get('by') else []
    routes = {
        'detected': {'perms': ['record', 'approve'], 'users': []},
        'reason': {'perms': ['approve'], 'users': []},
        'l1': {'perms': ['approveFinal'], 'users': author},
        'rejected': {'perms': ['record'], 'users': author + l1},
        'approved': {'perms': [], 'users': author + l1},
    }
    Notification.objects.create(
        ts=timezone.now(),
        type=kind,
        machine_id=log.machine_id,
        date=log.date,
        dev_id=d.dev_id,
        param=row['label'],
        detail=f"{params.format_reading(row, d.value)} {row['unit']} · {params.describe(row, d.value)}",
        note=note or '',
        actor=name_of(actor) if actor else 'system',
        actor_name=name_of(actor) if actor else 'system',
        actor_role=actor.role if actor else 'Auto',
        to=routes[kind],
    )


def visible_to(user, n):
    me = name_of(user)
    if n.actor == me:
        return False
    if can(user, 'monitor') or me in n.to.get('users', []):
        return True
    return can_access_machine(user, n.machine_id) and any(can(user, p) for p in n.to.get('perms', []))


def needs_action(user, n, status_now):
    if not status_now:
        return False
    me = name_of(user)
    if n.type == 'detected':
        return can(user, 'record') and status_now == 'open'
    if n.type == 'rejected':
        return (can(user, 'record') or me in n.to.get('users', [])) and status_now == 'rejected'
    if n.type == 'reason':
        return can(user, 'approve') and status_now == 'awaiting'
    if n.type == 'l1':
        return can(user, 'approveFinal') and status_now == 'supervised' and me not in n.to.get('users', [])
    return False


def notifications_for(user, limit=200):
    today = production_date()
    status = {
        (d.log.machine_id, d.dev_id): d.status
        for d in Deviation.objects.filter(log__date=today).select_related('log')
    }
    me = name_of(user)
    out = []
    for n in Notification.objects.all()[:600]:
        if not visible_to(user, n):
            continue
        item = n.to_dict()
        item['unread'] = me not in n.read_by
        item['action'] = n.date == today and needs_action(user, n, status.get((n.machine_id, n.dev_id)))
        out.append(item)
        if len(out) >= limit:
            break
    return out


# ---------- Recording readings ----------


def log_for(machine, date):
    log, _ = ParameterLog.objects.get_or_create(machine=machine, date=date)
    return log


def clean_values(rows, values):
    """Keep only the rows' keys; numbers as numbers, modes as text."""
    out = {}
    for row in rows:
        if row.get('na'):
            continue
        v = values.get(row['key'])
        if v is None or v == '':
            continue
        if 'text' in row:
            out[row['key']] = str(v)
        else:
            try:
                out[row['key']] = float(v) if not isinstance(v, (int, float)) or isinstance(v, bool) else v
            except (TypeError, ValueError):
                raise Refused(f"{row['label']}: “{v}” is not a number")
    return out


CLOCK_TOLERANCE_MINUTES = 2  # a PC's clock may differ a little from the server's
AUTO_RECORDER = 'opc-ua'  # recorded_by of readings the machine reported itself


def check_entry_time(date, hour, already_recorded):
    """When a person may save a reading (data collectors are not limited), by the Shift Master:
    never for a later production day or later than the next reading time; a new reading must be at
    a reading time, and one past its time (plus the shift's grace period) or on an earlier day needs
    the back-dated rule on. Changing a saved reading is "Edit after submit", not back-dating."""
    today = production_date()
    now_hour = shift_hour()
    shifts, rules = active_shifts(), shift_rules()
    slots = plant_slots(shifts, rules)
    due = next_slot(now_hour, slots)
    label = f'{date:%d.%m.%Y} {slot_label(hour)}'
    if date > today or (date == today and hour > now_hour and (due is None or hour > due)):
        raise Refused(f'{label} is still in the future; readings can only be saved once due.')
    if already_recorded:
        return
    if hour not in slots:
        raise Refused(f'{slot_label(hour)} is not a reading time in the Shift Master.')
    shift = shift_of(hour, shifts)
    grace = (shift.grace if shift and rules.get('grace', True) else 0) + CLOCK_TOLERANCE_MINUTES
    late = date < today or (now_hour - hour) * 60 > grace
    if late and not rules.get('backDated'):
        raise Refused(f'{label} was missed. Back-dated entries are switched off in the Shift Master.')


@transaction.atomic
def record_hour(machine, date, hour, values, user=None, edit=False):
    """Save one hour's readings. A first save needs 'record'; a change to a saved hour needs
    'editAfterSubmit'. Deviations whose value didn't change keep their reason and approvals;
    a value outside its limits starts a new open deviation.

    Without a user the readings come from the machine (OPC UA). A slot only the machine has
    filled still counts as open for a person: their first save needs only 'record', and the
    machine's values they didn't send are kept."""
    if not 6 <= hour < 30:
        raise Refused('Reading times run 06:00 → 06:00 (6 … below 30)')
    log = ParameterLog.objects.select_for_update().get(pk=log_for(machine, date).pk)
    key = slot_key(hour)
    before = log.recorded.get(key, {})
    auto_only = key in log.recorded and log.recorded_by.get(key, {}).get('by') == AUTO_RECORDER
    if user:
        already = key in log.recorded and not auto_only
        if already and not can(user, 'editAfterSubmit'):
            raise Refused(f'{slot_label(hour)} is already recorded. Editing needs “Edit after submit”.', 403)
        if not already and not can(user, 'record'):
            raise Refused('Your role may not record readings.', 403)
        check_entry_time(date, hour, already)
        if auto_only:
            values = {**before, **values}
    rows = rows_for(machine)
    clean = clean_values(rows, values)

    existing = {d.key: d for d in log.deviations.filter(hour=hour)}
    found = []
    for row in rows:
        v = clean.get(row['key'])
        old = existing.get(row['key'])
        if old and old.value == v:
            continue  # unchanged: keeps its reason and approvals
        if old:
            old.delete()
        if params.check(row, v):
            found.append((Deviation.objects.create(log=log, hour=hour, key=row['key'], value=v), row))

    log.recorded[key] = clean
    if user:
        # values still exactly as the machine reported them stay marked as automatic
        prev = log.recorded_by.get(key, {})
        auto = [k for k in (prev.get('auto') or []) if auto_only and k in clean and clean[k] == before.get(k)]
        kept = {'machineLimits': prev['machineLimits']} if 'machineLimits' in prev else {}
        log.recorded_by[key] = {'by': name_of(user), 'at': clock(), **({'auto': auto} if auto else {}), **kept}
    else:
        log.recorded_by[key] = {'by': AUTO_RECORDER, 'at': clock(), 'auto': sorted(clean)}
    log.save()
    for d, row in found:
        notify('detected', log, d, row, actor=user)
    if auto_only:  # completing the machine's reading: only a changed machine value is an edit
        changed = [r for r in rows if not r.get('na') and r['key'] in before and str(before[r['key']]) != str(clean.get(r['key']))]
    else:
        changed = [r for r in rows if not r.get('na') and str(before.get(r['key'])) != str(clean.get(r['key']))] if before else []
    return log, changed, before


APPROVAL_STEPS = {
    'awaiting': {'level': 1, 'permission': 'approve', 'who': 'Supervisor'},
    'supervised': {'level': 2, 'permission': 'approveFinal', 'who': 'Manager'},
}


def can_review(user, d):
    step = APPROVAL_STEPS.get(d.status)
    if not step or not can(user, step['permission']):
        return False
    # The final approval has to come from someone other than the level-1 supervisor.
    return step['level'] == 1 or not d.l1 or d.l1.get('by') != name_of(user)


def deviation_of(machine, date, dev_id):
    hour, _, key = dev_id.partition('-')
    d = Deviation.objects.select_related('log').filter(log__machine=machine, log__date=date, hour=parse_slot(hour), key=key).first()
    if not d:
        raise Refused('That deviation no longer exists (the reading was edited).', 404)
    return d


def row_of(machine, key):
    return next((r for r in rows_for(machine) if r['key'] == key), {'label': key, 'unit': '', 'na': True})


@transaction.atomic
def give_reason(machine, date, dev_id, reason, lot, user):
    if not can(user, 'record'):
        raise Refused('Your role may not enter reasons.', 403)
    d = deviation_of(machine, date, dev_id)
    if d.status not in ('open', 'rejected', 'awaiting'):
        raise Refused('This deviation is already being approved.')
    if not str(reason or '').strip():
        raise Refused('Enter a reason.')
    d.status, d.reason, d.lot = 'awaiting', reason.strip(), (lot or '').strip()
    d.by, d.role, d.at, d.admin_note = name_of(user), user.role, clock(), None
    d.save()
    notify('reason', d.log, d, row_of(machine, d.key), actor=user)
    return d


@transaction.atomic
def review(machine, date, dev_id, decision, comment, master_change, user):
    d = deviation_of(machine, date, dev_id)
    if not can_review(user, d):
        raise Refused('You can’t approve this deviation at its current step.', 403)
    step = APPROVAL_STEPS[d.status]
    at = clock()
    me = name_of(user)
    d.reviews = [*d.reviews, {'decision': decision, 'comment': comment, 'by': me, 'at': at, 'level': step['level']}]
    row = row_of(machine, d.key)
    if decision == 'reject':
        # Back to the operator, who edits the reason and sends it again from level 1.
        d.status, d.l1 = 'rejected', None
        d.admin_by, d.admin_at, d.admin_comment, d.admin_note = me, at, comment, comment
        d.rejected_by, d.master_change = step['who'], False
        d.save()
        notify('rejected', d.log, d, row, actor=user, note=comment)
    elif step['level'] == 1:
        d.status, d.l1, d.admin_note = 'supervised', {'by': me, 'at': at, 'comment': comment}, None
        d.save()
        notify('l1', d.log, d, row, actor=user, note=comment)
    else:
        d.status, d.approved_at, d.master_change, d.admin_note = 'closed', at, bool(master_change), None
        d.admin_by, d.admin_at, d.admin_comment = me, at, comment
        d.save()
        notify('approved', d.log, d, row, actor=user, note=comment)
    return d


# ---------- Dashboard summary ----------


def today_summary(machine_ids=None):
    """Per machine: the last log time today ('HH:MM' or '—') and today's deviations."""
    today = production_date()
    logs = ParameterLog.objects.filter(date__in=[today, today - timedelta(days=1)]).prefetch_related('deviations')
    if machine_ids is not None:
        logs = logs.filter(machine_id__in=machine_ids)
    last, devs, yesterday = {}, {}, set()
    for log in logs:
        if log.date == today:
            if log.recorded_by:
                last[log.machine_id] = max(v['at'] for v in log.recorded_by.values())
            devs[log.machine_id] = [d.to_dict() for d in log.deviations.all()]
        elif log.recorded:
            yesterday.add(log.machine_id)
    return {'date': today, 'lastLog': last, 'deviations': devs, 'yesterday': yesterday}


def machines_for(user):
    """The machines this user may see: all, or their machine-access list (User Management)."""
    return [m for m in Machine.objects.all() if can_access_machine(user, m.id)]


def user_directory(viewer):
    """Everyone's account for user managers; for everyone else only what screens need to name
    people (shift supervisors, who entered a reason): no emails or employee ids."""
    users = User.objects.order_by('id')
    if can(viewer, 'users'):
        return [u.to_dict() for u in users]
    return [{**{k: v for k, v in u.to_dict().items() if k in ('username', 'name', 'role', 'shift')}} if u.pk != viewer.pk else u.to_dict() for u in users]


def machine_dicts(machines=None):
    machines = list(machines if machines is not None else Machine.objects.all())
    s = today_summary([m.id for m in machines])
    out = []
    for m in machines:
        devs = s['deviations'].get(m.id, [])
        last = s['lastLog'].get(m.id) or ('Yesterday' if m.id in s['yesterday'] else '—')
        out.append(m.to_dict(last_log=last, deviations=sum(d['status'] != 'closed' for d in devs)))
    return out, s
