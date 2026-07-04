/**
 * SOS answers file — ~/.sos/sos.config.json. Produced by the setup interview
 * (or by hand), consumed by `sos apply`. One file drives every generated
 * artifact, so re-running apply is idempotent.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { suggestModels } = require('./platform');

const SOS_HOME = process.env.SOS_HOME || path.join(os.homedir(), '.sos');
const CONFIG_PATH = path.join(SOS_HOME, 'sos.config.json');

function defaultConfig(platformInfo) {
  const models = suggestModels(platformInfo.totalRamGb);
  return {
    version: 1,
    profile: platformInfo.os === 'linux' && platformInfo.headless ? 'vps' : 'laptop',
    retrieval: {
      qmd: true,
      gbrain: true
    },
    gbrain: {
      databaseUrl: 'postgres://localhost:5432/gbrain',
      embeddingModel: 'ollama:nomic-embed-text',
      thinkModel: models.think,
      cycleModel: models.cycle
    },
    distiller: {
      enabled: true
    },
    agents: {
      claude: true,
      codex: true,
      gemini: false
    }
  };
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (_) {
    return null;
  }
}

function saveConfig(config) {
  fs.mkdirSync(SOS_HOME, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
  return CONFIG_PATH;
}

function validateConfig(config) {
  const errors = [];
  if (!config || config.version !== 1) errors.push('config.version must be 1');
  if (config && !['laptop', 'vps'].includes(config.profile)) {
    errors.push(`unknown profile: ${config.profile}`);
  }
  if (config && config.retrieval && config.retrieval.gbrain && !config.gbrain) {
    errors.push('retrieval.gbrain enabled but gbrain section missing');
  }
  return errors;
}

module.exports = {
  CONFIG_PATH,
  SOS_HOME,
  defaultConfig,
  loadConfig,
  saveConfig,
  validateConfig
};
