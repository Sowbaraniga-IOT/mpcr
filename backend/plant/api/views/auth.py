"""Sign-in, sign-out and the first load after sign-in."""
from datetime import timedelta
from math import ceil

from django.conf import settings
from django.core.cache import cache
from django.db.models import F, Q
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated

from integrations.fanuc import euromap77

from ...services import logic, params
from ..authentication import token_expired
from ...services.logic import Refused
from ...models import AuditEntry, MachineImage, Mold, Part, Recipe, Role, SessionToken, Setting, Shift, User
from .common import body, ok


def find_user(login_id):
    """'operator', 'operator@mpcr.com' or 'EMP-0004' all find the operator."""
    v = str(login_id or '').strip()
    return User.objects.filter(Q(username__iexact=v) | Q(email__iexact=v) | Q(employee_id__iexact=v)).first()


# ---------- Brute-force protection (settings LOGIN_*) ----------


def client_ip(request):
    """The browser's address. Behind LOGIN_TRUSTED_PROXIES proxies it is read from X-Forwarded-For."""
    hops = settings.LOGIN_TRUSTED_PROXIES
    forwarded = [a.strip() for a in request.META.get('HTTP_X_FORWARDED_FOR', '').split(',') if a.strip()]
    if hops and len(forwarded) >= hops:
        return forwarded[-hops]
    return request.META.get('REMOTE_ADDR', '')


def ip_key(ip):
    return f'login-failures:{ip}'


def record_failure(ip, user, now):
    """One more wrong sign-in for this address, and for the account if the id exists."""
    window = settings.LOGIN_LOCK_MINUTES * 60
    if not cache.add(ip_key(ip), 1, window):
        try:
            cache.incr(ip_key(ip))
        except ValueError:  # expired in between
            cache.set(ip_key(ip), 1, window)
    if user:
        User.objects.filter(pk=user.pk).update(failed_logins=F('failed_logins') + 1)
        user.refresh_from_db(fields=['failed_logins'])
        if user.failed_logins >= settings.LOGIN_MAX_FAILURES:
            User.objects.filter(pk=user.pk).update(failed_logins=0, locked_until=now + timedelta(minutes=settings.LOGIN_LOCK_MINUTES))


def too_many(reason, seconds):
    minutes = max(1, ceil(seconds / 60))
    response = ok({'detail': f'{reason} Try again in {minutes} min, or ask an admin to reset your access code.'}, 429)
    response['Retry-After'] = str(ceil(seconds))
    return response


@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    data = body(request)
    ip = client_ip(request)
    if cache.get(ip_key(ip), 0) >= settings.LOGIN_IP_MAX_FAILURES:
        return too_many('Too many wrong sign-ins from this computer.', settings.LOGIN_LOCK_MINUTES * 60)

    user = find_user(data.get('loginId'))
    now = timezone.now()
    # A locked account is refused before the access code is even checked, so guessing gets nowhere.
    if user and user.locked_until and user.locked_until > now:
        return too_many('This account is locked after too many wrong access codes.', (user.locked_until - now).total_seconds())

    if not user or not user.has_usable_password() or not user.check_password(str(data.get('password') or '')):
        record_failure(ip, user, now)
        raise Refused('Operator ID or access code is incorrect.', 401)
    if user.failed_logins or user.locked_until:
        User.objects.filter(pk=user.pk).update(failed_logins=0, locked_until=None)
    if not user.can_login:
        raise Refused('This account is switched off. Ask an admin to turn it back on.', 403)
    user.last_login = timezone.now()
    if user.status == 'invited':
        user.status = 'active'
    user.save(update_fields=['last_login', 'status'])
    # A token of its own for this sign-in (this device); the user's expired ones are cleared away.
    for old in SessionToken.objects.filter(user=user):
        if token_expired(old):
            old.delete()
    token = SessionToken.objects.create(user=user, device=request.META.get('HTTP_USER_AGENT', '')[:200])
    return ok({'token': token.key, 'user': user.to_dict()})


@api_view(['POST'])
@permission_classes([IsAuthenticated])  # works while a new access code is still required
def logout(request):
    """Signs out this device only; the user's other sign-ins carry on."""
    if isinstance(request.auth, SessionToken):
        request.auth.delete()
    return ok()


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    return ok(request.user.to_dict())


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password(request):
    """The signed-in user changes their own access code (required after an admin asks for a reset)."""
    user = request.user
    data = body(request)
    current, new = str(data.get('current') or ''), str(data.get('password') or '')
    if not user.check_password(current):
        raise Refused('The current access code is wrong.')
    if len(new) < 6:
        raise Refused('Access codes are at least 6 characters.')
    if new == current:
        raise Refused('Choose a code different from the current one.')
    user.set_password(new)
    user.force_reset = False
    user.save()
    # The user's other devices are signed out; this one carries on.
    SessionToken.objects.filter(user=user).exclude(pk=getattr(request.auth, 'pk', None)).delete()
    return ok()


def images_doc():
    doc = {'machines': {}, 'models': {}}
    for img in MachineImage.objects.all():
        entry = {'src': img.src, 'fit': img.fit} if img.src else None
        doc['machines' if img.scope == 'machine' else 'models'][img.key] = entry
    return doc


def matrix_doc():
    return {r.key: r.permissions for r in Role.objects.all()}


def shift_master_doc():
    return {'shifts': [s.to_dict() for s in Shift.objects.all()], 'rules': Setting.get('shiftRules', {})}


@api_view(['GET'])
def bootstrap(request):
    """Everything the app keeps in memory, in one request after sign-in."""
    user = request.user
    # Only the machines this user may access, and their sheets.
    machines, summary = logic.machine_dicts(logic.machines_for(user))
    from ...models import ParameterLog

    ids = [m['id'] for m in machines]
    today_logs = {
        log.machine_id: log.to_dict()
        for log in ParameterLog.objects.filter(date=summary['date'], machine_id__in=ids).prefetch_related('deviations')
    }
    return ok(
        {
            'user': user.to_dict(),
            'serverTime': timezone.now().isoformat(),
            'users': logic.user_directory(user),
            'matrix': matrix_doc(),
            'machines': machines,
            'images': images_doc(),
            'parts': [p.to_dict() for p in Part.objects.all()],
            'molds': [m.to_dict() for m in Mold.objects.all()],
            'shiftMaster': shift_master_doc(),
            'recipes': [r.to_dict() for r in Recipe.objects.prefetch_related('versions')],
            'today': {'date': summary['date'].isoformat(), 'logs': today_logs},
            'notifications': logic.notifications_for(user),
            'auditCount': AuditEntry.objects.count(),
            'euromap77': euromap77_doc(),
        }
    )


def euromap77_doc():
    """Which EUROMAP 77 node each parameter and live value comes from (integrations/fanuc/euromap77.py)."""
    codes = [d['code'] for d in params.PARAM_DEFS]
    codes += [make(i)['code'] for _, top, make in params.SERIES for i in range(1, top + 1)]
    return {
        'root': euromap77.ROOT,
        'params': euromap77.catalogue(dict.fromkeys(codes)),
        'live': euromap77.LIVE,
        'machineInfo': euromap77.MACHINE_INFO,
    }
