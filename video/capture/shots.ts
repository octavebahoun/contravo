/**
 * The shot list, as data.
 *
 * One entry per storyboard scene that shows the real product. The narration and
 * the intent live in `video/script.md`; this file holds only what a browser has
 * to do to produce the footage, so a scene can be re-shot on its own after the
 * interface changes without touching the recorder.
 *
 * Paths carry placeholders instead of UUIDs — `{{quote:DEV-2026-0003}}` — which
 * `record.ts` resolves against the database at capture time. The demo dataset is
 * re-seeded regularly and its ids change every time; document numbers do not.
 */

export type Step =
  /** Idle on the current view. The only way to give a shot room to breathe. */
  | { do: 'wait'; ms: number }
  /** Eased scroll — a jump-scroll reads as a glitch once it is in a video. */
  | { do: 'scroll'; toSelector?: string; byPx?: number; ms?: number }
  | { do: 'click'; selector: string }
  | { do: 'hover'; selector: string }
  /** Types one character at a time, like a person would. */
  | { do: 'type'; selector: string; text: string; charDelayMs?: number }
  | { do: 'waitFor'; selector: string; timeoutMs?: number }
  /** Waits for text to appear anywhere on the page (toasts, status pills). */
  | { do: 'waitForText'; text: string; timeoutMs?: number }
  /** Freehand signature drawn on a canvas, as a fraction of its box (0–1). */
  | { do: 'sign'; selector: string };

export type Shot = {
  /** Matches the scene `id` in `storyboard.json`. */
  scene: number;
  /** Becomes the file name: `video/out/scene_03_tableau-de-bord.mp4`. */
  name: string;
  /**
   * Path or placeholder URL. Relative paths are joined to `CAPTURE_BASE_URL`.
   * Supported placeholders:
   *   {{quote:DEV-2026-0003}}     quote id by number
   *   {{invoice:FAC-2026-0003}}   invoice id by number
   *   {{contract:CTR-2026-0003}}  contract id by number
   *   {{project:PRJ-2026-001}}    project id by code
   *   {{client:Pharmacie du Plateau}}  client id by display name
   *   {{portal:quote:DEV-2026-0003}}   full portal URL, token minted on the spot
   *   {{pdf:quote:DEV-2026-0003}}      the generated PDF, saved and reopened
   *                                    from disk so Chrome renders it
   */
  path: string;
  /** `none` records signed out — the landing page and the client portal. */
  auth: 'session' | 'none';
  /** Settling time after load before recording starts. Default 1200 ms. */
  settleMs?: number;
  steps: Step[];
};

/**
 * Three scenes are absent on purpose: 1 needs a supplied visual, 12 is the phone
 * filmed by hand, and 16 is a text card rendered by Remotion.
 */
