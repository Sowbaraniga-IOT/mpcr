"""OPC UA sessions to the FANUC gateway: subscribe, keep each machine's state, hand it to the publisher.

One session per group of machines (cfg.machines_per_session), each reconnecting on its own.
A machine counts as live while its UserMachineName is not empty, as in the plant's collector.
Every message has the plant collector's shape:
    {"machine_node": "IMM_FANUC_ROBOSHOT0005", "machine": "J1030", "ts": "…", "data": {…}}
"""
import asyncio
import logging
import time
from datetime import datetime, timezone

from asyncua import Client, ua
from asyncua.common.events import where_clause_from_evtype

from . import NAME
from .nodes import EVENT_TYPE, NAME_KEY, VARIABLES, cycle_event_fields, setpoint_variables

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

    async def subscribe(self, c, sub):
        nodes, keys = [], []
        for machine in self.machine_nodes:
            for key, path in self.variables.items():
                node = c.get_node(ua.NodeId(f'{machine}.{path}', self.cfg.namespace))
                self.by_nodeid[node.nodeid.to_string()] = (machine, key)
                nodes.append(node)
                keys.append((machine, key))
        handles = await sub.subscribe_data_change(nodes, sampling_interval=self.cfg.sampling_ms)
        ok = sum(isinstance(h, int) for h in handles)
        missing = sorted({f'{m}.{k}' for (m, k), h in zip(keys, handles) if not isinstance(h, int) and k == NAME_KEY})
        log.info('Session %s: %s of %s variables subscribed', self.number, ok, len(nodes))
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


async def probe(cfg, machine_nodes):
    """Connect once, read the main values of each machine and print them (no subscription, no MQTT)."""
    s = Session(0, machine_nodes, cfg, publish=lambda m: None, stats={'events': 0, 'sessions': 0})
    c = s.client()
    await s.secure(c)
    async with c:
        print(f'Connected to {cfg.opcua_url}')
        evtype = await find_event_type(c)
        print(f'{EVENT_TYPE}: {"found " + evtype.to_string() if evtype else "NOT FOUND (no cycle events)"}')
        keys = ['machinename', 'operating_status', 'cycletime', 'tool', 'jobcyclecounter']
        print(f'{"node":<24}' + ''.join(f'{k:<20}' for k in keys))
        for machine in machine_nodes:
            row = []
            for k in keys:
                try:
                    v = jsonable(await c.get_node(ua.NodeId(f'{machine}.{VARIABLES[k]}', cfg.namespace)).read_value())
                except Exception as e:
                    v = f'({type(e).__name__})'
                row.append(str(v)[:19])
            print(f'{machine:<24}' + ''.join(f'{v:<20}' for v in row))
