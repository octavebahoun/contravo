/**
 * Public base URL of the application.
 *
 * Every absolute link that leaves the system is built from this: client portal
 * links, PDF download URLs embedded in webhook payloads, GeniusPay return URLs,
 * password reset and invitation links.
 *
 * This used to be inlined in six places with four different fallbacks — one of
 * them a hardcoded Vercel URL, the others `http://localhost:3000`. A localhost
 * fallback is silently destructive here: n8n runs in its own container, so
 * `localhost` resolves to that container and every portal link and PDF fetch
 * fails with a connection refused. No email goes out, and nothing in the
 * application logs an error.
 */

let warnedAboutFallback = false;

const DEV_FALLBACK = 'http://localhost:3000';

export function getAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.BASE_URL;

  if (configured) {
    // A trailing slash would produce `//portal/...` once joined with a path.
    return configured.replace(/\/+$/, '');
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_APP_URL is not set. Absolute links (client portal, PDF ' +
        'downloads, payment returns, invitations) would point at localhost and ' +
        'break for every external consumer. Refusing to build them.'
    );
  }

  if (!warnedAboutFallback) {
    warnedAboutFallback = true;
    console.warn(
      `[app-url] NEXT_PUBLIC_APP_URL is not set, falling back to ${DEV_FALLBACK}. ` +
        'Links sent to n8n or to a client will not be reachable from outside this machine.'
    );
  }

  return DEV_FALLBACK;
}
