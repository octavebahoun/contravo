import { NextResponse } from 'next/server';
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Adds `.openapi()` to zod schemas. Without this call the method does not
// exist and every schema definition below throws at module evaluation, which
// fails the production build while `next dev` never evaluates the route.
extendZodWithOpenApi(z);

export const dynamic = 'force-static';

const registry = new OpenAPIRegistry();

// Security Schemes
registry.registerComponent('securitySchemes', 'ApiKeyAuth', {
  type: 'http',
  scheme: 'bearer',
  description: 'Use your organization API key (prefixed with `sk_live_` or `sk_test_`).',
});

registry.registerComponent('securitySchemes', 'PublicTokenAuth', {
  type: 'http',
  scheme: 'bearer',
  description: 'Use resource-specific public token (prefixed with `pt_`). Can also be passed via query parameter `?token=pt_...`.',
});

// Zod Schemas for API documentation
const ApiKeySchema = registry.register(
  'ApiKey',
  z.object({
    id: z.string().uuid().openapi({ example: 'd3b07384-d113-4956-a50e-a1c6a2e4e240' }),
    name: z.string().openapi({ example: 'Production Integration Key' }),
    prefix: z.string().openapi({ example: 'sk_live_ABC123' }),
    scopes: z.array(z.string()).openapi({ example: ['contracts:read', 'invoices:read'] }),
    createdAt: z.string().datetime().openapi({ example: '2026-08-13T12:00:00Z' }),
    expiresAt: z.string().datetime().nullable().openapi({ example: null }),
    lastUsedAt: z.string().datetime().nullable().openapi({ example: '2026-08-13T14:22:00Z' }),
    lastUsedIp: z.string().nullable().openapi({ example: '192.168.1.1' }),
  })
);

const CreateApiKeyRequestSchema = registry.register(
  'CreateApiKeyRequest',
  z.object({
    name: z.string().min(1).openapi({ example: 'Billing Sync Key' }),
    scopes: z.array(z.string()).min(1).openapi({ example: ['invoices:read', 'invoices:write'] }),
    expiresAt: z.string().datetime().optional().openapi({ example: '2027-08-13T00:00:00Z' }),
  })
);

const QuoteSchema = registry.register(
  'Quote',
  z.object({
    id: z.string().openapi({ example: 'qte_12345' }),
    organizationId: z.string().openapi({ example: 'org_abc123' }),
    title: z.string().openapi({ example: 'Website Redesign Proposal' }),
    amount: z.number().openapi({ example: 4500.0 }),
    currency: z.string().openapi({ example: 'USD' }),
    status: z.string().openapi({ example: 'draft' }),
    recipientEmail: z.string().email().openapi({ example: 'client@example.com' }),
    createdAt: z.string().datetime().openapi({ example: '2026-08-13T12:00:00Z' }),
  })
);

const ContractSchema = registry.register(
  'Contract',
  z.object({
    id: z.string().openapi({ example: 'ctr_54321' }),
    organizationId: z.string().openapi({ example: 'org_abc123' }),
    title: z.string().openapi({ example: 'Master Services Agreement' }),
    status: z.string().openapi({ example: 'draft' }),
    recipientEmail: z.string().email().openapi({ example: 'client@example.com' }),
    createdAt: z.string().datetime().openapi({ example: '2026-08-13T12:00:00Z' }),
  })
);

const InvoiceSchema = registry.register(
  'Invoice',
  z.object({
    id: z.string().openapi({ example: 'inv_98765' }),
    organizationId: z.string().openapi({ example: 'org_abc123' }),
    number: z.string().openapi({ example: 'INV-2026-0001' }),
    amount: z.number().openapi({ example: 1500.0 }),
    currency: z.string().openapi({ example: 'USD' }),
    status: z.string().openapi({ example: 'unpaid' }),
    dueDate: z.string().datetime().openapi({ example: '2026-09-13T12:00:00Z' }),
    recipientEmail: z.string().email().openapi({ example: 'client@example.com' }),
    createdAt: z.string().datetime().openapi({ example: '2026-08-13T12:00:00Z' }),
  })
);

const DeliverableSchema = registry.register(
  'Deliverable',
  z.object({
    id: z.string().openapi({ example: 'dlv_13579' }),
    organizationId: z.string().openapi({ example: 'org_abc123' }),
    title: z.string().openapi({ example: 'Landing Page UI Kit' }),
    description: z.string().openapi({ example: 'Complete Figma designs and assets' }),
    status: z.string().openapi({ example: 'pending_review' }),
    recipientEmail: z.string().email().openapi({ example: 'client@example.com' }),
    createdAt: z.string().datetime().openapi({ example: '2026-08-13T12:00:00Z' }),
  })
);

const ReviewRequestSchema = registry.register(
  'ReviewRequest',
  z.object({
    id: z.string().openapi({ example: 'rev_24680' }),
    organizationId: z.string().openapi({ example: 'org_abc123' }),
    title: z.string().openapi({ example: 'Sprint 5 Deliverables Feedback' }),
    status: z.string().openapi({ example: 'pending' }),
    recipientEmail: z.string().email().openapi({ example: 'client@example.com' }),
    createdAt: z.string().datetime().openapi({ example: '2026-08-13T12:00:00Z' }),
  })
);

