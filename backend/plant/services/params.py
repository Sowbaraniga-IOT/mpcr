"""The parameter list and how readings are checked against a recipe.

A port of src/data/parameters.js and the checks in src/data/parameterLog.js, so the server
decides what is a deviation. Keep the two in step when a parameter is added.
"""
from decimal import ROUND_HALF_UP, Decimal

GROUPS = [('TEMPERATURE', 'Temperature'), ('INJECTION', 'Injection'), ('MONITOR', 'Monitor')]

T = {'group': 'TEMPERATURE', 'unit': '°C', 'digits': 1}
I = {'group': 'INJECTION'}
M = {'group': 'MONITOR'}


def _d(base, **kw):
    return {**base, **kw}


# fmt: off
PARAM_DEFS = [
    _d(T, key='nozzle', code='TMP_NOZ', label='Nozzle temperature', check='RANGE', std=255, tol=5),
    _d(T, key='zone1', code='TMP_Z1', label='Zone 1 temperature', check='RANGE', std=255, tol=5),
    _d(T, key='zone2', code='TMP_Z2', label='Zone 2 temperature', check='RANGE', std=250, tol=5),
    _d(T, key='zone3', code='TMP_Z3', label='Zone 3 temperature', check='RANGE', std=245, tol=5),
    _d(T, key='throat', code='TMP_HTH', label='Hopper throat temp', check='RANGE', std=55, tol=10),
    _d(T, key='hrtc1', code='TMP_HRTC1', label='HRTC temperature zone-1', check='NA'),
    _d(T, key='hrtc2', code='TMP_HRTC2', label='HRTC temperature zone-2', check='NA'),
    _d(T, key='hrtc3', code='TMP_HRTC3', label='HRTC temperature zone-3', check='NA'),
    _d(T, key='hrtc4', code='TMP_HRTC4', label='HRTC temperature zone-4', check='NA'),
    _d(T, key='mtc', code='TMP_MTC', label='MTC temperature', check='RANGE', std=60, tol=5),
    _d(T, key='mold', code='TMP_MOLD', label='Mold temperature', check='RANGE', std=60, tol=5),
    _d(T, key='dryer', code='TMP_DRY', label='Hopper dryer temp', check='RANGE', std=140, tol=10),

    _d(I, key='injVel1', code='INJ_VEL1', label='Inject velocity 1', unit='mm/s', check='EXACT', std=60),
    _d(I, key='injSwitch1', code='INJ_SWPOS1', label='Inject switch position 1', unit='mm', check='NA'),
    _d(I, key='injVel2', code='INJ_VEL2', label='Inject velocity 2', unit='mm/s', check='NA'),
    _d(I, key='maxInjPress', code='INJ_MAXPRS', label='Max inject pressure', unit='MPa', check='EXACT', std=150),
    _d(I, key='transfer', code='INJ_POSTR', label='Position transfer', unit='mm', check='EXACT', std=6),
    _d(I, key='hrMode', code='INJ_HRMODE', label='HR mode', unit='', check='TEXT', std='STD'),
    _d(I, key='hold1', code='INJ_HOLDP1', label='Hold pressure 1', unit='MPa', check='EXACT', std=55),
    _d(I, key='holdTime1', code='INJ_HOLDT1', label='Hold time 1', unit='s', check='EXACT', std=3),
    _d(I, key='back', code='INJ_BACKP', label='Back pressure', unit='MPa', check='EXACT', std=10),
    _d(I, key='rotation', code='INJ_ROT', label='Rotation', unit='min⁻¹', check='EXACT', std=120),
    _d(I, key='shotSize', code='INJ_SHOT', label='Shot size', unit='mm', check='EXACT', std=39.8, step=0.4),
    _d(I, key='decompDist', code='INJ_DECD', label='Decompression distance', unit='mm', check='EXACT', std=5),
    _d(I, key='decompVel', code='INJ_DECV', label='Decompression velocity', unit='mm/s', check='EXACT', std=5),
    _d(I, key='cooling', code='INJ_COOLT', label='Cooling time', unit='s', check='EXACT', std=18),

    _d(M, key='cycle', code='MON_CYCLE', label='Total cycle time', unit='s', check='MAX ONLY', std=26.15, tolUp=1, step=0.5),
    _d(M, key='cushion', code='MON_CUSH', label='Cushion (actual)', unit='mm', check='RANGE', std=3.7, tol=1, step=0.3),
    _d(M, key='injection', code='MON_INJT', label='Injection time', unit='s', check='RANGE', std=0.668, tol=0.05, step=0.02),
    _d(M, key='peakPressure', code='MON_PEAKP', label='Peak pressure', unit='MPa', check='RANGE', std=115, tol=20, step=5),
    _d(M, key='recovery', code='MON_RCVT', label='Recovery time', unit='s', check='RANGE', std=5.2, tol=3, step=0.5),
]
# fmt: on
DEF_BY_CODE = {p['code']: p for p in PARAM_DEFS}


