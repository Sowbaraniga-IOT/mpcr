"""A stand-in for the FANUC EUROMAP 77 gateway, for testing the collector without the plant network.

    .venv\\Scripts\\python tools\\sim_gateway.py            # opc.tcp://127.0.0.1:4841, no security

Machines IMM_FANUC_ROBOSHOT0001 (J1025) and 0002 (J1026) run; 0003 has no UserMachineName
(inactive). NodeIds are string ids in namespace 6 like the gateway's. Every few seconds each
running machine finishes a shot: LastCycleTime and the counters change and a
ROBOSHOTCycleParametersEventType event is sent with CycleTime (the real event also has nested
fields such as InjUnitCycParams_1/CushionVolume, which this simulator does not build).
"""
import asyncio
import random

from asyncua import Server, ua

MACHINES = {'IMM_FANUC_ROBOSHOT0001': 'J1025', 'IMM_FANUC_ROBOSHOT0002': 'J1026', 'IMM_FANUC_ROBOSHOT0003': ''}
NS = 6
# zone → (IsPresent, IsFeedingZone, NominalTemperature); the child names are this simulator's guess
TEMPERATURE_ZONES = {1: (True, False, 255.0), 2: (True, False, 255.0), 3: (True, False, 250.0), 4: (True, False, 245.0), 5: (False, False, 0.0), 6: (True, True, 55.0)}
INJECTION_STEPS = {1: (True, 60.0, 20.0), 2: (True, 40.0, 10.0), 3: (False, 0.0, 0.0)}  # step → (IsPresent, Velocity, Position)
PACK_STEPS = {1: (True, 55.0, 3.0), 2: (True, 50.0, 2.0), 3: (False, 0.0, 0.0)}  # step → (IsPresent, Pressure, Time)


async def main(port=4841):
    server = Server()
    await server.init()
    server.set_endpoint(f'opc.tcp://127.0.0.1:{port}')
    server.set_security_policy([ua.SecurityPolicyType.NoSecurity])
    # Namespaces 2 … 6 so the machine nodes land in ns=6 as on the gateway (3 = EUROMAP 83).
    for uri in ('http://opcfoundation.org/UA/DI/', 'http://www.euromap.org/euromap83/', 'http://www.euromap.org/euromap77/', 'http://www.fanuc.co.jp/ROBOSHOT/', 'urn:sim:instances'):
        await server.register_namespace(uri)

    evtype = await server.create_custom_event_type(3, 'ROBOSHOTCycleParametersEventType', ua.ObjectIds.BaseEventType, [('CycleTime', ua.VariantType.Double)])
    objects = server.nodes.objects
    machines = {}
    for node_name, user_name in MACHINES.items():
        obj = await objects.add_object(ua.NodeId(node_name, NS), ua.QualifiedName(node_name, NS))
        v = {}
        folders = {'': obj}

        async def folder(path, node_name=node_name, folders=folders):
            """The object at a dotted path below the machine, created (with its parents) on first use."""
            if path not in folders:
                parent, _, name = path.rpartition('.')
                folders[path] = await (await folder(parent)).add_object(ua.NodeId(f'{node_name}.{path}', NS), ua.QualifiedName(name, 5))
            return folders[path]

        async def var(path, value, vtype, node_name=node_name, v=v):
            parent, _, name = path.rpartition('.')
            v[path] = await (await folder(parent)).add_variable(ua.NodeId(f'{node_name}.{path}', NS), ua.QualifiedName(name, 3), ua.Variant(value, vtype))

        await var('MachineConfiguration.UserMachineName', user_name, ua.VariantType.String)
        await var('MachineStatus.MachineMode', 1 if user_name else 0, ua.VariantType.Int32)
        await var('MachineStatus.IsPresent', bool(user_name), ua.VariantType.Boolean)
        await var('Jobs.ActiveJob.ProductionDatasetName', f'M10{random.randint(50, 99)}_COND' if user_name else '', ua.VariantType.String)
        await var('Jobs.ActiveJob.ProductName', ['MSI60983822'], ua.VariantType.String)
        await var('Jobs.ActiveJobValues.JobCycleCounter', 500, ua.VariantType.UInt64)
        await var('Jobs.ActiveJobValues.MachineCycleCounter', 14250, ua.VariantType.UInt64)
        await var('Jobs.ActiveJobValues.LastCycleTime', 26150.0, ua.VariantType.Double)
        # Barrel zones: 1 nozzle, 2-4 heater bands, 5 not fitted, 6 the feed throat
        zones = TEMPERATURE_ZONES
        for n, (present, feeding, nominal) in zones.items():
            z = f'InjectionUnits.InjectionUnit_1.TemperatureZones.TemperatureZone_{n}'
            await var(f'{z}.IsPresent', present, ua.VariantType.Boolean)
            await var(f'{z}.IsFeedingZone', feeding, ua.VariantType.Boolean)
            await var(f'{z}.NominalTemperature', nominal, ua.VariantType.Double)
        # FANUC steps: 3 injection steps (step 3 switched off), 2 hold steps, 1 recovery step
        for n, (present, velocity, position) in INJECTION_STEPS.items():
            s = f'FANUCMoldingParameters.InjectionParameters.Step.Step_{n}'
            await var(f'{s}.IsPresent', present, ua.VariantType.Boolean)
            await var(f'{s}.Velocity', velocity, ua.VariantType.Double)
            await var(f'{s}.Position', position, ua.VariantType.Double)
        for n, (present, pressure, hold) in PACK_STEPS.items():
            s = f'FANUCMoldingParameters.PackParameters.Step.Step_{n}'
            await var(f'{s}.IsPresent', present, ua.VariantType.Boolean)
            await var(f'{s}.Pressure', pressure, ua.VariantType.Double)
            await var(f'{s}.Time', hold, ua.VariantType.Double)
        await var('FANUCMoldingParameters.ExtruderParameters.Step.Step_1.IsPresent', True, ua.VariantType.Boolean)
        await var('FANUCMoldingParameters.ExtruderParameters.Step.Step_1.Position', 39.8, ua.VariantType.Double)
        await var('FANUCMoldingParameters.ExtruderParameters.Decompression.Position', 5.0, ua.VariantType.Double)
        await var('FANUCMoldingParameters.ExtruderParameters.Decompression.Velocity', 5.0, ua.VariantType.Double)
        await var('FANUCMoldingParameters.ProcessMonitor.CushionStroke.Upper', 4.7, ua.VariantType.Double)
        await var('FANUCMoldingParameters.ProcessMonitor.CushionStroke.Lower', 2.7, ua.VariantType.Double)
        gen = await server.get_event_generator(evtype, obj)
        machines[node_name] = (v, gen, user_name)

    async with server:
        print(f'Simulated gateway on opc.tcp://127.0.0.1:{port} (ns={NS}); Ctrl+C stops', flush=True)
        while True:
            await asyncio.sleep(3)
            for node_name, (v, gen, user_name) in machines.items():
                if not user_name:
                    continue
                cycle = round(random.gauss(26150, 300), 1)
                await v['Jobs.ActiveJobValues.LastCycleTime'].write_value(ua.Variant(cycle, ua.VariantType.Double))
                count = await v['Jobs.ActiveJobValues.JobCycleCounter'].read_value()
                await v['Jobs.ActiveJobValues.JobCycleCounter'].write_value(ua.Variant(count + 1, ua.VariantType.UInt64))
                gen.event.CycleTime = cycle
                gen.event.Message = ua.LocalizedText(f'{user_name} cycle')
                await gen.trigger()


if __name__ == '__main__':
    asyncio.run(main())
