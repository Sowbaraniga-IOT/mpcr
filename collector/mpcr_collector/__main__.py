"""MPCR EUROMAP 77 Collector.

    python -m mpcr_collector                 # run: OPC UA → MQTT (settings in collector.env)
    python -m mpcr_collector --dry-run       # print the messages instead of publishing them
    python -m mpcr_collector --probe 1-5     # read machines 1 … 5 once and print a table, then exit
    python -m mpcr_collector --env other.env --machines 1-30
"""
import argparse
import asyncio
import logging
import sys

from . import NAME, VERSION, config
from .opcua_source import Session, groups, probe
from .publisher import ConsolePublisher, MqttPublisher

log = logging.getLogger('mpcr_collector')


async def report(stats, publisher, sessions, every=60):
    while True:
        await asyncio.sleep(every)
        live = sum(1 for s in sessions for st in s.state.values() if st['name'])
        log.info('%s/%s sessions connected · %s machines live · %s messages published · %s cycle events', stats['sessions'], len(sessions), live, publisher.sent, stats['events'])


async def run(cfg, dry_run):
    publisher = ConsolePublisher() if dry_run else MqttPublisher(cfg)
    publisher.start()
    stats = {'events': 0, 'sessions': 0}
    nodes = [cfg.node_name(n) for n in cfg.machines]
    sessions = [Session(i, g, cfg, publisher.publish, stats) for i, g in enumerate(groups(nodes, cfg.machines_per_session), start=1)]
    log.info('%s %s: %s machines in %s session(s) of up to %s', NAME, VERSION, len(nodes), len(sessions), cfg.machines_per_session)
    try:
        await asyncio.gather(report(stats, publisher, sessions), *(s.run() for s in sessions))
    finally:
        publisher.stop()


def main(argv=None):
    p = argparse.ArgumentParser(prog='mpcr_collector', description=f'{NAME} {VERSION}: FANUC ROBOSHOT OPC UA (EUROMAP 77) → MQTT')
    p.add_argument('--env', help='settings file (default: collector.env in the collector folder)')
    p.add_argument('--machines', help='machine numbers to collect, e.g. 1-131 or 1-10,15 (overrides OPCUA_MACHINES)')
    p.add_argument('--dry-run', action='store_true', help='print messages instead of publishing to MQTT')
    p.add_argument('--probe', metavar='MACHINES', help='read these machines once, print a table and exit, e.g. 1-5')
    p.add_argument('--log-file', metavar='PATH', help='also log to this file, a new file each midnight, 14 days kept')
    p.add_argument('--no-console', action='store_true', help='log only to --log-file (for the background service)')
    p.add_argument('-v', '--verbose', action='store_true')
    args = p.parse_args(argv)

    handlers = [] if args.no_console and args.log_file else [logging.StreamHandler()]
    if args.log_file:
        from logging.handlers import TimedRotatingFileHandler
        from pathlib import Path

        Path(args.log_file).parent.mkdir(parents=True, exist_ok=True)
        handlers.append(TimedRotatingFileHandler(args.log_file, when='midnight', backupCount=14, encoding='utf-8'))
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format='%(asctime)s %(levelname)-7s %(name)s: %(message)s', handlers=handlers)
    if not args.verbose:
        logging.getLogger('asyncua').setLevel(logging.WARNING)
    cfg, env_file = config.load(args.env)
    if args.machines:
        cfg.machines = config.machine_numbers(args.machines)
    log.info('Settings from %s', env_file)
    if cfg.security.lower() != 'none':
        import os

        for f in (cfg.cert, cfg.key):
            if not os.path.isfile(f):
                log.error('Client certificate file not found: %s (set OPCUA_CERT / OPCUA_KEY)', f)
                return 2
    if sys.platform.startswith('win'):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    try:
        if args.probe:
            asyncio.run(probe(cfg, [cfg.node_name(n) for n in config.machine_numbers(args.probe)]))
        else:
            asyncio.run(run(cfg, args.dry_run))
    except KeyboardInterrupt:
        log.info('Stopped')
    return 0


if __name__ == '__main__':
    sys.exit(main())
