const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { detectQmd } = require('./detect');
const { getRegistryPath, getSosHome } = require('./paths');

const DEFAULT_CONTEXT = 'project memory, source files, sessions, notes, operations, and project artifacts.';

function projectSource(project) {
  return project.source || project.path;
}

function projectLabel(project) {
  return project.label || project.name || project.id || project.qmd_collection || 'Project';
}

function runQmd(qmdPath, args, options = {}) {
  const result = spawnSync(qmdPath, args, {
    encoding: 'utf8',
    timeout: options.timeout || 120000
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function parseCollectionNames(output) {
  return new Set(
    output
      .split('\n')
      .map((line) => line.match(/^([a-z0-9][a-z0-9-]*) \(qmd:\/\//i))
      .filter(Boolean)
      .map((match) => match[1])
  );
}

function parseContextNames(output) {
  return new Set(
    output
      .split('\n')
      .map((line) => line.match(/^([a-z0-9][a-z0-9-]*)$/i))
      .filter(Boolean)
      .map((match) => match[1])
  );
}

function pendingEmbeddingCount(statusText) {
  const match = statusText.match(/Pending:\s+(\d+)\s+need embedding/);
  return match ? Number(match[1]) : 0;
}

function readRegistry(registryPath) {
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  if (registry.version !== 1 || !Array.isArray(registry.projects)) {
    throw new Error('Unsupported projects registry schema');
  }
  return registry;
}

function saveHealthState(state, env = process.env) {
  const target = path.join(getSosHome(env), 'health-check.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(state, null, 2) + '\n');
}

async function healthCheck(options = {}) {
  const env = options.env || process.env;
  const registryPath = options.registryPath || getRegistryPath(env);
  const repair = Boolean(options.repair);
  const issues = [];
  const qmd = detectQmd(env);

  if (!fs.existsSync(registryPath)) {
    issues.push(`Missing registry: ${registryPath}`);
    return { ok: false, issues };
  }

  if (!qmd.found) {
    issues.push(qmd.guidance);
    return { ok: false, issues };
  }

  const registry = readRegistry(registryPath);
  const listed = runQmd(qmd.path, ['collection', 'list'], { timeout: 30000 });
  const contextList = runQmd(qmd.path, ['context', 'list'], { timeout: 30000 });
  const collections = listed.ok ? parseCollectionNames(listed.stdout) : new Set();
  const contexts = contextList.ok ? parseContextNames(contextList.stdout) : new Set();

  if (!listed.ok) issues.push(`qmd collection list failed: ${listed.stderr || listed.stdout}`);
  if (!contextList.ok) issues.push(`qmd context list failed: ${contextList.stderr || contextList.stdout}`);

  for (const project of registry.projects) {
    const source = projectSource(project);
    const collection = project.qmd_collection;
    const vaultReadme = project.vault_readme
      ? path.join(registry.vault_root, project.vault_readme)
      : null;

    if (!source || !fs.existsSync(source)) {
      issues.push(`Missing source for ${projectLabel(project)}: ${source}`);
      continue;
    }

    if (vaultReadme && !fs.existsSync(vaultReadme)) {
      issues.push(`Missing vault README for ${projectLabel(project)}: ${vaultReadme}`);
    }

    if (collection && !collections.has(collection)) {
      if (!repair) {
        issues.push(`Missing QMD collection ${collection} for ${source}`);
      } else {
        const added = runQmd(qmd.path, ['collection', 'add', source, '--name', collection], {
          timeout: 120000
        });
        if (added.ok) collections.add(collection);
        else issues.push(`Failed to add QMD collection ${collection}: ${added.stderr || added.stdout}`);
      }
    }

    if (collection && collections.has(collection) && !contexts.has(collection)) {
      if (!repair) {
        issues.push(`Missing QMD context for ${collection}`);
      } else {
        const contextText = `${projectLabel(project)} ${DEFAULT_CONTEXT}`;
        const addedContext = runQmd(qmd.path, ['context', 'add', `qmd://${collection}/`, contextText], {
          timeout: 30000
        });
        if (addedContext.ok) contexts.add(collection);
        else issues.push(`Failed to add QMD context ${collection}: ${addedContext.stderr || addedContext.stdout}`);
      }
    }
  }

  if (repair) {
    const updated = runQmd(qmd.path, ['update'], { timeout: 180000 });
    if (!updated.ok) issues.push(`qmd update failed: ${updated.stderr || updated.stdout}`);
  }

  const status = runQmd(qmd.path, ['status'], { timeout: 30000 });
  const pending = status.ok ? pendingEmbeddingCount(status.stdout) : 0;
  if (!status.ok) issues.push(`qmd status failed: ${status.stderr || status.stdout}`);

  if (pending > 0) {
    if (!repair) {
      issues.push(`${pending} QMD document(s) need embedding`);
    } else {
      const embedded = runQmd(qmd.path, ['embed', '--max-docs-per-batch', '4'], {
        timeout: 300000
      });
      if (!embedded.ok) issues.push(`qmd embed failed: ${embedded.stderr || embedded.stdout}`);
    }
  }

  saveHealthState({
    lastRunIso: new Date().toISOString(),
    repair,
    pendingBeforeEmbed: pending,
    issues
  }, env);

  for (const issue of issues) console.log(`[warn] ${issue}`);
  if (!issues.length) console.log('SOS health check passed.');

  return { ok: issues.length === 0, issues, pendingBeforeEmbed: pending };
}

module.exports = {
  healthCheck,
  parseCollectionNames,
  parseContextNames,
  pendingEmbeddingCount
};
