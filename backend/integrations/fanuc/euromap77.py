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
(ROBOSHOTCycleParametersEvent). A few machine settings come from FANUC's own
FANUCMoldingParameters (max injection pressure, HR mode, cooling time); the step settings
(injection velocity / switch position, hold pressure / time, back pressure, rotation,
decompression) sit in its *Step* arrays and stay manual entries until their layout is mapped.

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

import re

ROOT = 'IMM_FANUC_ROBOSHOT<MachineID>'
CYCLE = 'ROBOSHOTCycleParametersEvent'
INJ = f'{CYCLE}/InjUnitCycParams_1'
FMP = 'FANUCMoldingParameters'  # FANUC's machine settings (variables, ns 5)
ZONES = 'InjectionUnits/InjectionUnit_1/TemperatureZones'
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
    'TMP_HTH': node(f'{ZONES}/TemperatureZone_<Nr> (feeding) → {INJ}/BrlTmpZnCycParams_<Nr>/ActualTemperature', 3, kind='derived', verify=True, note='Actual of the present zone flagged as feeding'),
    'TMP_MTC': node(f'{CYCLE}/Peripheral/Mold_1/TemperatureTo', 5, verify=True, note='Mould temperature controller, supply side'),
    'TMP_MOLD': node(f'{CYCLE}/Peripheral/Mold_1/TemperatureFrom', 5, verify=True, note='Mould circuit, return side'),
    'TMP_DRY': node(f'{CYCLE}/Peripheral/Dryer/TemperatureTo', 5),
    'INJ_POSTR': node(f'{INJ}/VPChangeOverPosition', 4, note='Actual V-P changeover position of the last shot'),
    'INJ_SHOT': node(f'{FMP}/ExtruderParameters/Step/Step_<n>/Position', 5, kind='derived', verify=True, note='Position of the last present recovery step (setting)'),
    'INJ_DECD': node(f'{FMP}/ExtruderParameters/Decompression/Position', 5, kind='derived', verify=True, note='Decompression position (setting)'),
    'INJ_BACKP': node(f'{FMP}/ExtruderParameters/Step/Step_<n>/BackPressure', 5, kind='derived', verify=True, note='Back pressure of the first present recovery step (setting)'),
    'INJ_ROT': node(f'{FMP}/ExtruderParameters/Step/Step_<n>/Rotation', 5, kind='derived', verify=True, note='Screw rotation of the first present recovery step (setting)'),
    'INJ_DECV': node(f'{FMP}/ExtruderParameters/Decompression/Velocity', 5, kind='derived', verify=True, note='Decompression velocity (setting)'),
    'INJ_MAXPRS': node(f'{FMP}/InjectionParameters/SingleMaxPressure', 5, kind='setpoint', verify=True, note='Machine setting; unit follows the controller (MPa expected)'),
    'INJ_HRMODE': node(f'{FMP}/InjectionParameters/HRMode', 5, kind='setpoint', verify=True, note='Taken only when the controller reports it as text (e.g. STD)'),
    'INJ_COOLT': node(f'{FMP}/ExtruderParameters/CoolTime', 5, kind='setpoint', verify=True, note='Machine setting; confirm the unit is seconds'),
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


def _step(group, field, rule):
    return lambda i: node(f'{FMP}/{group}/Step/Step_<n>/{field}', 5, kind='derived', verify=True, note=f'{rule} (setting); steps whose IsPresent is false are skipped')


# Settings taken from FANUC's step records: the n-th *present* step, see step_readings().
STEP_SERIES = (
    ('INJ_VEL', _step('InjectionParameters', 'Velocity', 'Velocity of the n-th present injection step'), 10),
    ('INJ_SWPOS', _step('InjectionParameters', 'Position', 'Position of the n-th present injection step; n steps have n−1 switch positions'), 10),
    ('INJ_HOLDP', _step('PackParameters', 'Pressure', 'Pressure of the n-th present hold step'), 10),
    ('INJ_HOLDT', _step('PackParameters', 'Time', 'Time of the n-th present hold step'), 10),
)


