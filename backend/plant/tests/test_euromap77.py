"""EUROMAP 77 (FANUC ROBOSHOT OPC UA) names: the mapping, the telemetry API and the first load."""
from django.test import SimpleTestCase

from integrations.fanuc import euromap77
from integrations.fanuc.euromap77 import from_euromap, node_for

from ..models import Machine
from ..services import params
from .base import PlantTestCase


class MappingTests(SimpleTestCase):
    def test_durations_arrive_in_milliseconds_and_become_seconds(self):
        out = from_euromap({'CycleTime': 26150, 'InjectionTime': 668, 'DosingTime': 5200})
        self.assertEqual(out, {'cycle': 26.15, 'injection': 0.668, 'recovery': 5.2})

    def test_full_paths_short_paths_and_browse_names_are_all_understood(self):
        root = euromap77.ROOT
        for key in (f'{root}/ROBOSHOTCycleParametersEvent/CycleTime', 'ROBOSHOTCycleParametersEvent/CycleTime', 'CycleTime'):
            self.assertEqual(from_euromap({key: 30000})['cycle'], 30.0, key)

    def test_analog_items_may_carry_their_unit(self):
        self.assertEqual(from_euromap({'SpecificPressureMaximum': {'value': 115, 'unit': 'MPa'}})['peakPressure'], 115)

    def test_machine_mode_becomes_the_dashboard_status(self):
        for mode, status in [('AUTOMATIC', 'run'), (2, 'run'), ('MANUAL', 'idle'), ('SETUP', 'maint'), ('SLEEP', 'idle')]:
            self.assertEqual(from_euromap({'MachineMode': mode})['status'], status, mode)
        self.assertEqual(from_euromap({'MachineMode': 'AUTOMATIC', 'IsPresent': False})['status'], 'off')

    def test_unknown_or_bad_values_are_ignored(self):
        self.assertEqual(from_euromap({'CycleTime': 'fast', 'MachineMode': 'DANCING', 'Nonsense': 1}), {})
        self.assertEqual(from_euromap(None), {})

    def test_every_mapped_code_is_a_real_parameter(self):
        codes = {d['code'] for d in params.PARAM_DEFS} | {make(i)['code'] for _, top, make in params.SERIES for i in range(1, top + 1)}
        for code in euromap77.PARAMS:
            self.assertIn(code, codes)
        self.assertEqual(node_for('TMP_NOZ')['path'], 'ROBOSHOTCycleParametersEvent/InjUnitCycParams_1/BrlTmpZnCycParams_1/ActualTemperature')
        self.assertEqual(node_for('TMP_Z3')['path'], 'ROBOSHOTCycleParametersEvent/InjUnitCycParams_1/BrlTmpZnCycParams_4/ActualTemperature')
        self.assertIsNone(node_for('TMP_Z12'))  # the ROBOSHOT has 11 barrel zones, the nozzle being one
        self.assertIsNone(node_for('INJ_HOLDP1'))  # setpoints are not published by EUROMAP 77


class EuromapApiTests(PlantTestCase):
    def test_telemetry_accepts_euromap_77_names(self):
        payload = {'MachineMode': 'AUTOMATIC', 'CycleTime': 24800, 'CushionVolume': 3.9, 'InjectionTime': 702, 'SpecificPressureMaximum': 118.5, 'DosingTime': 5100}
        r = self.client_for('admin').post('/api/machines/J10-25/telemetry/', payload, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        m = Machine.objects.get(id='J10-25')
        self.assertEqual((m.status, m.cycle, m.cushion, m.injection, m.peak_pressure, m.recovery), ('run', 24.8, 3.9, 0.702, 118.5, 5.1))

    def test_mpcr_names_sent_alongside_win(self):
        self.client_for('admin').post('/api/machines/J10-25/telemetry/', {'MachineMode': 'AUTOMATIC', 'status': 'alarm'}, format='json')
        self.assertEqual(Machine.objects.get(id='J10-25').status, 'alarm')

    def test_first_load_carries_the_mapping(self):
        doc = self.client_for('operator').get('/api/bootstrap/').json()['euromap77']
        self.assertEqual(doc['root'], 'IMM_FANUC_ROBOSHOT<MachineID>')
        self.assertEqual(doc['params']['MON_CYCLE']['path'], 'Jobs/ActiveJobValues/LastCycleTime')
        self.assertNotIn('INJ_HOLDP1', doc['params'])


def collector_message(name='J1030', node='IMM_FANUC_ROBOSHOT0005', **data):
    """A message exactly as the plant's collector publishes it on factory/euromap77/raw."""
    return {'machine_node': node, 'machine': name, 'ts': '2026-11-11T10:00:00+00:00', 'data': data}


class CollectorTests(SimpleTestCase):
    def test_node_ids_match_the_gateway(self):
        self.assertEqual(euromap77.node_id('IMM_FANUC_ROBOSHOT0005', 'Jobs/ActiveJobValues/LastCycleTime'), 'ns=6;s=IMM_FANUC_ROBOSHOT0005.Jobs.ActiveJobValues.LastCycleTime')

    def test_collector_keys_become_mpcr_fields(self):
        msg = collector_message(operating_status=1, cycletime=24800.0, tool='M1098_COND', jobcyclecounter=512, actualcavity=2, ProductName=['MSI60983822'])
        name, node, fields, extra = euromap77.from_collector(msg)
        self.assertEqual((name, node), ('J1030', 'IMM_FANUC_ROBOSHOT0005'))
        self.assertEqual(fields, {'status': 'run', 'cycle': 24.8})
        self.assertEqual(extra['tool'], 'M1098_COND')

    def test_dotted_node_paths_are_understood(self):
        self.assertEqual(from_euromap({'Jobs.ActiveJobValues.LastCycleTime': 30000, 'MachineStatus.MachineMode': 4}), {'status': 'maint', 'cycle': 30.0})

    def test_not_a_collector_message(self):
        self.assertEqual(euromap77.from_collector({'hello': 1}), (None, None, {}, {}))


class BridgeTests(PlantTestCase):
    def setUp(self):
        super().setUp()
        from integrations.fanuc.bridge import Bridge

        self.bridge = Bridge()

    def test_machine_names_match_mpcr_ids_without_punctuation(self):
        mid, fields = self.bridge.apply(collector_message('J1030', operating_status=1, cycletime=25500))
        self.assertEqual(mid, 'J10-30')
        m = Machine.objects.get(id='J10-30')
        self.assertEqual((m.status, m.cycle), ('run', 25.5))
        self.assertIsNotNone(m.telemetry_at)

    def test_only_the_values_sent_are_changed(self):
        Machine.objects.filter(id='J10-30').update(cushion=3.3)
        self.bridge.apply(collector_message('J1030', cycletime=26000))
        self.assertEqual(Machine.objects.get(id='J10-30').cushion, 3.3)

    def test_unknown_machines_are_skipped_and_remembered(self):
        self.assertEqual(self.bridge.apply(collector_message('ZZ999', operating_status=1)), (None, {}))
        self.assertIn('ZZ999', self.bridge.unmatched)

    def test_pinned_names_win(self):
        from django.test import override_settings
        from integrations.fanuc.bridge import Bridge

        with override_settings(FANUC_MACHINE_MAP='IMM_FANUC_ROBOSHOT0099=J10-25'):
            mid, _ = Bridge().apply(collector_message('PRESS-7', node='IMM_FANUC_ROBOSHOT0099', operating_status=3))
        self.assertEqual(mid, 'J10-25')
        self.assertEqual(Machine.objects.get(id='J10-25').status, 'idle')
