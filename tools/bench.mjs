// Measures Genesis on one Android device: CPU and memory of the app and its renderer
// processes, and the time from launch to an applet's first data. Prints one JSON line.
//
// Scenarios:
//   idle     samples for --seconds while nobody touches the device.
//   journey  samples for --seconds while the operator, or another script, drives the device.
//            Start the journey right after the script prints "sampling".
//   cold     force-stops Genesis, opens the applet with the intent its home-screen shortcut uses
//            (a debug build, whose entry activity is exported),
//            and waits (up to --seconds) for the shell's first page.emit to the applet's screens.
//            Needs `adb -s <serial> shell setprop debug.genesis.perf.trace 1` before it runs.
//
// CPU is the utime and stime of every thread (/proc/<pid>/task/*/stat) over the window, in ms
// of CPU per second. PSS is TOTAL PSS from `dumpsys meminfo <pid>` at the end. Renderers are the
// app's own child processes (`<package>:*`, such as WebView's sandboxed_process or GeckoView's
// tab) and WebView's sandboxed processes (`com.google.android.webview:sandboxed_process*`).
// Close other apps that use WebView first, or their renderers count too. The script clears the
// device log at start and reports the GenesisPerf lines written during the window.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const usage = 'Usage: node tools/bench.mjs --device <serial> --applet <id> --scenario idle|cold|journey --seconds <n> [--label <text>] [--package <name>]';
const SCENARIOS = ['idle', 'cold', 'journey'];
const ENTRY_ACTIVITY = 'app.nirvana.genesis.AppletEntryActivity';
const OPEN_APPLET = 'app.nirvana.genesis.OPEN_APPLET';
const FIRST_EMIT = /firstEmit (\S+)/;
const TRACE_EVENTS_MAX = 500;

function fail(message) {
  console.error(message);
  console.error(usage);
  process.exit(1);
}

function parse(argv) {
  if (argv.length === 0) fail('No arguments.');
  const options = { package: 'app.nirvana.genesis', label: '' };
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i]?.replace(/^--/, '');
    const value = argv[i + 1];
    if (!argv[i]?.startsWith('--') || !['device', 'applet', 'scenario', 'seconds', 'label', 'package'].includes(name)) fail(`Unknown option ${argv[i]}.`);
    if (value === undefined) fail(`--${name} needs a value.`);
    options[name] = value;
  }
  if (!options.device) fail('--device is required: the bench never picks a device on its own.');
  if (!options.applet) fail('--applet is required.');
  if (!SCENARIOS.includes(options.scenario)) fail('--scenario must be idle, cold or journey.');
  options.seconds = Number(options.seconds ?? (options.scenario === 'cold' ? 30 : 10));
  if (!Number.isFinite(options.seconds) || options.seconds <= 0) fail('--seconds must be a positive number.');
  return options;
}

function adbPath() {
  const home = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const candidates = [home && path.join(home, 'platform-tools', 'adb'), path.join(os.homedir(), 'Library', 'Android', 'sdk', 'platform-tools', 'adb')];
  return candidates.find(candidate => candidate && existsSync(candidate)) ?? 'adb';
}

const options = parse(process.argv.slice(2));
const ADB = adbPath();

