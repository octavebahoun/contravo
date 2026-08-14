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
 *  - Sub-workflows are deployed before the router, then every `executeWorkflow` node
 *    referencing a sub-workflow by name is rewritten to the real instance ID
 *    (n8n resolves `workflowId` by ID, not by name, and IDs differ per environment).
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

interface N8nCredential {
  id: string;
  name: string;
}

async function listCredentials(): Promise<N8nCredential[]> {
  // The public API exposes credentials only through the (paginated) list endpoint.
  const res = await fetch(`${API_BASE}/api/v1/credentials?limit=250`, {
    headers: { 'X-N8N-API-KEY': API_KEY! },
  });
  if (!res.ok) {
    // Older n8n versions do not expose GET /credentials; deploy can still proceed.
    console.warn(
      `[warn] could not list credentials (${res.status}); credential IDs will be left empty`
    );
    return [];
  }
  const data = (await res.json()) as { data: N8nCredential[] };
  return data.data ?? [];
}

/**
 * Resolves credential *names* (as committed in the repo) to instance credential IDs.
 * Names are environment-agnostic; IDs are not.
 */
function resolveCredentialIds(wf: N8nWorkflow, idsByName: Map<string, string>): void {
  for (const node of wf.nodes as Array<Record<string, any>>) {
    if (!node.credentials) continue;
    for (const [credType, ref] of Object.entries(node.credentials as Record<string, any>)) {
      if (!ref?.name || ref.id) continue;
      const id = idsByName.get(ref.name);
      if (!id) {
        console.warn(
          `[warn] ${wf.name}: node "${node.name}" references credential "${ref.name}" ` +
            `which does not exist on this instance — create it and re-run.`
        );
        continue;
      }
      node.credentials[credType] = { id, name: ref.name };
    }
  }
}

async function listWorkflows(): Promise<N8nWorkflow[]> {
  const res = await fetch(`${API_BASE}/api/v1/workflows`, {
    headers: { 'X-N8N-API-KEY': API_KEY! },
  });
  if (!res.ok) throw new Error(`Failed to list workflows: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { data: N8nWorkflow[] };
  return data.data;
}

async function createWorkflow(wf: N8nWorkflow): Promise<string> {
  const { id: _, ...payload } = wf;
  const res = await fetch(`${API_BASE}/api/v1/workflows`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': API_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to create ${wf.name}: ${res.status} ${await res.text()}`);
  const created = (await res.json()) as N8nWorkflow;
  console.log(`[create] ${wf.name}`);
  return created.id!;
}

async function updateWorkflow(wf: N8nWorkflow, id: string): Promise<string> {
  const { id: _, ...payload } = wf;
  const res = await fetch(`${API_BASE}/api/v1/workflows/${id}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': API_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update ${wf.name}: ${res.status} ${await res.text()}`);
  console.log(`[update] ${wf.name}`);
  return id;
}

/**
 * Rewrites every `executeWorkflow` node's `workflowId` from a workflow *name*
 * (as committed in the repo, which is environment-agnostic) to the actual
 * instance ID, using the name -> id map built while deploying sub-workflows.
 */
function resolveSubWorkflowIds(wf: N8nWorkflow, idsByName: Map<string, string>): void {
  for (const node of wf.nodes as Array<Record<string, any>>) {
    if (node.type !== 'n8n-nodes-base.executeWorkflow') continue;
    const ref = node.parameters?.workflowId;
    if (!ref || typeof ref !== 'object') continue;

    // Repo JSON references sub-workflows by name; n8n resolves by ID.
    const name = ref.mode === 'name' ? String(ref.value) : ref.cachedResultName;
    if (!name) continue;

    const id = idsByName.get(name);
    if (!id) {
      throw new Error(
        `${wf.name}: node "${node.name}" references unknown sub-workflow "${name}"`
      );
    }
    node.parameters.workflowId = { __rl: true, mode: 'id', value: id, cachedResultName: name };
  }
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

  const workflows = files.map((file) => {
    const raw = fs.readFileSync(path.join(DIR, file), 'utf-8');
    return JSON.parse(raw) as N8nWorkflow;
  });

  // Sub-workflows first: the router needs their IDs to wire its executeWorkflow nodes.
  const callsSubWorkflows = (wf: N8nWorkflow): boolean =>
    (wf.nodes as Array<Record<string, unknown>>).some(
      (n) => n.type === 'n8n-nodes-base.executeWorkflow'
    );
  const subWorkflows = workflows.filter((wf) => !callsSubWorkflows(wf));
  const callers = workflows.filter(callsSubWorkflows);

  const credentialIds = new Map(
    (await listCredentials()).map((c) => [c.name, c.id] as const)
  );

  const idsByName = new Map<string, string>();

  const deploy = async (wf: N8nWorkflow): Promise<void> => {
    resolveCredentialIds(wf, credentialIds);
    const match = existing.find((e) => e.name === wf.name);
    const id = match ? await updateWorkflow(wf, match.id!) : await createWorkflow(wf);
    idsByName.set(wf.name, id);
  };

  for (const wf of subWorkflows) await deploy(wf);
  for (const wf of callers) {
    resolveSubWorkflowIds(wf, idsByName);
    await deploy(wf);
  }

  console.log(`Deployed ${workflows.length} workflow(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
