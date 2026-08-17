/**
 * Rewrites `executeWorkflow` sub-workflow references to real n8n workflow IDs.
 *
 * Why this exists: an `executeWorkflow` node with `source: database` references
 * its target through a resource locator, and n8n only resolves the modes `list`,
 * `id` and `url`. The router was authored with `mode: "name"`, which n8n cannot
 * resolve at all — importing it produced "references workflow X which is not
 * published" for every branch and the router could not be published.
 *
 * IDs are per-instance, so they cannot be committed as-is. This script reads the
 * mapping from the running n8n instance and rewrites the files in place, turning
 * the repo copy into something publishable against *that* instance.
 *
 * Requires, in the environment or .env:
 *   N8N_API_URL   e.g. https://n8n-itenet.duckdns.org
 *   N8N_API_KEY   Settings -> n8n API -> Create an API key
 *
 * @example
 * pnpm tsx n8n/scripts/resolve-workflow-ids.ts            # rewrites the files
 * pnpm tsx n8n/scripts/resolve-workflow-ids.ts --dry-run  # only reports
 */
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const DIR = process.env.N8N_WORKFLOWS_DIR || path.join(process.cwd(), 'n8n', 'workflows');
const DRY_RUN = process.argv.includes('--dry-run');

type RemoteWorkflow = { id: string; name: string; active?: boolean };

/**
 * Lists every workflow on the instance, following pagination.
 *
 * The public API caps a page at 250 items; stopping at the first page would
 * silently miss workflows on a larger instance and leave those references
 * unresolved with no error.
 */
async function fetchWorkflows(apiUrl: string, apiKey: string): Promise<RemoteWorkflow[]> {
  const all: RemoteWorkflow[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL('/api/v1/workflows', apiUrl);
    url.searchParams.set('limit', '250');
    if (cursor) url.searchParams.set('cursor', cursor);

    const res = await fetch(url, { headers: { 'X-N8N-API-KEY': apiKey } });
    if (!res.ok) {
      throw new Error(
        `n8n API ${res.status} ${res.statusText} — vérifiez N8N_API_URL et N8N_API_KEY`
      );
    }

    const body = (await res.json()) as { data?: RemoteWorkflow[]; nextCursor?: string | null };
    all.push(...(body.data ?? []));
    cursor = body.nextCursor ?? undefined;
  } while (cursor);

  return all;
}

function main(): Promise<void> {
  const apiUrl = process.env.N8N_API_URL;
  const apiKey = process.env.N8N_API_KEY;

  if (!apiUrl || !apiKey) {
    console.error('N8N_API_URL et N8N_API_KEY sont requis (voir l’en-tête de ce fichier).');
    process.exit(1);
  }

  return fetchWorkflows(apiUrl, apiKey).then((remote) => {
    // Duplicated names make the mapping ambiguous, and picking one at random
    // would wire the router to whichever copy happened to come first.
    const byName = new Map<string, RemoteWorkflow[]>();
    for (const wf of remote) {
      byName.set(wf.name, [...(byName.get(wf.name) ?? []), wf]);
    }

    console.log(`${remote.length} workflow(s) sur l’instance.`);

    let rewritten = 0;
    let unresolved = 0;

    for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
      const full = path.join(DIR, file);
      const wf = JSON.parse(fs.readFileSync(full, 'utf-8'));
      let touched = false;

      for (const node of wf.nodes ?? []) {
        if (node.type !== 'n8n-nodes-base.executeWorkflow') continue;
        if (node.parameters?.source !== 'database') continue;

        const locator = node.parameters.workflowId ?? {};
        // Already pointing at an id: leave it alone so re-running is harmless.
        if (locator.mode === 'id' && locator.value) continue;

        const target = String(locator.value ?? '');
        const matches = byName.get(target) ?? [];

        if (matches.length === 0) {
          console.error(`  [MANQUANT] ${file}: "${target}" n’existe pas sur l’instance`);
          unresolved += 1;
          continue;
        }

        if (matches.length > 1) {
          console.error(
            `  [AMBIGU] ${file}: ${matches.length} workflows nommés "${target}" ` +
              `(${matches.map((m) => m.id).join(', ')}) — supprimez les doublons`
          );
          unresolved += 1;
          continue;
        }

        node.parameters.workflowId = {
          __rl: true,
          mode: 'id',
          value: matches[0].id,
          // Kept for readability in the n8n editor and in future diffs.
          cachedResultName: target,
        };
        touched = true;
        rewritten += 1;
      }

      if (touched && !DRY_RUN) {
        fs.writeFileSync(full, `${JSON.stringify(wf, null, 2)}\n`, 'utf-8');
        console.log(`  réécrit ${file}`);
      } else if (touched) {
        console.log(`  [dry-run] ${file} serait réécrit`);
      }
    }

    console.log(`\n${rewritten} référence(s) résolue(s), ${unresolved} en échec.`);
    if (unresolved > 0) process.exit(1);
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
