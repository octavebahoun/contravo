/**
 * Deploys all n8n workflow JSON files from ./workflows to a target n8n instance
 * via the n8n REST API.
 *
 * Required environment variables:
 *  - N8N_API_BASE   e.g. https://n8n.excellence.app
 *  - N8N_API_KEY    n8n API key with workflow:create / workflow:update scopes
 *  - N8N_WORKFLOWS_DIR (optional) default: ./workflows
 *
 * Behavior:
 *  - For each *.json file, if a workflow with the same `name` already exists it is
 *    updated (PUT), otherwise it is created (POST).
 *  - The function is idempotent and safe to run on every deploy.
 *
 * @example
 * N8N_API_BASE=https://n8n.excellence.app N8N_API_KEY=... pnpm tsx n8n/scripts/deploy.ts
 */
import fs from 'fs';
import path from 'path';

const API_BASE = process.env.N8N_API_BASE;
const API_KEY = process.env.N8N_API_KEY;
const DIR = process.env.N8N_WORKFLOWS_DIR || path.join(process.cwd(), 'n8n', 'workflows');

interface N8nWorkflow {
  id?: string;
  name: string;
  nodes: unknown[];
  connections: unknown;
  settings?: Record<string, unknown>;
  active?: boolean;
}

async function listWorkflows(): Promise<N8nWorkflow[]> {
  const res = await fetch(`${API_BASE}/api/v1/workflows`, {
    headers: { 'X-N8N-API-KEY': API_KEY! },
  });
  if (!res.ok) throw new Error(`Failed to list workflows: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { data: N8nWorkflow[] };
  return data.data;
}

async function createWorkflow(wf: N8nWorkflow): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/workflows`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': API_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify(wf),
  });
  if (!res.ok) throw new Error(`Failed to create ${wf.name}: ${res.status} ${await res.text()}`);
  console.log(`[create] ${wf.name}`);
}

async function updateWorkflow(wf: N8nWorkflow, id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/workflows/${id}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': API_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...wf, id }),
  });
  if (!res.ok) throw new Error(`Failed to update ${wf.name}: ${res.status} ${await res.text()}`);
  console.log(`[update] ${wf.name}`);
}

async function main(): Promise<void> {
  if (!API_BASE || !API_KEY) {
    throw new Error('N8N_API_BASE and N8N_API_KEY must be set');
  }
  if (!fs.existsSync(DIR)) {
    throw new Error(`Workflows directory not found: ${DIR}`);
  }

  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));
  const existing = await listWorkflows();

  for (const file of files) {
    const raw = fs.readFileSync(path.join(DIR, file), 'utf-8');
    const wf = JSON.parse(raw) as N8nWorkflow;
    const match = existing.find((e) => e.name === wf.name);
    if (match) {
      await updateWorkflow(wf, match.id!);
    } else {
      await createWorkflow(wf);
    }
  }
  console.log(`Deployed ${files.length} workflow(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
