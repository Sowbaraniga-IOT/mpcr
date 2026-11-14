"""Stand-in for the OPC UA gateway until the machines are connected.

Every few seconds each running machine's last-shot values move a little (drifting back towards
its recipe standard), and machines with data source "auto" record their hourly reading by
themselves; now and then a value lands outside its limits and raises a deviation, exactly as a
manual entry would.

    python manage.py simulate                 # run until Ctrl+C, a tick every 5 s
    python manage.py simulate --once          # one tick (e.g. from a scheduler)
    python manage.py simulate --backfill 7    # first record the last 7 days for auto machines
"""
import random
import time
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from plant.services import logic, params
from plant.models import Machine, slot_key, slot_label

# Live values the dashboard shows, and the recipe key each one is logged under.
TELEMETRY = {'cycle': 'cycle', 'cushion': 'cushion', 'injection': 'injection', 'peak_pressure': 'peakPressure', 'recovery': 'recovery'}
NOISE = {'cycle': 0.25, 'cushion': 0.08, 'injection': 0.015, 'peak_pressure': 1.5, 'recovery': 0.15}
STATUS_CHANGE = 0.004  # chance per machine per tick that a running machine stops (or a stopped one starts)


def reading(machine, rows, rng, deviation_rate):
    """One hour's values: standards, live values for the Monitor rows, a little temperature wander."""
    values = {}
    for row in rows:
        if row.get('na'):
            continue
        if 'text' in row:
            values[row['key']] = row['text']
            continue
        field = next((f for f, k in TELEMETRY.items() if k == row['key']), None)
        live = getattr(machine, field) if field else None
        v = live if live is not None else row['std']
        if row['unit'] == '°C' and rng.random() < 0.12:
            v = row['std'] + rng.choice([0.2, 0.3, -0.2])
        values[row['key']] = params.fix(v, row['digits'])
    if rng.random() < deviation_rate:
        candidates = [r for r in rows if params.is_numeric(r)]
        row = rng.choice(candidates)
        step = row.get('step') or 1
        up = row['lower'] is None or (row['upper'] is not None and rng.random() < 0.5)
        values[row['key']] = params.fix(row['upper'] + step if up else row['lower'] - step, row['digits'])
    return values


class Command(BaseCommand):
    help = 'Simulate live machine data and automatic hourly readings'

    def add_arguments(self, parser):
        parser.add_argument('--interval', type=float, default=5, help='seconds between ticks')
        parser.add_argument('--once', action='store_true', help='run a single tick and stop')
        parser.add_argument('--backfill', type=int, default=0, help='days of past readings to record first')
        parser.add_argument('--deviation-rate', type=float, default=0.06, help='chance an automatic reading has a value off limits')
        parser.add_argument('--seed', type=int, default=None)

    def handle(self, *args, interval, once, backfill, deviation_rate, seed, **kw):
        rng = random.Random(seed)
        if backfill:
            self.backfill(backfill, rng, deviation_rate)
        self.stdout.write(f'Simulating {Machine.objects.filter(active=True).count()} machines every {interval:g} s. Ctrl+C stops.')
        try:
            while True:
                self.tick(rng, deviation_rate)
                if once:
                    break
                time.sleep(interval)
        except KeyboardInterrupt:
            self.stdout.write('Stopped.')

    def tick(self, rng, deviation_rate):
        now = logic.local_now()
        today = logic.production_date(now)
        # The reading the parameter log asks for next, by the Shift Master.
        due = logic.next_slot(logic.shift_hour(now), logic.plant_slots())
        for m in Machine.objects.filter(active=True):
            rows = logic.rows_for(m)
            std = {r['key']: r.get('std') for r in rows if params.is_numeric(r)}
            # Running machines stop now and then; stopped ones come back.
            if rng.random() < STATUS_CHANGE:
                m.status = rng.choice(['idle', 'alarm', 'maint']) if m.status == 'run' else 'run'
            if m.status == 'off':
                continue
            for field, key in TELEMETRY.items():
                target = std.get(key)
                v = getattr(m, field)
                if v is None:
                    v = target
                if v is None:
                    continue
                pull = 0.1 * (target - v) if target is not None else 0
                setattr(m, field, round(max(0.01, v + pull + rng.gauss(0, NOISE[field])), 3 if field == 'injection' else 2))
            if m.status == 'run':
                m.progress = min(100, m.progress + (1 if rng.random() < 0.2 else 0))
            m.telemetry_at = timezone.now()
            m.save()
            if m.data_source == 'auto' and m.status != 'off' and due is not None:
                log = logic.log_for(m, today)
                if slot_key(due) not in log.recorded:
                    logic.record_hour(m, today, due, reading(m, rows, rng, deviation_rate))
                    self.stdout.write(f'{m.id} recorded {slot_label(due)}')

    def backfill(self, days, rng, deviation_rate):
        today = logic.production_date()
        now_hour = logic.shift_hour()
        slots = logic.plant_slots()
        for m in Machine.objects.filter(active=True, data_source='auto'):
            rows = logic.rows_for(m)
            for back in range(days, -1, -1):
                date = today - timedelta(days=back)
                log = logic.log_for(m, date)
                for hour in slots:
                    if back == 0 and hour > now_hour:
                        break
                    if slot_key(hour) not in log.recorded:
                        logic.record_hour(m, date, hour, reading(m, rows, rng, deviation_rate))
        self.stdout.write(f'Backfilled {days} day(s) of automatic readings.')
