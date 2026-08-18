/**
 * Films the real product for the presentation video.
 *
 * Everything on screen in the final cut is the running application, driven by a
 * headless Chrome against the local dev server and the seeded demo dataset. No
 * mockups, no stock footage, no reconstructed interface: what the viewer sees is
 * what ships.
 *
 * Three details matter more than they look:
 *
 *  - **A visible cursor.** Chrome's screencast records the page, not the pointer.
 *    Without a synthetic one the clicks look like the interface reacting to
 *    nothing, so a cursor overlay is injected and follows real mouse events.
 *  - **Eased movement.** Instant scrolls and teleporting clicks read as glitches
 *    in a 30 fps video. Both are interpolated over time here.
 *  - **Ids resolved at capture time.** The demo data is re-seeded and every UUID
 *    changes; shots reference document numbers, which do not.
 *
 * Usage — the dev server must already be running:
 *
 *   pnpm dev                                   # dans un autre terminal
 *   npx tsx video/capture/record.ts             # toutes les scènes
 *   npx tsx video/capture/record.ts 3 5 12      # seulement celles-là
 *   npx tsx video/capture/record.ts --headful   # pour voir ce qui se passe
 *
 * Output: `video/out/scene_NN_nom.mp4`, 1920×1080, ready to drop into
 * `/home/precieux/pipevideo/public/`.
 */
import 'dotenv/config';
import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import puppeteer, { Browser, Page } from 'puppeteer';
import { eq, and } from 'drizzle-orm';
import { db } from '../../lib/db/drizzle';
import { organizations, quotes, invoices, contracts, projects, clients } from '../../lib/db/schema';
import { generatePublicToken } from '../../lib/public-tokens';
import { SHOTS, Shot, Step } from './shots';

const BASE_URL = (process.env.CAPTURE_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const ORG_SLUG = 'studio-baobab';

/**
 * Whose session the dashboard scenes are filmed under.
 *
 * Deliberately the seeded teammate rather than the real owner. Two reasons, and
 * the first one matters more: the header and the user menu display this account,
 * and a personal Gmail address on screen would undo the whole point of a coherent
 * demo organization. The second is practical — the seed sets this password, so
 * filming needs no secret from anyone.
 *
 * `admin` carries every permission the shot list touches; only organization
 * deletion and role changes are reserved to `owner` (`lib/rbac/roles.ts`).
 */
const CAPTURE_EMAIL = process.env.CAPTURE_EMAIL ?? 'fatou.diarra@studiobaobab.ci';
const CAPTURE_PASSWORD =
  process.env.CAPTURE_PASSWORD ?? process.env.DEMO_TEAM_PASSWORD ?? 'Baobab2026!';
const OUT_DIR = path.join(__dirname, '..', 'out');

/**
 * 1280×720 CSS pixels at 1.5× density gives a 1920×1080 recording in which the
 * interface is 50 % larger than it would be at native 1080p. On a phone screen —
 * where most of this video will be watched — that is the difference between
 * legible figures and grey mush.
 */
const VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1.5 };

const args = process.argv.slice(2);
const headful = args.includes('--headful');
const onlyScenes = args
  .filter((a) => /^\d+$/.test(a))
  .map(Number);

// --- Résolution des identifiants ---------------------------------------------

/**
 * Resolved on first use, not at startup.
 *
 * Two shots need nothing from the database — the landing page, and any future
 * marketing page. Looking the organization up eagerly would make those
 * impossible to film whenever the database is unreachable, which is exactly when
 * one wants to keep working on something.
 */
let organizationIdPromise: Promise<string> | null = null;

function organizationId(): Promise<string> {
  organizationIdPromise ??= (async () => {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.slug, ORG_SLUG),
    });
    if (!org) {
      throw new Error(
        `Organisation « ${ORG_SLUG} » introuvable. Lancez d'abord : pnpm db:seed:demo`
      );
    }
    return org.id;
  })();
  return organizationIdPromise;
}

