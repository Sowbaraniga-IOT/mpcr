"""MPCR performance and load test (standard library only).

    backend\\.venv\\Scripts\\python qa\\perf\\load.py [--days 14] [--users 50] [--seconds 60]

1. Builds its own database (qa/perf/out/perf.sqlite3): seed + `simulate --backfill` for every machine,
   i.e. a plant that has been logging for --days days.
2. Starts the backend on :8002 and times each endpoint once on that data.
3. Runs --users virtual users for --seconds: 80 % readers (live, notifications, report, sheets),
   20 % operators saving readings at the same time (the SQLite write path).
Writes qa/perf/out/results.json. Your development database is not touched.
"""
import argparse
import json
import os
import random
import secrets
import shutil
import statistics
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / 'backend'
PY = BACKEND / '.venv' / 'Scripts' / 'python.exe'
OUT = ROOT / 'qa' / 'perf' / 'out'
DB = OUT / 'perf.sqlite3'
PORT = 8002
BASE = f'http://127.0.0.1:{PORT}/api'

ENV = {
    **os.environ,
    'SQLITE_PATH': str(DB),
    'DJANGO_ENV_FILE': 'none.env',
    'DJANGO_DEBUG': '0',
    'DJANGO_SECRET_KEY': secrets.token_urlsafe(48),
    'DJANGO_ALLOWED_HOSTS': 'localhost,127.0.0.1',
    'DJANGO_LOGIN_IP_MAX_FAILURES': '100000',
}


def manage(*args, **kw):
    return subprocess.run([str(PY), 'manage.py', *args], cwd=BACKEND, env=ENV, check=True, capture_output=True, text=True, **kw)


def call(method, path, token=None, body=None, timeout=60):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('Authorization', f'Token {token}')
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = r.read()
            return r.status, (time.perf_counter() - t0) * 1000, len(data), json.loads(data or b'null')
    except urllib.error.HTTPError as e:
        return e.code, (time.perf_counter() - t0) * 1000, 0, None
    except Exception as e:  # timeouts, refused connections
        return f'error: {type(e).__name__}', (time.perf_counter() - t0) * 1000, 0, None


def sign_in(user):
    status, _, _, body = call('POST', '/auth/login/', body={'loginId': user, 'password': f'{user}@2026'})
    assert status == 200, f'{user} sign-in: {status}'
    return body['token']


def production_today():
    now = datetime.now()
    return (now - timedelta(days=1)).date() if now.hour < 6 else now.date()


def report_filters(days):
    to = production_today()
    return {'from': (to - timedelta(days=days)).isoformat(), 'to': to.isoformat(), 'shifts': ['A', 'B', 'C'], 'machines': [], 'mold': 'all', 'part': 'all', 'param': 'all', 'status': 'all'}


