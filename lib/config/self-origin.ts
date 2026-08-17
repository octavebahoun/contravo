import { headers } from 'next/headers';
import { getAppUrl } from './app-url';

/**
 * Origin of the server handling the current request.
 *
 * This is what a page must use when it fetches *its own* API during a server
 * render. The portal pages were building that URL from
 * `process.env.NEXT_PUBLIC_APP_URL`, which is the public address used for links
 * sent to clients — so a locally running server fetched **production**. Reading
 * a portal page in development returned production's data, and any API field
 * added locally was simply absent from the response.
 *
 * `getAppUrl()` remains the right answer for links that leave the process
 * (emails, PDFs, portal links); it is only the fallback here, for the rare
 * render with no `host` header.
 */
export async function getSelfOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get('host');

  if (!host) return getAppUrl();

  const forwardedProto = requestHeaders.get('x-forwarded-proto');
  const protocol =
    forwardedProto?.split(',')[0].trim() ||
    (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');

  return `${protocol}://${host}`;
}
