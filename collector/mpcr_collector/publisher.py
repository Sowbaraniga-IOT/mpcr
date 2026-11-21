"""Where collected machine states go: an MQTT broker, or the console (--dry-run)."""
import json
import logging
import socket
from datetime import datetime, timezone

import paho.mqtt.client as mqtt

from . import NAME, VERSION

log = logging.getLogger('mpcr_collector.mqtt')


def dumps(message):
    return json.dumps(message, ensure_ascii=False, separators=(',', ':'), default=str)


class MqttPublisher:
    """Publishes each machine message on cfg.mqtt_topic. Reconnects by itself; while the broker
    is away, paho keeps up to cfg.mqtt_queue messages and sends them once it is back.
    The collector's own state is on <topic>/collector (retained, with a last will)."""

    def __init__(self, cfg):
        self.cfg = cfg
        self.status_topic = f'{cfg.mqtt_topic}/collector'
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f'mpcr-collector-{socket.gethostname()}')
        if cfg.mqtt_user:
            self.client.username_pw_set(cfg.mqtt_user, cfg.mqtt_password)
        self.client.max_queued_messages_set(cfg.mqtt_queue)
        self.client.reconnect_delay_set(min_delay=1, max_delay=30)
        self.client.will_set(self.status_topic, self._status(False), qos=1, retain=True)
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.sent = 0

    def _status(self, online, **extra):
        return dumps({'collector': NAME, 'version': VERSION, 'host': socket.gethostname(), 'online': online, 'ts': datetime.now(timezone.utc).isoformat(), **extra})

    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        if reason_code.is_failure:
            log.error('MQTT broker refused the connection: %s', reason_code)
            return
        log.info('MQTT connected to %s:%s, publishing on "%s"', self.cfg.mqtt_host, self.cfg.mqtt_port, self.cfg.mqtt_topic)
        client.publish(self.status_topic, self._status(True), qos=1, retain=True)

    def _on_disconnect(self, client, userdata, flags, reason_code, properties=None):
        if reason_code != 0:
            log.warning('MQTT disconnected (%s), reconnecting', reason_code)

    def start(self):
        self.client.connect_async(self.cfg.mqtt_host, self.cfg.mqtt_port, keepalive=60)
        self.client.loop_start()

    def publish(self, message):
        info = self.client.publish(self.cfg.mqtt_topic, dumps(message), qos=self.cfg.mqtt_qos)
        if info.rc == mqtt.MQTT_ERR_QUEUE_SIZE:
            log.warning('MQTT queue full (%s); a message for %s was dropped', self.cfg.mqtt_queue, message.get('machine'))
        else:
            self.sent += 1

    def stop(self):
        try:
            self.client.publish(self.status_topic, self._status(False), qos=1, retain=True).wait_for_publish(2)
        except Exception:
            pass
        self.client.loop_stop()
        self.client.disconnect()


class ConsolePublisher:
    """--dry-run: print instead of publishing."""

    sent = 0

    def start(self):
        log.info('Dry run: messages are printed, not published')

    def publish(self, message):
        self.sent += 1
        print(dumps(message), flush=True)

    def stop(self):
        pass
