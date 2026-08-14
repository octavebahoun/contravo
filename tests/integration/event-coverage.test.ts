import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Guards the contract between Excellence and n8n.
 *
 * n8n dispatches on the event name in the webhook body (MVP5 §3.1). An event the
 * router listens for but the backend never emits fails silently: no error, no
 * email, nothing to notice. This suite fails the build instead.
 */

const ROOT = path.join(__dirname, '../..');

/** Event names n8n's router switches on. */
function listenedEvents(): Set<string> {
  const router = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'n8n/workflows/router_dispatch_v1.json'), 'utf-8')
  );

  const events = new Set<string>();
  for (const node of router.nodes) {
    if (node.type !== 'n8n-nodes-base.switch') continue;
    for (const rule of node.parameters.rules.values) {
      for (const condition of rule.conditions.conditions) {
        if (typeof condition.rightValue === 'string') events.add(condition.rightValue);
      }
    }
  }
  return events;
}

/** Walks a directory collecting the text of every .ts/.tsx file. */
function readSources(dir: string): string {
  let out = '';
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      out += readSources(full);
    } else if (/\.tsx?$/.test(entry.name)) {
      out += fs.readFileSync(full, 'utf-8');
    }
  }
  return out;
}

/**
 * Event names the backend can emit.
 *
 * Covers both `emit('x.y', …)` and the state machines, which emit through a
 * variable looked up in an EVENT_BY_ACTION map.
 */
function emittedEvents(): Set<string> {
  const sources = readSources(path.join(ROOT, 'lib')) + readSources(path.join(ROOT, 'app'));

  const events = new Set<string>();
  for (const match of sources.matchAll(/emit\(\s*'([a-z_]+\.[a-z_]+)'/g)) {
    events.add(match[1]);
  }

  const machines = path.join(ROOT, 'lib/workflows');
  for (const file of fs.readdirSync(machines).filter((f) => f.endsWith('.state.ts'))) {
    const source = fs.readFileSync(path.join(machines, file), 'utf-8');
    const table = source.match(/EVENT_BY_ACTION[^=]*=\s*\{([\s\S]*?)\};/);
    if (!table) continue;
    for (const match of table[1].matchAll(/'([a-z_]+\.[a-z_]+)'/g)) {
      events.add(match[1]);
    }
  }
  return events;
}

describe('Webhook event coverage (MVP3 §6 ↔ MVP5 §3.1)', () => {
  it('emits every event the n8n router listens for', () => {
    const listened = listenedEvents();
    const emitted = emittedEvents();

    expect(listened.size).toBeGreaterThan(0);

    const missing = [...listened].filter((e) => !emitted.has(e)).sort();
    expect(missing).toEqual([]);
  });

  it('covers the full quote lifecycle', () => {
    const emitted = emittedEvents();
    for (const event of ['quote.sent', 'quote.viewed', 'quote.accepted', 'quote.rejected']) {
      expect(emitted).toContain(event);
    }
  });

  it('covers contract, invoice and deliverable transitions', () => {
    const emitted = emittedEvents();
    for (const event of [
      'contract.sent',
      'contract.signed',
      'invoice.sent',
      'invoice.overdue',
      'invoice.paid',
      'invoice.payment_failed',
      'deliverable.submitted',
      'deliverable.approved',
      'deliverable.rejected',
    ]) {
      expect(emitted).toContain(event);
    }
  });

  it('emits review.requested, the name MVP3 §6 specifies', () => {
    const emitted = emittedEvents();
    expect(emitted).toContain('review.requested');
    expect(emitted).toContain('review.created');
  });
});

describe('MVP3 route inventory (§5)', () => {
  const routeExists = (route: string): boolean =>
    fs.existsSync(path.join(ROOT, 'app/api/v1', route, 'route.ts'));

  it('exposes the expenses endpoints', () => {
    expect(routeExists('expenses')).toBe(true);
    expect(routeExists('expenses/[id]')).toBe(true);
    expect(routeExists('projects/[id]/expenses')).toBe(true);
  });

  it('exposes the deliverables endpoints', () => {
    expect(routeExists('deliverables/[id]')).toBe(true);
    expect(routeExists('deliverables/[id]/submit')).toBe(true);
    expect(routeExists('deliverables/[id]/resubmit')).toBe(true);
    expect(routeExists('projects/[id]/deliverables')).toBe(true);
  });

  it('exposes the reviews endpoints', () => {
    expect(routeExists('reviews')).toBe(true);
    expect(routeExists('reviews/[id]')).toBe(true);
    expect(routeExists('projects/[id]/review-request')).toBe(true);
  });
});
