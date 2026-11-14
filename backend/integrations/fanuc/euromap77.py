"""EUROMAP 77 node names for the FANUC ROBOSHOT (spec A-97146-00021EN, Appendix 1).

The one place that says which OPC UA / EUROMAP 77 node each MPCR value comes from:

* PARAMS      – parameter-sheet code (TMP_Z1, MON_CYCLE …) → node
* LIVE        – live dashboard field (cycle, cushion …)    → node
* from_euromap() turns a payload keyed by EUROMAP 77 BrowseNames (or full paths) into
  MPCR telemetry fields, converting units on the way (OPC UA Duration is milliseconds).

Paths are BrowseNames below the machine object `IMM_FANUC_ROBOSHOT<MachineID>`, joined
with '/'. `ns` is the BrowseName namespace from the spec: 3 = EUROMAP 83, 4 = EUROMAP 77,
5 = FANUC vendor nodes. `<Nr>` placeholders are filled in for numbered zones.

Not every parameter has a node: EUROMAP 77 publishes the *actual* values of each cycle
(ROBOSHOTCycleParametersEvent), not the machine's setpoints such as hold pressure,
injection velocity, back pressure or cooling time. Those stay manual entries.

How the plant's OPC UA server addresses them (FANUC gateway, see the collector's config):
string NodeIds in namespace 6, the path joined with dots after the 4-digit machine node,
e.g. ns=6;s=IMM_FANUC_ROBOSHOT0005.Jobs.ActiveJobValues.LastCycleTime (node_id() builds one).
The machine's own name (J1030 …) is MachineConfiguration.UserMachineName.

ROBOSHOTCycleParametersEvent is an *event* type: its fields (cushion, injection time …) arrive
through an OPC UA event subscription, not as variables a data-change subscription can watch.
That is why the live cycle time comes from the variable Jobs.ActiveJobValues.LastCycleTime.

`verify` marks a mapping that depends on how the machine is set up (zone numbering,
which peripheral channel is wired, the unit the controller reports). Check it once on the
machine against the node's Name / EngineeringUnits before trusting automatic deviations.
"""

ROOT = 'IMM_FANUC_ROBOSHOT<MachineID>'
CYCLE = 'ROBOSHOTCycleParametersEvent'
INJ = f'{CYCLE}/InjUnitCycParams_1'
STATUS = 'MachineStatus'
INFO = 'MachineInformation'
BARREL_SET = 'InjectionUnits/InjectionUnit_1/TemperatureZones/TemperatureZone_<Nr>/NominalTemperature'

# Barrel zones as numbered in BrlTmpZnCycParams_<Nr> (1 … 11). The usual ROBOSHOT order is the
# nozzle first, then the heater bands from the front; each node's Name says which it is.
NOZZLE_ZONE = 1
FIRST_BAND_ZONE = 2  # MPCR "Zone 1" is BrlTmpZnCycParams_2
BARREL_ZONES = 11
MOULD_ZONES = 108  # MldTmpZnCycParams_<Nr>; α-iA / AUTOSHOT have 1 … 10

MS = 0.001  # OPC UA Duration (milliseconds) → seconds

SERVER_NS = 6  # the plant gateway's namespace for machine nodes


def node_id(machine_node, path, ns=SERVER_NS):
    """The gateway's NodeId: node_id('IMM_FANUC_ROBOSHOT0005', 'MachineStatus/MachineMode')
    → 'ns=6;s=IMM_FANUC_ROBOSHOT0005.MachineStatus.MachineMode'."""
    return f"ns={ns};s={machine_node}.{path.replace('/', '.')}"


def node(path, ns, kind='actual', scale=1.0, verify=False, note='', setpoint=None, aliases=()):
    return {'path': path, 'ns': ns, 'kind': kind, 'scale': scale, 'verify': verify, 'note': note, 'setpoint': setpoint, 'aliases': list(aliases)}


def _barrel(nr, note=''):
    return node(
        f'{INJ}/BrlTmpZnCycParams_{nr}/ActualTemperature',
        3,
        verify=True,
        note=note or f'Barrel zone {nr}; confirm with BrlTmpZnCycParams_{nr}/Name',
        setpoint=BARREL_SET.replace('<Nr>', str(nr)),
    )