/** `DEV-2026-0003` → the quote's UUID, scoped to the demo organization. */
async function lookup(kind: string, key: string, organizationId: string): Promise<string> {
  const found = await (async () => {
    switch (kind) {
      case 'quote':
        return db.query.quotes.findFirst({
          where: and(eq(quotes.organizationId, organizationId), eq(quotes.number, key)),
        });
      case 'invoice':
        return db.query.invoices.findFirst({
          where: and(eq(invoices.organizationId, organizationId), eq(invoices.number, key)),
        });
      case 'contract':
        return db.query.contracts.findFirst({
          where: and(eq(contracts.organizationId, organizationId), eq(contracts.number, key)),
        });
      case 'project':
        return db.query.projects.findFirst({
          where: and(eq(projects.organizationId, organizationId), eq(projects.code, key)),
        });
      case 'client':
        return db.query.clients.findFirst({
          where: and(eq(clients.organizationId, organizationId), eq(clients.displayName, key)),
        });
      default:
        throw new Error(`Type de référence inconnu : {{${kind}:…}}`);
    }
  })();

  if (!found) throw new Error(`${kind} « ${key} » absent du jeu de démo.`);
  return found.id;
}

/** Resources the portal exposes, and which `generatePublicToken` accepts. */
type PortalKind = 'quote' | 'contract' | 'invoice';

/** Portal path segment per resource, mirroring `app/portal/*`. */
const PORTAL_PATH: Record<PortalKind, string> = {
  quote: 'quotes',
  contract: 'contracts',
  invoice: 'invoices',
};

/**
 * Actions a fresh capture token needs, per resource.
 *
 * Copied from `lib/webhooks/payload-builder`, which is what the send path
 * actually mints. Inventing plausible names here — `view` instead of `read` —
 * produced tokens the portal answered with « Accès refusé », because the API
 * checks for the scope `read`.
 */
const PORTAL_ACTIONS: Record<PortalKind, string[]> = {
  quote: ['read', 'sign'],
  contract: ['read', 'sign'],
  invoice: ['read', 'pay'],
};

/**
 * Mints a portal link the way the application does.
 *
 * The token cannot be read back out of the database — only its hash is stored —
 * so replaying an e-mail link is not an option. `generatePublicToken` is the same
 * function the send path calls, which keeps the filmed page identical to the one
 * a real client opens.
 */
async function mintPortalUrl(kind: string, key: string, organizationId: string): Promise<string> {
  if (!(kind in PORTAL_PATH)) {
    throw new Error(`{{portal:${kind}:…}} — le portail n'expose pas ce type de ressource.`);
  }
  const portalKind = kind as PortalKind;

  const resourceId = await lookup(portalKind, key, organizationId);
  const { token } = await generatePublicToken({
    organizationId,
    resourceType: portalKind,
    resourceId,
    actions: PORTAL_ACTIONS[portalKind],
    recipientEmail: process.env.DEMO_CLIENT_EMAIL ?? 'octavebahoun+pharmacie@gmail.com',
  });
  return `${BASE_URL}/portal/${PORTAL_PATH[portalKind]}/${resourceId}?token=${token}`;
}

async function resolvePath(raw: string): Promise<string> {
  const portal = raw.match(/^\{\{portal:(\w+):(.+?)\}\}$/);
  if (portal) return mintPortalUrl(portal[1], portal[2], await organizationId());

  // A path with no placeholder never touches the database.
  const placeholders = [...raw.matchAll(/\{\{(\w+):(.+?)\}\}/g)];
  if (placeholders.length === 0) return `${BASE_URL}${raw}`;

  const orgId = await organizationId();
  let resolved = raw;
  for (const match of placeholders) {
    resolved = resolved.replace(match[0], await lookup(match[1], match[2], orgId));
  }
  return resolved.startsWith('http') ? resolved : `${BASE_URL}${resolved}`;
}

// --- Curseur de synthèse ------------------------------------------------------

/**
 * Draws a pointer that tracks real mouse events.
 *
 * `Page.screencast` captures the rendered page only; the OS cursor is not part
 * of it. Filming clicks without this looks like the interface responding to
 * nothing at all.
 */
