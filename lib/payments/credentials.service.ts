import crypto from 'crypto';
import { db } from '../db/drizzle';
import { paymentGatewayCredentials } from '../db/schema';
import { eq } from 'drizzle-orm';

function getKek(): Buffer {
  const kekStr = process.env.PAYMENT_CREDENTIALS_KEK || 'mock_kek_must_be_32_bytes_long_!';
  let kek: Buffer;
  if (kekStr.length === 64 && /^[0-9a-fA-F]+$/.test(kekStr)) {
    kek = Buffer.from(kekStr, 'hex');
  } else {
    kek = Buffer.from(kekStr, 'utf-8');
  }
  if (kek.length !== 32) {
    throw new Error('PAYMENT_CREDENTIALS_KEK must be exactly 32 bytes long');
  }
  return kek;
}




export function encryptSecret(text: string): { encrypted: Buffer; nonce: Buffer } {
  const kek = getKek();
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', kek, nonce);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const encryptedWithTag = Buffer.concat([encrypted, tag]);
  return { encrypted: encryptedWithTag, nonce };
}

export function decryptSecret(encryptedWithTag: Buffer | Uint8Array, nonce: Buffer | Uint8Array): string {
  const encBuffer = Buffer.from(encryptedWithTag);
  const nonceBuffer = Buffer.from(nonce);

  const kek = getKek();
  const tag = encBuffer.subarray(encBuffer.length - 16);
  const ciphertext = encBuffer.subarray(0, encBuffer.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', kek, nonceBuffer);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Decrypts a secret using a specific old KEK (useful during rotation)
 */
export function decryptSecretWithKek(
  encryptedWithTag: Buffer | Uint8Array,
  nonce: Buffer | Uint8Array,
  kekStr: string
): string {
  const encBuffer = Buffer.from(encryptedWithTag);
  const nonceBuffer = Buffer.from(nonce);
  const kek = Buffer.from(kekStr, 'utf8');

  if (kek.length !== 32) {
    throw new Error('Old KEK must be exactly 32 bytes long');
  }

  const tag = encBuffer.subarray(encBuffer.length - 16);
  const ciphertext = encBuffer.subarray(0, encBuffer.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', kek, nonceBuffer);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Encrypts a secret using a specific new KEK (useful during rotation)
 */
export function encryptSecretWithKek(
  text: string,
  kekStr: string
): { encrypted: Buffer; nonce: Buffer } {
  const kek = Buffer.from(kekStr, 'utf8');
  if (kek.length !== 32) {
    throw new Error('New KEK must be exactly 32 bytes long');
  }

  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', kek, nonce);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const encryptedWithTag = Buffer.concat([encrypted, tag]);
  return { encrypted: encryptedWithTag, nonce };
}

/**
 * Rotates the KEK for all credentials in the database within a transaction
 */
export async function rotateAllCredentialsKek(
  oldKekStr: string,
  newKekStr: string,
  txClient?: any
): Promise<number> {
  const dbClient = txClient || db;

  const credentials = await dbClient.select().from(paymentGatewayCredentials);
  let rotatedCount = 0;

  for (const cred of credentials) {
    const apiSecret = decryptSecretWithKek(cred.apiSecretEncrypted, cred.apiSecretNonce, oldKekStr);
    const webhookSecret = decryptSecretWithKek(cred.webhookSecretEncrypted, cred.webhookSecretNonce, oldKekStr);

    const newApiSecret = encryptSecretWithKek(apiSecret, newKekStr);
    const newWebhookSecret = encryptSecretWithKek(webhookSecret, newKekStr);

    await dbClient
      .update(paymentGatewayCredentials)
      .set({
        apiSecretEncrypted: newApiSecret.encrypted,
        apiSecretNonce: newApiSecret.nonce,
        webhookSecretEncrypted: newWebhookSecret.encrypted,
        webhookSecretNonce: newWebhookSecret.nonce,
        updatedAt: new Date(),
      })
      .where(eq(paymentGatewayCredentials.id, cred.id));

    rotatedCount++;
  }

  return rotatedCount;
}
