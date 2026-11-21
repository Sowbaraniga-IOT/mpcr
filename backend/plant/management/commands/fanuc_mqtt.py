"""
Django Management Command: fanuc_mqtt
======================================
Runs the FANUC MQTT Client connected to your FANUC server / broker,
publishing machine telemetry and listening for plant commands.

Usage:
    python manage.py fanuc_mqtt
    python manage.py fanuc_mqtt --host 192.168.1.100 --port 1883
    python manage.py fanuc_mqtt --machine-id M01 --interval 5.0 --db-sync
"""

import time
from django.core.management.base import BaseCommand
from integrations.fanuc.mqtt_client import FanucMQTTClient


class Command(BaseCommand):
    help = "Run FANUC MQTT Publisher & Subscriber Client"

    def add_arguments(self, parser):
        parser.add_argument("--host", default="localhost", help="MQTT Broker host")
        parser.add_argument("--port", type=int, default=1883, help="MQTT Broker port")
        parser.add_argument("-u", "--user", default=None, help="Broker username")
        parser.add_argument("-p", "--password", default=None, help="Broker password")
        parser.add_argument("--machine-id", default="M01", help="Target FANUC machine ID")
        parser.add_argument("--topic-prefix", default="mpcr/fanuc", help="MQTT topic prefix")
        parser.add_argument("--mode", choices=["both", "pub", "sub"], default="both", help="Pub/Sub mode")
        parser.add_argument("--interval", type=float, default=5.0, help="Publish interval in seconds")
        parser.add_argument("--db-sync", action="store_true", default=True, help="Sync telemetry into Machine model")

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS(f"Starting FANUC MQTT Client for machine {options['machine_id']}..."))
        client = FanucMQTTClient(
            broker_host=options["host"],
            broker_port=options["port"],
            machine_id=options["machine_id"],
            topic_prefix=options["topic_prefix"],
            username=options["user"],
            password=options["password"],
            publish_interval=options["interval"],
            db_sync=options["db_sync"],
        )

        try:
            client.start(mode=options["mode"])
            self.stdout.write(self.style.SUCCESS(f"Connected to {options['host']}:{options['port']}. Press Ctrl+C to stop."))
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            self.stdout.write(self.style.WARNING("Stopping client..."))
        finally:
            client.stop()
            self.stdout.write(self.style.SUCCESS("FANUC MQTT Client stopped."))
