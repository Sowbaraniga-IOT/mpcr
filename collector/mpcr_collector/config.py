"""Settings, read from collector.env (KEY=VALUE lines) with real environment variables winning."""
import os
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent  # the collector folder


def read_env_file(path):
    values = {}
    if path and Path(path).is_file():
        for line in Path(path).read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def machine_numbers(spec, exclude=''):
    """'1-131' or '1-10,15,20-22', minus the excluded numbers."""
    out = []
    for part in str(spec).split(','):
        part = part.strip()
        if '-' in part:
            a, b = part.split('-', 1)
            out.extend(range(int(a), int(b) + 1))
        elif part:
            out.append(int(part))
    skip = {int(x) for x in str(exclude).replace(' ', '').split(',') if x}
    return [n for n in dict.fromkeys(out) if n not in skip]


@dataclass
class Config:
    # OPC UA gateway (FANUC)
    opcua_url: str = 'opc.tcp://10.245.251.10:62553'
    opcua_user: str = ''
    opcua_password: str = ''
    security: str = 'Basic256Sha256'  # Basic256Sha256 (SignAndEncrypt) or None
    cert: str = 'certs/rconnect_cert.der'
    key: str = 'certs/rconnect_key.pem'
    app_uri: str = 'urn:fanuc:euromap77:rconnect'  # must match the URI inside the client certificate
    namespace: int = 6  # the gateway's namespace for machine nodes
    machine_prefix: str = 'IMM_FANUC_ROBOSHOT'
    machines: list = field(default_factory=lambda: machine_numbers('1-131'))
    machines_per_session: int = 30
    sampling_ms: int = 250
    cycle_events: bool = True  # subscribe to ROBOSHOTCycleParametersEvent (cushion, injection time …)
    barrel_zones: int = 6
    mould_zones: int = 4
    reconnect_hours: float = 2.0
    retry_seconds: int = 20
    # MQTT
    mqtt_host: str = 'localhost'
    mqtt_port: int = 1883
    mqtt_user: str = ''
    mqtt_password: str = ''
    mqtt_topic: str = 'mpcr/euromap77/mpcr'
    mqtt_qos: int = 0
    mqtt_queue: int = 20000
    publish_ms: int = 1000  # at most one message per machine per this interval
    keepalive_seconds: int = 60  # resend every live machine's state at least this often

    def node_name(self, number):
        return f'{self.machine_prefix}{number:04d}'

    def path(self, value):
        p = Path(value)
        return str(p if p.is_absolute() else HERE / p)


def load(env_file=None):
    env_file = env_file or os.environ.get('COLLECTOR_ENV') or HERE / 'collector.env'
    raw = {**read_env_file(env_file), **{k: v for k, v in os.environ.items() if k.startswith(('OPCUA_', 'MQTT_', 'COLLECTOR_'))}}
    get = raw.get
    c = Config()
    c.opcua_url = get('OPCUA_URL', c.opcua_url)
    c.opcua_user = get('OPCUA_USER', c.opcua_user)
    c.opcua_password = get('OPCUA_PASSWORD', c.opcua_password)
    c.security = get('OPCUA_SECURITY', c.security)
    c.cert = c.path(get('OPCUA_CERT', c.cert))
    c.key = c.path(get('OPCUA_KEY', c.key))
    c.app_uri = get('OPCUA_APP_URI', c.app_uri)
    c.namespace = int(get('OPCUA_NAMESPACE', c.namespace))
    c.machine_prefix = get('OPCUA_MACHINE_PREFIX', c.machine_prefix)
    c.machines = machine_numbers(get('OPCUA_MACHINES', '1-131'), get('OPCUA_MACHINES_EXCLUDE', ''))
    c.machines_per_session = max(1, int(get('OPCUA_MACHINES_PER_SESSION', c.machines_per_session)))
    c.sampling_ms = int(get('OPCUA_SAMPLING_MS', c.sampling_ms))
    c.cycle_events = get('OPCUA_CYCLE_EVENTS', '1') not in ('0', 'false', 'no', '')
    c.barrel_zones = int(get('OPCUA_BARREL_ZONES', c.barrel_zones))
    c.mould_zones = int(get('OPCUA_MOULD_ZONES', c.mould_zones))
    c.reconnect_hours = float(get('OPCUA_RECONNECT_HOURS', c.reconnect_hours))
    c.retry_seconds = int(get('OPCUA_RETRY_SECONDS', c.retry_seconds))
    c.mqtt_host = get('MQTT_HOST', c.mqtt_host)
    c.mqtt_port = int(get('MQTT_PORT', c.mqtt_port))
    c.mqtt_user = get('MQTT_USER', c.mqtt_user)
    c.mqtt_password = get('MQTT_PASSWORD', c.mqtt_password)
    c.mqtt_topic = get('MQTT_TOPIC', c.mqtt_topic)
    c.mqtt_qos = int(get('MQTT_QOS', c.mqtt_qos))
    c.mqtt_queue = int(get('MQTT_QUEUE', c.mqtt_queue))
    c.publish_ms = int(get('COLLECTOR_PUBLISH_MS', c.publish_ms))
    c.keepalive_seconds = int(get('COLLECTOR_KEEPALIVE_SECONDS', c.keepalive_seconds))
    return c, str(env_file)