def node_for(code):
    """The EUROMAP 77 node for a parameter-sheet code, or None if the machine doesn't publish it."""
    if code in PARAMS:
        return PARAMS[code]
    for prefix, make, top in (('TMP_Z', lambda i: _barrel(FIRST_BAND_ZONE + i - 1), BARREL_ZONES - 1), ('TMP_HRTC', _mould, MOULD_ZONES), *STEP_SERIES):
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
    # MPCR's own collector (../collector) adds these
    'machinecyclecounter': 'Jobs/ActiveJobValues/MachineCycleCounter',
    'max_injection_pressure': f'{FMP}/InjectionParameters/SingleMaxPressure',
    'hr_mode': f'{FMP}/InjectionParameters/HRMode',
    'max_injection_time': f'{FMP}/InjectionParameters/MaxInjectionTime',
    'injection_steps': f'{FMP}/InjectionParameters/Step',
    'pack_steps': f'{FMP}/PackParameters/Step',
    'extruder_steps': f'{FMP}/ExtruderParameters/Step',
    'cooling_time': f'{FMP}/ExtruderParameters/CoolTime',
}

MOULD_SHEET_ZONES = 24  # TMP_HRTC1 … 24 on the parameter sheet


def sheet_codes():
    """Every parameter-sheet code that has a fixed node, numbered series included."""
    return list(PARAMS) + [f'TMP_Z{i}' for i in range(1, BARREL_ZONES)] + [f'TMP_HRTC{i}' for i in range(1, MOULD_SHEET_ZONES + 1)]


def _payload(data):
    return _flat({COLLECTOR_KEYS.get(k, k): v for k, v in (data or {}).items()})


def _num(v):
    if isinstance(v, dict):
        v = v.get('value')
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _truthy(v):
    if isinstance(v, str):
        return v.strip().lower() in ('1', 'true', 'yes', 'on')
    return bool(v)


def _field(rec, *names):
    """A record's value by exact (lower-case) field name, else by a name containing it."""
    for n in names:
        if n in rec:
            return rec[n]
    for n in names:
        for k, v in rec.items():
            if n in k:
                return v
    return None


def _present(rec):
    """A step / zone counts unless it has an IsPresent-like field that is false / 0."""
    flag = next((v for k, v in rec.items() if 'present' in k), None)
    return True if flag is None else _truthy(flag)


def _records(payload, root, pattern=r'(?:Step_?)?(\d+)'):
    """{number: {field (lower case): value}} below `root`, from browsed children
    (root/Step_1/Velocity) or from one array of records published at `root` itself."""
    out = {}
    if isinstance(payload.get(root), list):
        for i, rec in enumerate(payload[root], 1):
            if isinstance(rec, dict):
                out[i] = {str(k).lower(): v for k, v in rec.items()}
    head = re.compile(rf'{pattern}/(?:.+/)?([^/]+)$', re.I)
    for key, v in payload.items():
        if not key.startswith(root + '/'):
            continue
        rest = key[len(root) + 1:]
        m = head.match(rest)
        if m:
            out.setdefault(int(m.group(1)), {})[m.group(2).lower()] = v
        elif '/' not in rest:  # a single, unnumbered record: root/Position
            out.setdefault(1, {})[rest.lower()] = v
    return dict(sorted(out.items()))


def _present_steps(payload, group):
    return [s for s in _records(payload, f'{FMP}/{group}/Step').values() if _present(s)]


