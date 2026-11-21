"""Hourly parameter log, deviations and their approval, notifications and the report."""
from datetime import timedelta

from rest_framework.decorators import api_view

from ...services import logic, params
from ...services.logic import Refused
from ...models import Deviation, Machine, Notification, ParameterLog, slot_key, slot_label
from .common import audit, body, ok, parse_date, require, whole_number


def machine_for(user, machine_id):
    m = Machine.objects.filter(id=machine_id).first()
    if not m:
        raise Refused(f'{machine_id} is not in the machine master', 404)
    if not logic.can_access_machine(user, m.id):
        raise Refused(f'You have no access to {machine_id}.', 403)
    return m


def log_doc(machine, date):
    log = ParameterLog.objects.filter(machine=machine, date=date).prefetch_related('deviations').first()
    return log.to_dict() if log else {'recorded': {}, 'recordedBy': {}, 'deviations': []}


@api_view(['GET'])
def log(request, machine_id, date):
    require(request.user, 'dashboard', 'report')
    return ok(log_doc(machine_for(request.user, machine_id), parse_date(date)))


@api_view(['PUT'])
def log_hour(request, machine_id, date, hour):
    """Record (or, with 'Edit after submit', change) one hour's readings: { values: { key: value } }."""
    values = body(request).get('values') or {}
    if not isinstance(values, dict):
        raise Refused('“values” must be an object of parameter → reading, e.g. {"nozzle": 255}.')
    m = machine_for(request.user, machine_id)
    day = parse_date(date)
    slot = logic.parse_slot(hour)
    _, changed, before = logic.record_hour(m, day, slot, values, request.user)
    if changed:
        audit(
            request.user,
            'Parameter log',
            f"Edited {m.id} {day:%d.%m.%Y} {slot_label(slot)}: "
            + ', '.join(f"{r['label']} {params.num_text(before.get(r['key'])) if before.get(r['key']) is not None else '—'} → {params.num_text(values.get(r['key']))}" for r in changed),
        )
    return ok(log_doc(m, day))


@api_view(['POST'])
def deviation_reason(request, machine_id, date, dev_id):
    m = machine_for(request.user, machine_id)
    day = parse_date(date)
    logic.give_reason(m, day, dev_id, request.data.get('reason'), request.data.get('lot'), request.user)
    return ok(log_doc(m, day))


@api_view(['POST'])
def deviation_review(request, machine_id, date, dev_id):
    """{ decision: 'approve' | 'reject', comment, masterChange }"""
    decision = request.data.get('decision')
    if decision not in ('approve', 'reject'):
        raise Refused('Decision is approve or reject')
    comment = str(request.data.get('comment') or '').strip()
    if decision == 'reject' and not comment:
        raise Refused('Say why it is rejected')
    m = machine_for(request.user, machine_id)
    day = parse_date(date)
    logic.review(m, day, dev_id, decision, comment, request.data.get('masterChange'), request.user)
    return ok(log_doc(m, day))


# ---------- Notifications ----------


@api_view(['GET'])
def notifications(request):
    return ok(logic.notifications_for(request.user))


@api_view(['POST'])
def notifications_read(request):
    me = logic.name_of(request.user)
    ids = [int(i) for i in request.data.get('ids') or [] if str(i).isdigit()]
    for n in Notification.objects.filter(id__in=ids):
        if me not in n.read_by:
            n.read_by = [*n.read_by, me]
            n.save(update_fields=['read_by'])
    return ok(logic.notifications_for(request.user))


# ---------- Report: standard vs actual ----------

STATUS_ORDER = ['open', 'rejected', 'awaiting', 'supervised', 'closed']
MAX_DAYS = 366
# Every parameter in sheet order, with each zone / stage set at its largest size.
ALL_KEYS = [d['key'] for d in params.defs_for({key: top for key, top, _ in params.SERIES})]


def matches_status(status, wanted):
    if wanted in ('all', 'deviations'):
        return True
    return status in ('open', 'rejected') if wanted == 'open' else status == wanted


