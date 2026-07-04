const { apply } = require('./apply');
const { auditVault, inspectContinues } = require('./audit');
const { bootstrapProject } = require('./bootstrap');
const { doctor } = require('./doctor');
const { detectPlatform } = require('./platform');
const { healthCheck } = require('./health-check');
const { install } = require('./install');
const { runQmd } = require('./qmd');
const { update } = require('./update');
const { validate } = require('./validate');

function parseFlags(args) {
  const command = args[0];
  const flags = new Set(args.filter((arg) => arg.startsWith('--')));
  const positional = args.slice(1).filter((arg) => !arg.startsWith('--'));
  return { command, flags, positional };
}

function printHelp() {
  console.log(`sos-memory commands:
  sos install [--dry-run] [--auto] [--yes]
  sos apply [--dry-run]
  sos doctor
  sos platform
  sos update
  sos validate
  sos health-check [--repair]
  sos bootstrap-project <folder>
  sos update-qmd
  sos embed
  sos audit-vault
  sos continues`);
}

async function main(args) {
  const { command, flags, positional } = parseFlags(args);

  switch (command) {
    case 'install':
      return install({
        auto: flags.has('--auto'),
        dryRun: flags.has('--dry-run'),
        yes: flags.has('--yes')
      });
    case 'apply':
      return apply({ dryRun: flags.has('--dry-run') });
    case 'doctor':
      return doctor();
    case 'platform':
      console.log(JSON.stringify(detectPlatform(), null, 2));
      return null;
    case 'update':
      return update();
    case 'validate':
      return validate();
    case 'health-check':
      return healthCheck({ repair: flags.has('--repair') });
    case 'bootstrap-project':
      if (!positional[0]) throw new Error('Usage: sos bootstrap-project <folder>');
      await bootstrapProject(positional[0]);
      return healthCheck({ repair: true });
    case 'update-qmd':
      return runQmd(['update']);
    case 'embed':
      return runQmd(['embed', '--max-docs-per-batch', '4']);
    case 'audit-vault':
      return auditVault();
    case 'continues':
      return inspectContinues();
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      return null;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

module.exports = {
  main,
  parseFlags
};
