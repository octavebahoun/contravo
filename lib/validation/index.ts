import { z } from 'zod';
import crypto from 'crypto';

// HaveIBeenPwned Check Helper
export async function isPasswordPwned(password: string): Promise<boolean> {
  try {
    const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      signal: AbortSignal.timeout(3000), // 3s timeout to prevent hanging
    });
    
    if (!res.ok) return false; // Fail open if API is down to not block users

    const text = await res.text();
    const lines = text.split('\n');
    
    for (const line of lines) {
      const [hashSuffix, countStr] = line.split(':');
      if (hashSuffix.trim() === suffix) {
        const count = parseInt(countStr, 10);
        return count > 0;
      }
    }
    return false;
  } catch (error) {
    console.error('HaveIBeenPwned API error:', error);
    return false; // Fail open
  }
}

export const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  fullName: z.string().min(1, 'Full name is required'),
}).strict().superRefine(async (val, ctx) => {
  if (val.password && await isPasswordPwned(val.password)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'This password has been compromised in a data breach. Please choose a different password.',
      path: ['password'],
    });
  }
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
}).strict();

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token is required'),
}).strict();

export const requestPasswordResetSchema = z.object({
  email: z.string().email('Invalid email address'),
}).strict();

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z.string().min(12, 'Password must be at least 12 characters'),
}).strict().superRefine(async (val, ctx) => {
  if (val.newPassword && await isPasswordPwned(val.newPassword)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'This password has been compromised in a data breach. Please choose a different password.',
      path: ['newPassword'],
    });
  }
});

const BLACKLISTED_SLUGS = ['admin', 'api', 'www', 'portal', 'auth', 'dashboard', 'settings', 'legal', 'pricing', 'support'];

export const createOrgSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  slug: z.string()
    .min(3, 'Slug must be at least 3 characters')
    .max(50, 'Slug must be less than 50 characters')
    .regex(/^[a-z0-9][a-z0-9-]{2,49}$/, 'Slug must be alphanumeric lowercase and may contain dashes')
    .refine((slug) => !BLACKLISTED_SLUGS.includes(slug), 'This slug is reserved'),
}).strict();

export const updateOrgSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100).optional(),
  /**
   * Re-arms the J+0/J+7/J+14/J+30 dunning ladder for this organization.
   *
   * Optional and off by default: chasing a client is a commercial decision, and
   * the manual "Relancer" action is the normal path.
   */
  autoRemindersEnabled: z.boolean().optional(),
}).strict().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'Aucun champ à mettre à jour' }
);

export const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'member', 'viewer'], {
    errorMap: () => ({ message: 'Role must be admin, member, or viewer' }),
  }),
}).strict();

export const acceptInvitationSchema = z.object({
  token: z.string().min(1, 'Token is required'),
}).strict();

export const updateMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member', 'viewer'], {
    errorMap: () => ({ message: 'Role must be admin, member, or viewer' }),
  }),
}).strict();