def pct(values, p):
    values = sorted(values)
    return round(values[min(len(values) - 1, int(len(values) * p / 100))], 1) if values else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--days', type=int, default=14)
    ap.add_argument('--users', type=int, default=50)
    ap.add_argument('--seconds', type=int, default=60)
    ap.add_argument('--no-report', action='store_true', help='readers never run the report (control run)')
    ap.add_argument('--reuse', action='store_true', help='keep the test plant from the last run')
    ap.add_argument('--out', default='results.json')
    ap.add_argument('--realistic', action='store_true', help='readers poll like the app: live every 10 s, notifications every 15 s; 1 in 10 runs a report each minute')
    args = ap.parse_args()

    result = {'ranAt': datetime.now().isoformat(timespec='seconds'), 'days': args.days, 'users': args.users, 'seconds': args.seconds, 'report': not args.no_report, 'profile': 'app polling' if args.realistic else 'stress (0.2–1 s think time)'}
    if args.reuse and DB.exists():
        prev = json.loads((OUT / 'results.json').read_text(encoding='utf-8'))
        result.update(backfillSeconds=prev['backfillSeconds'], data=prev['data'])
        print('• Reusing the test plant from the last run')
    else:
        shutil.rmtree(OUT, ignore_errors=True)
        OUT.mkdir(parents=True, exist_ok=True)  # OneDrive may still hold the emptied folder

        print(f'• Building the test plant: seed + {args.days} days of hourly readings for every machine')
        manage('migrate', '-v', '0')
        manage('seed')
        manage('shell', '-c', "from plant.models import Machine, Setting\nMachine.objects.update(data_source='auto', active=True)\nSetting.put('shiftRules', {**Setting.get('shiftRules', {}), 'backDated': True})")
        t0 = time.perf_counter()
        manage('simulate', '--backfill', str(args.days), '--once', '--seed', '7')
        result['backfillSeconds'] = round(time.perf_counter() - t0, 1)
        counts = json.loads(manage('shell', '-c', "import json\nfrom plant.models import ParameterLog, Deviation\nprint(json.dumps({'sheets': ParameterLog.objects.count(), 'values': sum(len(v) for l in ParameterLog.objects.all() for v in l.recorded.values()), 'deviations': Deviation.objects.count()}))").stdout.strip().splitlines()[-1])
        result['data'] = {**counts, 'dbMb': round(DB.stat().st_size / 1048576, 1)}
        print(f"  {counts['sheets']} sheets · {counts['values']:,} values · {counts['deviations']} deviations · {result['data']['dbMb']} MB · {result['backfillSeconds']} s")

    print(f'• Starting the backend on :{PORT}')
    server = subprocess.Popen([str(PY), 'manage.py', 'runserver', f'127.0.0.1:{PORT}', '--noreload'], cwd=BACKEND, env=ENV, stdout=subprocess.DEVNULL, stderr=open(OUT / 'backend.log', 'w'))
    try:
        for _ in range(100):
            if call('GET', '/auth/me/')[0] == 401:
                break
            time.sleep(0.3)

        # ----- Single requests on the full data -----
        admin = sign_in('admin')
        single = {}
        f_all = report_filters(args.days)
        for name, method, path, body in [
            ('bootstrap', 'GET', '/bootstrap/', None),
            ('live', 'GET', '/live/', None),
            ('notifications', 'GET', '/notifications/', None),
            ('log sheet', 'GET', f'/logs/J10-25/{production_today().isoformat()}/', None),
            (f'report, {args.days} days, page 1', 'POST', '/report/', {'filters': f_all, 'offset': 0, 'limit': 25}),
            (f'report, {args.days} days, last page', 'POST', '/report/', {'filters': f_all, 'offset': 10**8, 'limit': 25}),
            (f'report, {args.days} days, deviations only', 'POST', '/report/', {'filters': {**f_all, 'status': 'deviations'}, 'offset': 0, 'limit': 25}),
            ('report, export 20,000 rows', 'POST', '/report/', {'filters': f_all, 'offset': 0, 'limit': 20000}),
        ]:
            status, ms, size, body_ = call(method, path, admin, body, timeout=300)
            single[name] = {'status': status, 'ms': round(ms), 'kb': round(size / 1024)}
            if name.endswith('page 1') and body_:
                single[name]['totalRows'] = body_['total']
            print(f'  {name:<40} {status}  {ms:8.0f} ms  {size / 1024:8.0f} KB')
        result['single'] = single

        # ----- Concurrent users -----
        print(f'• {args.users} users for {args.seconds} s (80 % reading, 20 % saving readings)')
        tokens = {u: sign_in(u) for u in ['admin', 'manager', 'supervisor', 'operator']}
        # The backfill filled every past hour of today, so saving one is an edit: that needs "Edit after submit" (supervisor).
        # Stress: a fifth of the users keep saving. App polling: the real peak, every one of the 48 machines
        # saving its reading once within the minute after the hour turns (on top of all the readers).
        writers = 48 if args.realistic else max(1, args.users // 5)
        stats = {}
        lock = threading.Lock()
        machines = [f'J10-{25 + i}' for i in range(48)]
        now_hour = datetime.now().hour + (24 if datetime.now().hour < 6 else 0)
        free_hours = [h for h in range(6, 30) if h <= now_hour - 1] or [6]  # earlier hours today (back-dated on)
        slots = [(m, h) for m in machines for h in free_hours]
        random.Random(1).shuffle(slots)
        slot_iter = iter(slots)
        today = production_today().isoformat()
        stop_at = time.time() + args.seconds

        def record(kind, status, ms):
            with lock:
                s = stats.setdefault(kind, {'ms': [], 'errors': {}})
                s['ms'].append(ms)
                if status not in (200, 201):
                    s['errors'][str(status)] = s['errors'].get(str(status), 0) + 1

        def polling_reader(i):
            # As the app behaves: dashboard polls live every 10 s and notifications every 15 s.
            rng = random.Random(i)
            token = tokens[['admin', 'manager', 'supervisor', 'operator'][i % 4]]
            next_live = time.time() + rng.uniform(0, 10)
            next_notes = time.time() + rng.uniform(0, 15)
            next_report = time.time() + rng.uniform(0, 60) if i % 10 == 0 and not args.no_report else float('inf')
            while time.time() < stop_at:
                now = time.time()
                if now >= next_live:
                    record('live', *call('GET', '/live/', token, timeout=120)[:2])
                    next_live += 10
                if now >= next_notes:
                    record('notifications', *call('GET', '/notifications/', token, timeout=120)[:2])
                    next_notes += 15
                if now >= next_report:
                    record('report', *call('POST', '/report/', tokens['manager'], {'filters': f_all, 'offset': 0, 'limit': 25}, timeout=120)[:2])
                    next_report += 60
                time.sleep(0.1)

        def reader(i):
            if args.realistic:
                return polling_reader(i)
            rng = random.Random(i)
            token = tokens[['admin', 'manager', 'supervisor', 'operator'][i % 4]]
            while time.time() < stop_at:
                r = rng.random()
                if r < 0.6:
                    kind, args_ = 'live', ('GET', '/live/', token)
                elif r < 0.8:
                    kind, args_ = 'notifications', ('GET', '/notifications/', token)
                elif r < 0.9 or args.no_report:
                    kind, args_ = 'log sheet', ('GET', f'/logs/{rng.choice(machines)}/{today}/', token)
                else:
                    kind, args_ = 'report', ('POST', '/report/', tokens['manager'], {'filters': f_all, 'offset': 0, 'limit': 25})
                status, ms, _, _ = call(*args_, timeout=120)
                record(kind, status, ms)
                time.sleep(rng.uniform(0.2, 1.0))  # think time

        def writer(i):
            rng = random.Random(1000 + i)
            if args.realistic:
                time.sleep(rng.uniform(0, min(60, args.seconds - 1)))
            while time.time() < stop_at:
                with lock:
                    slot = next(slot_iter, None)
                if not slot:
                    break
                m, h = slot
                values = {'nozzle': 255 + rng.choice([0, 0, 0, 12]), 'zone1': 255, 'zone2': 250, 'zone3': 245, 'mold': 60, 'hrMode': 'STD'}
                status, ms, _, _ = call('PUT', f'/logs/{m}/{today}/hours/{h}/', tokens['supervisor'], {'values': values}, timeout=120)
                record('save reading', status, ms)
                if args.realistic:
                    break  # one reading per machine per hour
                time.sleep(rng.uniform(0.5, 2.0))

        t0 = time.time()
        with ThreadPoolExecutor(max_workers=args.users) as pool:
            for i in range(args.users if args.realistic else args.users - writers):
                pool.submit(reader, i)
            for i in range(writers):
                pool.submit(writer, i)
        elapsed = time.time() - t0
        load = {}
        for kind, s in stats.items():
            load[kind] = {'requests': len(s['ms']), 'p50': pct(s['ms'], 50), 'p95': pct(s['ms'], 95), 'p99': pct(s['ms'], 99), 'max': round(max(s['ms'])), 'errors': s['errors']}
            print(f"  {kind:<16} {len(s['ms']):6} req   p50 {load[kind]['p50']:7} ms   p95 {load[kind]['p95']:7} ms   max {load[kind]['max']:7} ms   errors {s['errors'] or 0}")
        total = sum(len(s['ms']) for s in stats.values())
        result['load'] = {'byKind': load, 'totalRequests': total, 'throughputPerSec': round(total / elapsed, 1), 'errors': sum(sum(s['errors'].values()) for s in stats.values())}
        print(f"  total {total} requests · {result['load']['throughputPerSec']} req/s · {result['load']['errors']} errors")
    finally:
        subprocess.run(['taskkill', '/PID', str(server.pid), '/T', '/F'], capture_output=True)

    (OUT / args.out).write_text(json.dumps(result, indent=1), encoding='utf-8')
    print(f'Results: {OUT / args.out}')


if __name__ == '__main__':
    sys.exit(main())
