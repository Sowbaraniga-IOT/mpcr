"""OPC UA sessions to the FANUC gateway: subscribe, keep each machine's state, hand it to the publisher.

One session per group of machines (cfg.machines_per_session), each reconnecting on its own.
A machine counts as live while its UserMachineName is not empty, as in the plant's collector.
Every message has the plant collector's shape:
    {"machine_node": "IMM_FANUC_ROBOSHOT0005", "machine": "J1030", "ts": "…", "data": {…}}
"""
import asyncio
import dataclasses
import logging
import time
from datetime import datetime, timezone

from asyncua import Client, ua
from asyncua.common.events import where_clause_from_evtype

from . import NAME
from .nodes import (BROWSE_DEPTH, BROWSE_LIMIT, BROWSE_ROOTS, BROWSE_SKIP, EVENT, EVENT_TYPE, NAME_KEY, VARIABLES,
                    cycle_event_fields, setpoint_variables)

log = logging.getLogger('mpcr_collector.opcua')

SERVER_TIME = ua.NodeId(ua.ObjectIds.Server_ServerStatus_CurrentTime)


def jsonable(v):
    """OPC UA values → plain JSON values."""
    if v is None or isinstance(v, bool | int | float | str):
        return v
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, ua.LocalizedText):
        return v.Text
    if isinstance(v, ua.QualifiedName):
        return v.Name
    if isinstance(v, ua.NodeId):
        return v.to_string()
    if isinstance(v, bytes | bytearray):
        return v.hex()
    if isinstance(v, list | tuple):
        return [jsonable(x) for x in v]
    if dataclasses.is_dataclass(v) and not isinstance(v, type):  # a structure, e.g. one FANUC step
        return {f.name: jsonable(getattr(v, f.name)) for f in dataclasses.fields(v)}
    if hasattr(v, 'value') and isinstance(getattr(v, 'value'), int):  # IntEnum
        return int(v.value)
    if hasattr(v, 'Value'):  # e.g. EUInformation-like structures with a Value
        return jsonable(v.Value)
    return str(v)


def machine_of(nodeid):
    """'IMM_FANUC_ROBOSHOT0005' from ns=6;s=IMM_FANUC_ROBOSHOT0005[.Something]."""
    ident = getattr(nodeid, 'Identifier', None)
    return ident.split('.', 1)[0] if isinstance(ident, str) else None


def build_cycle_filter(evtype_nodeid, fields):
    """EventFilter selecting SourceNode plus the cycle fields, by browse path on the event type."""
    f = ua.EventFilter()
    source = ua.SimpleAttributeOperand()
    source.TypeDefinitionId = ua.NodeId(ua.ObjectIds.BaseEventType)
    source.BrowsePath = [ua.QualifiedName('SourceNode', 0)]
    source.AttributeId = ua.AttributeIds.Value
    f.SelectClauses.append(source)
    for _key, path in fields:
        op = ua.SimpleAttributeOperand()
        op.TypeDefinitionId = evtype_nodeid
        op.BrowsePath = [ua.QualifiedName(name, ns) for ns, name in path]
        op.AttributeId = ua.AttributeIds.Value
        f.SelectClauses.append(op)
    return f


def child_key(machine, nodeid, parent_key, name):
    """The published key of a browsed node: its dotted path below the machine, taken from the
    gateway's string NodeId (ns=6;s=IMM_…0005.A.B → "A.B"), else the parent's key + its name."""
    ident = getattr(nodeid, 'Identifier', None)
    prefix = f'{machine}.'
    if isinstance(ident, str) and ident.startswith(prefix):
        return ident[len(prefix):]
    return f'{parent_key}.{name}'


