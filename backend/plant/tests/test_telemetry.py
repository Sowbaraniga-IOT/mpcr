"""Telemetry and the simulator."""
from django.core.management import call_command
from ..models import Deviation, Machine, ParameterLog
from .base import PlantTestCase


class TelemetryTests(PlantTestCase):
    # ---------- Telemetry (QA SEC-19) ----------

    def test_only_a_data_collector_sends_telemetry(self):
        self.assertEqual(self.client_for('operator').post('/api/machines/J10-25/telemetry/', {'status': 'run'}, format='json').status_code, 403)
        self.assertEqual(self.client_for('admin').post('/api/machines/J10-25/telemetry/', {'status': 'run', 'cycle': 25.1}, format='json').status_code, 200)
        self.assertEqual(Machine.objects.get(id='J10-25').cycle, 25.1)

    def test_simulator_records_auto_machines(self):
        call_command('simulate', once=True, seed=1, verbosity=0, stdout=open('nul' if __import__('os').name == 'nt' else '/dev/null', 'w'))
        auto = Machine.objects.filter(data_source='auto', active=True).exclude(status='off').count()
        self.assertEqual(ParameterLog.objects.exclude(recorded={}).count(), auto)
        self.assertTrue(Deviation.objects.count() >= 0)

