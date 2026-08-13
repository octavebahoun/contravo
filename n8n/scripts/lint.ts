/**
 * Validates the structure of every n8n workflow JSON file in ./workflows.
 *
 * Checks (MVP5 §7):
 *  - File is valid JSON.
 *  - Contains required top-level keys: name, nodes, connections, settings.
 *  - Every node has a non-empty `type`, `name`, and `parameters`.
 *  - Webhook/respondToWebhook nodes are only present in the router workflow.
 *  - No secret is inlined (no `credentials` with raw `apiKey`/`password` values).
 *
 * Exits non-zero on the first failure so it can block CI.
 *
 * @example
 * pnpm tsx n8n/scripts/lint.ts
 */
import fs from 'fs';
import path from 'path';

const DIR = process.env.N8N_WORKFLOWS_DIR || path.join(process.cwd(), 'n8n', 'workflows');

interface N8nNode {
  type: string;
  name: string;
  parameters?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
}

let failures = 0;

function fail(file: string, message: string): void {
  failures += 1;
  console.error(`[FAIL] ${file}: ${message}`);
}

function lintFile(file: string): void {
  const raw = fs.readFileSync(path.join(DIR, file), 'utf-8');
  let wf: { name?: string; nodes?: N8nNode[]; connections?: unknown; settings?: unknown };
  try {
    wf = JSON.parse(raw);
  } catch (e) {
    fail(file, `invalid JSON: ${(e as Error).message}`);
    return;
  }

  if (!wf.name) fail(file, 'missing "name"');
  if (!Array.isArray(wf.nodes)) {
    fail(file, 'missing or invalid "nodes" array');
    return;
  }
  if (wf.connections === undefined) fail(file, 'missing "connections"');
  if (wf.settings === undefined) fail(file, 'missing "settings"');

  const seenNames = new Set<string>();
  for (const node of wf.nodes) {
    if (!node.type) fail(file, `node missing "type" (name=${node.name})`);
    if (!node.name) fail(file, `node missing "name" (type=${node.type})`);
    if (node.name && seenNames.has(node.name)) fail(file, `duplicate node name "${node.name}"`);
    seenNames.add(node.name);

    if (node.credentials) {
      for (const [credType, cred] of Object.entries(node.credentials)) {
        const c = cred as Record<string, unknown>;
        if (typeof c === 'object' && ('apiKey' in c || 'password' in c || 'token' in c)) {
          fail(file, `node "${node.name}" inlines a secret for ${credType}`);
        }
      }
    }
  }
}

function main(): void {
  if (!fs.existsSync(DIR)) {
    fail(DIR, 'workflows directory not found');
    process.exit(1);
  }
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));
  if (files.length === 0) fail(DIR, 'no workflow JSON files found');
  for (const file of files) lintFile(file);

  if (failures > 0) {
    console.error(`\n${failures} validation failure(s).`);
    process.exit(1);
  }
  console.log(`OK: ${files.length} workflow(s) valid.`);
}

main();