export const SHOTS: Shot[] = [
  {
    scene: 2,
    name: 'promesse',
    path: '/',
    auth: 'none',
    settleMs: 1800,
    steps: [
      { do: 'wait', ms: 1500 },
      // 420 px, mesuré sur la charte actuelle : au-delà, le scroll dépasse le
      // hero et atterrit sur la section « Le problème », qui appartient à la
      // scène 1 et non à celle-ci.
      { do: 'scroll', byPx: 420, ms: 3500 },
      { do: 'wait', ms: 1200 },
    ],
  },
  {
    scene: 3,
    name: 'tableau-de-bord',
    path: '/dashboard',
    auth: 'session',
    settleMs: 2000,
    steps: [
      { do: 'wait', ms: 3000 },
      { do: 'scroll', byPx: 500, ms: 4500 },
      { do: 'wait', ms: 3000 },
      { do: 'scroll', byPx: -500, ms: 3500 },
      { do: 'wait', ms: 2000 },
    ],
  },
  {
    scene: 4,
    name: 'fiche-client',
    path: '/dashboard/clients',
    auth: 'session',
    steps: [
      { do: 'wait', ms: 1800 },
      { do: 'click', selector: 'text/Pharmacie du Plateau' },
      { do: 'wait', ms: 2500 },
      { do: 'scroll', byPx: 600, ms: 3000 },
      { do: 'wait', ms: 1500 },
    ],
  },
  {
    scene: 5,
    name: 'devis-lignes',
    path: '/dashboard/quotes/{{quote:DEV-2026-0003}}',
    auth: 'session',
    settleMs: 1800,
    steps: [
      { do: 'wait', ms: 3000 },
      { do: 'scroll', byPx: 450, ms: 4000 },
      { do: 'wait', ms: 4000 },
      { do: 'scroll', byPx: 350, ms: 3000 },
      { do: 'wait', ms: 2500 },
    ],
  },
  {
    scene: 6,
    // The one shot that changes state: it actually sends the quote, which
    // generates the PDF and mints the portal token used by scene 8.
    name: 'envoi',
    path: '/dashboard/quotes/{{quote:DEV-2026-0003}}',
    auth: 'session',
    steps: [
      { do: 'wait', ms: 1200 },
      { do: 'hover', selector: 'text/Envoyer au client' },
      { do: 'wait', ms: 700 },
      { do: 'click', selector: 'text/Envoyer au client' },
      { do: 'wait', ms: 4000 },
    ],
  },
  {
    scene: 7,
    // The document itself, in Chrome's PDF viewer. The e-mail body lives in MJML
    // under `n8n/email-templates/` and is only ever assembled by n8n, so there is
    // nothing local to point a browser at; the attachment is the part worth
    // showing anyway. An optional insert of the real inbox is noted in
    // plan-tournage.md.
    name: 'document-pdf',
    path: '{{pdf:quote:DEV-2026-0003}}',
    auth: 'session',
    settleMs: 3000,
    steps: [
      { do: 'wait', ms: 3000 },
      { do: 'scroll', byPx: 600, ms: 3500 },
      { do: 'wait', ms: 1500 },
    ],
  },
  {
    scene: 8,
    name: 'portail-acceptation',
    path: '{{portal:quote:DEV-2026-0003}}',
    auth: 'none',
    settleMs: 2000,
    steps: [
      { do: 'wait', ms: 2000 },
      { do: 'scroll', byPx: 700, ms: 3500 },
      { do: 'wait', ms: 1200 },
      { do: 'click', selector: 'text/Accepter le devis' },
      { do: 'wait', ms: 3500 },
    ],
  },
  {
    scene: 9,
    name: 'signature-contrat',
    path: '{{portal:contract:CTR-2026-0003}}',
    auth: 'none',
    settleMs: 2000,
    steps: [
      { do: 'wait', ms: 1500 },
      { do: 'scroll', toSelector: 'canvas', ms: 2500 },
      { do: 'wait', ms: 800 },
      { do: 'sign', selector: 'canvas' },
      { do: 'wait', ms: 1500 },
      { do: 'click', selector: 'text/Signer le contrat' },
      { do: 'wait', ms: 4000 },
    ],
  },
  {
    scene: 10,
    name: 'facture-a-payer',
    path: '{{portal:invoice:FAC-2026-0003}}',
    auth: 'none',
    settleMs: 1800,
    steps: [
      { do: 'wait', ms: 2000 },
      { do: 'scroll', byPx: 550, ms: 3000 },
      { do: 'hover', selector: 'text/Payer' },
      { do: 'wait', ms: 2000 },
    ],
  },
  {
    scene: 11,
    // Ends on the gateway's sandbox checkout. Scene 12 — the phone in hand — is
    // filmed by hand; see plan-tournage.md.
    name: 'paiement-passerelle',
    path: '{{portal:invoice:FAC-2026-0003}}',
    auth: 'none',
    steps: [
      { do: 'wait', ms: 1000 },
      { do: 'click', selector: 'text/Payer' },
      { do: 'wait', ms: 6000 },
    ],
  },
  {
    scene: 13,
    // FAC-2026-0001, not the 0003 of scenes 10 and 11.
    //
    // Settling 0003 needs a real trip through the GeniusPay sandbox, OTP on a
    // phone included, which no script can do. 0001 is genuinely paid by Mobile
    // Money in the demo dataset — gateway reference, fees, net — so the scene
    // shows a true collection rather than a staged one. The invoice number
    // changes between scenes; the narration names no amount here, so nothing is
    // claimed that the screen does not show. Re-shoot on 0003 once the sandbox
    // payment is done.
    name: 'facture-payee',
    path: '/dashboard/invoices/{{invoice:FAC-2026-0001}}',
    auth: 'session',
    settleMs: 1800,
    steps: [
      { do: 'wait', ms: 3000 },
      { do: 'scroll', byPx: 650, ms: 4500 },
      { do: 'wait', ms: 5000 },
    ],
  },
  {
    scene: 14,
    name: 'relances-automatiques',
    path: '/dashboard/invoices/{{invoice:FAC-2026-0002}}',
    auth: 'session',
    settleMs: 1800,
    steps: [
      { do: 'wait', ms: 3000 },
      { do: 'scroll', byPx: 700, ms: 4500 },
      { do: 'wait', ms: 6000 },
    ],
  },
  {
    scene: 15,
    name: 'webhooks-api',
    path: '/dashboard/developer',
    auth: 'session',
    settleMs: 1800,
    // The screen opens on the API-keys tab and fits inside the window, so there
    // is nothing to scroll: the shot moves between the two tabs instead. The
    // webhook side is the one the narration is about.
    steps: [
      { do: 'wait', ms: 3500 },
      { do: 'click', selector: 'text/Webhooks' },
      { do: 'wait', ms: 8000 },
      { do: 'scroll', byPx: 250, ms: 3000 },
      { do: 'wait', ms: 4000 },
    ],
  },
];
