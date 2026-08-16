import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { verifyApiKey } from '@/lib/api-keys';
import { verifyPublicToken } from '@/lib/public-tokens';
import { rateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db/drizzle';
import { memberships, organizations } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = crypto.randomUUID();

  // Create request headers to inject unified context
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  // 0. Handle Admin routes (/admin/* and /api/v1/admin/*)
  const isAdminRoute = pathname.startsWith('/admin');
  const isAdminApiRoute = pathname.startsWith('/api/v1/admin');

  if (isAdminRoute || isAdminApiRoute) {
    const sessionCookie = request.cookies.get('session');
    if (!sessionCookie) {
      if (isAdminApiRoute) {
        return new NextResponse(
          JSON.stringify({ error: 'unauthenticated', message: 'Authentication required' }),
          { status: 401, headers: { 'Content-Type': 'application/json', 'x-request-id': requestId } }
        );
      }
      return NextResponse.redirect(new URL('/sign-in', request.url));
    }

    try {
      const user = await getSessionUser(sessionCookie.value);
      if (!user || !user.isSuperAdmin) {
        if (isAdminApiRoute) {
          return new NextResponse(
            JSON.stringify({ error: 'permission_denied', message: 'Accès réservé au Super-Admin Contravo.' }),
            { status: 403, headers: { 'Content-Type': 'application/json', 'x-request-id': requestId } }
          );
        }
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }

      requestHeaders.set('x-auth-type', 'session');
      requestHeaders.set('x-user-id', user.id);
      requestHeaders.set('x-is-super-admin', 'true');

      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    } catch (error) {
      console.error('Admin route check failed:', error);
      if (isAdminApiRoute) {
        return new NextResponse(
          JSON.stringify({ error: 'internal_server_error', message: 'Internal server error checking admin access' }),
          { status: 500, headers: { 'Content-Type': 'application/json', 'x-request-id': requestId } }
        );
      }
      return NextResponse.redirect(new URL('/sign-in', request.url));
    }
  }

  // 1. Handle Dashboard routes
  const isProtectedRoute = pathname.startsWith('/dashboard');
  const sessionCookie = request.cookies.get('session');

  if (isProtectedRoute) {
    if (!sessionCookie) {
      return NextResponse.redirect(new URL('/sign-in', request.url));
    }

    try {
      const user = await getSessionUser(sessionCookie.value);
      if (!user) {
        const res = NextResponse.redirect(new URL('/sign-in', request.url));
        res.cookies.delete('session');
        return res;
      }

      // Check if organization is suspended
      const organizationId = request.cookies.get('organization_id')?.value;
      if (organizationId) {
        const [org] = await db
          .select()
          .from(organizations)
          .where(eq(organizations.id, organizationId))
          .limit(1);

        if (org && org.subscriptionStatus === 'suspended') {
          return NextResponse.redirect(new URL('/suspended', request.url));
        }
      } else {
        const ms = await db
          .select({
            organization: organizations,
          })
          .from(memberships)
          .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
          .where(eq(memberships.userId, user.id))
          .limit(1);

        if (ms.length > 0 && ms[0].organization.subscriptionStatus === 'suspended') {
          return NextResponse.redirect(new URL('/suspended', request.url));
        }
      }
    } catch (error) {
      console.error('Middleware session check failed:', error);
      const res = NextResponse.redirect(new URL('/sign-in', request.url));
      res.cookies.delete('session');
      return res;
    }
  }

  // 2. Handle API v1 routes (except docs, openapi.json, webhooks, and admin)
  const isApiRoute = pathname.startsWith('/api/v1') && !pathname.startsWith('/api/v1/admin');
  const isDocsOrOpenApi =
    pathname === '/api/v1/openapi.json' ||
    pathname.startsWith('/api/v1/docs');
  const isWebhookRoute = pathname === '/api/v1/webhooks/geniuspay';
  // Signature verification is intentionally public (MVP4 §7.3): a proof that
  // requires an account is not verifiable by a third party.
  const isPublicVerifyRoute = pathname.startsWith('/api/v1/verify/signature/');

  if (isApiRoute && !isDocsOrOpenApi && !isWebhookRoute && !isPublicVerifyRoute) {
    try {
      // Resolve client IP
      const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';

      // Parse authorization header
      const authHeader = request.headers.get('authorization');
      let bearerToken: string | null = null;
      if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
        bearerToken = authHeader.substring(7).trim();
      }

      // Check query parameter for public token if not in headers
      const queryToken = request.nextUrl.searchParams.get('token');
      const token = bearerToken || queryToken;

      let authContext: {
        organizationId: string;
        authType: 'session' | 'api_key' | 'public_token';
        scopes: string[];
        userId?: string;
        role?: string;
        apiKeyId?: string;
        publicTokenId?: string;
        recipientEmail?: string;
      } | null = null;

      // Keys are minted as sk_live_/sk_test_ (lib/api-keys generateApiKey, MVP2 §3).
      if (token && (token.startsWith('sk_live_') || token.startsWith('sk_test_'))) {
        // API Key Auth
        const verifiedKey = await verifyApiKey(token, ip);
        // Get organization's plan for rate limiting
        const [org] = await db
          .select()
          .from(organizations)
          .where(eq(organizations.id, verifiedKey.organizationId))
          .limit(1);

        authContext = {
          organizationId: verifiedKey.organizationId,
          authType: 'api_key',
          scopes: verifiedKey.scopes,
          apiKeyId: verifiedKey.apiKeyId,
          role: org?.plan || 'free', // Use plan as role indicator for simple checks if needed
        };
      } else if (token && token.startsWith('pt_')) {
        // Public Token Auth
        const match = pathname.match(
          /^\/api\/v1\/portal\/(quotes|contracts|invoices|deliverables|reviews)\/([^\/]+)/
        );

        if (!match) {
          return new NextResponse(
            JSON.stringify({
              error: 'permission_denied',
              message: 'Public token cannot access this route',
            }),
            {
              status: 403,
              headers: {
                'Content-Type': 'application/json',
                'x-request-id': requestId,
              },
            }
          );
        }

        const resourceTypeMap: Record<string, 'quote' | 'contract' | 'invoice' | 'deliverable' | 'review_request'> = {
          quotes: 'quote',
          contracts: 'contract',
          invoices: 'invoice',
          deliverables: 'deliverable',
          reviews: 'review_request',
        };
        const resourceType = resourceTypeMap[match[1]];
        const resourceId = match[2];

        const verifiedPt = await verifyPublicToken(token, resourceType, resourceId);

        authContext = {
          organizationId: verifiedPt.organizationId,
          authType: 'public_token',
          scopes: verifiedPt.actions,
          publicTokenId: verifiedPt.id,
          recipientEmail: verifiedPt.recipientEmail,
        };
      } else if (sessionCookie) {
        // Session Auth (for frontend/dashboard calling API endpoints)
        const user = await getSessionUser(sessionCookie.value);
        if (user) {
          let organizationId =
            request.headers.get('x-organization-id') ||
            request.headers.get('x-org-id') ||
            request.cookies.get('organization_id')?.value;
          let membership = null;

          if (organizationId) {
            const ms = await db
              .select({
                membership: memberships,
                organization: organizations,
              })
              .from(memberships)
              .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
              .where(
                and(
                  eq(memberships.userId, user.id),
                  eq(memberships.organizationId, organizationId)
                )
              )
              .limit(1);
            if (ms.length > 0) {
              membership = ms[0];
            }
          }

          if (!membership) {
            // Fallback to first membership
            const ms = await db
              .select({
                membership: memberships,
                organization: organizations,
              })
              .from(memberships)
              .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
              .where(eq(memberships.userId, user.id))
              .limit(1);
            if (ms.length > 0) {
              membership = ms[0];
              organizationId = membership.organization.id;
            }
          }

          if (membership && organizationId) {
            authContext = {
              organizationId,
              authType: 'session',
              scopes: [], // session role-based logic handles this
              userId: user.id,
              role: membership.membership.role,
            };
          }
        }
      }

      if (!authContext) {
        return new NextResponse(
          JSON.stringify({
            error: 'unauthenticated',
            message: 'Authentication required',
          }),
          {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              'x-request-id': requestId,
            },
          }
        );
      }

      // Inject auth details into internal headers
      requestHeaders.set('x-organization-id', authContext.organizationId);
      requestHeaders.set('x-auth-type', authContext.authType);
      requestHeaders.set('x-auth-scopes', JSON.stringify(authContext.scopes));
      if (authContext.userId) requestHeaders.set('x-user-id', authContext.userId);
      if (authContext.role) requestHeaders.set('x-auth-role', authContext.role);
      if (authContext.apiKeyId) requestHeaders.set('x-api-key-id', authContext.apiKeyId);
      if (authContext.publicTokenId) requestHeaders.set('x-public-token-id', authContext.publicTokenId);
      if (authContext.recipientEmail) requestHeaders.set('x-recipient-email', authContext.recipientEmail);

      // Fetch organization details for rate limiting and suspension check
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, authContext.organizationId))
        .limit(1);

      if (org && org.subscriptionStatus === 'suspended') {
        return new NextResponse(
          JSON.stringify({
            error: 'suspended',
            message: 'Votre organisation est suspendue. Veuillez contacter le support Contravo.',
          }),
          {
            status: 403,
            headers: {
              'Content-Type': 'application/json',
              'x-request-id': requestId,
            },
          }
        );
      }

      const plan = (org?.plan || 'free') as 'free' | 'pro' | 'enterprise';

      // Run rate limiting
      const limitResult = await rateLimit(authContext.organizationId, plan);

      if (!limitResult.allowed) {
        return new NextResponse(
          JSON.stringify({
            error: 'rate_limit_exceeded',
            message: `Rate limit exceeded. Reset in ${Math.max(
              0,
              limitResult.reset - Math.floor(Date.now() / 1000)
            )} seconds.`,
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'x-request-id': requestId,
              'X-RateLimit-Limit': String(limitResult.limit),
              'X-RateLimit-Remaining': String(limitResult.remaining),
              'X-RateLimit-Reset': String(limitResult.reset),
            },
          }
        );
      }

      // Successful request handling
      const response = NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });

      response.headers.set('x-request-id', requestId);
      response.headers.set('X-RateLimit-Limit', String(limitResult.limit));
      response.headers.set('X-RateLimit-Remaining', String(limitResult.remaining));
      response.headers.set('X-RateLimit-Reset', String(limitResult.reset));

      return response;
    } catch (err: any) {
      console.error('API authentication middleware error:', err);
      const statusCode = err?.statusCode || 500;
      const errorCode = err?.code || 'internal_server_error';
      return new NextResponse(
        JSON.stringify({
          error: errorCode,
          message: err?.message || 'An unexpected error occurred during authentication',
        }),
        {
          status: statusCode,
          headers: {
            'Content-Type': 'application/json',
            'x-request-id': requestId,
          },
        }
      );
    }
  }

  // Fallback for standard page requests
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
  runtime: 'nodejs',
};