const CURSOR_SCRIPT = `
  (() => {
    // Injected at document-start, when <body> does not exist yet: appending
    // straight away silently throws and the shot ends up with no cursor at all.
    const install = () => {
    if (document.getElementById('__capture_cursor')) return;

    // The Next.js dev-tools badge sits in a shadow-DOM portal in the corner of
    // every dev page. Nothing about it belongs in a product video.
    const hide = document.createElement('style');
    hide.textContent = 'nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important; }';
    document.head.appendChild(hide);

    const dot = document.createElement('div');
    dot.id = '__capture_cursor';
    dot.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:22px', 'height:22px',
      'border-radius:50%', 'pointer-events:none', 'z-index:2147483647',
      'background:rgba(255,255,255,0.92)',
      'box-shadow:0 0 0 2px rgba(0,0,0,0.55), 0 2px 10px rgba(0,0,0,0.4)',
      'transform:translate(-50%,-50%) scale(1)',
      'transition:transform 90ms ease-out',
      'will-change:transform,top,left',
    ].join(';');
    document.body.appendChild(dot);

    addEventListener('mousemove', (e) => {
      dot.style.left = e.clientX + 'px';
      dot.style.top = e.clientY + 'px';
    }, true);

    // A brief squeeze on press: the only visual feedback that a click happened
    // when the interface itself takes a moment to react.
    addEventListener('mousedown', () => {
      dot.style.transform = 'translate(-50%,-50%) scale(0.7)';
    }, true);
    addEventListener('mouseup', () => {
      dot.style.transform = 'translate(-50%,-50%) scale(1)';
    }, true);

    // Chrome's screencast emits a frame only when the page actually repaints.
    // A view that fits inside the window has nothing to scroll and nothing to
    // animate, so it paints once and then goes silent — the recording comes back
    // as a zero-byte file, which is how the developer screen was lost twice.
    // This single pixel changes colour every frame, which is enough to keep the
    // stream alive and far too faint to survive as anything visible.
    const beat = document.createElement('div');
    beat.style.cssText = [
      'position:fixed', 'bottom:0', 'right:0', 'width:1px', 'height:1px',
      'pointer-events:none', 'z-index:2147483646',
    ].join(';');
    document.body.appendChild(beat);
    let n = 0;
    const tick = () => {
      n = (n + 1) % 2;
      beat.style.background = 'rgba(128,128,128,' + (0.004 + n * 0.004) + ')';
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    };

    if (document.body) install();
    else addEventListener('DOMContentLoaded', install, { once: true });
  })();
`;

async function installCursor(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(CURSOR_SCRIPT);
}

// --- Gestes ------------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Ease-in-out, so movement starts and stops softly instead of snapping. */
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Glides the pointer to a point over `ms`, firing real mousemove events. */
async function glide(page: Page, x: number, y: number, ms = 550): Promise<void> {
  const steps = Math.max(2, Math.round((ms / 1000) * 30));
  const start = await page.evaluate(() => ({
    x: (window as any).__capture_x ?? window.innerWidth / 2,
    y: (window as any).__capture_y ?? window.innerHeight / 2,
  }));

  for (let i = 1; i <= steps; i += 1) {
    const t = ease(i / steps);
    await page.mouse.move(start.x + (x - start.x) * t, start.y + (y - start.y) * t);
    await sleep(ms / steps);
  }
  await page.evaluate(
    ([px, py]) => {
      (window as any).__capture_x = px;
      (window as any).__capture_y = py;
    },
    [x, y]
  );
}

