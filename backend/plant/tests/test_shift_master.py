"""The Shift_Master table (models.ShiftMaster) holds the shift times; services/shift_master.py."""
from datetime import datetime, time

from django.utils import timezone

from ..models import Shift, ShiftMaster
from ..services import logic
from ..services.shift_master import save_times, to_minute, with_master_times
from .base import PlantTestCase


def stamp(hh, mm=0):
    return timezone.make_aware(datetime(2000, 1, 1, hh, mm))


class ShiftMasterTableTests(PlantTestCase):
    def test_seed_fills_shift_master(self):
        rows = {m.Shift_Code: m for m in ShiftMaster.objects.all()}
        self.assertEqual(set(rows), set(Shift.objects.values_list('code', flat=True)))
        for s in Shift.objects.all():
            m = rows[s.code]
            self.assertEqual((to_minute(m.start_tm), to_minute(m.end_tm), m.time_diff), (s.start, s.end, s.time_diff))
            self.assertEqual(m.Unit_code, 'SML')

    def test_times_come_from_shift_master(self):
        # Changed in the table itself (admin, SQL, another program): the reading schedule follows at once.
        ShiftMaster.objects.filter(Shift_Code='A').update(start_tm=stamp(7), end_tm=stamp(15), time_diff='08:00')
        a = next(s for s in logic.active_shifts() if s.code == 'A')
        self.assertEqual((a.start, a.end), (420, 900))
        self.assertIn(7, logic.plant_slots())
        doc = self.client_for('admin').get('/api/shift-master/').json()
        row = next(s for s in doc['shifts'] if s['code'] == 'A')
        self.assertEqual((row['start'], row['end'], row['unitCode'], row['timeDiff']), (420, 900, 'SML', '08:00'))

    def test_row_only_in_shift_master_counts_with_default_settings(self):
        ShiftMaster.objects.create(Unit_code='SML', Shift_Code='D', start_tm=stamp(9), end_tm=stamp(17, 30), time_diff='08:30')
        d = next(s for s in with_master_times() if s.code == 'D')
        self.assertEqual((d.name, d.start, d.end, d.interval, d.active, d.unit_code), ('Shift D', 540, 1050, 60, True, 'SML'))
        self.assertFalse(Shift.objects.filter(code='D').exists())  # reading never writes

    def test_switched_off_shift_stays_off(self):
        Shift.objects.filter(code='G').update(active=False)
        self.assertNotIn('G', [s.code for s in logic.active_shifts()])

    def test_screen_save_writes_shift_master(self):
        admin = self.client_for('admin')
        doc = admin.get('/api/shift-master/').json()
        a = next(s for s in doc['shifts'] if s['code'] == 'A')
        a.update(start=6 * 60 + 30, end=14 * 60 + 30, unitCode='MSSL')
        self.assertEqual(admin.put('/api/shift-master/', doc, format='json').status_code, 200)
        m = ShiftMaster.objects.get(Shift_Code='A')
        self.assertEqual((m.Unit_code, to_minute(m.start_tm), to_minute(m.end_tm), m.time_diff), ('MSSL', 390, 870, '08:00'))
        # A shift removed on the screen leaves Shift_Master too; blank unit → PLANT_UNIT_CODE.
        doc['shifts'] = [s for s in doc['shifts'] if s['code'] != 'G']
        doc['shifts'].append({'code': 'N', 'name': 'Night 2', 'start': 0, 'end': 360, 'interval': 60, 'grace': 10, 'supervisor': '', 'active': False})
        self.assertEqual(admin.put('/api/shift-master/', doc, format='json').status_code, 200)
        self.assertFalse(ShiftMaster.objects.filter(Shift_Code='G').exists())
        self.assertEqual(ShiftMaster.objects.get(Shift_Code='N').Unit_code, 'SML')

    def test_code_is_one_character(self):
        admin = self.client_for('admin')
        admin.raise_request_exception = False
        doc = admin.get('/api/shift-master/').json()
        doc['shifts'][0]['code'] = 'AB'
        r = admin.put('/api/shift-master/', doc, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('one letter or digit', r.json()['detail'])

    def test_night_shift_past_midnight(self):
        save_times('C', 22 * 60, 6 * 60)
        m = ShiftMaster.objects.get(Shift_Code='C')
        self.assertEqual(m.time_diff, '08:00')
        self.assertEqual(timezone.localtime(m.end_tm).time(), time(6, 0))
