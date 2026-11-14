"""Feeds MPCR from the plant's existing EUROMAP 77 collector (OPC UA → MQTT).

The collector already holds the OPC UA sessions to the FANUC gateway; MPCR only listens to
what it publishes, so the gateway never sees a second client. Each message names the machine
by its UserMachineName (e.g. "J1030"); that is matched to the MPCR machine whose id is the same
apart from punctuation and case ("J10-30"). FANUC_MACHINE_MAP in the settings can pin names
that don't match that way: "J1030=J10-30,IMM_FANUC_ROBOSHOT0005=J10-31".
"""
import re

from django.conf import settings
from django.utils import timezone

from .euromap77 import from_collector


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
        if not fields:
            return mid, {}
        m = self.Machine.objects.filter(id=mid).first()
        if not m:
            return None, {}
        m.set_fields(fields, self.Machine.TELEMETRY_FIELDS)
        m.telemetry_at = timezone.now()
        m.save(update_fields=[self.Machine.FIELD_OF.get(k, k) for k in fields] + ['telemetry_at'])
        return mid, fields