async function centerOf(page: Page, selector: string) {
  const handle = await page.waitForSelector(selector, { visible: true, timeout: 15000 });
  if (!handle) throw new Error(`Sélecteur introuvable : ${selector}`);
  await handle.scrollIntoView();
  await sleep(400);
  const box = await handle.boundingBox();
  if (!box) throw new Error(`Élément non visible : ${selector}`);
  return { handle, x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Smooth scroll driven inside the page.
 *
 * `window.scrollBy` lands in one frame, which on video looks like a cut rather
 * than a movement; `behavior: 'smooth'` is not tunable enough to match a scene's
 * pacing. So the offset is interpolated frame by frame.
 */
async function smoothScroll(page: Page, deltaPx: number, ms: number): Promise<void> {
  // Passed as source text rather than as a function: tsx compiles with esbuild's
  // `keepNames`, which wraps every named inner function in a `__name()` call.
  // That helper exists in the Node bundle, not in the page, so handing
  // `page.evaluate` a callback containing named arrow functions fails with
  // "__name is not defined". A string is evaluated verbatim by the browser.
  await page.evaluate(`
    new Promise((resolve) => {
      var from = window.scrollY;
      var startedAt = performance.now();
      requestAnimationFrame(function step(now) {
        var t = Math.min(1, (now - startedAt) / ${ms});
        var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        window.scrollTo(0, from + ${deltaPx} * eased);
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      });
    })
  `);
}

/** Draws a plausible signature across the canvas, in one continuous stroke. */
async function drawSignature(page: Page, selector: string): Promise<void> {
  const handle = await page.waitForSelector(selector, { visible: true, timeout: 15000 });
  if (!handle) throw new Error(`Canvas de signature introuvable : ${selector}`);
  await handle.scrollIntoView();
  await sleep(300);
  const box = await handle.boundingBox();
  if (!box) throw new Error('Canvas de signature non visible');

  // A loose cursive shape in normalized canvas coordinates. Deliberately not a
  // clean sine wave — a signature that looks generated undermines the scene.
  const stroke: Array<[number, number]> = [
    [0.14, 0.70], [0.18, 0.40], [0.22, 0.30], [0.26, 0.52], [0.30, 0.72],
    [0.33, 0.55], [0.36, 0.34], [0.40, 0.48], [0.44, 0.68], [0.48, 0.50],
    [0.52, 0.32], [0.57, 0.46], [0.61, 0.66], [0.66, 0.44], [0.71, 0.36],
    [0.76, 0.58], [0.81, 0.48], [0.86, 0.62],
  ];

  const at = ([fx, fy]: [number, number]) => ({
    x: box.x + box.width * fx,
    y: box.y + box.height * fy,
  });

  const first = at(stroke[0]);
  await glide(page, first.x, first.y, 500);
  await page.mouse.down();
  for (const point of stroke.slice(1)) {
    const { x, y } = at(point);
    await page.mouse.move(x, y);
    await sleep(45);
  }
  await page.mouse.up();
}

async function runStep(page: Page, step: Step): Promise<void> {
  switch (step.do) {
    case 'wait':
      return sleep(step.ms);

    case 'scroll': {
      if (step.toSelector) {
        const { y } = await centerOf(page, step.toSelector);
        return smoothScroll(page, y - VIEWPORT.height / 2, step.ms ?? 2000);
      }
      return smoothScroll(page, step.byPx ?? 400, step.ms ?? 2000);
    }

    case 'hover': {
      const { x, y } = await centerOf(page, step.selector);
      return glide(page, x, y);
    }

    case 'click': {
      const { x, y } = await centerOf(page, step.selector);
      await glide(page, x, y);
      await sleep(220);
      await page.mouse.down();
      await sleep(90);
      await page.mouse.up();
      return;
    }

    case 'type': {
      const { x, y } = await centerOf(page, step.selector);
      await glide(page, x, y);
      await page.mouse.click(x, y);
      return page.keyboard.type(step.text, { delay: step.charDelayMs ?? 70 });
    }

    case 'waitFor':
      await page.waitForSelector(step.selector, {
        visible: true,
        timeout: step.timeoutMs ?? 15000,
      });
      return;

    case 'waitForText':
      await page.waitForSelector(`text/${step.text}`, { timeout: step.timeoutMs ?? 15000 });
      return;

    case 'sign':
      return drawSignature(page, step.selector);
  }
}

// --- Session -----------------------------------------------------------------

/**
 * Signs in through the real form.
 *
 * Forging a session cookie would be faster but would skip whatever the login
 * path actually sets — and a capture run that works while the login is broken is
 * a capture run that lies.
 */
async function signIn(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/sign-in`, { waitUntil: 'networkidle2' });
  await page.type('#email', CAPTURE_EMAIL);
  await page.type('#password', CAPTURE_PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);

  if (new URL(page.url()).pathname.startsWith('/sign-in')) {
    throw new Error(
      `Connexion refusée pour ${CAPTURE_EMAIL}. Ce compte est créé par ` +
        'lib/db/seed-demo.ts — relancez « pnpm db:seed:demo ».'
    );
  }
}

// --- Encodage ----------------------------------------------------------------

/**
 * webm → mp4, normalized to exactly 1920×1080 at 30 fps.
 *
 * The pipeline crops any clip to fill the frame, so handing it a file that is
 * already the right size and frame rate avoids a second, lossier resampling.
 */
function toMp4(webm: string, mp4: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-y',
      '-i', webm,
      '-vf', 'scale=1920:1080:flags=lanczos,fps=30',
      '-c:v', 'libx264',
      '-preset', 'slow',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-an', // the voice-over carries the sound; the page has none anyway
      mp4,
    ]);

    let stderr = '';
    ff.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    ff.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg (${code}) :\n${stderr.slice(-1500)}`))
    );
  });
}

