#!/usr/bin/env python3
"""
FANUC MQTT Client (Publisher & Subscriber)
===========================================
Connects to a FANUC MQTT Server / Industrial IoT Gateway (FANUC ROBOSHOT,
FANUC ROBODRILL, FANUC Robot Controller, Kepware, FIELD System, or Mosquitto/EMQX).

Capabilities:
  1. SUBSCRIBER:
     - Listens on command topics (e.g. `mpcr/fanuc/{machine_id}/command`)
     - Handles commands: START, STOP, RESET_ALARM, SET_RECIPE, POLL, PING
     - Publishes acknowledgments / responses back to `mpcr/fanuc/{machine_id}/response`
  2. PUBLISHER:
     - Publishes live machine telemetry: status, cycle time, cushion, injection time,
       peak pressure, recovery time, barrel temperatures, shot count
     - Publishes Last Will and Testament (LWT) & online presence on `mpcr/fanuc/{machine_id}/status`
     - Publishes alarm alerts on `mpcr/fanuc/{machine_id}/alarms`
  3. DUAL-MODE / INTERACTIVE:
     - Runs both publisher and subscriber concurrently in background threads.
     - Optional interactive prompt to send manual commands to the FANUC server.
  4. OPTIONAL DJANGO / DATABASE SYNC:
     - If `--db-sync` is enabled, incoming telemetry directly updates the MPCR
       Machine and ParameterLog database records.

Usage Examples:
  # 1. Run both Publisher and Subscriber against localhost:
  python -m integrations.fanuc.mqtt_client --host localhost --port 1883 --machine-id FANUC-01

  # 2. Run with username/password authentication:
  python -m integrations.fanuc.mqtt_client --host 192.168.1.100 --port 1883 -u fanuc_user -p secure123

  # 3. Run in Subscriber-only mode:
  python -m integrations.fanuc.mqtt_client --host 192.168.1.100 --mode sub

  # 4. Run in Publisher-only mode:
  python -m integrations.fanuc.mqtt_client --host 192.168.1.100 --mode pub --interval 3.0

  # 5. Run with automatic database persistence (MPCR Django backend):
  python -m integrations.fanuc.mqtt_client --host localhost --db-sync
"""

import argparse
import json
import logging
import os
import random
import signal
import sys
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from integrations.fanuc import euromap77  # run from backend/: python -m integrations.fanuc.mqtt_client

# Attempt to load paho-mqtt
try:
    import paho.mqtt.client as mqtt
    from paho.mqtt.enums import CallbackAPIVersion
    PAHO_V2 = True
except (ImportError, AttributeError):
    try:
        import paho.mqtt.client as mqtt
        PAHO_V2 = False
    except ImportError:
        print("[ERROR] 'paho-mqtt' is not installed. Install it with: pip install paho-mqtt")
        sys.exit(1)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("FANUC-MQTT")


