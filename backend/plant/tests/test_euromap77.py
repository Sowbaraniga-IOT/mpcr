"""EUROMAP 77 (FANUC ROBOSHOT OPC UA) names: the mapping, the telemetry API and the first load."""
from django.test import SimpleTestCase, override_settings

from integrations.fanuc import euromap77
from integrations.fanuc.euromap77 import from_euromap, node_for

from ..models import Machine, slot_key
from ..services import params
from .base import PlantTestCase, plant_time


@override_settings(FANUC_DURATION_UNIT='ms')  # sample durations in milliseconds
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
        self.assertEqual(node_for('INJ_HOLDP1')['kind'], 'derived')  # from FANUC's step records
        self.assertEqual(node_for('INJ_BACKP')['kind'], 'derived')  # from the first present recovery step
        self.assertIsNone(node_for('NOT_A_CODE'))


@override_settings(FANUC_DURATION_UNIT='ms')  # sample durations in milliseconds
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
        self.assertEqual(doc['params']['INJ_HOLDP1']['path'], 'FANUCMoldingParameters/PackParameters/Step/Step_<n>/Pressure')
        self.assertEqual(doc['params']['INJ_BACKP']['path'], 'FANUCMoldingParameters/ExtruderParameters/Step/Step_<n>/BackPressure')


def collector_message(name='J1030', node='IMM_FANUC_ROBOSHOT0005', **data):
    """A message exactly as the plant's collector publishes it on factory/euromap77/raw."""
    return {'machine_node': node, 'machine': name, 'ts': '2026-11-11T10:00:00+00:00', 'data': data}


@override_settings(FANUC_DURATION_UNIT='ms')  # sample durations in milliseconds
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


@override_settings(FANUC_DURATION_UNIT='ms')  # sample durations in milliseconds
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


# ---------- Parameter sheet filled from the collector ----------

FULL_SHOT = {
    'operating_status': 1,
    'cycletime': 26150.0,
    'ROBOSHOTCycleParametersEvent.InjUnitCycParams_1.CushionVolume': 3.8,
    'ROBOSHOTCycleParametersEvent.InjUnitCycParams_1.InjectionTime': 668,
    'ROBOSHOTCycleParametersEvent.InjUnitCycParams_1.DosingTime': 5200,
    'ROBOSHOTCycleParametersEvent.InjUnitCycParams_1.SpecificPressureMaximum': 112.0,
    'ROBOSHOTCycleParametersEvent.InjUnitCycParams_1.VPChangeOverPosition': 6.0,
    'ROBOSHOTCycleParametersEvent.InjUnitCycParams_1.BrlTmpZnCycParams_1.ActualTemperature': 254.6,
    'ROBOSHOTCycleParametersEvent.InjUnitCycParams_1.BrlTmpZnCycParams_2.ActualTemperature': 255.2,
    'ROBOSHOTCycleParametersEvent.MldCycParams_1.MldTmpZnCycParams_1.ActualTemperature': 231.0,
    'ROBOSHOTCycleParametersEvent.Peripheral.Dryer.TemperatureTo': 141.0,
    'max_injection_pressure': 150,
    'cooling_time': 18.0,
    'hr_mode': 'STD',
    'injection_steps': ['…'],  # step layout not mapped yet: ignored
}


@override_settings(FANUC_DURATION_UNIT='ms')  # sample durations in milliseconds
class ReadingTests(SimpleTestCase):
    def test_collector_values_become_parameter_readings(self):
        self.assertEqual(
            euromap77.readings(FULL_SHOT),
            {
                'nozzle': 254.6, 'zone1': 255.2, 'hrtc1': 231.0, 'dryer': 141.0,
                'maxInjPress': 150, 'transfer': 6.0, 'hrMode': 'STD', 'cooling': 18.0,
                'cycle': 26.15, 'cushion': 3.8, 'injection': 0.668, 'peakPressure': 112.0, 'recovery': 5.2,
            },
        )

    def test_a_numeric_mode_and_missing_nodes_are_left_out(self):
        self.assertEqual(euromap77.readings({'hr_mode': 2, 'cycletime': 30000}), {'cycle': 30.0})
        self.assertEqual(euromap77.readings({}), {})


