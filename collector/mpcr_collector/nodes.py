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
    'tool': 'Jobs.ActiveJob.ProductionDatasetName',
    'Part_Number': 'Jobs.ActiveJob.ProductName',
    #'operating_status': 'MachineStatus.MachineMode',
    #'present': 'MachineStatus.IsPresent',
    #'cavity': 'Jobs.ActiveJob.NumCavities',
    #'jobcyclecounter': 'Jobs.ActiveJobValues.JobCycleCounter',
    #'machinecyclecounter': 'Jobs.ActiveJobValues.MachineCycleCounter',
     # FANUC molding setpoints (FANUCMoldingParameters, seen on the gateway in nodes.uap)
    'Cycle_Time': 'Jobs.ActiveJobValues.LastCycleTime',
    'max_injection_pressure': 'FANUCMoldingParameters.InjectionParameters.SingleMaxPressure',  # MAX INJ PRS
    'hr_mode': 'FANUCMoldingParameters.InjectionParameters.HRMode',  # HR MODE
    'max_injection_time': 'FANUCMoldingParameters.InjectionParameters.MaxInjectionTime',
    'injection_cooling_time': 'FANUCMoldingParameters.ExtruderParameters.CoolTime',  # COOLING TIME
    'injection_decompression_distance':'FANUCMoldingParameters.ExtruderParameters.Decompress.Position',
    'injection_decompression_velocity':'FANUCMoldingParameters.ExtruderParameters.Decompress.Velocity' ,
    'injection_shot_size':'FANUCMoldingParameters.ExtruderParameters.ScrewBack.Position',
    'injection_hold_on_pressure':'FANUCMoldingParameters.PackParameters.Step_1.Pressure', # HOLD ON PRESSURE n
    'injection_hold_on_time':'FANUCMoldingParameters.PackParameters.Step_1.Time',  #HOLD ON TIME n
    'injection_velocity_1':'FANUCMoldingParameters.InjectionParameters.Step_1.Velocity',
    'injection_velocity_2':'FANUCMoldingParameters.InjectionParameters.Step_2.Velocity',
    'injection_velocity_3':'FANUCMoldingParameters.InjectionParameters.Step_3.Velocity',
    'injection_upper_tol_set_value':'FANUCMoldingParameters.ProcessMonitor.InjectionTime.Upper',
    'injection_lower_tol_set_value':'FANUCMoldingParameters.ProcessMonitor.InjectionTime.Lower',
    'Monitor_Peak_pressure_Maximum':'FANUCMoldingParameters.ProcessMonitor.SpecificPressureMaximum.Upper', 
    'Monitor_Peak_pressure_Minimum':'FANUCMoldingParameters.ProcessMonitor.SpecificPressureMaximum.Lower', 
    'RCV_Time_Maximum':'FANUCMoldingParameters.ProcessMonitor.DosingTime.Upper', 
    'RCV_Time_Minimumm':'FANUCMoldingParameters.ProcessMonitor.DosingTime.Lower', 
   

}