def _stage_std(first, step_by, low):
    return lambda i: max(low, first - step_by * (i - 1))


# Zones and profile stages come in numbered sets; a recipe chooses how many (1 … max).
SERIES = [
    ('zone', 12, lambda i: _d(T, key=f'zone{i}', code=f'TMP_Z{i}', label=f'Zone {i} temperature', check='RANGE', std=_stage_std(255, 5, 200)(i), tol=5)),
    ('hrtc', 24, lambda i: _d(T, key=f'hrtc{i}', code=f'TMP_HRTC{i}', label=f'HRTC temperature zone-{i}', check='NA')),
    ('injVel', 10, lambda i: _d(I, key=f'injVel{i}', code=f'INJ_VEL{i}', label=f'Inject velocity {i}', unit='mm/s', check='EXACT' if i == 1 else 'NA', std=60)),
    ('injSwitch', 10, lambda i: _d(I, key=f'injSwitch{i}', code=f'INJ_SWPOS{i}', label=f'Inject switch position {i}', unit='mm', check='NA')),
    ('hold', 10, lambda i: _d(I, key=f'hold{i}', code=f'INJ_HOLDP{i}', label=f'Hold pressure {i}', unit='MPa', check='EXACT', std=_stage_std(55, 5, 10)(i))),
    ('holdTime', 10, lambda i: _d(I, key=f'holdTime{i}', code=f'INJ_HOLDT{i}', label=f'Hold time {i}', unit='s', check='EXACT', std=3)),
]


def _series_of(code):
    for key, top, make in SERIES:
        prefix = make(1)['code'][:-1]
        rest = code[len(prefix):]
        if code.startswith(prefix) and rest.isdigit() and 1 <= int(rest) <= top:
            return key, top, make, int(rest)
    return None


def def_of(code):
    if code in DEF_BY_CODE:
        return DEF_BY_CODE[code]
    hit = _series_of(code)
    return hit[2](hit[3]) if hit else None


def counts_of(codes):
    counts = {key: 0 for key, _, _ in SERIES}
    for code in codes:
        hit = _series_of(code)
        if hit:
            counts[hit[0]] = max(counts[hit[0]], hit[3])
    return counts


DEFAULT_COUNTS = counts_of(p['code'] for p in PARAM_DEFS)


def defs_for(counts=None):
    counts = counts or DEFAULT_COUNTS
    out = []
    for d in PARAM_DEFS:
        hit = _series_of(d['code'])
        if not hit:
            out.append(d)
        elif hit[3] == 1:
            key, top, make, _ = hit
            for i in range(1, min(top, max(1, counts.get(key) or DEFAULT_COUNTS[key])) + 1):
                out.append(make(i))
    return out


# ---------- Numbers ----------


def decimals(n):
    if isinstance(n, bool) or not isinstance(n, (int, float)):
        return 0
    text = repr(float(n)) if isinstance(n, float) else str(n)
    if 'e' in text or '.' not in text:
        return 0
    frac = text.split('.')[1].rstrip('0')
    return len(frac)


def fix(n, d):
    return float(Decimal(str(n)).quantize(Decimal(1).scaleb(-d), rounding=ROUND_HALF_UP)) if d else float(round(n))


