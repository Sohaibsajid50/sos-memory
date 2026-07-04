/**
 * Platform detection — the single place SOS asks "what machine am I on?".
 * Drives scheduler backend choice, install guidance, and model sizing.
 */

const os = require('os');
const fs = require('fs');
const { spawnSync } = require('child_process');

const GIB = 1024 ** 3;

function commandSucceeds(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return result.status === 0;
}

/**
 * @returns {'launchd'|'systemd'|'cron'|'task-scheduler'|'none'}
 * Preferred scheduler backend for background jobs on this machine.
 */
function detectScheduler(platform = process.platform) {
  if (platform === 'darwin') return 'launchd';
  if (platform === 'win32') return 'task-scheduler';
  if (platform === 'linux') {
    // systemd user units need a running user manager, not just systemctl on PATH.
    if (commandSucceeds('systemctl', ['--user', 'show-environment'])) return 'systemd';
    if (commandSucceeds('crontab', ['-l']) || commandSucceeds('which', ['crontab'])) return 'cron';
  }
  return 'none';
}

/** @returns {'brew'|'apt'|'dnf'|'pacman'|'winget'|'none'} */
function detectPackageManager(platform = process.platform) {
  const candidates = platform === 'darwin'
    ? ['brew']
    : platform === 'win32'
      ? ['winget']
      : ['apt-get', 'dnf', 'pacman', 'brew'];
  for (const candidate of candidates) {
    if (commandSucceeds('which', [candidate]) || commandSucceeds('where', [candidate])) {
      return candidate === 'apt-get' ? 'apt' : candidate;
    }
  }
  return 'none';
}

function isHeadlessServer() {
  if (process.platform === 'darwin' || process.platform === 'win32') return false;
  return !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;
}

/**
 * Suggest local chat models by available RAM. Interactive synthesis (think)
 * gets the largest model that fits comfortably; background/cycle work always
 * gets a small fast model so scheduled jobs never pin large models in RAM.
 */
function suggestModels(totalRamGb) {
  if (totalRamGb >= 48) return { think: 'qwen3:14b', cycle: 'qwen3:4b' };
  if (totalRamGb >= 24) return { think: 'qwen3:8b', cycle: 'qwen3:4b' };
  if (totalRamGb >= 12) return { think: 'qwen3:4b', cycle: 'qwen3:4b' };
  return { think: null, cycle: null, note: 'Under 12GB RAM: use an API provider for synthesis.' };
}

function detectPlatform(env = process.env) {
  const platform = process.platform;
  const totalRamGb = Math.round(os.totalmem() / GIB);
  return {
    platform,
    os: platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : 'linux',
    arch: process.arch,
    totalRamGb,
    cpuCount: os.cpus().length,
    scheduler: detectScheduler(platform),
    packageManager: detectPackageManager(platform),
    headless: isHeadlessServer(),
    isWsl: platform === 'linux' && fs.existsSync('/proc/version') &&
      /microsoft/i.test(fs.readFileSync('/proc/version', 'utf8')),
    homeDir: env.HOME || env.USERPROFILE || os.homedir(),
    suggestedModels: suggestModels(totalRamGb)
  };
}

module.exports = {
  detectPackageManager,
  detectPlatform,
  detectScheduler,
  suggestModels
};