# Folders whose contents are found by browsing each machine at every connect, because the
# number of steps / zones and their child names come from the machine. Every variable below
# them is subscribed and published under its dotted path, e.g.
# "FANUCMoldingParameters.InjectionParameters.Step.Step_1.Velocity". A folder that is itself a
# variable (e.g. an array of step structures) is published under the folder's path.
BROWSE_ROOTS = [
    'FANUCMoldingParameters.InjectionParameters.Step',
    'InjectionUnits.InjectionUnit_1.TemperatureZones',
    'FANUCMoldingParameters.InjectionParameters.Step_1.Velocity',
    'FANUCMoldingParameters.InjectionParameters.Step_2.Velocity',
    'FANUCMoldingParameters.InjectionParameters.Step_3.Velocity',    # INJCT VEL n, INJCT SW POS n
    'FANUCMoldingParameters.PackParameters.Step',
    'FANUCMoldingParameters.PackParameters.Step_1.Pressure', # HOLD ON PRESSURE n
    'FANUCMoldingParameters.PackParameters.Step_1.Time',  #HOLD ON TIME n
    'FANUCMoldingParameters.ExtruderParameters.Step',
    'FANUCMoldingParameters.ExtruderParameters.Step_1.BackPressure',# BACK PRESSURE
    'FANUCMoldingParameters.ExtruderParameters.Step_1.ScrewRotation',# ROTATION
    'FANUCMoldingParameters.ExtruderParameters.Decompress.Position',
    'FANUCMoldingParameters.ExtruderParameters.Decompress.Velocity' ,
    'FANUCMoldingParameters.ExtruderParameters.ScrewBack.Position',  # DECOMPRESSION position, DECOMPRESSION VELOCITY
    'FANUCMoldingParameters.ProcessMonitor.CushionStroke',  # M-CUSHION upper / lower monitor
    'FANUCMoldingParameters.ProcessMonitor.InjectionTime',  # INJCT TIME upper / lower monitor
    'FANUCMoldingParameters.ProcessMonitor.SpecificPressureMaximum.Upper', 
    'FANUCMoldingParameters.ProcessMonitor.SpecificPressureMaximum.Lower', 
    'FANUCMoldingParameters.ProcessMonitor.DosingTime.Upper', 
    'FANUCMoldingParameters.ProcessMonitor.DosingTime.Lower', 
    

    
    
     # which zones are present / feeding
]
BROWSE_SKIP = {'EURange', 'EngineeringUnits', 'InstrumentRange', 'ValuePrecision', 'EnumStrings', 'EnumValues', 'Definition','PowerUnits', 'NodeVersion'}
BROWSE_DEPTH = 4  # levels below a root
BROWSE_LIMIT = 400  # variables per root and machine, at most
# Sub-units with their IsPresent flag and values (paths as seen on the gateway in nodes.uap);
# the key is the EUROMAP path itself. Units a machine does not have read as not subscribed.
# for _path in [
#     'InjectionUnits.InjectionUnit_1.IsPresent',
#     'InjectionUnits.InjectionUnit_1.InProduction',
#     'InjectionUnits.InjectionUnit_1.BarrelId',
#     'InjectionUnits.InjectionUnit_1.ScrewDiameter',
#     'InjectionUnits.InjectionUnit_1.MaxScrewStroke',
#     'Moulds.Mould_1.IsPresent',
#     'Moulds.Mould_1.Id',
#     'Moulds.Mould_1.Description',
#     'Moulds.Mould_1.MouldStatus',
# ] + [f'PowerUnits.PowerUnit_{_n}.{_v}' for _n in range(1, 8) for _v in ('IsPresent', 'Id', 'PowerOn')]:
#     VARIABLES[_path] = _path
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
    # Short keys for event fields, next to the setpoint keys in VARIABLES (RCV_Time_Maximum / _Minimumm).
    for key, (ns, name) in {
        'RCV_Standard': (4, 'DosingTime'),  # RCV TIME actual: ROBOSHOTCycleParametersEvent.InjUnitCycParams_1.DosingTime
    }.items():
        fields.append((key, _INJ + [(ns, name)]))
    for n in range(1, barrel_zones + 1):
        zone = (5, f'BrlTmpZnCycParams_{n}')
        fields.append((f'{EVENT}.InjUnitCycParams_1.BrlTmpZnCycParams_{n}.Name', _INJ + [zone, (3, 'Name')]))
        fields.append((f'{EVENT}.InjUnitCycParams_1.BrlTmpZnCycParams_{n}.ActualTemperature', _INJ + [zone, (3, 'ActualTemperature')]))
    for n in range(1, mould_zones + 1):
        zone = (5, f'MldTmpZnCycParams_{n}')
        fields.append((f'{EVENT}.MldCycParams_1.MldTmpZnCycParams_{n}.ActualTemperature', _MLD + [zone, (3, 'ActualTemperature')]))
    for path in (['Dryer', 'TemperatureTo'], ['Mold_1', 'TemperatureFrom'], ['Mold_1', 'TemperatureTo']):
        fields.append((f'{EVENT}.Peripheral.' + '.'.join(path), [(5, 'Peripheral')] + [(5, p) for p in path]))
    # FANUC-native values (all FANUC namespace 5, paths as seen on the gateway in nodes.uap)
    # for group, name in [
    #     ('ParallelAndVariance', 'VPSwitchPosition'),  # POS TRANSFER
    #     ('AV', 'MinimumCushion'),  # M-CUSHION ACTUAL
    #     ('AV', 'PeakPressure'),  # PEAK PRESSURE
    #     ('AV', 'RecoveryTime'),  # RCV TIME
    # ]:
        # fields.append((f'{EVENT}.{group}.{name}', [(5, group), (5, name)]))
    return fields