/**
 * Blocks until the view has stopped loading, or gives up loudly.
 *
 * Every screen here fetches its data client-side and shows a spinner meanwhile.
 * Recording through that spinner produces a clip that is worse than useless — it
 * says the product is slow — so a shot that never settles is reported as a
 * failure rather than saved.
 */
async function waitForQuietPage(page: Page, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const busy = await page.evaluate(`
      (() => {
        // Radix/shadcn spinners and anything Tailwind spins.
        if (document.querySelector('.animate-spin, [data-loading="true"], [aria-busy="true"]')) return true;
        // A view still on its skeleton has not painted its data yet.
        if (document.querySelector('.animate-pulse')) return true;
        return false;
      })()
    `);
    if (!busy) return;
    await sleep(400);
  }

  throw new Error(
    "la vue tourne encore après 20 s — filmer maintenant enregistrerait le spinner"
  );
}

// --- Documents PDF ------------------------------------------------------------

/**
 * Saves a generated PDF locally and hands back a `file://` URL for it.
 *
 * The download route answers with `Content-Disposition: attachment`, which is
 * exactly right for a product — and means Chrome downloads the file instead of
 * navigating to it, so pointing the recorder at that URL only ever yields
 * `net::ERR_ABORTED`. Rather than weaken the route for the sake of a video, the
 * bytes are fetched through the page's own session and reopened from disk, where
 * Chrome renders them in its built-in viewer.
 */
async function fetchPdf(page: Page, kind: string, key: string, label: string): Promise<string> {
  const id = await lookup(kind, key, await organizationId());
  const apiPath = `/api/v1/${kind}s/${id}/pdf/download`;

  const base64 = await page.evaluate(async (u: string) => {
    const response = await fetch(u);
    if (!response.ok) throw new Error(`HTTP ${response.status} sur ${u}`);
    const buffer = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (const byte of buffer) binary += String.fromCharCode(byte);
    return btoa(binary);
  }, apiPath);

  const file = path.join(OUT_DIR, `${label}.pdf`);
  await fs.writeFile(file, Buffer.from(base64, 'base64'));
  return `file://${file}`;
}

async function resolveShotUrl(page: Page, shot: Shot, label: string): Promise<string> {
  const pdf = shot.path.match(/^\{\{pdf:(\w+):(.+?)\}\}$/);
  if (pdf) return fetchPdf(page, pdf[1], pdf[2], label);
  return resolvePath(shot.path);
}

// --- Boucle principale --------------------------------------------------------