async def discover(client, machine, namespace):
    """{key: NodeId} of every variable in the machine's BROWSE_ROOTS folders (steps, zones …).
    A root the machine doesn't have is skipped."""
    out = {}

    async def walk(node, key, depth, budget):
        if depth > BROWSE_DEPTH:
            return
        for ref in await node.get_children_descriptions():
            name = ref.BrowseName.Name
            if name in BROWSE_SKIP or len(out) >= budget:
                continue
            nid = ua.NodeId(ref.NodeId.Identifier, ref.NodeId.NamespaceIndex)
            k = child_key(machine, nid, key, name)
            if ref.NodeClass == ua.NodeClass.Variable:
                out[k] = nid
            if ref.NodeClass in (ua.NodeClass.Object, ua.NodeClass.Variable):
                await walk(client.get_node(nid), k, depth + 1, budget)

    for root in BROWSE_ROOTS:
        node = client.get_node(ua.NodeId(f'{machine}.{root}', namespace))
        try:
            cls = await node.read_node_class()
        except Exception:
            continue
        if cls == ua.NodeClass.Variable:
            out[root] = node.nodeid
        await walk(node, root, 1, len(out) + BROWSE_LIMIT)
    return out


async def find_event_type(client, name=EVENT_TYPE, limit=3000):
    """The NodeId of an event type, found by BrowseName under BaseEventType (HasSubtype)."""
    queue = [client.get_node(ua.ObjectIds.BaseEventType)]
    seen = 0
    while queue and seen < limit:
        node = queue.pop(0)
        seen += 1
        for child in await node.get_children(refs=ua.ObjectIds.HasSubtype):
            if (await child.read_browse_name()).Name == name:
                return child.nodeid
            queue.append(child)
    return None


