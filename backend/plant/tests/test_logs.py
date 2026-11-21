"""Parameter log entry, approval and reading times."""
from io import StringIO
from django.core.management import call_command
from django.utils import timezone
from ..services import logic
from ..services.shift_master import save_times
from ..models import Machine, Notification, ParameterLog, Setting, Shift, User
from .base import PlantTestCase, plant_time


class LogsTests(PlantTestCase):
    # ---------- Parameter log and two-level approval ----------

    def test_record_flags_deviation_and_runs_the_approval(self):
        op = self.client_for('operator')
        r = self.record(op, 7, nozzle=270, zone1=255, hrMode='STD')
        self.assertEqual(r.status_code, 200, r.content)
        devs = r.json()['deviations']
        self.assertEqual([(d['key'], d['status']) for d in devs], [('nozzle', 'open')])
        n = Notification.objects.get(type='detected')
        self.assertEqual(n.detail, '270.0 °C · 10.0 °C above upper limit (260)')

        # The supervisor hears about it; the operator who recorded it doesn't.
        sup = self.client_for('supervisor')
        # Supervisors hold 'record', so an open deviation asks them to act too.
        self.assertTrue(any(x['type'] == 'detected' and x['action'] and x['unread'] for x in sup.get('/api/notifications/').json()))
        self.assertEqual([x for x in op.get('/api/notifications/').json() if x['type'] == 'detected'], [])

        base = f'/api/logs/J10-25/{self.today}/deviations/7-nozzle'
        # Nobody may approve before a reason is given.
        self.assertEqual(sup.post(f'{base}/review/', {'decision': 'approve'}, format='json').status_code, 403)
        r = op.post(f'{base}/reason/', {'reason': 'Heater overshoot', 'lot': 'LOT 1'}, format='json')
        self.assertEqual(r.json()['deviations'][0]['status'], 'awaiting')
        self.assertEqual(r.json()['deviations'][0]['by'], 'operator')

        r = sup.post(f'{base}/review/', {'decision': 'approve', 'comment': 'ok'}, format='json')
        self.assertEqual(r.json()['deviations'][0]['status'], 'supervised')
        # Level 2 needs approveFinal, which the supervisor doesn't have.
        self.assertEqual(sup.post(f'{base}/review/', {'decision': 'approve'}, format='json').status_code, 403)

        mgr = self.client_for('manager')
        r = mgr.post(f'{base}/review/', {'decision': 'approve', 'comment': 'fine', 'masterChange': False}, format='json')
        d = r.json()['deviations'][0]
        self.assertEqual(d['status'], 'closed')
        self.assertEqual(d['l1']['by'], 'supervisor')
        self.assertEqual([x['level'] for x in d['reviews']], [1, 2])
        self.assertEqual(list(Notification.objects.order_by('id').values_list('type', flat=True)), ['detected', 'reason', 'l1', 'approved'])

    def test_reject_sends_it_back(self):
        op, sup = self.client_for('operator'), self.client_for('supervisor')
        self.record(op, 8, nozzle=240)
        base = f'/api/logs/J10-25/{self.today}/deviations/8-nozzle'
        op.post(f'{base}/reason/', {'reason': 'x'}, format='json')
        self.assertEqual(sup.post(f'{base}/review/', {'decision': 'reject'}, format='json').status_code, 400)  # needs a why
        d = sup.post(f'{base}/review/', {'decision': 'reject', 'comment': 'Attach QC report'}, format='json').json()['deviations'][0]
        self.assertEqual((d['status'], d['adminNote'], d['rejectedBy']), ('rejected', 'Attach QC report', 'Supervisor'))

    def test_edit_after_submit(self):
        op = self.client_for('operator')
        self.record(op, 9, nozzle=270, zone1=255)
        # Operators can't change a saved hour …
        self.assertEqual(self.record(op, 9, nozzle=255).status_code, 403)
        sup = self.client_for('supervisor')
        op.post(f'/api/logs/J10-25/{self.today}/deviations/9-nozzle/reason/', {'reason': 'x'}, format='json')
        # … a supervisor can; an unchanged value keeps its reason, a new one off limits starts open.
        devs = self.record(sup, 9, nozzle=270, zone1=200).json()['deviations']
        self.assertEqual({d['key']: d['status'] for d in devs}, {'nozzle': 'awaiting', 'zone1': 'open'})
        devs = self.record(sup, 9, nozzle=255, zone1=255).json()['deviations']
        self.assertEqual(devs, [])

    def test_roles_without_record_are_refused(self):
        mgr = self.client_for('manager')  # Manager doesn't hold 'record'
        self.assertEqual(self.record(mgr, 10, nozzle=255).status_code, 403)

    def test_machine_access_is_enforced(self):
        User.objects.filter(username='operator').update(access=['J10-26'])
        op = self.client_for('operator')
        self.assertEqual(self.record(op, 10, nozzle=255).status_code, 403)

    def test_bad_number_is_refused(self):
        r = self.record(self.client_for('operator'), 11, nozzle='hot')
        self.assertEqual(r.status_code, 400)
        self.assertIn('Nozzle temperature', r.json()['detail'])

    def test_malformed_readings_are_refused_not_crashed(self):
        # QA API-02: a list (or any non-object) for "values", or a non-object body, is a 400 with a message.
        op = self.client_for('operator')
        op.raise_request_exception = False
        url = f'/api/logs/J10-25/{self.today}/hours/10/'
        for payload in [{'values': [1, 2]}, {'values': 'nozzle=255'}, {'values': 255}, [1, 2]]:
            r = op.put(url, payload, format='json')
            self.assertEqual(r.status_code, 400, payload)
            self.assertIn('detail', r.json())
        self.assertFalse(ParameterLog.objects.filter(machine_id='J10-25', date=self.today).exclude(recorded={}).exists())

    def test_report_paging_values_are_validated(self):
        # QA API-01: offset / limit must be whole numbers; out-of-range values are clamped.
        mgr = self.client_for('manager')
        mgr.raise_request_exception = False
        f = {'from': self.today, 'to': self.today, 'shifts': ['A'], 'machines': [], 'mold': 'all', 'part': 'all', 'param': 'all', 'status': 'all'}
        for bad in [{'offset': 'abc'}, {'offset': 1.5}, {'limit': 'ten'}, {'limit': [5]}]:
            r = mgr.post('/api/report/', {'filters': f, **bad}, format='json')
            self.assertEqual(r.status_code, 400, bad)
            self.assertIn('whole number', r.json()['detail'])
        self.assertEqual(mgr.post('/api/report/', {'filters': f, 'offset': -5, 'limit': 10**9}, format='json').json()['offset'], 0)
        self.assertEqual(mgr.post('/api/report/', {'filters': 'all'}, format='json').status_code, 400)
        self.assertEqual(mgr.post('/api/report/', [f], format='json').status_code, 400)
        # Numbers sent as text still work, as a browser form would send them.
        self.assertEqual(mgr.post('/api/report/', {'filters': f, 'offset': '0', 'limit': '25'}, format='json').status_code, 200)
        # The audit trail's ?limit= follows the same rules.
        admin = self.client_for('admin')
        admin.raise_request_exception = False
        self.assertEqual(admin.get('/api/audit/?limit=abc').status_code, 400)
        self.assertEqual(admin.get('/api/audit/?limit=-5').status_code, 200)

    # ---------- When a reading may be saved (QA API-05 / API-06) ----------

    def test_future_days_and_hours_are_refused(self):
        self.set_clock(plant_time(3, 10, 20))  # 10:20 → the 11:00 reading is due
        op = self.client_for('operator')
        for date, hour in [('2030-01-01', 10), ('2026-11-04', 7), ('2026-11-03', 12), ('2026-11-03', 29)]:
            r = op.put(f'/api/logs/J10-25/{date}/hours/{hour}/', {'values': {'nozzle': 255}}, format='json')
            self.assertEqual(r.status_code, 400, (date, hour))
            self.assertIn('future', r.json()['detail'])
        # The due hour and the current hour are fine.
        for hour in (11, 10):
            self.assertEqual(op.put(f'/api/logs/J10-25/2026-11-03/hours/{hour}/', {'values': {'nozzle': 255}}, format='json').status_code, 200)

    def test_back_dated_entries_follow_the_shift_master_rule(self):
        self.set_clock(plant_time(3, 10, 20))
        Setting.put('shiftRules', {**Setting.get('shiftRules'), 'backDated': False})
        op, sup = self.client_for('operator'), self.client_for('supervisor')
        put = lambda c, date, hour, v=255: c.put(f'/api/logs/J10-25/{date}/hours/{hour}/', {'values': {'nozzle': v}}, format='json')  # noqa: E731
        # A missed hour today and an earlier day are refused while the rule is off …
        for date, hour in [('2026-11-03', 8), ('2026-11-02', 15), ('2025-01-01', 10)]:
            r = put(op, date, hour)
            self.assertEqual(r.status_code, 400, (date, hour))
            self.assertIn('Back-dated entries are switched off', r.json()['detail'])
        # … a reading that was saved on time can still be edited (that's "Edit after submit").
        self.assertEqual(put(op, '2026-11-03', 11).status_code, 200)
        self.assertEqual(put(sup, '2026-11-03', 11, 256).status_code, 200)
        # With the rule on, missed hours and earlier days can be filled in.
        Setting.put('shiftRules', {**Setting.get('shiftRules'), 'backDated': True})
        self.assertEqual(put(op, '2026-11-03', 8).status_code, 200)
        self.assertEqual(put(op, '2026-11-02', 15).status_code, 200)

    def test_after_midnight_belongs_to_the_production_day(self):
        self.set_clock(plant_time(4, 2, 10))  # 02:10 on the 4th is hour 26 of the 3rd
        op = self.client_for('operator')
        self.assertEqual(op.put('/api/logs/J10-25/2026-11-03/hours/27/', {'values': {'nozzle': 255}}, format='json').status_code, 200)
        self.assertEqual(op.put('/api/logs/J10-25/2026-11-04/hours/6/', {'values': {'nozzle': 255}}, format='json').status_code, 400)

    def test_data_collector_is_not_limited_by_entry_rules(self):
        Setting.put('shiftRules', {**Setting.get('shiftRules'), 'backDated': False})
        m = Machine.objects.get(id='J10-27')
        log, _, _ = logic.record_hour(m, timezone.localdate(plant_time(1, 12)), 9, {'nozzle': 255})
        self.assertIn('9', log.recorded)

    # ---------- Reading times follow the Shift Master ----------

    def set_shift(self, code, **fields):
        Shift.objects.filter(code=code).update(**fields)
        if 'start' in fields or 'end' in fields:  # the times that count are in Shift_Master
            s = Shift.objects.get(code=code)
            save_times(code, s.start, s.end)

    def test_interval_changes_the_reading_times(self):
        self.set_clock(plant_time(3, 10, 20))
        Setting.put('shiftRules', {**Setting.get('shiftRules'), 'backDated': False})
        self.set_shift('A', interval=30)
        op = self.client_for('operator')
        put = lambda hour: op.put(f'/api/logs/J10-25/2026-11-03/hours/{hour}/', {'values': {'nozzle': 270}}, format='json')  # noqa: E731
        r = put(10.5)  # 10:30 is now the next reading
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['deviations'][0]['id'], '10.5-nozzle')
        self.assertIn('10.5', r.json()['recorded'])
        self.assertEqual(put(11).status_code, 400)  # later than the next reading
        self.assertEqual(put('abc').status_code, 400)
        # The half-hour deviation runs through the approval like any other.
        r = op.post('/api/logs/J10-25/2026-11-03/deviations/10.5-nozzle/reason/', {'reason': 'x'}, format='json')
        self.assertEqual(r.json()['deviations'][0]['status'], 'awaiting')
        # With a 2-hour interval from 06:00, 11:00 is no longer a reading time at all.
        self.set_shift('A', interval=120)
        self.set_clock(plant_time(3, 12, 1))
        Setting.put('shiftRules', {**Setting.get('shiftRules'), 'backDated': True})
        r = put(11)
        self.assertEqual(r.status_code, 400)
        self.assertIn('not a reading time', r.json()['detail'])

    def test_shift_times_decide_the_slots_and_the_report(self):
        self.set_shift('A', start=7 * 60)
        self.set_shift('C', end=7 * 60)  # night now runs until 07:00
        self.assertEqual(logic.shift_of(6.5).code, 'C')
        self.assertEqual(logic.shift_of(7).code, 'A')
        self.assertEqual([h for h in logic.plant_slots() if h < 9], [6, 7, 8])  # 06:00 is now the night shift's last reading
        self.assertEqual(logic.shift_of(6).code, 'C')
        self.set_shift('G', active=True, start=8 * 60, end=9 * 60, interval=30)
        self.assertIn(8.5, logic.plant_slots())
        self.set_shift('G', active=False)
        Setting.put('shiftRules', {**Setting.get('shiftRules'), 'firstAtStart': False})
        self.assertNotIn(7, logic.plant_slots())
        Setting.put('shiftRules', {**Setting.get('shiftRules'), 'firstAtStart': True})

        op = self.client_for('operator')
        self.record(op, 7, nozzle=255)  # shift A by the new times
        self.record(op, 14, nozzle=255)  # shift B
        f = {'from': self.today, 'to': self.today, 'machines': [], 'mold': 'all', 'part': 'all', 'param': 'all', 'status': 'all'}
        mgr = self.client_for('manager')
        values = lambda shifts: mgr.post('/api/report/', {'filters': {**f, 'shifts': shifts}}, format='json').json()['stats']['values']  # noqa: E731
        self.assertEqual((values(['A']), values(['B']), values(['C']), values(['A', 'B', 'C'])), (1, 1, 0, 2))
        # A reading from before the times changed stays in the "all shifts" report.
        log = ParameterLog.objects.get(machine_id='J10-25', date=self.today)
        log.recorded['6'] = {'nozzle': 255}
        log.save()
        self.assertEqual((values(['A', 'B', 'C']), values(['C'])), (3, 1))

    def test_grace_period(self):
        Setting.put('shiftRules', {**Setting.get('shiftRules'), 'backDated': False})
        op = self.client_for('operator')
        put = lambda m, hour: op.put(f'/api/logs/{m}/2026-11-03/hours/{hour}/', {'values': {'nozzle': 255}}, format='json')  # noqa: E731
        self.set_clock(plant_time(3, 10, 12))  # 12 min late: grace 10 + clock tolerance 2
        self.assertEqual(put('J10-25', 10).status_code, 200)
        self.set_clock(plant_time(3, 10, 13))
        self.assertEqual(put('J10-26', 10).status_code, 400)
        self.set_shift('A', grace=30)
        self.assertEqual(put('J10-26', 10).status_code, 200)
        # Grace rule off: only the clock tolerance is left.
        Setting.put('shiftRules', {**Setting.get('shiftRules'), 'grace': False})
        self.assertEqual(put('J10-27', 10).status_code, 400)

    def test_no_active_shift_means_no_reading_due(self):
        Shift.objects.update(active=False)
        self.assertEqual(logic.plant_slots(), [])
        r = self.record(self.client_for('operator'), 23, nozzle=255)
        self.assertEqual(r.status_code, 400)

    def test_live_carries_the_shift_master(self):
        self.set_shift('A', name='Morning 2')
        live = self.client_for('operator').get('/api/live/').json()
        self.assertEqual(live['shiftMaster']['shifts'][0]['name'], 'Morning 2')

    def test_simulator_follows_the_reading_times(self):
        self.set_shift('C', interval=120)  # 23:30 → next slot in shift C (22:00, 00:00 …) is 24
        call_command('simulate', once=True, seed=1, stdout=StringIO())
        keys = {k for log in ParameterLog.objects.exclude(recorded={}) for k in log.recorded}
        self.assertEqual(keys, {'24'})

