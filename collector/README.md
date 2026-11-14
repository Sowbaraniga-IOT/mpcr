# MPCR EUROMAP 77 Collector

Reads the FANUC ROBOSHOT machines from the plant's EUROMAP 77 OPC UA gateway and publishes them on MQTT for MPCR (`manage.py euromap_bridge`).

```
FANUC gateway  ──OPC UA (Basic256Sha256)──▶  MPCR EUROMAP 77 Collector  ──MQTT──▶  broker  ──▶  MPCR euromap_bridge  ──▶  dashboard
opc.tcp://10.245.251.10:62553                 (this folder)                  mpcr/euromap77/raw
```

It addresses machines the same way as the plant's existing collector: string NodeIds in namespace 6, such as `ns=6;s=IMM_FANUC_ROBOSHOT0005.Jobs.ActiveJobValues.LastCycleTime`. It uses the same client certificate and login, and its messages have the same shape (`{machine_node, machine, ts, data}`). On top of that, it subscribes to the per-shot **ROBOSHOTCycleParametersEvent**, which carries cushion, injection time, dosing (recovery) time, peak pressure, V-P position, barrel and mould temperatures, and the dryer and mould-water temperatures.

## Set up (once, on the PC that can reach the gateway)

```powershell
cd mpcr-login\collector
py -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
copy collector.env.example collector.env      # then fill in OPCUA_PASSWORD
mkdir certs
copy "<plant collector folder>\rconnect_cert.der" certs\
copy "<plant collector folder>\rconnect_key.pem"  certs\
```

`collector.env`, `certs\` and the key never go into git (see `.gitignore`).

## Check, then run

```powershell
.venv\Scripts\python -m mpcr_collector --probe 1-10    # read machines 1 … 10 once and print a table
.venv\Scripts\python -m mpcr_collector --dry-run       # collect, print the messages instead of publishing
.venv\Scripts\python -m mpcr_collector                 # collect and publish (or double-click start-collector.cmd)
```

`--probe` shows each machine's name, mode, last cycle time, tool and job counter, and whether the server has the cycle event type. Every minute the running collector logs how many sessions are connected, how many machines are live, and how many messages and cycle events it has handled. Its online state is published retained on `mpcr/euromap77/raw/collector`.

Then point MPCR at it (`backend/.env`): `FANUC_MQTT_HOST=<this PC>` and `FANUC_MQTT_TOPIC=mpcr/euromap77/raw`, and start `manage.py euromap_bridge`.

## Settings (`collector.env`)

| Setting | Meaning |
| --- | --- |
| `OPCUA_URL`, `OPCUA_USER`, `OPCUA_PASSWORD` | The gateway and its EUROMAP 77 login |
| `OPCUA_SECURITY`, `OPCUA_CERT`, `OPCUA_KEY`, `OPCUA_APP_URI` | Basic256Sha256 Sign & Encrypt with the trusted client certificate; the URI must match the certificate |
| `OPCUA_MACHINES`, `OPCUA_MACHINES_EXCLUDE` | Machine numbers (`1-131`, minus the excluded ones), as in the plant collector |
| `OPCUA_MACHINES_PER_SESSION` | Machines per OPC UA session (30) |
| `OPCUA_CYCLE_EVENTS`, `OPCUA_BARREL_ZONES`, `OPCUA_MOULD_ZONES` | Per-shot cycle event on or off, and how many temperature zones to take from it |
| `MQTT_HOST`, `MQTT_PORT`, `MQTT_TOPIC` | Where to publish. The default is its own topic, so the other software reading `factory/euromap77/raw` is not affected |
| `COLLECTOR_PUBLISH_MS`, `COLLECTOR_KEEPALIVE_SECONDS` | At most one message per machine per second, and every live machine at least once a minute |

Every setting can also be given as an environment variable of the same name.

## Behaviour

- A machine is live while its `MachineConfiguration.UserMachineName` is not empty. Machines without a name are not published.
- Each session reconnects by itself: after an error (20 s pause), when a health read of the server clock fails, and every `OPCUA_RECONNECT_HOURS` (2 h) as a planned refresh.
- If the MQTT broker is away, up to `MQTT_QUEUE` messages are kept and sent when it is back.
- The gateway limits OPC UA sessions. With 117 machines this collector opens 4. Don't run it next to a second copy of itself, and check the gateway's session limit before running it alongside the plant collector.

## Test without the plant

```powershell
.venv\Scripts\python tools\sim_gateway.py      # a stand-in gateway on opc.tcp://127.0.0.1:4841
# second window:
$env:OPCUA_URL="opc.tcp://127.0.0.1:4841"; $env:OPCUA_SECURITY="None"; $env:OPCUA_USER=""
.venv\Scripts\python -m mpcr_collector --machines 1-3 --dry-run
.venv\Scripts\python -m unittest discover tests
```

The simulator has two running machines and one inactive machine, plus a cycle event with `CycleTime`. Its other event fields (cushion and so on) are not simulated, so check those on the real gateway with `--dry-run`.
