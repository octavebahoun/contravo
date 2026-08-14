import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../lib/db/drizzle';
import { organizations, users, memberships, files, storageUsage } from '../lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { initiateUpload, completeUpload, deleteFile } from '../lib/storage/upload-service';
import { getPresignedGetUrl } from '../lib/storage/presign';
import { r2Key } from '../lib/storage/r2-keys';
import { isMimeAllowed, verifyMimeMatchesBuffer } from '../lib/storage/mime-guard';
import { scanFileBuffer } from '../lib/storage/antivirus';
import { r2Client, R2_BUCKET_NAME } from '../lib/storage/r2-client';
import { HeadObjectCommand } from '@aws-sdk/client-s3';

describe('R2 Storage Service Integration Tests', () => {
  let orgId: string;
  let userId: string;

  beforeAll(async () => {
    // 1. Create a test organization
    const [org] = await db
      .insert(organizations)
      .values({
        name: 'Storage Test Org',
        slug: `storage-test-${Math.random().toString(36).substring(2, 8)}`,
      })
      .returning();
    orgId = org.id;

    // 2. Create a test user
    const [user] = await db
      .insert(users)
      .values({
        email: `test-user-${Math.random().toString(36).substring(2, 8)}@example.com`,
        fullName: 'Test Storage User',
        passwordHash: 'dummy-hash',
      })
      .returning();
    userId = user.id;

    // 3. Create membership
    await db.insert(memberships).values({
      organizationId: orgId,
      userId,
      role: 'admin',
    });
  }, 60000);

  afterAll(async () => {
    // Clean up files first
    const orgFiles = await db.select().from(files).where(eq(files.organizationId, orgId));
    for (const f of orgFiles) {
      try {
        await deleteFile(f.id, orgId, userId);
      } catch (err) {
        // ignore
      }
    }

    // Clean up org/user/membership
    await db.delete(memberships).where(eq(memberships.organizationId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await db.delete(users).where(eq(users.id, userId));
  }, 60000);

  describe('r2Key', () => {
    it('should construct correct path and sanitize input', () => {
      const key = r2Key(orgId, 'deliverable', orgId, 'document../hello.pdf');
      expect(key).toBe(`org/${orgId}/deliverables/${orgId}/document_hello.pdf`);
    });

    it('should throw error for invalid org/entity UUIDs', () => {
      expect(() => r2Key('invalid-uuid', 'deliverable', orgId, 'test.pdf')).toThrow();
      expect(() => r2Key(orgId, 'deliverable', 'invalid-uuid', 'test.pdf')).toThrow();
    });
  });

  describe('mime-guard', () => {
    it('should validate allowed MIME types correctly', () => {
      expect(isMimeAllowed('quote_pdf', 'application/pdf')).toBe(true);
      expect(isMimeAllowed('quote_pdf', 'image/png')).toBe(false);
      expect(isMimeAllowed('signature_canvas', 'image/png')).toBe(true);
      expect(isMimeAllowed('signature_canvas', 'image/jpeg')).toBe(false);
      expect(isMimeAllowed('expense_receipt', 'image/webp')).toBe(true);
      expect(isMimeAllowed('expense_receipt', 'application/pdf')).toBe(true);
      expect(isMimeAllowed('expense_receipt', 'video/mp4')).toBe(false);
    });

    it('should verify buffer content type matches declared type', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4 ...'); // Mock PDF header
      const match = await verifyMimeMatchesBuffer(pdfBuffer, 'application/pdf');
      expect(match).toBe(true);

      const invalidMatch = await verifyMimeMatchesBuffer(pdfBuffer, 'image/png');
      expect(invalidMatch).toBe(false);
    });
  });

  describe('antivirus', () => {
    it('should detect infected EICAR string', async () => {
      const cleanBuffer = Buffer.from('hello world, this is a clean file.');
      const cleanResult = await scanFileBuffer(cleanBuffer);
      expect(cleanResult.status).toBe('clean');

      const infectedBuffer = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
      const infectedResult = await scanFileBuffer(infectedBuffer);
      expect(infectedResult.status).toBe('infected');
      expect(infectedResult.virusName).toContain('EICAR');
    });

    it('should detect suspicious structures in PDF files', async () => {
      // 1. Clean PDF
      const cleanPdf = Buffer.from('%PDF-1.5\n%...\n%%EOF');
      const cleanRes = await scanFileBuffer(cleanPdf);
      expect(cleanRes.status).toBe('clean');

      // 2. PDF with Embedded JavaScript
      const jsPdf = Buffer.from('%PDF-1.5\n/JavaScript (alert(1))\n%%EOF');
      const jsRes = await scanFileBuffer(jsPdf);
      expect(jsRes.status).toBe('infected');
      expect(jsRes.virusName).toBe('Heuristic.PDF.EmbeddedJavaScript');

      // 3. PDF with Suspicious Launch Action
      const launchPdf = Buffer.from('%PDF-1.5\n/Launch /F (calc.exe)\n%%EOF');
      const launchRes = await scanFileBuffer(launchPdf);
      expect(launchRes.status).toBe('infected');
      expect(launchRes.virusName).toBe('Heuristic.PDF.SuspiciousLaunch');

      // 4. PDF with EmbeddedFiles
      const embedPdf = Buffer.from('%PDF-1.5\n/EmbeddedFiles << ... >>\n%%EOF');
      const embedRes = await scanFileBuffer(embedPdf);
      expect(embedRes.status).toBe('infected');
      expect(embedRes.virusName).toBe('Heuristic.PDF.EmbeddedFiles');
    });

    it('should detect macro-enabled OpenXML ZIP Office documents', async () => {
      // 1. Clean OpenXML document (ZIP format without VBA macros)
      const cleanDocx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0x68, 0x65, 0x6c, 0x6c, 0x6f]);
      const cleanRes = await scanFileBuffer(cleanDocx);
      expect(cleanRes.status).toBe('clean');

      // 2. Macro-enabled document (ZIP format with vbaProject.bin)
      const vbaDocx = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        Buffer.from('word/vbaProject.bin other contents')
      ]);
      const vbaRes = await scanFileBuffer(vbaDocx);
      expect(vbaRes.status).toBe('infected');
      expect(vbaRes.virusName).toBe('Heuristic.Office.VBA.MacroEnabled');
    });

    it('should detect macro-enabled legacy OLE Office documents', async () => {
      // 1. Legacy OLE document (starts with OLE header, but no macro content)
      const cleanDoc = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0x1a, 0xe1, 0x1a, 0xe1, 0x00, 0x00, 0x00, 0x00]);
      const cleanRes = await scanFileBuffer(cleanDoc);
      expect(cleanRes.status).toBe('clean');

      // 2. Legacy OLE document with macros (OLE header + VBA identifier)
      const vbaDoc = Buffer.concat([
        Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0x1a, 0xe1, 0x1a, 0xe1]),
        Buffer.from('some _VBA_PROJECT binary metadata')
      ]);
      const vbaRes = await scanFileBuffer(vbaDoc);
      expect(vbaRes.status).toBe('infected');
      expect(vbaRes.virusName).toBe('Heuristic.OfficeLegacy.VBA.MacroEnabled');
    });
  });

  describe('Upload & Complete Flow', () => {
    it('should successfully upload and complete a file', async () => {
      const filename = 'test-doc.pdf';
      const content = Buffer.from('%PDF-1.5 test document content');
      const mimeType = 'application/pdf';
      const sizeBytes = content.length;

      // 1. Initiate upload
      const { fileId, uploadUrl, r2Key } = await initiateUpload({
        orgId,
        userId,
        kind: 'attachment',
        filename,
        mimeType,
        sizeBytes,
        uploadedVia: 'test',
      });

      expect(fileId).toBeDefined();
      expect(uploadUrl).toBeDefined();
      expect(r2Key).toBeDefined();

      // 2. Perform direct PUT upload to R2
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': mimeType,
          'Content-Length': String(sizeBytes),
        },
        body: content,
      });

      expect(putRes.status).toBe(200);

      // Verify S3 has the object
      const headCmd = new HeadObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: r2Key,
      });
      const s3Head = await r2Client.send(headCmd);
      expect(s3Head.ContentLength).toBe(sizeBytes);

      // 3. Complete upload
      const completed = await completeUpload(fileId, orgId, userId);
      expect(completed.status).toBe('ready');
      expect(completed.sha256).toBeDefined();

      // Check DB values
      const [dbFile] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
      expect(dbFile.status).toBe('ready');

      // Check Storage Usage
      const [usage] = await db.select().from(storageUsage).where(eq(storageUsage.organizationId, orgId)).limit(1);
      expect(usage.totalBytes).toBe(BigInt(sizeBytes));
      expect(usage.fileCount).toBe(1);

      // 4. Generate presigned GET URL
      const downloadUrl = await getPresignedGetUrl(r2Key, orgId, 300, filename);
      expect(downloadUrl).toBeDefined();

      // 5. Test download
      const getRes = await fetch(downloadUrl);
      expect(getRes.status).toBe(200);
      const getBuf = await getRes.arrayBuffer();
      expect(Buffer.from(getBuf).toString()).toBe(content.toString());
    });

    it('should reject infected upload during completion', async () => {
      const filename = 'infected-doc.pdf';
      const content = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
      const mimeType = 'application/pdf';
      const sizeBytes = content.length;

      // 1. Initiate upload
      const { fileId, uploadUrl, r2Key } = await initiateUpload({
        orgId,
        userId,
        kind: 'attachment',
        filename,
        mimeType,
        sizeBytes,
        uploadedVia: 'test',
      });

      // 2. Perform direct PUT upload to R2
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': mimeType,
          'Content-Length': String(sizeBytes),
        },
        body: content,
      });
      expect(putRes.status).toBe(200);

      // 3. Complete upload (should throw error and set status to infected)
      await expect(completeUpload(fileId, orgId, userId)).rejects.toThrow(/infected/i);

      // Check DB values
      const [dbFile] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
      expect(dbFile.status).toBe('infected');
      expect(dbFile.scanResult).toBeDefined();

      // Verify that the file was deleted from R2
      const headCmd = new HeadObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: r2Key,
      });
      await expect(r2Client.send(headCmd)).rejects.toThrow();
    });
  });
});
