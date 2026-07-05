/**
 * Scheduler — renders and installs SOS background jobs on the platform's
 * native scheduler: launchd (macOS), systemd user units (Linux), or cron
 * (fallback). Windows Task Scheduler gets guidance strings in v1.
 *
 * Jobs are defined once; renderers translate them per backend.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CRON_MARKER = '# sos-memory managed';

/**
 * @typedef {object} JobSpec
 * @property {string} id            e.g. "gbrain-sync" -> com.sos.gbrain-sync / sos-gbrain-sync
 * @property {string[]} command     argv to run
 * @property {object} env           extra environment variables
 * @property {{intervalSeconds:number}|{hour:number,minute:number}|{minute:number}} schedule
 * @property {number} [timeoutSeconds]  hard watchdog cap (wrapped in shell on unix)
 * @property {string[]} [onExit]    extra shell commands after the job ends (unix only)
 * @property {{startHour:number,endHour:number,catchUpBeforeHour:number,staleMinutes:number,successFile:string}} [window]
 *   Only run inside [startHour, endHour); outside it, run only if successFile
 *   is older than staleMinutes AND current hour < catchUpBeforeHour. Guards
 *   heavy nightly jobs against wake-firing: launchd/systemd run missed
 *   calendar jobs when a laptop wakes, which otherwise loads large models
 *   mid-workday.
 */

/** Shell prefix that enforces a job's run window (exit 0 = skipped). */
function windowGuardPrefix(job) {
  if (!job.window) return '';
  const { startHour, endHour, catchUpBeforeHour, staleMinutes, successFile } = job.window;
  return (
    `H=$(date +%H); S="${successFile}"; ` +
    `RECENT=$(find "$S" -mmin -${staleMinutes} 2>/dev/null); ` +
    `if [ "$H" -ge ${startHour} ] && [ "$H" -lt ${endHour} ]; then :; ` +
    `elif [ -z "$RECENT" ] && [ "$H" -lt ${catchUpBeforeHour} ]; then echo "[window] ${job.id} catch-up run"; ` +
    `else echo "[window] ${job.id} skipped: outside ${startHour}-${endHour} window"; exit 0; fi; `
  );
}

/** Wrap a command in window-guard + watchdog shell enforcing timeoutSeconds + onExit cleanup. */
function watchdogShellLine(job) {
  const quoted = job.command.map((part) => `'${part.replace(/'/g, "'\\''")}'`).join(' ');
  const cleanup = (job.onExit || []).map((cmd) => `${cmd} 2>/dev/null;`).join(' ');
  const guard = windowGuardPrefix(job);
  const touchSuccess = job.window ? `[ $RC -eq 0 ] && touch "${job.window.successFile}"; ` : '';
  if (!job.timeoutSeconds && !guard) {
    return cleanup ? `${quoted}; ${cleanup} true` : quoted;
  }
  if (!job.timeoutSeconds) {
    return `${guard}${quoted}; RC=$?; ${touchSuccess}${cleanup} true`;
  }
  return (
    `${guard}${quoted} & P=$!; (sleep ${job.timeoutSeconds} && kill $P 2>/dev/null ` +
    `&& echo "[watchdog] ${job.id} killed after cap") & W=$!; ` +
    `wait $P; RC=$?; kill $W 2>/dev/null; ${touchSuccess}${cleanup} true`
  );
}

function launchdLabel(jobId) {
  return `com.sos.${jobId}`;
}

