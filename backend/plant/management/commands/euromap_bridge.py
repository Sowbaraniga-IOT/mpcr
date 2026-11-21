"""Listens to the plant's EUROMAP 77 collector on MQTT and keeps MPCR's live machine values current.

    python manage.py euromap_bridge                       # broker and topic from settings / .env
    python manage.py euromap_bridge --host 10.245.x.x --topic factory/euromap77/raw
    python manage.py euromap_bridge --verbose              # print every update
    python manage.py euromap_bridge --no-auto-log          # live values only, don't fill the parameter sheet

The collector (OPC UA → MQTT) owns the connection to the FANUC gateway; this only subscribes.
For machines whose data source is "Auto (OPC UA)" it also records each reading time of the
parameter sheet from the collector's values (FANUC_AUTO_LOG=0 in .env switches that off).
"""
import json
import time

import paho.mqtt.client as mqtt
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import close_old_connections

from integrations.fanuc.bridge import Bridge
from plant.models import slot_label


class Command(BaseCommand):
    help = "Feed MPCR's live machine values from the EUROMAP 77 collector's MQTT topic"

    def add_arguments(self, parser):
        parser.add_argument('--host', default=settings.FANUC_MQTT_HOST)
        parser.add_argument('--port', type=int, default=settings.FANUC_MQTT_PORT)
        parser.add_argument('--topic', default=settings.FANUC_MQTT_TOPIC)
        parser.add_argument('-u', '--user', default=settings.FANUC_MQTT_USER or None)
        parser.add_argument('-p', '--password', default=settings.FANUC_MQTT_PASSWORD or None)
        parser.add_argument('--verbose', action='store_true', help='Print every machine update')
        parser.add_argument('--no-auto-log', action='store_true', help="Don't fill the parameter sheet of Auto (OPC UA) machines")

    def handle(self, *args, host, port, topic, user, password, verbose, no_auto_log, **kw):
        bridge = Bridge()
        seen = set()
        auto_log = settings.FANUC_AUTO_LOG and not no_auto_log
        self.stdout.write(f'{len(bridge.by_name)} MPCR machines; pinned names: {len(bridge.pinned)}; parameter sheet auto-fill: {"on" if auto_log else "off"}')

        def on_connect(client, userdata, flags, reason_code, properties=None):
            if getattr(reason_code, 'is_failure', False):
                self.stderr.write(f'Broker refused the connection: {reason_code}')
                return
            client.subscribe(topic, qos=0)
            self.stdout.write(self.style.SUCCESS(f'Connected to {host}:{port}, listening on "{topic}"'))

        def on_message(client, userdata, msg):
            try:
                message = json.loads(msg.payload)
            except ValueError:
                return
            close_old_connections()
            try:
                mid, fields = bridge.apply(message)
            except Exception as e:  # one bad message must not stop the feed
                self.stderr.write(f'Could not apply a message: {e}')
                return
            if mid and mid not in seen:
                seen.add(mid)
                self.stdout.write(f'{mid} ← {message.get("machine") or message.get("machine_node")} ({len(seen)} machines live)')
            elif mid and verbose:
                self.stdout.write(f'{mid} {fields}')
            elif not mid and (message.get('machine') or message.get('machine_node')) in bridge.unmatched and verbose:
                self.stdout.write(f'No MPCR machine for {message.get("machine")} / {message.get("machine_node")}')

        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f'mpcr-euromap-bridge-{int(time.time()) % 100000}')
        if user:
            client.username_pw_set(user, password)
        client.on_connect = on_connect
        client.on_message = on_message
        client.reconnect_delay_set(min_delay=1, max_delay=30)
        client.connect_async(host, port, keepalive=60)
        client.loop_start()
        try:
            warned = time.monotonic()
            while True:
                time.sleep(20)
                if auto_log:
                    close_old_connections()
                    try:
                        for mid, slot, n in bridge.record_due():
                            self.stdout.write(f'{mid} {slot_label(slot)} recorded from OPC UA ({n} values)')
                    except Exception as e:  # a database hiccup must not stop the live feed
                        self.stderr.write(f'Could not fill the parameter sheet: {e}')
                if bridge.unmatched and time.monotonic() - warned >= 60:
                    warned = time.monotonic()
                    self.stdout.write(self.style.WARNING(f'Not in the MPCR machine master: {", ".join(sorted(bridge.unmatched))}'))
        except KeyboardInterrupt:
            self.stdout.write('Stopped.')
        finally:
            client.loop_stop()
            client.disconnect()