def _mould(nr):
    return node(f'{CYCLE}/MldCycParams_1/MldTmpZnCycParams_{nr}/ActualTemperature', 3, note=f'Mould (hot runner) zone {nr}')


# Live values on the dashboard: Machine field → node.
LIVE = {
    'status': node(f'{STATUS}/MachineMode', 3, kind='status', note='MachineModeEnumeration; IsPresent = false means offline'),
    'cycle': node('Jobs/ActiveJobValues/LastCycleTime', 3, scale=MS, note='Duration (ms); the cycle event field CycleTime is also accepted', aliases=[f'{CYCLE}/CycleTime']),
    'cushion': node(f'{INJ}/CushionVolume', 4, verify=True, note='Reported with EngineeringUnits; MPCR expects mm. Vendor alternative: InjUnitCycParams_1/MinimumCushion (ns 5)'),
    'injection': node(f'{INJ}/InjectionTime', 4, scale=MS, note='Duration (ms)'),
    'peakPressure': node(f'{INJ}/SpecificPressureMaximum', 4, verify=True, note='Unit follows the controller setting (MPa expected)'),
    'recovery': node(f'{INJ}/DosingTime', 4, scale=MS, note='Dosing = screw recovery; Duration (ms)'),
}

# Fixed parameter-sheet codes → node. Numbered series are handled in node_for().
PARAMS = {
    'TMP_NOZ': _barrel(NOZZLE_ZONE, 'Nozzle; confirm with BrlTmpZnCycParams_1/Name'),
    'TMP_HTH': node(f'{INJ}/BrlTmpZnCycParams_<Nr>/ActualTemperature', 3, verify=True, note='The barrel zone whose Name is the feed throat'),
    'TMP_MTC': node(f'{CYCLE}/Peripheral/Mold_1/TemperatureTo', 5, verify=True, note='Mould temperature controller, supply side'),
    'TMP_MOLD': node(f'{CYCLE}/Peripheral/Mold_1/TemperatureFrom', 5, verify=True, note='Mould circuit, return side'),
    'TMP_DRY': node(f'{CYCLE}/Peripheral/Dryer/TemperatureTo', 5),
    'INJ_POSTR': node(f'{INJ}/VPChangeOverPosition', 4, note='Actual V-P changeover position of the last shot'),
    'INJ_SHOT': node(f'{INJ}/ExtruderEndPosition', 5, verify=True, note='Actual recovery end position (shot size)'),
    'MON_CYCLE': LIVE['cycle'],
    'MON_CUSH': LIVE['cushion'],
    'MON_INJT': LIVE['injection'],
    'MON_PEAKP': LIVE['peakPressure'],
    'MON_RCVT': LIVE['recovery'],
}

# Machine master fields that the machine itself reports.
MACHINE_INFO = {
    'make': node(f'{INFO}/Manufacturer', 2, kind='info'),
    'model': node(f'{INFO}/Model', 2, kind='info'),
    'serialNumber': node(f'{INFO}/SerialNumber', 2, kind='info'),
    'name': node('MachineConfiguration/UserMachineName', 3, kind='info', note='Read only on ROBOSHOT'),
    'recipe': node('Jobs/ActiveJob/ProductionDatasetName', 3, kind='info', note='Active production dataset (condition file)'),
    'cavities': node('Jobs/ActiveJob/NumCavities', 3, kind='info'),
    'shotCount': node('Jobs/ActiveJobValues/MachineCycleCounter', 3, kind='info'),
}


def node_for(code):
    """The EUROMAP 77 node for a parameter-sheet code, or None if the machine doesn't publish it."""
    if code in PARAMS:
        return PARAMS[code]
    for prefix, make, top in (('TMP_Z', lambda i: _barrel(FIRST_BAND_ZONE + i - 1), BARREL_ZONES - 1), ('TMP_HRTC', _mould, MOULD_ZONES)):
        rest = code[len(prefix):]
        if code.startswith(prefix) and rest.isdigit() and 1 <= int(rest) <= top:
            return make(int(rest))
    return None


def catalogue(codes):
    """{code: node} for the codes that have one, as sent to the app."""
    return {c: n for c in codes if (n := node_for(c))}


# ---------- Incoming values ----------