def to_fixed(n, d):
    return f'{Decimal(str(n)).quantize(Decimal(1).scaleb(-d), rounding=ROUND_HALF_UP):f}' if d else str(int(Decimal(str(n)).quantize(Decimal(1), rounding=ROUND_HALF_UP)))


def num_text(n):
    """A number as JavaScript prints it: 5 not 5.0."""
    return str(int(n)) if isinstance(n, float) and n.is_integer() else str(n)


# ---------- Recipe rows ----------

MACHINE_KEYS = {'peakPressure': 'peak_pressure'}


def default_row(d, machine=None):
    code = d['code']
    if d['check'] == 'NA':
        return {'code': code, 'check': 'NA', 'lower': None, 'std': None, 'upper': None, 'applies': False}
    if d['check'] == 'TEXT':
        return {'code': code, 'check': 'TEXT', 'lower': d['std'], 'std': d['std'], 'upper': d['std'], 'applies': True}
    live = getattr(machine, MACHINE_KEYS.get(d['key'], d['key']), None) if machine and d['group'] == 'MONITOR' else None
    std = live or d['std']
    dd = max(decimals(std), decimals(d.get('tol', d.get('tolUp', 0))))
    if d['check'] == 'EXACT':
        return {'code': code, 'check': 'EXACT', 'lower': std, 'std': std, 'upper': std, 'applies': True}
    if d['check'] == 'MAX ONLY':
        return {'code': code, 'check': 'MAX ONLY', 'lower': None, 'std': std, 'upper': fix(std + d['tolUp'], dd), 'applies': True}
    return {'code': code, 'check': 'RANGE', 'lower': fix(std - d['tol'], dd), 'std': std, 'upper': fix(std + d['tol'], dd), 'applies': True}


def default_rows(machine=None, counts=None):
    return [default_row(d, machine) for d in defs_for(counts)]


# ---------- Checking readings ----------


def resolve(d, r):
    """A recipe row → limits and display digits for the log. `na` rows aren't fitted; `text` rows hold a mode."""
    base = {'key': d['key'], 'code': d['code'], 'label': d['label'], 'unit': d.get('unit', ''), 'group': d['group'], 'step': d.get('step')}
    if not r or not r.get('applies') or r.get('check') == 'NA':
        return {**base, 'na': True}
    if r['check'] == 'TEXT':
        return {**base, 'text': str(r['std'])}
    std, lower, upper = r['std'], r.get('lower'), r.get('upper')
    digits = d.get('digits', max(decimals(std), decimals(lower or 0), decimals(upper or 0)))
    up = None if upper is None else fix(upper - std, digits)
    down = None if lower is None else fix(std - lower, digits)
    zero_tol = r['check'] == 'EXACT' or (up == 0 and down == 0)
    return {**base, 'std': std, 'lower': lower, 'upper': upper, 'digits': digits, 'zeroTol': zero_tol}


def sections(rows):
    """Resolved rows in sheet order, for one recipe's rows."""
    by_code = {r['code']: r for r in rows}
    return [resolve(d, by_code.get(d['code'])) for d in defs_for(counts_of(by_code))]


def is_numeric(row):
    return not row.get('na') and 'text' not in row


def check(row, value):
    """'low' | 'high' | None"""
    if not is_numeric(row) or value is None or value == '' or not isinstance(value, (int, float)):
        return None
    if row.get('lower') is not None and value < row['lower']:
        return 'low'
    if row.get('upper') is not None and value > row['upper']:
        return 'high'
    return None


def describe(row, value):
    """'1.0 °C below lower limit (45)' / '1 s above standard (18)'"""
    direction = check(row, value)
    if not direction:
        return ''
    limit = row['lower'] if direction == 'low' else row['upper']
    diff = to_fixed(abs(value - limit), row['digits'])
    where = 'standard' if row['zeroTol'] else 'lower limit' if direction == 'low' else 'upper limit'
    ref = row['std'] if row['zeroTol'] else limit
    return f"{diff} {row['unit']} {'below' if direction == 'low' else 'above'} {where} ({num_text(ref)})"


def format_reading(row, value):
    if row.get('na'):
        return 'NA'
    if value is None:
        return ''
    return to_fixed(value, row['digits']) if isinstance(value, (int, float)) else str(value)
