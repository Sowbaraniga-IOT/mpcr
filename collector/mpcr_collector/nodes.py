"""What is read from each machine (FANUC spec A-97146-00021EN, Appendix 1: Table of EUROMAP77 Nodes).

Two kinds of source:

* VARIABLES – nodes watched with a data-change subscription. NodeIds are string ids in the
  gateway's namespace: ns=6;s=IMM_FANUC_ROBOSHOT0005.Jobs.ActiveJobValues.LastCycleTime.
  The keys are the same as the plant's existing collector, so anything that reads its
  messages reads these too.
* CYCLE EVENT – ROBOSHOTCycleParametersEvent, sent once per shot. Its fields (cushion,
  injection time, barrel temperatures …) only exist inside the event, so they are selected with
  an event filter. Each field is a browse path of (namespace index, BrowseName); the indexes are
  the ones the spec lists for this server: 0 OPC UA, 3 EUROMAP 83, 4 EUROMAP 77, 5 FANUC.
  Published keys are the dotted EUROMAP path, e.g.
  "ROBOSHOTCycleParametersEvent.InjUnitCycParams_1.CushionVolume".
"""

VARIABLES = {
    'machinename': 'MachineConfiguration.UserMachineName',
    'operating_status': 'MachineStatus.MachineMode',
    'present': 'MachineStatus.IsPresent',
    'tool': 'Jobs.ActiveJob.ProductionDatasetName',
    'ProductName': 'Jobs.ActiveJob.ProductName',
    'cavity': 'Jobs.ActiveJob.NumCavities',
    'jobcyclecounter': 'Jobs.ActiveJobValues.JobCycleCounter',
    'machinecyclecounter': 'Jobs.ActiveJobValues.MachineCycleCounter',
    'cycletime': 'Jobs.ActiveJobValues.LastCycleTime',
}
NAME_KEY = 'machinename'


def setpoint_variables(barrel_zones):
    """Barrel temperature setpoints, keyed by their EUROMAP path."""
    out = {}
    for n in range(1, barrel_zones + 1):
        path = f'InjectionUnits.InjectionUnit_1.TemperatureZones.TemperatureZone_{n}.NominalTemperature'
        out[path] = path
    return out


EVENT_TYPE = 'ROBOSHOTCycleParametersEventType'
EVENT = 'ROBOSHOTCycleParametersEvent'
_INJ = [(5, 'InjUnitCycParams_1')]
_MLD = [(5, 'MldCycParams_1')]


def cycle_event_fields(barrel_zones, mould_zones):
    """[(published key, browse path)] selected from each cycle event."""
    fields = [(f'{EVENT}.CycleTime', [(3, 'CycleTime')])]
    for ns, name in [
        (4, 'CushionVolume'),
        (4, 'InjectionTime'),
        (4, 'DosingTime'),
        (4, 'SpecificPressureMaximum'),
        (4, 'VPChangeOverPosition'),
        (4, 'PlastificationVolume'),
        (5, 'ExtruderEndPosition'),
        (5, 'MinimumCushion'),
    ]:
        fields.append((f'{EVENT}.InjUnitCycParams_1.{name}', _INJ + [(ns, name)]))
    for n in range(1, barrel_zones + 1):
        zone = (5, f'BrlTmpZnCycParams_{n}')
        fields.append((f'{EVENT}.InjUnitCycParams_1.BrlTmpZnCycParams_{n}.Name', _INJ + [zone, (3, 'Name')]))
        fields.append((f'{EVENT}.InjUnitCycParams_1.BrlTmpZnCycParams_{n}.ActualTemperature', _INJ + [zone, (3, 'ActualTemperature')]))
    for n in range(1, mould_zones + 1):
        zone = (5, f'MldTmpZnCycParams_{n}')
        fields.append((f'{EVENT}.MldCycParams_1.MldTmpZnCycParams_{n}.ActualTemperature', _MLD + [zone, (3, 'ActualTemperature')]))
    for path in (['Dryer', 'TemperatureTo'], ['Mold_1', 'TemperatureFrom'], ['Mold_1', 'TemperatureTo']):
        fields.append((f'{EVENT}.Peripheral.' + '.'.join(path), [(5, 'Peripheral')] + [(5, p) for p in path]))
    return fields