class FanucMQTTClient:
    """Industrial MQTT Client for FANUC machine integration."""

    def __init__(
        self,
        broker_host: str = "localhost",
        broker_port: int = 1883,
        machine_id: str = "FANUC-01",
        topic_prefix: str = "mpcr/fanuc",
        username: Optional[str] = None,
        password: Optional[str] = None,
        keepalive: int = 60,
        publish_interval: float = 5.0,
        db_sync: bool = False,
    ):
        self.broker_host = broker_host
        self.broker_port = broker_port
        self.machine_id = machine_id
        self.topic_prefix = topic_prefix.rstrip("/")
        self.username = username
        self.password = password
        self.keepalive = keepalive
        self.publish_interval = publish_interval
        self.db_sync = db_sync

        self._running = threading.Event()
        self._publisher_thread: Optional[threading.Thread] = None

        # Topics definition
        self.topic_telemetry = f"{self.topic_prefix}/{self.machine_id}/telemetry"
        self.topic_status = f"{self.topic_prefix}/{self.machine_id}/status"
        self.topic_command = f"{self.topic_prefix}/{self.machine_id}/command"
        self.topic_response = f"{self.topic_prefix}/{self.machine_id}/response"
        self.topic_alarms = f"{self.topic_prefix}/{self.machine_id}/alarms"
        self.topic_all_commands = f"{self.topic_prefix}/+/command"

        # Machine state simulation cache
        self.state = {
            "machine_id": self.machine_id,
            "make": "FANUC",
            "model": "ROBOSHOT α-S100iA",
            "status": "run",  # run, idle, alarm, maint, off
            "shot_count": 14250,
            "cycle_time": 22.40,      # seconds
            "cushion": 4.12,          # mm
            "injection_time": 1.485,   # seconds
            "peak_pressure": 138.5,   # bar / MPa
            "recovery_time": 6.82,    # seconds
            "barrel_temp": {
                "nozzle": 235.0,
                "zone1": 230.0,
                "zone2": 225.0,
                "zone3": 215.0,
                "feed": 60.0,
            },
            "mold_temp": 45.0,
            "clamp_force": 1000,      # kN
            "alarm_code": None,
            "alarm_text": None,
        }

        # Initialize Paho MQTT Client
        client_id = f"fanuc-client-{self.machine_id}-{int(time.time()) % 10000}"
        if PAHO_V2:
            self.client = mqtt.Client(
                callback_api_version=CallbackAPIVersion.VERSION2,
                client_id=client_id,
                clean_session=True,
            )
        else:
            self.client = mqtt.Client(
                client_id=client_id,
                clean_session=True,
            )

        # Set credentials if provided
        if self.username:
            self.client.username_pw_set(self.username, self.password)

        # Attach Callbacks
        self._setup_callbacks()

        # Set Last Will and Testament (LWT)
        lwt_payload = json.dumps({
            "machine_id": self.machine_id,
            "online": False,
            "status": "offline",
            "reason": "Unexpected client disconnect (LWT triggered)",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        self.client.will_set(self.topic_status, payload=lwt_payload, qos=1, retain=True)

        # Optional DB initialization
        if self.db_sync:
            self._init_django()

    def _init_django(self):
        """Initializes Django environment for database synchronization if requested."""
        try:
            import django
            os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mpcr.settings")
            django.setup()
            logger.info("Django database environment initialized successfully for DB sync.")
        except Exception as e:
            logger.warning(f"Could not initialize Django database models: {e}. Running without DB sync.")
            self.db_sync = False

    def _setup_callbacks(self):
        """Attaches MQTT protocol event handlers."""
        if PAHO_V2:
            self.client.on_connect = self._on_connect_v2
            self.client.on_disconnect = self._on_disconnect_v2
            self.client.on_message = self._on_message_v2
            self.client.on_publish = self._on_publish_v2
        else:
            self.client.on_connect = self._on_connect_v1
            self.client.on_disconnect = self._on_disconnect_v1
            self.client.on_message = self._on_message_v1
            self.client.on_publish = self._on_publish_v1

    # -------------------------------------------------------------------------
    # MQTT Callbacks (v2 and v1 compatibility)
    # -------------------------------------------------------------------------
    def _on_connect_v2(self, client, userdata, flags, reason_code, properties):
        if reason_code == 0:
            logger.info(f"Connected to FANUC MQTT Broker at {self.broker_host}:{self.broker_port} (code: {reason_code})")
            self._handle_successful_connection()
        else:
            logger.error(f"Failed to connect to broker. Reason code: {reason_code}")

    def _on_connect_v1(self, client, userdata, flags, rc):
        if rc == 0:
            logger.info(f"Connected to FANUC MQTT Broker at {self.broker_host}:{self.broker_port} (rc: {rc})")
            self._handle_successful_connection()
        else:
            logger.error(f"Failed to connect to broker. Return code: {rc}")

    def _handle_successful_connection(self):
        """Actions to execute immediately upon establishing connection."""
        # 1. Publish birth certificate / online status (retained)
        birth_payload = json.dumps({
            "machine_id": self.machine_id,
            "online": True,
            "status": self.state["status"],
            "make": self.state["make"],
            "model": self.state["model"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        self.client.publish(self.topic_status, birth_payload, qos=1, retain=True)
        logger.info(f"[PRESENCE] Published birth status to topic: {self.topic_status}")

        # 2. Subscribe to incoming command topics (SUBSCRIBER ROLE)
        # Subscribes to machine specific commands and wildcard commands
        topics = [(self.topic_command, 1), (self.topic_all_commands, 1)]
        self.client.subscribe(topics)
        logger.info(f"[SUBSCRIBER] Subscribed to command topics: {self.topic_command}")

    def _on_disconnect_v2(self, client, userdata, disconnect_flags, reason_code, properties):
        logger.warning(f"Disconnected from MQTT Broker. Reason code: {reason_code}")

    def _on_disconnect_v1(self, client, userdata, rc):
        logger.warning(f"Disconnected from MQTT Broker. Return code: {rc}")

    def _on_publish_v2(self, client, userdata, mid, reason_code, properties):
        logger.debug(f"[PUBLISHER] Message #{mid} successfully published.")

    def _on_publish_v1(self, client, userdata, mid):
        logger.debug(f"[PUBLISHER] Message #{mid} successfully published.")

    # -------------------------------------------------------------------------
    # SUBSCRIBER MESSAGE HANDLER
    # -------------------------------------------------------------------------
    def _on_message_v2(self, client, userdata, message):
        self._process_incoming_message(message.topic, message.payload.decode("utf-8", errors="replace"))

    def _on_message_v1(self, client, userdata, message):
        self._process_incoming_message(message.topic, message.payload.decode("utf-8", errors="replace"))

    def _process_incoming_message(self, topic: str, payload_str: str):
        """Processes and routes received MQTT messages."""
        logger.info(f"[SUBSCRIBER] Received message on topic: '{topic}'")
        try:
            data = json.loads(payload_str)
        except json.JSONDecodeError:
            logger.warning(f"Could not parse payload as JSON: {payload_str}")
            data = {"raw_text": payload_str}

        logger.info(f"Payload: {json.dumps(data, indent=2)}")

        # Handle Commands
        if "command" in data or "action" in data:
            cmd = (data.get("command") or data.get("action", "")).upper()
            cmd_id = data.get("id") or data.get("request_id") or f"cmd-{int(time.time())}"
            self._handle_command(cmd, data, cmd_id)
        elif "telemetry" in topic and self.db_sync:
            # External telemetry received, sync to DB
            self._save_telemetry_to_db(data)

    def _handle_command(self, cmd: str, payload: Dict[str, Any], cmd_id: str):
        """Executes machine control actions and responds back over MQTT."""
        logger.info(f"[COMMAND HANDLER] Executing command '{cmd}' (ID: {cmd_id})")
        status = "ACK"
        message = "Command executed successfully"

        if cmd == "PING":
            message = "PONG"

        elif cmd == "START":
            self.state["status"] = "run"
            self.state["alarm_code"] = None
            self.state["alarm_text"] = None
            message = f"FANUC machine {self.machine_id} switched to RUN mode."

        elif cmd == "STOP":
            self.state["status"] = "idle"
            message = f"FANUC machine {self.machine_id} stopped (IDLE)."

        elif cmd == "RESET_ALARM":
            self.state["status"] = "run" if self.state["status"] == "alarm" else self.state["status"]
            self.state["alarm_code"] = None
            self.state["alarm_text"] = None
            message = f"Alarms cleared on {self.machine_id}."

        elif cmd == "TRIGGER_ALARM":
            self.state["status"] = "alarm"
            self.state["alarm_code"] = payload.get("code", "AL-104")
            self.state["alarm_text"] = payload.get("text", "Barrel Temperature Zone 2 Overheat")
            self.publish_alarm(self.state["alarm_code"], self.state["alarm_text"], severity="CRITICAL")
            message = f"Simulated alarm triggered: {self.state['alarm_code']}."

        elif cmd == "SET_RECIPE":
            recipe = payload.get("recipe", {})
            if "cycle_time" in recipe:
                self.state["cycle_time"] = float(recipe["cycle_time"])
            if "peak_pressure" in recipe:
                self.state["peak_pressure"] = float(recipe["peak_pressure"])
            message = f"Recipe parameters updated: {recipe}"

        elif cmd == "POLL":
            # Immediately publish telemetry
            self.publish_telemetry()
            message = "Immediate telemetry publish dispatched."

        else:
            status = "NACK"
            message = f"Unknown command: '{cmd}'. Supported: START, STOP, RESET_ALARM, TRIGGER_ALARM, SET_RECIPE, POLL, PING"

        # Publish response
        response = {
            "machine_id": self.machine_id,
            "request_id": cmd_id,
            "command": cmd,
            "status": status,
            "message": message,
            "machine_status": self.state["status"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        self.client.publish(self.topic_response, json.dumps(response), qos=1)
        logger.info(f"[PUBLISHER] Published response to '{self.topic_response}': {status} - {message}")

    # -------------------------------------------------------------------------
    # PUBLISHER ACTIONS
    # -------------------------------------------------------------------------
    def publish_telemetry(self):
        """Generates and publishes a telemetry packet."""
        if self.state["status"] == "run":
            # Add small realistic sensor jitter
            self.state["shot_count"] += 1
            self.state["cycle_time"] = round(max(5.0, 22.40 + random.gauss(0, 0.25)), 2)
            self.state["cushion"] = round(max(0.1, 4.12 + random.gauss(0, 0.08)), 2)
            self.state["injection_time"] = round(max(0.5, 1.485 + random.gauss(0, 0.015)), 3)
            self.state["peak_pressure"] = round(max(20.0, 138.5 + random.gauss(0, 1.5)), 1)
            self.state["recovery_time"] = round(max(2.0, 6.82 + random.gauss(0, 0.15)), 2)
            for k in self.state["barrel_temp"]:
                self.state["barrel_temp"][k] = round(self.state["barrel_temp"][k] + random.uniform(-0.3, 0.3), 1)

        payload = {
            "machine_id": self.machine_id,
            "make": self.state["make"],
            "model": self.state["model"],
            "status": self.state["status"],
            "shot_count": self.state["shot_count"],
            # Keyed by EUROMAP 77 node path (integrations/fanuc/euromap77.py), in the units the
            # ROBOSHOT OPC UA server uses: Duration in milliseconds.
            "telemetry": self._euromap_values(),
            "alarm": {
                "active": self.state["status"] == "alarm",
                "code": self.state["alarm_code"],
                "text": self.state["alarm_text"],
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        json_data = json.dumps(payload)
        infot = self.client.publish(self.topic_telemetry, json_data, qos=0)
        logger.info(f"[PUBLISHER] Published telemetry to '{self.topic_telemetry}': "
                    f"Status={self.state['status']} | Cycle={self.state['cycle_time']}s | "
                    f"PeakP={self.state['peak_pressure']}bar | Cushion={self.state['cushion']}mm")

        # If DB sync is active, also record into Django PostgreSQL/SQLite
        if self.db_sync:
            self._save_telemetry_to_db(payload)

    def _euromap_values(self) -> Dict[str, Any]:
        """The simulated machine state as EUROMAP 77 node path → value."""
        s = self.state
        mode = {"run": "AUTOMATIC", "idle": "MANUAL", "maint": "SETUP", "alarm": "MANUAL", "off": "OTHER"}[s["status"]]
        zone = euromap77.INJ + "/BrlTmpZnCycParams_{}/ActualTemperature"
        barrel = [s["barrel_temp"]["nozzle"], s["barrel_temp"]["zone1"], s["barrel_temp"]["zone2"], s["barrel_temp"]["zone3"]]
        values = {
            f"{euromap77.STATUS}/IsPresent": s["status"] != "off",
            euromap77.LIVE["status"]["path"]: mode,
            euromap77.MACHINE_INFO["make"]["path"]: s["make"],
            euromap77.MACHINE_INFO["model"]["path"]: s["model"],
            euromap77.MACHINE_INFO["shotCount"]["path"]: s["shot_count"],
            euromap77.LIVE["cycle"]["path"]: round(s["cycle_time"] * 1000),
            euromap77.LIVE["cushion"]["path"]: s["cushion"],
            euromap77.LIVE["injection"]["path"]: round(s["injection_time"] * 1000),
            euromap77.LIVE["peakPressure"]["path"]: s["peak_pressure"],
            euromap77.LIVE["recovery"]["path"]: round(s["recovery_time"] * 1000),
            euromap77.PARAMS["TMP_MOLD"]["path"]: s["mold_temp"],
        }
        for nr, temp in enumerate(barrel, start=1):
            values[zone.format(nr)] = temp
        return values

    def publish_alarm(self, code: str, description: str, severity: str = "WARNING"):
        """Publishes an alarm notice."""
        payload = {
            "machine_id": self.machine_id,
            "alarm_code": code,
            "description": description,
            "severity": severity,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        self.client.publish(self.topic_alarms, json.dumps(payload), qos=1)
        logger.warning(f"[PUBLISHER] Published alarm to '{self.topic_alarms}': [{severity}] {code} - {description}")

    def send_command(self, target_machine_id: str, command: str, extra_params: Optional[Dict[str, Any]] = None):
        """Allows client to act as a publisher sending a command to any FANUC machine."""
        topic = f"{self.topic_prefix}/{target_machine_id}/command"
        payload = {
            "command": command.upper(),
            "request_id": f"cli-{int(time.time())}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if extra_params:
            payload.update(extra_params)
        self.client.publish(topic, json.dumps(payload), qos=1)
        logger.info(f"[PUBLISHER] Dispatched command '{command}' to topic '{topic}'")

    # -------------------------------------------------------------------------
    # DATABASE PERSISTENCE (Django Integration)
    # -------------------------------------------------------------------------
    def _save_telemetry_to_db(self, data: Dict[str, Any]):
        """Persists telemetry values to Django DB."""
        try:
            from plant.models import Machine
            from django.utils import timezone as dj_timezone

            m_id = data.get("machine_id", self.machine_id)
            machine = Machine.objects.filter(id=m_id).first()
            if not machine:
                return

            # EUROMAP 77 names first; MPCR's own keys (older publishers) and an explicit
            # "status" such as "alarm" override them.
            t = data.get("telemetry", {})
            values = euromap77.from_euromap(t)
            values.update({k: t[k] for k in ("cycle", "cushion", "injection", "peakPressure", "recovery") if k in t})
            if data.get("status") in ("run", "idle", "maint", "alarm", "off"):
                values["status"] = data["status"]
            machine.set_fields(values, Machine.TELEMETRY_FIELDS)

            machine.telemetry_at = dj_timezone.now()
            machine.save(update_fields=["status", "cycle", "cushion", "injection", "peak_pressure", "recovery", "telemetry_at"])
            logger.debug(f"[DB SYNC] Updated Machine {machine.id} in MPCR database.")
        except Exception as e:
            logger.error(f"[DB SYNC] Failed to save telemetry to database: {e}")

    # -------------------------------------------------------------------------
    # MAIN RUN LOOP & LIFECYCLE
    # -------------------------------------------------------------------------
    def _publisher_worker(self):
        """Periodic background telemetry publisher."""
        logger.info(f"Background publisher started (interval: {self.publish_interval}s)")
        while self._running.is_set():
            try:
                self.publish_telemetry()
            except Exception as e:
                logger.error(f"Error publishing telemetry: {e}")
            self._running.wait(self.publish_interval)

    def start(self, mode: str = "both"):
        """
        Starts the MQTT client network loop and tasks.
        mode: 'both' (Pub + Sub), 'pub' (Publisher only), 'sub' (Subscriber only)
        """
        self._running.set()
        logger.info(f"Connecting to broker {self.broker_host}:{self.broker_port}...")
        self.client.connect(self.broker_host, self.broker_port, keepalive=self.keepalive)
        self.client.loop_start()

        if mode in ("both", "pub"):
            self._publisher_thread = threading.Thread(target=self._publisher_worker, daemon=True)
            self._publisher_thread.start()

    def stop(self):
        """Gracefully shuts down publisher and disconnects."""
        logger.info("Stopping FANUC MQTT Client...")
        self._running.clear()
        if self._publisher_thread and self._publisher_thread.is_alive():
            self._publisher_thread.join(timeout=2.0)

        # Publish offline status before closing
        try:
            offline_payload = json.dumps({
                "machine_id": self.machine_id,
                "online": False,
                "status": "offline",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            self.client.publish(self.topic_status, offline_payload, qos=1, retain=True)
            time.sleep(0.2)
        except Exception:
            pass

        self.client.loop_stop()
        self.client.disconnect()
        logger.info("Disconnected cleanly.")


# -----------------------------------------------------------------------------
# CLI Entrypoint
# -----------------------------------------------------------------------------
def parse_arguments():
    parser = argparse.ArgumentParser(
        description="FANUC MQTT Client - Industrial Publisher & Subscriber",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--host", default=os.getenv("MQTT_BROKER_HOST", "localhost"), help="MQTT broker / FANUC server IP")
    parser.add_argument("--port", type=int, default=int(os.getenv("MQTT_BROKER_PORT", "1883")), help="MQTT broker port")
    parser.add_argument("-u", "--user", default=os.getenv("MQTT_USERNAME", None), help="Username for broker authentication")
    parser.add_argument("-p", "--password", default=os.getenv("MQTT_PASSWORD", None), help="Password for broker authentication")
    parser.add_argument("--machine-id", default=os.getenv("FANUC_MACHINE_ID", "FANUC-01"), help="FANUC Machine ID identifier")
    parser.add_argument("--topic-prefix", default=os.getenv("MQTT_TOPIC_PREFIX", "mpcr/fanuc"), help="MQTT topic prefix")
    parser.add_argument("--mode", choices=["both", "pub", "sub", "interactive"], default="both",
                        help="Operation mode: 'both' (Pub+Sub), 'pub' (only publish), 'sub' (only listen), 'interactive' (CLI prompt)")
    parser.add_argument("--interval", type=float, default=5.0, help="Seconds between telemetry publish ticks")
    parser.add_argument("--db-sync", action="store_true", help="Sync received live telemetry into MPCR Django database")
    return parser.parse_args()


def main():
    args = parse_arguments()

    client = FanucMQTTClient(
        broker_host=args.host,
        broker_port=args.port,
        machine_id=args.machine_id,
        topic_prefix=args.topic_prefix,
        username=args.user,
        password=args.password,
        publish_interval=args.interval,
        db_sync=args.db_sync,
    )

    # Handle OS termination signals
    def signal_handler(signum, frame):
        print("\nShutdown signal received. Exiting...")
        client.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        run_mode = "both" if args.mode == "interactive" else args.mode
        client.start(mode=run_mode)

        if args.mode == "interactive":
            print("\n" + "=" * 60)
            print(f"FANUC MQTT Interactive Terminal for machine '{args.machine_id}'")
            print("Commands: START | STOP | RESET | ALARM | POLL | PING | SEND <cmd> | QUIT")
            print("=" * 60 + "\n")

            while True:
                try:
                    cmd_input = input("FANUC-MQTT> ").strip()
                    if not cmd_input:
                        continue
                    parts = cmd_input.split(maxsplit=1)
                    verb = parts[0].upper()

                    if verb in ("QUIT", "EXIT", "Q"):
                        break
                    elif verb == "START":
                        client.send_command(args.machine_id, "START")
                    elif verb == "STOP":
                        client.send_command(args.machine_id, "STOP")
                    elif verb == "RESET":
                        client.send_command(args.machine_id, "RESET_ALARM")
                    elif verb == "ALARM":
                        client.send_command(args.machine_id, "TRIGGER_ALARM", {"code": "AL-502", "text": "Cycle Time Exceeded Limit"})
                    elif verb == "POLL":
                        client.send_command(args.machine_id, "POLL")
                    elif verb == "PING":
                        client.send_command(args.machine_id, "PING")
                    elif verb == "SEND" and len(parts) > 1:
                        client.send_command(args.machine_id, parts[1])
                    else:
                        print("Unknown command. Try: START, STOP, RESET, ALARM, POLL, PING, SEND <custom>, QUIT")
                except (EOFError, KeyboardInterrupt):
                    break
        else:
            print(f"Client running in '{args.mode}' mode. Press Ctrl+C to terminate.")
            while True:
                time.sleep(1)

    except KeyboardInterrupt:
        pass
    except Exception as e:
        logger.error(f"Execution error: {e}", exc_info=True)
    finally:
        client.stop()


if __name__ == "__main__":
    main()