function shell(command) {
  return execFileSync(ADB, ['-s', options.device, 'shell', command], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** The app's pid and its renderers' pids, by process name. */
function processes() {
  const rows = shell('ps -A -o PID,NAME').trim().split('\n').slice(1).map(line => line.trim().split(/\s+/));
  let app = null;
  const renderers = [];
  for (const [pid, name] of rows) {
    if (name === options.package) app = Number(pid);
    else if (name?.startsWith(`${options.package}:`) || /webview.*:sandboxed_process/.test(name ?? '')) renderers.push({ pid: Number(pid), name });
  }
  return { app, renderers };
}

/** CPU ticks per pid, and the device uptime in seconds, from one shell call. */
function sample(pids) {
  const script = `cat /proc/uptime; for p in ${pids.join(' ')}; do echo "#$p"; cat /proc/$p/task/*/stat 2>/dev/null; done`;
  const lines = shell(script).split('\n');
  const uptime = Number(lines[0].split(/\s+/)[0]);
  const ticks = new Map();
  let pid = null;
  for (const line of lines.slice(1)) {
    if (line.startsWith('#')) { pid = Number(line.slice(1)); ticks.set(pid, 0); continue; }
    const fields = line.slice(line.lastIndexOf(')') + 2).split(' ');
    // After the command name: state is field 3, utime field 14 and stime field 15.
    if (pid !== null && fields.length > 13) ticks.set(pid, ticks.get(pid) + Number(fields[11]) + Number(fields[12]));
  }
  return { uptime, ticks };
}

function pss(pid) {
  const text = shell(`dumpsys meminfo ${pid}`);
  const match = text.match(/TOTAL PSS:\s+(\d+)/) ?? text.match(/^\s*TOTAL\s+(\d+)/m);
  return match ? Number(match[1]) : null;
}

/** GenesisPerf lines of the device log, with their epoch milliseconds. */
function traceLines() {
  return shell('logcat -d -v epoch -s GenesisPerf:I GenesisBench:I').split('\n').flatMap(line => {
    const match = line.match(/^\s*(\d+)\.(\d{3})\s+\d+\s+\d+\s+\w\s+(\S+)\s*:\s?(.*)$/);
    return match ? [{ t: Number(match[1]) * 1000 + Number(match[2]), tag: match[3], message: match[4] }] : [];
  });
}

function launchApplet() {
  // The entry activity is exported in debug builds only, so a release build refuses this start.
  const intent = `am start -a ${OPEN_APPLET} -d genesis-applet:${options.applet} -n ${options.package}/${ENTRY_ACTIVITY}`;
  let output;
  try {
    output = shell(`log -t GenesisBench launch; ${intent} 2>&1`);
  } catch (error) {
    output = `${error.stdout ?? ''}${error.stderr ?? ''}` || error.message;
  }
  if (/Error|Permission Denial|Exception/.test(output)) throw new Error(`Could not open ${options.applet} (a debug build is needed): ${output.trim().split('\n').slice(0, 3).join(' ')}`);
}

async function main() {
  const tick = Number(shell('getconf CLK_TCK').trim()) || 100;
  shell('logcat -c');
  let coldMs = null;
  let start;
  let found;
  if (options.scenario === 'cold') {
    if (shell('getprop debug.genesis.perf.trace').trim() !== '1') throw new Error('cold needs: adb -s <serial> shell setprop debug.genesis.perf.trace 1');
    shell(`am force-stop ${options.package}`);
    shell('logcat -c');
    launchApplet();
    const deadline = Date.now() + options.seconds * 1000;
    let launch = null;
    while (Date.now() < deadline) {
      await sleep(250);
      const lines = traceLines();
      launch ??= lines.find(line => line.tag === 'GenesisBench')?.t ?? null;
      const emit = lines.find(line => FIRST_EMIT.exec(line.message)?.[1] === options.applet);
      if (launch !== null && emit) { coldMs = emit.t - launch; break; }
    }
    if (coldMs === null) console.error(`No first page.emit for ${options.applet} within ${options.seconds} s.`);
    found = processes();
    if (!found.app) throw new Error(`${options.package} is not running.`);
    // Fresh processes start at zero CPU, so the window runs from the launch to this mark.
    shell('log -t GenesisBench end');
    const end = traceLines().findLast(line => line.tag === 'GenesisBench' && line.message === 'end')?.t;
    start = { window: launch !== null && end ? (end - launch) / 1000 : null, ticks: new Map() };
  } else {
    found = processes();
    if (!found.app) throw new Error(`${options.package} is not running. Open the applet first.`);
    start = sample([found.app, ...found.renderers.map(r => r.pid)]);
    console.error('sampling');
    await sleep(options.seconds * 1000);
    // A renderer that started during the window counts from zero.
    found = processes();
  }
  const end = sample([found.app, ...found.renderers.map(r => r.pid)]);
  const window = Math.max(start.window ?? end.uptime - start.uptime, 0.001);
  const cpu = pid => Math.round(((end.ticks.get(pid) ?? 0) - (start.ticks.get(pid) ?? 0)) * 1000 / tick / window * 10) / 10;
  const trace = traceLines().filter(line => line.tag === 'GenesisPerf');
  const result = {
    label: options.label,
    applet: options.applet,
    scenario: options.scenario,
    seconds: Math.round(window * 1000) / 1000,
    ...(options.scenario === 'cold' ? { coldMs } : {}),
    cpuMsPerSec: { app: cpu(found.app), renderers: found.renderers.map(r => ({ pid: r.pid, name: r.name, ms: cpu(r.pid) })) },
    pssKb: { app: pss(found.app), renderers: found.renderers.map(r => ({ pid: r.pid, name: r.name, kb: pss(r.pid) })) },
    traceEvents: trace.slice(-TRACE_EVENTS_MAX).map(line => ({ t: line.t, message: line.message })),
  };
  console.log(JSON.stringify(result));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
