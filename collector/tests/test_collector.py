"""Unit tests that need no gateway or broker:  .venv\\Scripts\\python -m unittest discover tests"""
import unittest

from asyncua import ua

from mpcr_collector import config
from mpcr_collector.nodes import EVENT, VARIABLES, cycle_event_fields
from mpcr_collector.opcua_source import Session, build_cycle_filter, child_key, groups, jsonable, machine_of


class ConfigTests(unittest.TestCase):
    def test_machine_lists(self):
        self.assertEqual(config.machine_numbers('1-5', '2,4'), [1, 3, 5])
        self.assertEqual(config.machine_numbers('1-3,7,3'), [1, 2, 3, 7])

    def test_node_names_have_four_digits(self):
        self.assertEqual(config.Config().node_name(5), 'IMM_FANUC_ROBOSHOT0005')

    def test_sessions_split_evenly(self):
        self.assertEqual([len(g) for g in groups(list(range(117)), 30)], [30, 29, 29, 29])


class NodeTests(unittest.TestCase):
    def test_same_keys_as_the_plant_collector(self):
        for key in ('operating_status', 'tool', 'jobcyclecounter', 'cycletime', 'ProductName'):
            self.assertIn(key, VARIABLES)
        self.assertEqual(VARIABLES['cycletime'], 'Jobs.ActiveJobValues.LastCycleTime')

    def test_cycle_event_paths_follow_the_spec(self):
        fields = dict(cycle_event_fields(2, 1))
        self.assertEqual(fields[f'{EVENT}.InjUnitCycParams_1.CushionVolume'], [(5, 'InjUnitCycParams_1'), (4, 'CushionVolume')])
        self.assertEqual(fields[f'{EVENT}.InjUnitCycParams_1.BrlTmpZnCycParams_2.ActualTemperature'], [(5, 'InjUnitCycParams_1'), (5, 'BrlTmpZnCycParams_2'), (3, 'ActualTemperature')])
        self.assertEqual(fields[f'{EVENT}.MldCycParams_1.MldTmpZnCycParams_1.ActualTemperature'], [(5, 'MldCycParams_1'), (5, 'MldTmpZnCycParams_1'), (3, 'ActualTemperature')])

    def test_filter_selects_the_source_first(self):
        f = build_cycle_filter(ua.NodeId(1, 3), cycle_event_fields(1, 0))
        self.assertEqual(f.SelectClauses[0].BrowsePath[0].Name, 'SourceNode')
        self.assertEqual(len(f.SelectClauses), 1 + len(cycle_event_fields(1, 0)))


class SessionTests(unittest.TestCase):
    def setUp(self):
        self.sent = []
        cfg = config.Config()
        cfg.keepalive_seconds = 3600
        self.s = Session(1, ['IMM_FANUC_ROBOSHOT0005', 'IMM_FANUC_ROBOSHOT0006'], cfg, self.sent.append, {'events': 0, 'sessions': 0})

    def test_only_named_machines_are_published_and_only_when_changed(self):
        self.s.update('IMM_FANUC_ROBOSHOT0005', {'machinename': 'J1030', 'cycletime': 25000.0})
        self.s.update('IMM_FANUC_ROBOSHOT0006', {'cycletime': 1.0})  # no name yet: inactive
        self.s.flush()
        self.assertEqual([(m['machine_node'], m['machine']) for m in self.sent], [('IMM_FANUC_ROBOSHOT0005', 'J1030')])
        self.s.flush()
        self.assertEqual(len(self.sent), 1)  # nothing changed

    def test_event_values_are_matched_by_position(self):
        self.s.update('IMM_FANUC_ROBOSHOT0005', {'machinename': 'J1030'})
        values = [ua.NodeId('IMM_FANUC_ROBOSHOT0005', 6), 25500.0] + [None] * (len(self.s.event_fields) - 1)

        class Ev:
            event_fields = [ua.Variant(v) for v in values]

        self.s.event_notification(Ev())
        self.assertEqual(self.s.state['IMM_FANUC_ROBOSHOT0005']['data'][f'{EVENT}.CycleTime'], 25500.0)

    def test_values_become_json(self):
        self.assertEqual(jsonable(ua.LocalizedText('AUTOMATIC')), 'AUTOMATIC')
        self.assertEqual(machine_of(ua.NodeId('IMM_FANUC_ROBOSHOT0005.MachineStatus.MachineMode', 6)), 'IMM_FANUC_ROBOSHOT0005')

    def test_structures_become_objects(self):
        from dataclasses import dataclass

        @dataclass
        class Step:
            IsPresent: bool
            Velocity: float

        self.assertEqual(jsonable([Step(True, 60.0), Step(False, 0.0)]), [{'IsPresent': True, 'Velocity': 60.0}, {'IsPresent': False, 'Velocity': 0.0}])

    def test_browsed_nodes_are_keyed_by_their_path(self):
        m = 'IMM_FANUC_ROBOSHOT0005'
        nid = ua.NodeId(f'{m}.FANUCMoldingParameters.InjectionParameters.Step.Step_1.Velocity', 6)
        self.assertEqual(child_key(m, nid, 'x', 'Velocity'), 'FANUCMoldingParameters.InjectionParameters.Step.Step_1.Velocity')
        self.assertEqual(child_key(m, ua.NodeId(4711, 6), 'FANUCMoldingParameters.InjectionParameters.Step', 'Step_1'), 'FANUCMoldingParameters.InjectionParameters.Step.Step_1')


if __name__ == '__main__':
    unittest.main()
