#!/usr/bin/env node
/**
 * SessionEnd hook — spawn a detached headless agent run that summarizes the
 * session transcript into the registry-resolved vault daily section.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { findBinary, isInside, readRegistry, readStdinJson, resolveProject, todayIso } = require('./_common');

// Re-entrancy guard: the spawned summarizer runs with VAULT_AUTOSAVE=1.
if (process.env.VAULT_AUTOSAVE === '1') process.exit(0);

const input = readStdinJson();

const registry = readRegistry();
if (!registry) process.exit(0);

const cwd = input.cwd || process.cwd();
const transcriptPath = input.transcript_path;

if (!isInside(cwd, registry.documents_root)) process.exit(0);
if (!transcriptPath || !fs.existsSync(transcriptPath)) process.exit(0);
if (fs.statSync(transcriptPath).size < 2048) process.exit(0);

const claudeBin = findBinary('claude');
if (!claudeBin) {
  process.stderr.write('[vault-autosave] claude binary not found; skipping summary\n');
  process.exit(0);
}

const project = resolveProject(registry, cwd);
const section = project ? project.daily_section : 'General';
const projectLabel = project ? project.label : 'General';
const today = todayIso();
const time = new Date().toTimeString().slice(0, 5);
const dailyPath = path.join(registry.vault_root, 'Daily', `${today}.md`);

const prompt = `You are writing a session summary. Read the conversation transcript at this path: ${transcriptPath}

Session context:
- Project: ${projectLabel}
- Daily section: ${section}
- Working directory: ${cwd}
- Date: ${today}, Time: ${time}

Task: Append a concise session entry to the vault daily note at: ${dailyPath}

Find the ## ${section} section and append exactly this format:

### Session — ${time}
- <what was accomplished — specific, mention file names or decisions>
- <repeat for each key thing, 3–6 bullets total>
- **Next**: <the single most important next action>

Rules you must follow:
- 3 to 6 bullet points only — no more, no less
- Be specific: name files changed, decisions made, problems solved
- The **Next** line is required — one action only, no lists
- Do not rewrite or modify any other content in the file
- Do not add headers, preamble, or closing remarks — only the ### Session block
- If the ## ${section} section does not exist in the file, create it before appending
- If the daily file does not exist, create it with frontmatter first

Use the Read tool to read the transcript and daily file, then Edit or Write to append.`;

const proc = spawn(
  claudeBin,
  ['--print', prompt, '--allowedTools', 'Read,Edit,Write', '--dangerously-skip-permissions'],
  {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, VAULT_AUTOSAVE: '1' }
  }
);
proc.unref();

process.stdout.write(`[vault-autosave] Session summarization started for ${section} (${today} ${time})\n`);