class Session:
    def __init__(self, number, machine_nodes, cfg, publish, stats):
        self.number = number
        self.machine_nodes = machine_nodes
        self.cfg = cfg
        self.publish = publish
        self.stats = stats
        self.variables = {**VARIABLES, **setpoint_variables(cfg.barrel_zones)}
        self.event_fields = cycle_event_fields(cfg.barrel_zones, cfg.mould_zones)
        self.reset()

    def reset(self):
        self.by_nodeid = {}  # node id string → (machine node, key)
        self.state = {m: {'name': None, 'data': {}, 'dirty': False, 'sent': 0.0} for m in self.machine_nodes}

    # ---------- subscription callbacks ----------

    def datachange_notification(self, node, val, data):
        hit = self.by_nodeid.get(node.nodeid.to_string())
        if hit:
            self.update(hit[0], {hit[1]: jsonable(val)})

    def event_notification(self, event):
        values = [f.Value for f in event.event_fields]
        machine = machine_of(values[0]) if values else None
        if machine not in self.state:
            return
        data = {key: jsonable(v) for (key, _), v in zip(self.event_fields, values[1:]) if v is not None}
        if data:
            self.stats['events'] += 1
            self.update(machine, data)

    def status_change_notification(self, status):
        log.warning('Session %s: subscription status changed: %s', self.number, status)

    def update(self, machine, data):
        st = self.state[machine]
        if NAME_KEY in data:
            name = (data[NAME_KEY] or '').strip() if isinstance(data[NAME_KEY], str) else data[NAME_KEY]
            if st['name'] and name and name != st['name']:
                log.info('%s renamed %s → %s', machine, st['name'], name)
            st['name'] = name or None
        st['data'].update(data)
        st['dirty'] = True

    # ---------- publishing ----------

    def flush(self):
        now = time.monotonic()
        for machine, st in self.state.items():
            if not st['name']:
                continue
            if st['dirty'] or now - st['sent'] >= self.cfg.keepalive_seconds:
                self.publish({'machine_node': machine, 'machine': st['name'], 'ts': datetime.now(timezone.utc).isoformat(), 'collector': NAME, 'data': dict(st['data'])})
                st['dirty'] = False
                st['sent'] = now

    # ---------- connection ----------

    def client(self):
        c = Client(self.cfg.opcua_url, timeout=30, watchdog_intervall=10)
        c.application_uri = self.cfg.app_uri
        c.name = NAME
        c.description = NAME
        c.session_name = f'MPCR_EUROMAP77_Collector_{self.number}'
        if self.cfg.opcua_user:
            c.set_user(self.cfg.opcua_user)
            c.set_password(self.cfg.opcua_password)
        return c

    async def secure(self, c):
        if self.cfg.security.lower() != 'none':
            from asyncua.crypto.security_policies import SecurityPolicyBasic256Sha256

            await c.set_security(SecurityPolicyBasic256Sha256, certificate=self.cfg.cert, private_key=self.cfg.key, mode=ua.MessageSecurityMode.SignAndEncrypt)

    async def load_types(self, c):
        """Teach the client the server's own structures (e.g. FANUC step records) so their values
        arrive as fields instead of raw bytes. A server without them still works."""
        if not self.cfg.load_types:
            return
        try:
            await asyncio.wait_for(c.load_data_type_definitions(), 120)
        except Exception as e:
            log.warning('Session %s: could not load the server\'s data types (%s: %s); structures stay undecoded', self.number, type(e).__name__, e)

    async def variables_for(self, c, machine):
        """{key: NodeId} for one machine: the fixed VARIABLES and setpoints, plus whatever the
        BROWSE_ROOTS folders contain on this machine."""
        out = {key: ua.NodeId(f'{machine}.{path}', self.cfg.namespace) for key, path in self.variables.items()}
        known = {n.to_string() for n in out.values()}
        for key, nid in (await discover(c, machine, self.cfg.namespace)).items():
            if nid.to_string() not in known:
                out[key] = nid
        return out

    async def subscribe(self, c, sub):
        nodes, keys = [], []
        found = 0
        for machine in self.machine_nodes:
            variables = await self.variables_for(c, machine)
            found += len(variables) - len(self.variables)
            for key, nid in variables.items():
                node = c.get_node(nid)
                self.by_nodeid[node.nodeid.to_string()] = (machine, key)
                nodes.append(node)
                keys.append((machine, key))
        handles = await sub.subscribe_data_change(nodes, sampling_interval=self.cfg.sampling_ms)
        ok = sum(isinstance(h, int) for h in handles)
        missing = sorted({f'{m}.{k}' for (m, k), h in zip(keys, handles) if not isinstance(h, int) and k == NAME_KEY})
        log.info('Session %s: %s of %s variables subscribed (%s found by browsing steps, zones and monitors)', self.number, ok, len(nodes), found)
        if missing:
            log.warning('Session %s: no UserMachineName node for %s machine(s) (e.g. %s)', self.number, len(missing), missing[0])
        if self.cfg.cycle_events:
            await self.subscribe_events(c, sub)

    async def subscribe_events(self, c, sub):
        evtype = await find_event_type(c)
        if evtype is None:
            log.warning('Session %s: the server has no %s; cushion, injection time and temperatures are not collected', self.number, EVENT_TYPE)
            return
        evfilter = build_cycle_filter(evtype, self.event_fields)
        evfilter.WhereClause = await where_clause_from_evtype([c.get_node(evtype)])
        ok = 0
        for machine in self.machine_nodes:
            try:
                await sub.subscribe_events(c.get_node(ua.NodeId(machine, self.cfg.namespace)), evfilter=evfilter)
                ok += 1
            except Exception as e:
                log.debug('Session %s: no cycle events from %s: %s', self.number, machine, e)
        if ok:
            log.info('Session %s: cycle events from %s machines', self.number, ok)
        elif self.number == 1:  # the server may only send events through its Server object
            await sub.subscribe_events(c.get_node(ua.ObjectIds.Server), evfilter=evfilter)
            log.info('Session 1: cycle events through the Server object')

    async def run(self):
        while True:
            self.reset()
            started = time.monotonic()
            connected = False
            try:
                c = self.client()
                await self.secure(c)
                log.info('Session %s: connecting to %s for %s machines', self.number, self.cfg.opcua_url, len(self.machine_nodes))
                async with c:
                    await self.load_types(c)
                    sub = await c.create_subscription(self.cfg.sampling_ms, self)
                    await self.subscribe(c, sub)
                    connected = True
                    self.stats['sessions'] += 1
                    health = time.monotonic()
                    while True:
                        await asyncio.sleep(self.cfg.publish_ms / 1000)
                        self.flush()
                        if time.monotonic() - health >= 15:
                            await asyncio.wait_for(c.get_node(SERVER_TIME).read_value(), 10)
                            health = time.monotonic()
                        if time.monotonic() - started >= self.cfg.reconnect_hours * 3600:
                            log.info('Session %s: planned reconnect', self.number)
                            break
            except asyncio.CancelledError:
                raise
            except Exception as e:
                log.error('Session %s: %s: %s; retrying in %s s', self.number, type(e).__name__, e, self.cfg.retry_seconds)
                await asyncio.sleep(self.cfg.retry_seconds)
                continue
            finally:
                if connected:
                    self.stats['sessions'] -= 1
            await asyncio.sleep(3)