@override_settings(FANUC_DURATION_UNIT='ms')  # sample durations in milliseconds
class AutoLogTests(PlantTestCase):
    def setUp(self):
        super().setUp()
        from integrations.fanuc.bridge import Bridge

        from ..services import logic

        Machine.objects.filter(id='J10-30').update(data_source='auto')
        self.bridge = Bridge()
        self.day = logic.production_date()
        self.slot = next(s for s in logic.plant_slots() if 9 <= s < 22)
        self.at_slot = plant_time(3, int(self.slot), round(self.slot % 1 * 60) + 1)  # one minute after the reading time

    def sheet(self, mid='J10-30'):
        from ..models import ParameterLog

        log = ParameterLog.objects.filter(machine_id=mid, date=self.day).first()
        return log.recorded.get(slot_key(self.slot)) if log else None, log.recorded_by.get(slot_key(self.slot)) if log else None

    def test_an_auto_machine_is_recorded_at_the_reading_time_once(self):
        self.bridge.apply(collector_message('J1030', **FULL_SHOT))
        done = self.bridge.record_due(self.at_slot)
        self.assertEqual([d[:2] for d in done], [('J10-30', self.slot)])
        values, by = self.sheet()
        self.assertEqual((values['nozzle'], values['cycle'], values['maxInjPress']), (254.6, 26.15, 150))
        self.assertEqual(by['by'], 'opc-ua')
        self.assertIn('cycle', by['auto'])
        self.assertEqual(self.bridge.record_due(self.at_slot), [])  # not twice

    def test_manual_idle_stale_and_late_machines_are_not_recorded(self):
        from unittest import mock

        self.bridge.apply(collector_message('J1025', **FULL_SHOT))  # J10-25 is a manual machine
        self.assertEqual(self.bridge.record_due(self.at_slot), [])
        self.bridge.apply(collector_message('J1030', **{**FULL_SHOT, 'operating_status': 3}))  # manual mode = idle
        self.assertEqual(self.bridge.record_due(self.at_slot), [])
        self.bridge.apply(collector_message('J1030', **FULL_SHOT))
        self.assertEqual(self.bridge.record_due(plant_time(3, int(self.slot), round(self.slot % 1 * 60) + 40)), [])  # past the window
        with mock.patch('integrations.fanuc.bridge.time.monotonic', return_value=10**9):  # last message long ago
            self.assertEqual(self.bridge.record_due(self.at_slot), [])

    def test_a_slot_a_person_recorded_is_left_alone(self):
        from ..services import logic

        logic.record_hour(Machine.objects.get(id='J10-30'), self.day, self.slot, {'nozzle': 250}, self.operator())
        self.bridge.apply(collector_message('J1030', **FULL_SHOT))
        self.assertEqual(self.bridge.record_due(self.at_slot), [])
        self.assertEqual(self.sheet()[0], {'nozzle': 250})

    def test_an_operator_completes_the_machine_reading_without_edit_rights(self):
        self.bridge.apply(collector_message('J1030', **FULL_SHOT))
        self.bridge.record_due(self.at_slot)
        op = self.client_for('operator')
        url = f'/api/logs/J10-30/{self.today}/hours/{slot_key(self.slot)}/'
        r = op.put(url, {'values': {'hold1': 55}}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        values, by = self.sheet()
        self.assertEqual((values['hold1'], values['nozzle']), (55, 254.6))  # the machine's values are kept
        self.assertNotEqual(by['by'], 'opc-ua')
        self.assertIn('nozzle', by['auto'])
        self.assertEqual(op.put(url, {'values': {'hold1': 60}}, format='json').status_code, 403)  # now it's a person's reading

    def operator(self):
        from ..models import User

        return User.objects.get(username='operator')


# ---------- FANUC step records, temperature zones and the cushion monitor ----------

FMP = 'FANUCMoldingParameters'
ZN = 'InjectionUnits.InjectionUnit_1.TemperatureZones.TemperatureZone_'
EV = 'ROBOSHOTCycleParametersEvent.InjUnitCycParams_1.BrlTmpZnCycParams_'


def steps(group, *records):
    """Browsed step children as the collector publishes them: (present, {field: value}) per step."""
    out = {}
    for n, (present, fields) in enumerate(records, 1):
        out[f'{FMP}.{group}.Step.Step_{n}.IsPresent'] = present
        out.update({f'{FMP}.{group}.Step.Step_{n}.{k}': v for k, v in fields.items()})
    return out


class StepRuleTests(SimpleTestCase):
    def test_injection_velocities_and_switch_positions_follow_the_present_steps(self):
        one = euromap77.readings(steps('InjectionParameters', (True, {'Velocity': 60, 'Position': 20})))
        self.assertEqual((one['injVel1'], 'injSwitch1' in one), (60, False))  # one step: no switch position
        data = steps(
            'InjectionParameters',
            (True, {'Velocity': 60, 'Position': 20}),
            (0, {'Velocity': 99, 'Position': 99}),  # not present: skipped
            (1, {'Velocity': 40, 'Position': 10}),
            (True, {'Velocity': 30, 'Position': 5}),
        )
        out = euromap77.readings(data)
        self.assertEqual([out.get(f'injVel{i}') for i in (1, 2, 3)], [60, 40, 30])
        self.assertEqual([out.get(f'injSwitch{i}') for i in (1, 2, 3)], [20, 10, None])

    def test_hold_steps_give_pressure_and_time(self):
        out = euromap77.readings(steps('PackParameters', (True, {'Pressure': 55, 'Time': 3}), (False, {'Pressure': 1, 'Time': 1}), (True, {'Pressure': 50, 'Time': 2})))
        self.assertEqual((out['hold1'], out['holdTime1'], out['hold2'], out['holdTime2']), (55, 3, 50, 2))
        self.assertNotIn('hold3', out)

    def test_an_array_of_step_records_works_too(self):
        out = euromap77.readings({f'{FMP}.InjectionParameters.Step': [{'IsPresent': True, 'Velocity': 70, 'Position': 25}, {'IsPresent': True, 'Velocity': 35, 'Position': 8}]})
        self.assertEqual((out['injVel1'], out['injSwitch1'], out['injVel2']), (70, 25, 35))

    def test_shot_size_and_decompression_are_settings(self):
        data = {**steps('ExtruderParameters', (True, {'Position': 20.0}), (True, {'Position': 39.8})), f'{FMP}.ExtruderParameters.Decompression.Position': 5.0,
                f'{FMP}.ExtruderParameters.Decompression.Velocity': 12.5}
        out = euromap77.readings(data)
        self.assertEqual((out['shotSize'], out['decompDist'], out['decompVel']), (39.8, 5.0, 12.5))
        self.assertEqual(euromap77.node_for('INJ_DECV')['kind'], 'derived')

    def test_back_pressure_and_rotation_from_first_present_recovery_step(self):
        data = steps('ExtruderParameters', (False, {'BackPressure': 99, 'Rotation': 999}),
                     (True, {'BackPressure': 10.0, 'Rotation': 120.0, 'Position': 30.0}),
                     (True, {'BackPressure': 8.0, 'Rotation': 100.0, 'Position': 39.8}))
        out = euromap77.readings(data)
        self.assertEqual((out['back'], out['rotation'], out['shotSize']), (10.0, 120.0, 39.8))

    def test_present_zones_become_zone_1_onwards_and_the_feeding_zone_the_hopper_throat(self):
        zones = {1: (True, False), 2: (True, False), 3: (False, False), 4: (True, False), 5: (True, True)}
        data = {}
        for n, (present, feeding) in zones.items():
            data[f'{ZN}{n}.IsPresent'] = present
            data[f'{ZN}{n}.IsFeedingZone'] = feeding
            data[f'{EV}{n}.ActualTemperature'] = 200.0 + n
        out = euromap77.readings(data)
        self.assertEqual(out['nozzle'], 201.0)
        self.assertEqual((out['zone1'], out['zone2'], out['throat']), (202.0, 204.0, 205.0))
        self.assertNotIn('zone3', out)  # zone 3 isn't fitted, zone 5 is the feed throat

    def test_without_zone_flags_the_fixed_numbering_stays(self):
        self.assertEqual(euromap77.readings({f'{EV}2.ActualTemperature': 255.0})['zone1'], 255.0)

    def test_the_machines_cushion_monitor_limits(self):
        data = {f'{FMP}.ProcessMonitor.CushionStroke.Upper': 4.7, f'{FMP}.ProcessMonitor.CushionStroke.Lower': 2.7}
        self.assertEqual(euromap77.machine_limits(data), {'cushion': {'lower': 2.7, 'upper': 4.7}})
        self.assertEqual(euromap77.machine_limits({}), {})

    def test_the_machines_injection_time_monitor_limits(self):
        data = {f'{FMP}.ProcessMonitor.InjectionTime.Upper': 0.72, f'{FMP}.ProcessMonitor.InjectionTime.Lower': 0.62,
                f'{FMP}.ProcessMonitor.CushionStroke.Upper': 4.7}
        self.assertEqual(euromap77.machine_limits(data), {'injection': {'lower': 0.62, 'upper': 0.72}, 'cushion': {'lower': None, 'upper': 4.7}})

class MachineLimitLogTests(AutoLogTests):
    def test_the_machines_cushion_limits_are_kept_with_the_slot(self):
        shot = {**FULL_SHOT, f'{FMP}.ProcessMonitor.CushionStroke.Upper': 4.7, f'{FMP}.ProcessMonitor.CushionStroke.Lower': 2.7}
        self.bridge.apply(collector_message('J1030', **shot))
        self.bridge.record_due(self.at_slot)
        self.assertEqual(self.sheet()[1]['machineLimits'], {'cushion': {'lower': 2.7, 'upper': 4.7}})
        op = self.client_for('operator')
        op.put(f'/api/logs/J10-30/{self.today}/hours/{slot_key(self.slot)}/', {'values': {'hold1': 55}}, format='json')
        self.assertEqual(self.sheet()[1]['machineLimits'], {'cushion': {'lower': 2.7, 'upper': 4.7}})  # kept when completed


class SecondsGatewayTests(SimpleTestCase):
    """The plant's FANUC gateway sends durations in seconds (the default FANUC_DURATION_UNIT=s).
    Values from a real probe of J1032, keys as MPCR's collector publishes them."""

    def test_durations_in_seconds_and_current_collector_keys(self):
        from integrations.fanuc.euromap77 import from_collector

        E = 'ROBOSHOTCycleParametersEvent.InjUnitCycParams_1.'
        data = {'machinename': 'J1032', 'cycle_time': 17.99, E + 'InjectionTime': 0.891, E + 'DosingTime': 3.31, E + 'CushionVolume': 3.58}
        name, _, fields, _ = from_collector({'machine_node': 'IMM_FANUC_ROBOSHOT0025', 'data': data})
        self.assertEqual(name, 'J1032')
        self.assertEqual({k: fields[k] for k in ('cycle', 'injection', 'recovery', 'cushion')}, {'cycle': 17.99, 'injection': 0.891, 'recovery': 3.31, 'cushion': 3.58})

