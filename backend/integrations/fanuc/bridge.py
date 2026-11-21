"""Feeds MPCR from the plant's existing EUROMAP 77 collector (OPC UA → MQTT).

The collector already holds the OPC UA sessions to the FANUC gateway; MPCR only listens to
what it publishes, so the gateway never sees a second client. Each message names the machine
by its UserMachineName (e.g. "J1030"); that is matched to the MPCR machine whose id is the same
apart from punctuation and case ("J10-30"). FANUC_MACHINE_MAP in the settings can pin names
that don't match that way: "J1030=J10-30,IMM_FANUC_ROBOSHOT0005=J10-31".

Machines whose data source is "Auto (OPC UA)" also get their parameter sheet filled: at each
reading time of the Shift Master, record_due() writes the slot from the machine's latest
collector values (recorded by "opc-ua"); the recipe checks then open deviations as usual.
"""
import re
import threading
import time

from django.conf import settings
from django.utils import timezone

from .euromap77 import from_collector, machine_limits, readings

STALE_SECONDS = 300  # collector data older than this is not written to the sheet (the collector resends every minute)
MIN_WINDOW_MINUTES = 5  # how long after a reading time it may still be filled, at least


def _norm(name):
    return re.sub(r'[^0-9A-Z]', '', str(name).upper())


def explicit_map():
    """FANUC_MACHINE_MAP as {normalised collector name or machine node: MPCR id}."""
    raw = getattr(settings, 'FANUC_MACHINE_MAP', '') or ''
    pairs = (p.split('=', 1) for p in raw.split(',') if '=' in p)
    return {_norm(k): v.strip() for k, v in pairs if k.strip() and v.strip()}


class Bridge:
    def __init__(self):
        from plant.models import Machine

        self.Machine = Machine
        self.pinned = explicit_map()
        self.by_name = {}
        self.unmatched = set()
        self.latest = {}  # MPCR id → (time.monotonic(), collector data) of the last message
        self.lock = threading.Lock()  # MQTT messages arrive on paho's thread, record_due() runs on another
        self.refresh()

    def refresh(self):
        """Re-read the machine master (a machine added in MPCR is picked up)."""
        self.by_name = {_norm(mid): mid for mid in self.Machine.objects.values_list('id', flat=True)}

    def machine_for(self, name, node):
        for key in (name, node):
            if key and _norm(key) in self.pinned:
                return self.pinned[_norm(key)]
        return self.by_name.get(_norm(name)) if name else None

    def apply(self, message):
        """Updates the machine a collector message is about. Returns (MPCR id or None, fields)."""
        name, node, fields, _extra = from_collector(message)
        if not name and not node:
            return None, {}
        mid = self.machine_for(name, node)
        if not mid:
            label = name or node
            if label not in self.unmatched:
                self.refresh()
                mid = self.machine_for(name, node)
                if not mid:
                    self.unmatched.add(label)
            if not mid:
                return None, {}
        with self.lock:
            self.latest[mid] = (time.monotonic(), dict(message['data']))
        if not fields:
            return mid, {}
        m = self.Machine.objects.filter(id=mid).first()
        if not m:
            return None, {}
        m.set_fields(fields, self.Machine.TELEMETRY_FIELDS)
        m.telemetry_at = timezone.now()
        m.save(update_fields=[self.Machine.FIELD_OF.get(k, k) for k in fields] + ['telemetry_at'])
        return mid, fields

    def due_slot(self, now=None):
        """(production date, slot) of the reading time just reached, or (date, None) if none is
        open: a slot counts from its time until its shift's grace period (at least 5 min) is over."""
        from plant.services import logic

        now = now or logic.local_now()
        day, at = logic.production_date(now), logic.shift_hour(now)
        shifts, rules = logic.active_shifts(), logic.shift_rules()
        passed = [s for s in logic.plant_slots(shifts, rules) if s <= at]
        if not passed:
            return day, None
        slot = passed[-1]
        shift = logic.shift_of(slot, shifts)
        window = max(MIN_WINDOW_MINUTES, shift.grace if shift and rules.get('grace', True) else 0)
        return day, (slot if (at - slot) * 60 <= window else None)

    def record_due(self, now=None):
        """Fills the open reading slot of every running "Auto (OPC UA)" machine from its latest
        collector values, once. A slot someone has already recorded is left alone.
        Returns [(MPCR id, slot, number of values)]."""
        from plant.models import ParameterLog, slot_key
        from plant.services import logic

        day, slot = self.due_slot(now)
        if slot is None:
            return []
        with self.lock:
            latest = {mid: data for mid, (at, data) in self.latest.items() if time.monotonic() - at <= STALE_SECONDS}
        if not latest:
            return []
        key = slot_key(slot)
        taken = {log.machine_id for log in ParameterLog.objects.filter(machine_id__in=latest, date=day) if key in log.recorded}
        done = []
        for m in self.Machine.objects.filter(id__in=set(latest) - taken, data_source='auto', active=True, status='run'):
            values = readings(latest[m.id])
            if not values:
                continue
            log, _, _ = logic.record_hour(m, day, slot, values)
            limits = machine_limits(latest[m.id])
            if limits:  # the machine's own monitor limits, shown next to the reading
                log.recorded_by[key]['machineLimits'] = limits
                log.save(update_fields=['recorded_by'])
            done.append((m.id, slot, len(log.recorded.get(key, {}))))
        return done