// Register Paths
registry.registerPath({
  method: 'get',
  path: '/api/v1/api-keys',
  summary: 'List API Keys',
  description: 'Retrieve all active API keys for the authenticated organization.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'List of active API keys',
      content: {
        'application/json': {
          schema: z.object({
            apiKeys: z.array(ApiKeySchema),
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/api-keys',
  summary: 'Create API Key',
  description: 'Generate a new API key with specific scopes and expiry.',
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateApiKeyRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'API key successfully created. Make sure to copy the secret as it will not be shown again.',
      content: {
        'application/json': {
          schema: z.object({
            id: z.string().uuid(),
            secret: z.string(),
            prefix: z.string(),
            name: z.string(),
            scopes: z.array(z.string()),
            expiresAt: z.string().datetime().nullable(),
            createdAt: z.string().datetime(),
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/api-keys/{id}/rotate',
  summary: 'Rotate API Key',
  description: 'Invalidate current API key after a 24-hour grace period and generate a replacement key.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'New API key generated',
      content: {
        'application/json': {
          schema: z.object({
            id: z.string().uuid(),
            secret: z.string(),
            prefix: z.string(),
            name: z.string(),
            scopes: z.array(z.string()),
            expiresAt: z.string().datetime().nullable(),
            createdAt: z.string().datetime(),
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/api-keys/{id}',
  summary: 'Revoke API Key',
  description: 'Immediately and permanently revoke an API key.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Key successfully revoked',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        },
      },
    },
  },
});

// Portal Paths
registry.registerPath({
  method: 'get',
  path: '/api/v1/portal/quotes/{id}',
  summary: 'Get Portal Quote',
  description: 'Retrieve quote details using a client public token.',
  security: [{ PublicTokenAuth: [] }],
  responses: {
    200: {
      description: 'Quote details',
      content: {
        'application/json': {
          schema: z.object({
            quote: QuoteSchema,
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/portal/quotes/{id}/sign',
  summary: 'Sign Portal Quote',
  description: 'Sign and accept a quote. Validates signer email identity and triggers webhook event `quote.signed`.',
  security: [{ PublicTokenAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            signerName: z.string(),
            signerEmail: z.string().email(),
            signatureBase64: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Quote signed successfully',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
            signedAt: z.string().datetime(),
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/portal/contracts/{id}',
  summary: 'Get Portal Contract',
  description: 'Retrieve contract details using a client public token.',
  security: [{ PublicTokenAuth: [] }],
  responses: {
    200: {
      description: 'Contract details',
      content: {
        'application/json': {
          schema: z.object({
            contract: ContractSchema,
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/portal/contracts/{id}/sign',
  summary: 'Sign Portal Contract',
  description: 'Sign a contract. Validates signer email identity and triggers webhook event `contract.signed`.',
  security: [{ PublicTokenAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            signerName: z.string(),
            signerEmail: z.string().email(),
            signatureBase64: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Contract signed successfully',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
            signedAt: z.string().datetime(),
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/portal/invoices/{id}',
  summary: 'Get Portal Invoice',
  description: 'Retrieve invoice details using a client public token.',
  security: [{ PublicTokenAuth: [] }],
  responses: {
    200: {
      description: 'Invoice details',
      content: {
        'application/json': {
          schema: z.object({
            invoice: InvoiceSchema,
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/portal/deliverables/{id}',
  summary: 'Get Portal Deliverable',
  description: 'Retrieve deliverable status and details using a client public token.',
  security: [{ PublicTokenAuth: [] }],
  responses: {
    200: {
      description: 'Deliverable details',
      content: {
        'application/json': {
          schema: z.object({
            deliverable: DeliverableSchema,
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/portal/deliverables/{id}/approve',
  summary: 'Approve Deliverable',
  description: 'Approve a deliverable. Triggers webhook event `deliverable.approved`.',
  security: [{ PublicTokenAuth: [] }],
  responses: {
    200: {
      description: 'Deliverable approved successfully',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
            approvedAt: z.string().datetime(),
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/portal/deliverables/{id}/reject',
  summary: 'Reject Deliverable',
  description: 'Reject a deliverable with a reason. Triggers webhook event `deliverable.rejected`.',
  security: [{ PublicTokenAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            reason: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Deliverable rejected successfully',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
            rejectedAt: z.string().datetime(),
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/portal/reviews/{requestId}',
  summary: 'Get Portal Review Request',
  description: 'Retrieve review request details using a client public token.',
  security: [{ PublicTokenAuth: [] }],
  responses: {
    200: {
      description: 'Review request details',
      content: {
        'application/json': {
          schema: z.object({
            reviewRequest: ReviewRequestSchema,
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/portal/reviews/{requestId}',
  summary: 'Submit Portal Review',
  description: 'Submit rating and comments for a review request. Triggers webhook event `review.submitted`.',
  security: [{ PublicTokenAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            rating: z.number().int().min(1).max(5),
            comment: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Review submitted successfully',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
            submittedAt: z.string().datetime(),
          }),
        },
      },
    },
  },
});

export async function GET() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  const spec = generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'Contravo Public API',
      version: '1.0.0',
      description:
        'This API enables programmatic integrations and client portal access for Contravo SaaS multi-tenant platform.',
    },
    servers: [
      {
        url: process.env.BASE_URL || 'http://localhost:3000',
        description: 'Current Environment Server',
      },
    ],
  });

  return NextResponse.json(spec);
}