def groups(items, size):
    n = max(1, -(-len(items) // size))
    base, extra = divmod(len(items), n)
    out, start = [], 0
    for i in range(n):
        end = start + base + (1 if i < extra else 0)
        out.append(items[start:end])
        start = end
    return [g for g in out if g]


async def probe(cfg, machine_nodes, event_wait=60):
    """Connect once, read every collected variable of each machine and print it, then wait up to
    event_wait seconds for one cycle event per running machine and print all its fields (no MQTT)."""
    s = Session(0, machine_nodes, cfg, publish=lambda m: None, stats={'events': 0, 'sessions': 0})
    c = s.client()
    await s.secure(c)
    async with c:
        print(f'Connected to {cfg.opcua_url}')
        await s.load_types(c)
        evtype = await find_event_type(c)
        print(f'{EVENT_TYPE}: {"found " + evtype.to_string() if evtype else "NOT FOUND (no cycle events)"}')

        # ---- all variables (VARIABLES + barrel setpoints + browsed steps / zones), read once ----
        live = []
        for machine in machine_nodes:
            print(f'\n=== {machine} - variables ===')
            variables = await s.variables_for(c, machine)
            width = max(len(k) for k in variables)
            for key, nid in variables.items():
                try:
                    v = jsonable(await c.get_node(nid).read_value())
                except Exception as e:
                    v = f'({type(e).__name__})'
                print(f'  {key:<{width}}  {v}')
                if key == NAME_KEY and isinstance(v, str) and v.strip():
                    live.append(machine)

        # ---- all cycle event fields: they only exist inside an event, so wait for one shot ----
        if not cfg.cycle_events or evtype is None:
            print('\nCycle events are off or not available on this server; no event fields to show.')
            return
        if not live:
            print('\nNo running machine (empty UserMachineName); no cycle events to wait for.')
            return
        print(f'\nWaiting up to {event_wait} s for one shot on each of {len(live)} running machine(s) ...', flush=True)
        sub = await c.create_subscription(cfg.sampling_ms, s)
        await s.subscribe_events(c, sub)
        deadline = time.monotonic() + event_wait
        while time.monotonic() < deadline and not all(s.state[m]['data'] for m in live):
            await asyncio.sleep(1)
        width = max(len(k) for k, _ in s.event_fields) - len(EVENT) - 1
        for machine in live:
            data = s.state[machine]['data']
            print(f'\n=== {machine} - {EVENT} ===')
            if not data:
                print(f'  (no shot within {event_wait} s)')
                continue
            for key, _ in s.event_fields:
                print(f'  {key[len(EVENT) + 1:]:<{width}}  {data.get(key, "(not in event)")}')
