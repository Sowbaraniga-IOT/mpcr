"""Checks the live-data chain end to end, one hop at a time, and says where it breaks:

    collector (FANUC server) -> MQTT -> subscriber (manage.py euromap_bridge) -> DB -> backend API -> frontend

Run it on the server that hosts MPCR, with the bridge running in another window / service:

    python manage.py check_pipeline
    python manage.py check_pipeline --api http://127.0.0.1:8000 --frontend http://10.x.x.x --user admin --password ...
    python manage.py check_pipeline --wait 120        # wait longer for the first MQTT message

It only reads: MQTT is subscribed to, the DB is queried, the API is called with GET after one
sign-in. The password can also come from MPCR_CHECK_PASSWORD instead of the command line.
"""
import json
import os
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone as dt_timezone

import paho.mqtt.client as mqtt
from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from integrations.fanuc.bridge import Bridge
from integrations.fanuc.euromap77 import from_collector
from plant.models import Machine

FRESH_SECONDS = 180  # the collector resends every minute; DB values older than this mean the bridge isn't writing
COMPARE = ['cycle', 'cushion', 'injection', 'peakPressure', 'recovery']


class Command(BaseCommand):
    help = 'Check collector -> MQTT -> euromap_bridge -> DB -> API -> frontend, hop by hop (read-only)'

    def add_arguments(self, parser):
        parser.add_argument('--host', default=settings.FANUC_MQTT_HOST)
        parser.add_argument('--port', type=int, default=settings.FANUC_MQTT_PORT)
        parser.add_argument('--topic', default=settings.FANUC_MQTT_TOPIC)
        parser.add_argument('--mqtt-user', default=settings.FANUC_MQTT_USER or None)
        parser.add_argument('--mqtt-password', default=getattr(settings, 'FANUC_MQTT_PASSWORD', '') or None)
        parser.add_argument('--wait', type=int, default=75, help='Seconds to listen on MQTT (default 75)')
        parser.add_argument('--api', default='http://127.0.0.1:8000', help='Backend base URL')
        parser.add_argument('--frontend', default='', help='Frontend base URL as users open it, e.g. http://10.x.x.x')
        parser.add_argument('--user', default='admin', help='MPCR login for the API check')
        parser.add_argument('--password', default=os.environ.get('MPCR_CHECK_PASSWORD', ''))

    # ---------- output ----------

    def result(self, status, hop, text):
        style = {'PASS': self.style.SUCCESS, 'WARN': self.style.WARNING, 'FAIL': self.style.ERROR, 'SKIP': self.style.NOTICE}[status]
        self.stdout.write(f'{style(f"[{status}]")} {hop:<11} {text}')
        self.summary.append(status)

    def detail(self, text):
        self.stdout.write(f'              {text}')

    # ---------- hops ----------

    def handle(self, *args, **o):
        self.summary = []
        self.stdout.write(f'Live-data check  {timezone.localtime():%d.%m.%Y %H:%M:%S}\n')
        messages = self.check_mqtt(o)
        matched = self.check_subscriber(messages) if messages else {}
        db = self.check_db(matched, messages) if matched else {}
        token = self.check_api(o, db)
        self.check_frontend(o, token)
        fails, warns = self.summary.count('FAIL'), self.summary.count('WARN')
        self.stdout.write('')
        if fails:
            self.stdout.write(self.style.ERROR(f'{fails} hop(s) failed: fix the first [FAIL] above, the later ones depend on it.'))
        elif warns:
            self.stdout.write(self.style.WARNING(f'Chain works, {warns} warning(s) to look at.'))
        else:
            self.stdout.write(self.style.SUCCESS('Whole chain works: collector -> MQTT -> bridge -> DB -> API -> frontend.'))

    def check_mqtt(self, o):
        """{machine_node or name: last message} heard on the topic within --wait seconds."""
        hop = 'MQTT'
        heard, connected, refused = {}, threading.Event(), []

        def on_connect(client, userdata, flags, reason_code, properties=None):
            if getattr(reason_code, 'is_failure', False):
                refused.append(str(reason_code))
            else:
                client.subscribe(o['topic'], qos=0)
            connected.set()

        def on_message(client, userdata, msg):
            try:
                m = json.loads(msg.payload)
            except ValueError:
                return
            if isinstance(m, dict):
                heard[m.get('machine_node') or m.get('machine') or '?'] = m

        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f'mpcr-pipeline-check-{int(time.time()) % 100000}')
        if o['mqtt_user']:
            client.username_pw_set(o['mqtt_user'], o['mqtt_password'])
        client.on_connect, client.on_message = on_connect, on_message
        try:
            client.connect(o['host'], o['port'], keepalive=30)
        except OSError as e:
            self.result('FAIL', hop, f'Cannot reach the broker at {o["host"]}:{o["port"]} ({e}). Is Mosquitto running, port open in the firewall?')
            return {}
        client.loop_start()
        try:
            if not connected.wait(10) or refused:
                self.result('FAIL', hop, f'Broker at {o["host"]}:{o["port"]} refused the connection {refused or ""} (MQTT user / password?)')
                return {}
            self.stdout.write(f'Listening on "{o["topic"]}" at {o["host"]}:{o["port"]} for up to {o["wait"]} s ...')
            deadline = time.monotonic() + o['wait']
            while time.monotonic() < deadline:
                time.sleep(1)
                if heard and time.monotonic() > deadline - o['wait'] + 15:  # a few seconds more to hear the other machines
                    break
        finally:
            client.loop_stop()
            client.disconnect()
        if not heard:
            self.result('FAIL', hop, f'Connected, but nothing arrived on "{o["topic"]}". Is the collector running on the FANUC server, with MQTT_HOST = this broker and MQTT_TOPIC = "{o["topic"]}"?')
            return {}
        self.result('PASS', hop, f'{len(heard)} machine(s) publishing')
        for node, m in sorted(heard.items()):
            data = m.get('data') or {}
            age = self.age(m.get('ts'))
            rcv = data.get('RCV_Standard', '-')
            self.detail(f'{node} ({m.get("machine") or "no name"}): {len(data)} values, RCV_Standard={rcv}, sent {age}')
        return heard

    def check_subscriber(self, messages):
        """{MPCR id: message} for the machines MPCR knows."""
        hop = 'Subscriber'
        bridge = Bridge()
        matched, unknown = {}, []
        for node, m in messages.items():
            name, mnode, _, _ = from_collector(m)
            mid = bridge.machine_for(name, mnode)
            (matched.__setitem__(mid, m) if mid else unknown.append(f'{name or "?"} / {mnode or "?"}'))
        if not matched:
            self.result('FAIL', hop, f'No message matches an MPCR machine: {", ".join(unknown)}. Add them to the machine master, or pin them with FANUC_MACHINE_MAP=J1032=J10-32,... in backend/.env')
            return {}
        self.result('WARN' if unknown else 'PASS', hop, f'{len(matched)} machine(s) map to MPCR: ' + ', '.join(f'{m.get("machine")}->{mid}' for mid, m in sorted(matched.items())))
        if unknown:
            self.detail(f'Not in MPCR (ignored by the bridge): {", ".join(unknown)}. Use FANUC_MACHINE_MAP to pin them.')
        return matched

    def check_db(self, matched, messages):
        """Has the running bridge written these machines lately? {MPCR id: Machine}."""
        hop = 'DB'
        rows = {m.id: m for m in Machine.objects.filter(id__in=matched)}
        now = timezone.now()
        fresh, stale = [], []
        for mid in sorted(matched):
            m = rows.get(mid)
            at = m.telemetry_at if m else None
            (fresh if at and (now - at).total_seconds() <= FRESH_SECONDS else stale).append((mid, at))
        engine = settings.DATABASES['default']['ENGINE'].rsplit('.', 1)[-1]
        where = f'{engine} {settings.DATABASES["default"].get("NAME")}'
        if not fresh:
            last = max((at for _, at in stale if at), default=None)
            when = f'last write {timezone.localtime(last):%d.%m %H:%M:%S}' if last else 'never written'
            self.result('FAIL', hop, f'MQTT has data but the bridge is not writing it to {where} ({when})')
            self.detail('Start the subscriber on this server:  python manage.py euromap_bridge --verbose')
            self.detail('It must use this same backend/.env (same DB) and the same broker/topic as above.')
            return {}
        self.result('WARN' if stale else 'PASS', hop, f'{len(fresh)} machine(s) updated by the bridge in the last {FRESH_SECONDS // 60} min ({where})')
        for mid, at in fresh:
            m = rows[mid]
            _, _, sent, _ = from_collector(matched[mid])
            pairs = []
            for k in COMPARE:
                stored = getattr(m, Machine.FIELD_OF.get(k, k))
                if k in sent or stored is not None:
                    mark = '' if k not in sent or sent[k] == stored else f' (MQTT {sent[k]})'
                    pairs.append(f'{k}={stored}{mark}')
            self.detail(f'{mid}: status={m.status}, ' + ', '.join(pairs) + f', written {self.age(at.isoformat())}')
        for mid, at in stale:
            self.detail(f'{mid}: not written lately (last {timezone.localtime(at):%d.%m %H:%M:%S})' if at else f'{mid}: never written')
        self.detail('A value differing from MQTT by one shot is normal (a newer message arrived in between).')
        return {mid: rows[mid] for mid, _ in fresh}

    def check_api(self, o, db):
        hop = 'API'
        base = o['api'].rstrip('/')
        if not o['password']:
            self.result('SKIP', hop, f'No password given: add --user {o["user"]} --password ... (or set MPCR_CHECK_PASSWORD) to check {base}/api/live/')
            return None
        try:
            token = self.login(base, o['user'], o['password'])
            live = self.get_json(f'{base}/api/live/', token)
        except Exception as e:
            self.result('FAIL', hop, f'{base}: {e}. Is the backend running (runserver / waitress / IIS) and is this host in DJANGO_ALLOWED_HOSTS?')
            return None
        by_id = {m['id']: m for m in live.get('machines', [])}
        if not db:
            self.result('PASS', hop, f'{base}/api/live/ answers ({len(by_id)} machines); nothing live to compare yet')
            return token
        wrong, missing = [], []
        for mid, m in db.items():
            row = by_id.get(mid)
            if row is None:
                missing.append(mid)
            elif row.get('cycle') != m.cycle and row.get('cycle') is not None:
                wrong.append(f'{mid}: API cycle {row.get("cycle")} vs DB {m.cycle}')
        if missing:
            self.result('WARN', hop, f'{o["user"]} cannot see {", ".join(missing)} (machine access in User Management?)')
        elif wrong:
            self.result('WARN', hop, 'API differs from DB (may be a newer shot): ' + '; '.join(wrong))
        else:
            self.result('PASS', hop, f'{base}/api/live/ returns the same live values as the DB for ' + ', '.join(sorted(db)))
        return token

    def check_frontend(self, o, token):
        hop = 'Frontend'
        base = o['frontend'].rstrip('/')
        if not base:
            self.result('SKIP', hop, 'Add --frontend http://<address users open> to check the page and its /api forwarding')
            return
        try:
            with urllib.request.urlopen(f'{base}/', timeout=10) as r:
                page = r.read(200_000).decode('utf-8', 'replace')
        except Exception as e:
            self.result('FAIL', hop, f'{base}/ does not load: {e}')
            return
        if 'id="root"' not in page:
            self.result('FAIL', hop, f'{base}/ answers, but it is not the MPCR app (no <div id="root">)')
            return
        if not token:
            self.result('WARN', hop, f'{base}/ serves the app; /api forwarding not checked (no API sign-in)')
            return
        try:
            live = self.get_json(f'{base}/api/live/', token)
        except Exception as e:
            self.result('FAIL', hop, f'The page loads, but {base}/api/ does not reach the backend: {e}. Check the /api proxy (IIS / nginx / vite preview) to {o["api"]}')
            return
        self.result('PASS', hop, f'{base}/ serves the app and {base}/api/live/ reaches the backend ({len(live.get("machines", []))} machines)')

    # ---------- helpers ----------

    def login(self, base, user, password):
        body = json.dumps({'loginId': user, 'password': password}).encode()
        req = urllib.request.Request(f'{base}/api/auth/login/', data=body, headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return json.load(r)['token']
        except urllib.error.HTTPError as e:
            detail = e.read(500).decode('utf-8', 'replace')
            raise RuntimeError(f'sign-in as {user} refused (HTTP {e.code}: {detail})') from None

    def get_json(self, url, token):
        req = urllib.request.Request(url, headers={'Authorization': f'Token {token}', 'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            raise RuntimeError(f'HTTP {e.code} from {url}') from None

    def age(self, iso):
        try:
            at = datetime.fromisoformat(str(iso).replace('Z', '+00:00'))
        except ValueError:
            return 'at unknown time'
        if at.tzinfo is None:
            at = at.replace(tzinfo=dt_timezone.utc)
        seconds = int((datetime.now(dt_timezone.utc) - at).total_seconds())
        return f'{seconds} s ago' if seconds < 120 else f'{seconds // 60} min ago' + (' (old: collector stopped?)' if seconds > FRESH_SECONDS else '')