async function capture(browser: Browser, shot: Shot): Promise<string> {
  const label = `scene_${String(shot.scene).padStart(2, '0')}_${shot.name}`;
  const webm = path.join(OUT_DIR, `${label}.webm`);
  const mp4 = path.join(OUT_DIR, `${label}.mp4`);

  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  // Held outside the try so the finally can stop it. A step that throws would
  // otherwise leave the screencast running, and closing the context under a live
  // stream raises `Page.screencastFrameAck: Target closed` from the event loop —
  // an unhandled rejection that kills the whole run, not just this scene.
  let recorder: Awaited<ReturnType<Page['screencast']>> | null = null;

  try {
    await page.setViewport(VIEWPORT);
    await installCursor(page);

    if (shot.auth === 'session') await signIn(page);

    const url = await resolveShotUrl(page, shot, label);

    // Visited twice on purpose. `next dev` compiles a route the first time it is
    // requested, which takes seconds and puts a loading spinner on screen — the
    // dunning scene came back as ten seconds of spinner and nothing else. The
    // first visit pays that cost off camera; the second one loads from the warm
    // build.
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
    await sleep(1500);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

    // Park the pointer before recording so it does not fly in from a corner.
    await page.mouse.move(VIEWPORT.width * 0.5, VIEWPORT.height * 0.62);
    await sleep(shot.settleMs ?? 1200);

    await waitForQuietPage(page);

    recorder = await page.screencast({ path: webm as `${string}.webm` });
    for (const step of shot.steps) await runStep(page, step);
    await recorder.stop();
    recorder = null;

    await toMp4(webm, mp4);
    await fs.unlink(webm);

    const { size } = await fs.stat(mp4);
    console.log(`  ✓ ${label}.mp4  ${(size / 1024 / 1024).toFixed(1)} Mo`);
    return mp4;
  } finally {
    if (recorder) await recorder.stop().catch(() => {});
    await context.close().catch(() => {});
  }
}

// Chrome's DevTools protocol can reject asynchronously, outside any await we
// control. Without this the first such rejection ends the run and every scene
// still queued behind it is lost.
process.on('unhandledRejection', (reason) => {
  console.warn(`  ⚠ rejet ignoré : ${(reason as Error)?.message ?? reason}`);
});

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const response = await fetch(`${BASE_URL}/`, { method: 'HEAD' }).catch(() => null);
  if (!response) {
    throw new Error(`${BASE_URL} ne répond pas. Lancez « pnpm dev » dans un autre terminal.`);
  }

  const planned = onlyScenes.length > 0
    ? SHOTS.filter((s) => onlyScenes.includes(s.scene))
    : SHOTS;

  if (planned.length === 0) {
    throw new Error(`Aucune scène ne correspond à : ${onlyScenes.join(', ')}`);
  }

  console.log(`\n${planned.length} scène(s) à filmer sur ${BASE_URL}\n`);

  const browser = await puppeteer.launch({
    headless: !headful,
    defaultViewport: VIEWPORT,
    args: [
      '--window-size=1280,720',
      '--hide-scrollbars', // a scrollbar sliding across the frame is pure noise
      '--force-device-scale-factor=1.5',
      '--disable-features=Translate',
      // This Ubuntu restricts unprivileged user namespaces through AppArmor, so
      // Chrome's zygote sandbox cannot start at all ("No usable sandbox!").
      // Acceptable *here and only here*: this script loads nothing but our own
      // localhost pages and the payment sandbox we already trust. Never carry
      // these two flags into anything that opens a URL from outside.
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  const failures: string[] = [];
  try {
    for (const shot of planned) {
      console.log(`· scène ${shot.scene} — ${shot.name}`);
      try {
        await capture(browser, shot);
      } catch (error) {
        // One broken selector should not cost the other eleven scenes.
        failures.push(`scène ${shot.scene} (${shot.name}) — ${(error as Error).message}`);
        console.error(`  ✗ ${(error as Error).message}`);

        // A failed take leaves an empty .webm behind, which looks like a clip in
        // a directory listing and is not one.
        await fs
          .unlink(path.join(OUT_DIR, `scene_${String(shot.scene).padStart(2, '0')}_${shot.name}.webm`))
          .catch(() => {});
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\nClips dans ${OUT_DIR}`);
  if (failures.length > 0) {
    console.log(`\n${failures.length} scène(s) en échec :`);
    for (const failure of failures) console.log(`  · ${failure}`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(`\n${(error as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
