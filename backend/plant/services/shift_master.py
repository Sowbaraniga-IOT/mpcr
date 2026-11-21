"""Shift_Master (models.ShiftMaster) holds the shift timings: Unit_code, Shift_Code, start_tm, end_tm,
time_diff. MPCR's reading settings for each shift (name, interval, grace, supervisor, on/off) are in
models.Shift. Everything that needs shifts goes through here, so the times always come from Shift_Master:

  * with_master_times(): Shift rows with start/end/unit_code taken from Shift_Master. A Shift_Master
    row with no Shift row yet (e.g. added through the admin or SQL) still counts, with default settings.
  * save_times(): what the Shift Master screen saves goes into Shift_Master.
"""
from datetime import date, datetime, time, timedelta

from django.conf import settings
from django.utils import timezone

from ..models import Shift, ShiftMaster

DAY_MINUTES = 24 * 60
# start_tm / end_tm are timestamps, but only the time of day means anything. MPCR writes them on this date.
BASE_DATE = date(2000, 1, 1)
DEFAULTS = {'interval': 60, 'grace': 10, 'supervisor': '', 'active': True}


def default_unit():
    return getattr(settings, 'PLANT_UNIT_CODE', '') or ''


def to_minute(value):
    """start_tm / end_tm → minutes after midnight, in plant time. Seconds are dropped."""
    if isinstance(value, datetime):
        value = timezone.localtime(value).time() if timezone.is_aware(value) else value.time()
    if not isinstance(value, time):
        raise ValueError(f'“{value}” is not a time')
    return value.hour * 60 + value.minute


def to_timestamp(minute):
    """Minutes after midnight → the start_tm / end_tm value stored for it."""
    naive = datetime.combine(BASE_DATE, time()) + timedelta(minutes=minute % DAY_MINUTES)
    return timezone.make_aware(naive) if settings.USE_TZ else naive


def time_diff(start, end):
    minutes = (end - start) % DAY_MINUTES or DAY_MINUTES
    return f'{minutes // 60:02d}:{minutes % 60:02d}'


def with_master_times(shifts=None, active_only=False):
    """Shift objects with start, end and unit_code from Shift_Master, in screen order."""
    shifts = list(Shift.objects.all() if shifts is None else shifts)
    master = {m.Shift_Code: m for m in ShiftMaster.objects.all()}
    known = set()
    for s in shifts:
        known.add(s.code)
        m = master.get(s.code)
        if m:
            s.start, s.end, s.unit_code = to_minute(m.start_tm), to_minute(m.end_tm), m.Unit_code
    # In Shift_Master only: count it, with MPCR's default reading settings (not saved until edited).
    last = max((s.position for s in shifts), default=0)
    for i, code in enumerate(sorted(set(master) - known - set(Shift.objects.values_list('code', flat=True))), 1):
        m = master[code]
        shifts.append(Shift(code=code, name=f'Shift {code}', position=last + i, start=to_minute(m.start_tm), end=to_minute(m.end_tm), **DEFAULTS))
        shifts[-1].unit_code = m.Unit_code
    shifts = [s for s in shifts if s.active] if active_only else shifts
    return sorted(shifts, key=lambda s: (s.position, s.code))


def save_times(code, start, end, unit_code=''):
    """Write one shift's timing into Shift_Master."""
    unit_code = unit_code or ShiftMaster.objects.filter(Shift_Code=code).values_list('Unit_code', flat=True).first() or default_unit()
    ShiftMaster.objects.update_or_create(
        Shift_Code=code,
        defaults={'Unit_code': unit_code, 'start_tm': to_timestamp(start), 'end_tm': to_timestamp(end), 'time_diff': time_diff(start, end)},
    )


def keep_only(codes):
    """Shifts removed on the screen leave Shift_Master too."""
    ShiftMaster.objects.exclude(Shift_Code__in=codes).delete()