function renderLaunchdPlist(job, logDir) {
  const needsShell = Boolean(job.timeoutSeconds || job.window || (job.onExit && job.onExit.length));
  const programArguments = needsShell
    ? ['/bin/bash', '-c', watchdogShellLine(job)]
    : job.command;
  const envEntries = Object.entries(job.env || {})
    .map(([key, value]) => `    <key>${key}</key>\n    <string>${value}</string>`)
    .join('\n');
  const schedule = 'intervalSeconds' in job.schedule
    ? `  <key>StartInterval</key>\n  <integer>${job.schedule.intervalSeconds}</integer>`
    : `  <key>StartCalendarInterval</key>\n  <dict>\n` +
      ('hour' in job.schedule ? `    <key>Hour</key>\n    <integer>${job.schedule.hour}</integer>\n` : '') +
      `    <key>Minute</key>\n    <integer>${job.schedule.minute}</integer>\n  </dict>`;
  const logPath = path.join(logDir, `${job.id}.launchd.log`);
  const args = programArguments
    .map((arg) => `    <string>${arg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</string>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${launchdLabel(job.id)}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${envEntries}
  </dict>
${schedule}
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${logPath}</string>
</dict>
</plist>
`;
}

function renderSystemdUnit(job) {
  const envLines = Object.entries(job.env || {})
    .map(([key, value]) => `Environment=${key}=${value}`)
    .join('\n');
  const needsShell = Boolean(job.timeoutSeconds || job.window || (job.onExit && job.onExit.length));
  const execStart = needsShell
    ? `/bin/bash -c "${watchdogShellLine(job).replace(/"/g, '\\"')}"`
    : job.command.join(' ');

  const service = `[Unit]
Description=SOS ${job.id}

[Service]
Type=oneshot
${envLines}
ExecStart=${execStart}
`;

  const onCalendar = 'intervalSeconds' in job.schedule
    ? null
    : 'hour' in job.schedule
      ? `*-*-* ${String(job.schedule.hour).padStart(2, '0')}:${String(job.schedule.minute).padStart(2, '0')}:00`
      : `*-*-* *:${String(job.schedule.minute).padStart(2, '0')}:00`;
  const timerSpec = onCalendar
    ? `OnCalendar=${onCalendar}\nPersistent=true`
    : `OnUnitActiveSec=${job.schedule.intervalSeconds}s\nOnBootSec=120s`;

  const timer = `[Unit]
Description=SOS ${job.id} timer

[Timer]
${timerSpec}

[Install]
WantedBy=timers.target
`;

  return { service, timer };
}

function renderCronLine(job) {
  const shellLine = watchdogShellLine(job);
  const env = Object.entries(job.env || {})
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  const cronTime = 'intervalSeconds' in job.schedule
    ? `*/${Math.max(1, Math.round(job.schedule.intervalSeconds / 60))} * * * *`
    : 'hour' in job.schedule
      ? `${job.schedule.minute} ${job.schedule.hour} * * *`
      : `${job.schedule.minute} * * * *`;
  return `${cronTime} ${env} /bin/bash -c '${shellLine.replace(/'/g, "'\\''")}' ${CRON_MARKER}:${job.id}`;
}

function renderTaskSchedulerGuidance(job) {
  const time = 'intervalSeconds' in job.schedule
    ? `/sc minute /mo ${Math.max(1, Math.round(job.schedule.intervalSeconds / 60))}`
    : `/sc daily /st ${String(job.schedule.hour || 0).padStart(2, '0')}:${String(job.schedule.minute).padStart(2, '0')}`;
  return `schtasks /create /tn "SOS\\${job.id}" ${time} /tr "${job.command.join(' ')}"`;
}

function installLaunchd(job, { logDir, dryRun }) {
  const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${launchdLabel(job.id)}.plist`);
  const content = renderLaunchdPlist(job, logDir);
  if (dryRun) return { plistPath, content, installed: false };
  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(plistPath, content);
  const uid = process.getuid();
  spawnSync('launchctl', ['bootout', `gui/${uid}`, plistPath], { encoding: 'utf8' });
  const boot = spawnSync('launchctl', ['bootstrap', `gui/${uid}`, plistPath], { encoding: 'utf8' });
  return { plistPath, installed: boot.status === 0, error: boot.status === 0 ? null : boot.stderr.trim() };
}

function installSystemd(job, { dryRun }) {
  const unitDir = path.join(os.homedir(), '.config', 'systemd', 'user');
  const { service, timer } = renderSystemdUnit(job);
  const servicePath = path.join(unitDir, `sos-${job.id}.service`);
  const timerPath = path.join(unitDir, `sos-${job.id}.timer`);
  if (dryRun) return { servicePath, timerPath, service, timer, installed: false };
  fs.mkdirSync(unitDir, { recursive: true });
  fs.writeFileSync(servicePath, service);
  fs.writeFileSync(timerPath, timer);
  spawnSync('systemctl', ['--user', 'daemon-reload'], { encoding: 'utf8' });
  const enable = spawnSync('systemctl', ['--user', 'enable', '--now', `sos-${job.id}.timer`], { encoding: 'utf8' });
  return { servicePath, timerPath, installed: enable.status === 0, error: enable.status === 0 ? null : enable.stderr.trim() };
}

function installCron(jobs, { dryRun }) {
  const current = spawnSync('crontab', ['-l'], { encoding: 'utf8' });
  const existing = current.status === 0 ? current.stdout : '';
  const kept = existing
    .split('\n')
    .filter((line) => !line.includes(CRON_MARKER))
    .join('\n')
    .trimEnd();
  const lines = jobs.map(renderCronLine);
  const next = `${kept}\n${lines.join('\n')}\n`;
  if (dryRun) return { crontab: next, installed: false };
  const write = spawnSync('crontab', ['-'], { input: next, encoding: 'utf8' });
  return { crontab: next, installed: write.status === 0, error: write.status === 0 ? null : write.stderr.trim() };
}

/**
 * Install jobs on the detected scheduler backend.
 * Windows: returns guidance strings only (no auto-install in v1).
 */
function installJobs(jobs, { scheduler, logDir, dryRun = false }) {
  if (scheduler === 'launchd') {
    return { scheduler, results: jobs.map((job) => installLaunchd(job, { logDir, dryRun })) };
  }
  if (scheduler === 'systemd') {
    return { scheduler, results: jobs.map((job) => installSystemd(job, { dryRun })) };
  }
  if (scheduler === 'cron') {
    return { scheduler, results: [installCron(jobs, { dryRun })] };
  }
  if (scheduler === 'task-scheduler') {
    return { scheduler, guidance: jobs.map(renderTaskSchedulerGuidance), results: [] };
  }
  return { scheduler: 'none', results: [], guidance: ['No scheduler available; run hooks manually or install cron.'] };
}

module.exports = {
  CRON_MARKER,
  installJobs,
  renderCronLine,
  renderLaunchdPlist,
  renderSystemdUnit,
  renderTaskSchedulerGuidance,
  watchdogShellLine,
  windowGuardPrefix
};