# EUROMAP 77 MachineModeEnumeration → MPCR status.
MACHINE_MODE = {
    0: 'idle',  # OTHER
    1: 'run',  # AUTOMATIC
    2: 'run',  # SEMI_AUTOMATIC
    3: 'idle',  # MANUAL
    4: 'maint',  # SETUP
    5: 'idle',  # SLEEP
}
MODE_NAMES = {'OTHER': 0, 'AUTOMATIC': 1, 'SEMI_AUTOMATIC': 2, 'MANUAL': 3, 'SETUP': 4, 'SLEEP': 5}


def _leaf(path):
    return path.rsplit('/', 1)[-1]


def _flat(payload):
    """Keys with dots (the gateway's NodeId style) read the same as keys with slashes."""
    return {str(k).replace('.', '/'): v for k, v in payload.items()}


def _lookup(payload, path, aliases=()):
    """A value by full path, by path without the machine root, or by its last BrowseName."""
    for p in (path, *aliases):
        for key in (f'{ROOT}/{p}', p, _leaf(p)):
            if key in payload:
                return payload[key]
    return None


def _status(payload):
    present = _lookup(payload, f'{STATUS}/IsPresent')
    if present is False:
        return 'off'
    mode = _lookup(payload, LIVE['status']['path'])
    if isinstance(mode, str):
        mode = MODE_NAMES.get(mode.strip().upper().replace('-', '_'), mode)
    if isinstance(mode, dict):  # {"value": 1, "text": "AUTOMATIC"}
        mode = mode.get('value')
    # Alarms are not a machine mode in EUROMAP 77 (they arrive as MessageLog events), so a
    # collector reports one by sending MPCR's own "status": "alarm" alongside.
    return MACHINE_MODE.get(mode) if isinstance(mode, int) else None


def from_euromap(payload):
    """MPCR telemetry fields from a payload keyed by EUROMAP 77 names; unknown keys are ignored."""
    if not isinstance(payload, dict):
        return {}
    payload = _flat(payload)
    out = {}
    status = _status(payload)
    if status:
        out['status'] = status
    for field, n in LIVE.items():
        if field == 'status':
            continue
        v = _lookup(payload, n['path'], n['aliases'])
        if isinstance(v, dict):  # AnalogItemType sent with its unit: {"value": …, "unit": …}
            v = v.get('value')
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            out[field] = round(v * n['scale'], 4)
    return out


# ---------- The plant's existing OPC UA → MQTT collector ----------
# It publishes every data change on `factory/euromap77/raw` as
#   {"machine_node": "IMM_FANUC_ROBOSHOT0005", "machine": "J1030", "ts": "…",
#    "data": {"operating_status": 1, "cycletime": 24800.0, "tool": "…", …}}
# with these keys for these nodes (its config.NODE_IDS):
COLLECTOR_KEYS = {
    'operating_status': f'{STATUS}/MachineMode',
    'present': f'{STATUS}/IsPresent',
    'cycletime': 'Jobs/ActiveJobValues/LastCycleTime',
    'jobcyclecounter': 'Jobs/ActiveJobValues/JobCycleCounter',
    'jobgoodcounter': 'Jobs/ActiveJobValues/JobGoodPartsCounter',
    'jobbadcounter': 'Jobs/ActiveJobValues/JobBadPartsCounter',
    'tool': 'Jobs/ActiveJob/ProductionDatasetName',
    'ProductName': 'Jobs/ActiveJob/ProductName',
    'cavity': 'Jobs/ActiveJob/NumCavities',
    'actualcavity': 'FANUCMoldingParameters/ProductManagementParameters/ProductManagement/ActualCavity',
    'machinename': 'MachineConfiguration/UserMachineName',
}


def from_collector(message):
    """(machine name, machine node, MPCR telemetry fields, other values) from one collector
    message; (None, None, {}, {}) if it isn't one. Keys the collector adds later as EUROMAP
    paths (e.g. "InjectionUnits.InjectionUnit_1. …") are understood too."""
    if not isinstance(message, dict) or not isinstance(message.get('data'), dict):
        return None, None, {}, {}
    data = message['data']
    by_path = {COLLECTOR_KEYS.get(k, k): v for k, v in data.items()}
    fields = from_euromap(by_path)
    extra = {k: data[k] for k in ('tool', 'ProductName', 'jobcyclecounter', 'actualcavity') if k in data}
    name = message.get('machine') or data.get('machinename')
    return (str(name).strip() if name else None), message.get('machine_node'), fields, extra