@api_view(['POST'])
def report(request):
    """{ filters, offset, limit } → stats and one page of rows: deviations first, then readings within limits.

    Values are what was actually recorded; a deviation is any reading the log flagged."""
    require(request.user, 'report')
    data = body(request)
    f = data.get('filters') or {}
    if not isinstance(f, dict):
        raise Refused('“filters” must be an object.')
    offset = whole_number(data.get('offset'), 'offset', 0, 0, 10**9)
    limit = whole_number(data.get('limit'), 'limit', 25, 0, 20000)

    today = logic.production_date()
    start, end = parse_date(f.get('from')), min(parse_date(f.get('to')), today)
    days = []
    d = end
    while d >= start and len(days) < MAX_DAYS:
        days.append(d)
        d -= timedelta(days=1)

    machines = [
        m
        for m in Machine.objects.filter(active=True)
        if logic.can_access_machine(request.user, m.id)
        and (not f.get('machines') or m.id in f['machines'])
        and (f.get('mold', 'all') == 'all' or m.mold == f['mold'])
        and (f.get('part', 'all') == 'all' or m.part_no == f['part'])
    ]
    m_index = {m.id: i for i, m in enumerate(machines)}
    keys = ALL_KEYS if f.get('param', 'all') == 'all' else [f['param']]
    k_index = {k: i for i, k in enumerate(keys)}
    # Shift filter, by the Shift Master's current times. With every active shift ticked nothing is
    # left out: a reading taken before a shift's times were changed still counts.
    shifts = logic.active_shifts()
    ticked = set(f.get('shifts') or [])
    everything = not ticked or {s.code for s in shifts} <= ticked
    in_ticked = {}

    def wanted_hour(h):
        if everything:
            return True
        if h not in in_ticked:
            shift = logic.shift_of(h, shifts)
            in_ticked[h] = bool(shift and shift.code in ticked)
        return in_ticked[h]

    logs = {
        (log.machine_id, log.date): log
        for log in ParameterLog.objects.filter(machine_id__in=m_index, date__in=days).prefetch_related('deviations')
    }

    # Deviations, and how many readings each (day, hour) block holds.
    all_devs = []
    dev_keys = set()
    block_total = {}
    for (mid, day), log in logs.items():
        for h_text, values in log.recorded.items():
            h = float(h_text)
            if wanted_hour(h):
                n = sum(1 for k in values if k in k_index)
                block_total[(day, h)] = block_total.get((day, h), 0) + n
        for dv in log.deviations.all():
            if wanted_hour(dv.hour) and dv.key in k_index and slot_key(dv.hour) in log.recorded:
                all_devs.append((day, mid, dv))
                dev_keys.add((day, dv.hour, mid, dv.key))

    total_values = sum(block_total.values())
    count = lambda *s: sum(1 for _, _, dv in all_devs if dv.status in s)  # noqa: E731
    stats = {
        'machines': len(machines),
        'days': len(days),
        'values': total_values,
        'deviations': len(all_devs),
        'open': count('open', 'rejected'),
        'awaiting': count('awaiting'),
        'supervised': count('supervised'),
        'closed': count('closed'),
    }
    stats['compliance'] = (total_values - len(all_devs)) / total_values * 100 if total_values else 100

    wanted = f.get('status', 'all')
    devs = sorted(
        (x for x in all_devs if matches_status(x[2].status, wanted)),
        key=lambda x: (STATUS_ORDER.index(x[2].status), -x[0].toordinal(), -x[2].hour, m_index[x[1]], k_index[x[2].key]),
    )
    within_count = total_values - len(all_devs) if wanted == 'all' else 0
    total = len(devs) + within_count

    def row(day, hour, mid, key, value, dv=None):
        return {'date': day.isoformat(), 'hour': int(hour) if float(hour).is_integer() else hour, 'machineId': mid, 'key': key, 'value': value, 'deviation': dv.to_dict() if dv else None}

    rows = []
    for day, mid, dv in devs[offset : offset + limit]:
        rows.append(row(day, dv.hour, mid, dv.key, dv.value, dv))

    # Then readings within limits: newest day first, then hour, machine, parameter.
    skip = max(0, offset - len(devs))
    want = limit - len(rows)
    if want > 0 and within_count:
        for day in days:
            for h in sorted(hh for dd, hh in block_total if dd == day):
                n = block_total.get((day, h), 0)
                if not n:
                    continue
                block_devs = sum(1 for (dd, hh, _, _) in dev_keys if dd == day and hh == h) if n else 0
                if skip >= n - block_devs:
                    skip -= n - block_devs
                    continue
                for m in machines:
                    values = (logs.get((m.id, day)) or ParameterLog()).recorded.get(slot_key(h)) or {}
                    for k in sorted((k for k in values if k in k_index), key=k_index.get):
                        if (day, h, m.id, k) in dev_keys:
                            continue
                        if skip:
                            skip -= 1
                            continue
                        rows.append(row(day, h, m.id, k, values[k]))
                        if len(rows) >= limit:
                            break
                    if len(rows) >= limit:
                        break
                if len(rows) >= limit:
                    break
            if len(rows) >= limit:
                break

    return ok({'stats': stats, 'deviationCount': len(devs), 'withinCount': within_count, 'total': total, 'offset': offset, 'rows': rows})


@api_view(['GET'])
def deviation_counts(request):
    """Open / awaiting counts across all days, e.g. for a badge."""
    qs = Deviation.objects.filter(log__machine_id__in=[m.id for m in Machine.objects.all() if logic.can_access_machine(request.user, m.id)])
    return ok({s: qs.filter(status=s).count() for s in STATUS_ORDER})
