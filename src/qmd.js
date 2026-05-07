const { spawnSync } = require('child_process');
const { detectQmd } = require('./detect');

function runQmd(args) {
  const qmd = detectQmd();
  if (!qmd.found) {
    console.log(qmd.guidance);
    return { skipped: true, guidance: qmd.guidance };
  }

  const result = spawnSync(qmd.path, args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`qmd ${args.join(' ')} failed`);
  return { ok: true };
}

module.exports = {
  runQmd
};
