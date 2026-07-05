const test = require('node:test');
const assert = require('node:assert');

const { detectPlatform, detectScheduler, suggestModels } = require('../src/platform');
const {
  renderCronLine,
  renderLaunchdPlist,
  renderSystemdUnit,
  watchdogShellLine
} = require('../src/scheduler');
const { defaultConfig, validateConfig } = require('../src/config');
const { databaseNameFrom } = require('../src/provision');
const { doctorChecks, jobSpecs } = require('../src/gbrain');

const intervalJob = {
  id: 'gbrain-sync',
  command: ['/usr/bin/node', '/tmp/hooks/gbrain-sync.js'],
  env: { OPENROUTER_API_KEY: 'ollama' },
  schedule: { intervalSeconds: 3600 }
};

const dreamJob = {
  id: 'gbrain-dream',
  command: ['/tmp/bin/gbrain', 'dream'],
  env: {},
  schedule: { hour: 3, minute: 30 },
  timeoutSeconds: 7200,
  window: {
    startHour: 2,
    endHour: 7,
    catchUpBeforeHour: 9,
    staleMinutes: 4320,
    successFile: '/tmp/logs/dream-last-success'
  },
  onExit: ['/tmp/bin/ollama stop qwen3:4b']
};

test('detectPlatform reports a known scheduler and sane RAM', () => {
  const info = detectPlatform();
  assert.ok(['launchd', 'systemd', 'cron', 'task-scheduler', 'none'].includes(info.scheduler));
  assert.ok(info.totalRamGb > 0);
  assert.ok(['macos', 'linux', 'windows'].includes(info.os));
});

test('detectScheduler maps platforms', () => {
  assert.strictEqual(detectScheduler('darwin'), 'launchd');
  assert.strictEqual(detectScheduler('win32'), 'task-scheduler');
});

test('suggestModels sizes by RAM and refuses tiny machines', () => {
  assert.strictEqual(suggestModels(64).think, 'qwen3:14b');
  assert.strictEqual(suggestModels(16).think, 'qwen3:4b');
  assert.strictEqual(suggestModels(8).think, null);
});

test('launchd plist renders interval schedule and env', () => {
  const plist = renderLaunchdPlist(intervalJob, '/tmp/logs');
  assert.match(plist, /com\.sos\.gbrain-sync/);
  assert.match(plist, /StartInterval/);
  assert.match(plist, /OPENROUTER_API_KEY/);
});

test('launchd plist wraps watchdog jobs in bash with cap and cleanup', () => {
  const plist = renderLaunchdPlist(dreamJob, '/tmp/logs');
  assert.match(plist, /\/bin\/bash/);
  assert.match(plist, /sleep 7200/);
  assert.match(plist, /ollama stop qwen3:4b/);
  assert.match(plist, /StartCalendarInterval/);
});

test('systemd timer renders OnCalendar for calendar schedules', () => {
  const { service, timer } = renderSystemdUnit(dreamJob);
  assert.match(timer, /OnCalendar=\*-\*-\* 03:30:00/);
  assert.match(service, /ExecStart=\/bin\/bash/);
});

test('cron line renders interval as minutes with marker', () => {
  const line = renderCronLine(intervalJob);
  assert.match(line, /^\*\/60 \* \* \* \*/);
  assert.match(line, /# sos-memory managed:gbrain-sync/);
});

test('watchdog shell line without timeout is plain command', () => {
  const line = watchdogShellLine(intervalJob);
  assert.match(line, /gbrain-sync\.js/);
  assert.ok(!line.includes('sleep'));
});

test('window guard skips outside hours, allows catch-up, records success', () => {
  const line = watchdogShellLine(dreamJob);
  assert.match(line, /-ge 2/);
  assert.match(line, /-lt 7/);
  assert.match(line, /-lt 9/);
  assert.match(line, /-mmin -4320/);
  assert.match(line, /exit 0/);
  assert.match(line, /\[ \$RC -eq 0 \] && touch "\/tmp\/logs\/dream-last-success"/);
});

test('jobs without window have no guard', () => {
  const { windowGuardPrefix } = require('../src/scheduler');
  assert.strictEqual(windowGuardPrefix(intervalJob), '');
});

test('default config validates and follows platform RAM', () => {
  const config = defaultConfig({ totalRamGb: 64, os: 'macos', headless: false });
  assert.deepStrictEqual(validateConfig(config), []);
  assert.strictEqual(config.gbrain.thinkModel, 'qwen3:14b');
  assert.strictEqual(config.profile, 'laptop');
});

test('headless linux defaults to vps profile', () => {
  const config = defaultConfig({ totalRamGb: 16, os: 'linux', headless: true });
  assert.strictEqual(config.profile, 'vps');
});

test('databaseNameFrom parses postgres urls', () => {
  assert.strictEqual(databaseNameFrom('postgres://ss@localhost:5432/gbrain'), 'gbrain');
});

test('gbrain doctor flags missing file-plane base url and pglite engine', () => {
  const checks = doctorChecks({
    gbrain: { found: true, path: '/x/gbrain', config: { database_path: '/home/u/.gbrain/brain.pglite' } },
    ollama: { found: true, running: true, models: ['qwen3:4b'] },
    postgres: null,
    requiredModels: ['qwen3:4b', 'qwen3:14b']
  });
  const byId = Object.fromEntries(checks.map((check) => [check.id, check]));
  assert.strictEqual(byId.gbrain_file_plane_base_url.ok, false);
  assert.strictEqual(byId.gbrain_engine_multiwriter.ok, false);
  assert.strictEqual(byId['ollama_model_qwen3_4b'].ok, true);
  assert.strictEqual(byId['ollama_model_qwen3_14b'].ok, false);
});

test('jobSpecs includes dream watchdog and distiller schedule', () => {
  const jobs = jobSpecs({
    nodeBin: '/usr/bin/node',
    gbrainBin: '/x/gbrain',
    ollamaBin: '/x/ollama',
    hooksDir: '/tmp/hooks',
    cycleModel: 'qwen3:4b',
    thinkModel: 'qwen3:14b'
  });
  const dream = jobs.find((job) => job.id === 'gbrain-dream');
  assert.ok(dream.timeoutSeconds >= 3600);
  assert.strictEqual(dream.onExit.length, 2);
  assert.strictEqual(dream.window.startHour, 2);
  assert.ok(dream.window.successFile.endsWith('dream-last-success'));
  const distiller = jobs.find((job) => job.id === 'transcript-distiller');
  assert.deepStrictEqual(distiller.schedule, { minute: 45 });
  const sync = jobs.find((job) => job.id === 'gbrain-sync');
  assert.strictEqual(sync.env.OPENROUTER_API_KEY, 'ollama');
});