def step_readings(payload):
    """{sheet code: value} from FANUC's step records and temperature zones, by the plant's rules:

    * INJ_VEL n / INJ_SWPOS n – the n-th present injection step's velocity / position; n present
      steps give n−1 switch positions (one step: none).
    * INJ_HOLDP n / INJ_HOLDT n – the n-th present hold (pack) step's pressure / time.
    * INJ_SHOT – the last present recovery (extruder) step's position; INJ_BACKP / INJ_ROT – the
      first present recovery step's back pressure / screw rotation; INJ_DECD (and INJ_DECV) –
      the decompression position (velocity).
    * TMP_Z n – the actual temperature (last shot) of the n-th present barrel zone from zone 2 on,
      the feeding zone left out; TMP_HTH – the present zone flagged as feeding.
    """
    out = {}
    inj = _present_steps(payload, 'InjectionParameters')
    for i, s in enumerate(inj, 1):
        out[f'INJ_VEL{i}'] = _num(_field(s, 'velocity', 'speed'))
        if i < len(inj):
            out[f'INJ_SWPOS{i}'] = _num(_field(s, 'position'))
    for i, s in enumerate(_present_steps(payload, 'PackParameters'), 1):
        out[f'INJ_HOLDP{i}'] = _num(_field(s, 'pressure'))
        out[f'INJ_HOLDT{i}'] = _num(_field(s, 'time'))
    ext = _present_steps(payload, 'ExtruderParameters')
    if ext:
        out['INJ_SHOT'] = _num(_field(ext[-1], 'position'))
        out['INJ_BACKP'] = _num(_field(ext[0], 'backpressure', 'back'))
        out['INJ_ROT'] = _num(_field(ext[0], 'rotation', 'rpm', 'screwspeed', 'revolution'))
    dec = _records(payload, f'{FMP}/ExtruderParameters/Decompression').get(1, {})
    out['INJ_DECD'] = _num(_field(dec, 'position', 'distance'))
    out['INJ_DECV'] = _num(_field(dec, 'velocity', 'speed'))

    zones = _records(payload, ZONES, r'TemperatureZone_(\d+)')
    if zones:
        actual = lambda n: _num(_lookup(payload, f'{INJ}/BrlTmpZnCycParams_{n}/ActualTemperature'))  # noqa: E731
        feeding = [n for n, z in zones.items() if _present(z) and _truthy(_field(z, 'feed'))]
        bands = [n for n, z in zones.items() if n >= FIRST_BAND_ZONE and _present(z) and n not in feeding]
        for i, n in enumerate(bands, 1):
            out[f'TMP_Z{i}'] = actual(n)
        if feeding:
            out['TMP_HTH'] = actual(feeding[0])
    return {c: v for c, v in out.items() if v is not None}


def machine_limits(data):
    """The machine's own monitor limits, logged next to the reading (the parameter master still
    decides deviations): {"cushion": {"lower": 2.7, "upper": 4.7}, "injection": {…}}."""
    payload = _payload(data)
    out = {}
    for key, folder in MONITORS.items():
        mon = _records(payload, f'{FMP}/ProcessMonitor/{folder}').get(1, {})
        limits = {'lower': _num(_field(mon, 'lower')), 'upper': _num(_field(mon, 'upper'))}
        if any(v is not None for v in limits.values()):
            out[key] = limits
    return out


# Parameter-sheet row → FANUCMoldingParameters.ProcessMonitor folder with its Upper / Lower.
MONITORS = {
    'cushion': 'CushionStroke',  # M-CUSHION
    'injection': 'InjectionTime',  # INJCT TIME
}


def readings(data):
    """{parameter key: value} for the parameter sheet from a collector message's data, e.g.
    {"nozzle": 254.8, "cycle": 26.15, "maxInjPress": 150}. Codes whose node isn't in the data,
    or isn't a number (or, for a mode, text) are left out."""
    from plant.services import params

    payload = _payload(data)
    derived = step_readings(payload)
    zones_known = any(k.startswith(f'{ZONES}/') for k in payload)
    out = {}
    for code in sheet_codes():
        n, d = node_for(code), params.def_of(code)
        if not n or not d or n['kind'] == 'derived' or '<' in n['path']:
            continue
        if zones_known and code.startswith('TMP_Z'):
            continue  # zones are assigned from the machine's present zones below
        v = _lookup(payload, n['path'], n['aliases'])
        if isinstance(v, dict):
            v = v.get('value')
        if d['check'] == 'TEXT':
            if isinstance(v, str) and v.strip():
                out[d['key']] = v.strip()
        elif isinstance(v, (int, float)) and not isinstance(v, bool):
            out[d['key']] = round(v * n['scale'], 4)
    for code, v in derived.items():
        d = params.def_of(code)
        if d:
            out[d['key']] = round(v, 4)
    return out


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
