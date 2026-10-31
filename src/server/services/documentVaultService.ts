import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { dbInstance } from '../db/database';

export interface DocumentUploadParams {
  uploaderId: string;
  entityType: 'REP_APPLICATION' | 'DRIVER_APPLICATION' | 'USER_PROFILE' | 'MERCHANT_VERIFICATION';
  entityId: string;
  documentType: 'ID_DOCUMENT' | 'PROOF_OF_RESIDENCE' | 'DRIVER_SELFIE' | 'DRIVER_TRANSPORT_SELFIE' | 'DRIVERS_LICENSE' | 'VEHICLE_ROADWORTHY' | 'PAYLOAD_CERTIFICATE';
  originalFilename: string;
  buffer: Buffer;
  mimeType: string;
}

export interface DocumentRecord {
  id: string;
  uploader_id: string;
  entity_type: string;
  entity_id: string;
  document_type: string;
  storage_path: string;
  file_mime_type: string;
  file_size_bytes: number;
  original_filename: string;
  sha256_hash: string;
  encryption_iv: string;
  encryption_tag: string;
  is_verified: number;
  verification_notes?: string;
  created_at: string;
}

export class DocumentVaultService {
  private static instance: DocumentVaultService;
  private readonly vaultDirectory: string;
  private readonly encryptionKey: Buffer;

  private constructor() {
    // Isolated secure vault outside public assets
    this.vaultDirectory = path.resolve(process.cwd(), 'data', 'vault', 'documents');
    if (!fs.existsSync(this.vaultDirectory)) {
      fs.mkdirSync(this.vaultDirectory, { recursive: true, mode: 0o700 });
    }

    // Encryption key derivation (AES-256 requires 32 bytes)
    const secret = process.env.DOCUMENT_VAULT_KEY || 'tuxi-sovereign-vault-key-dev-seed-2026-financial-strict';
    this.encryptionKey = crypto.createHash('sha256').update(secret).digest();
  }

  public static getInstance(): DocumentVaultService {
    if (!DocumentVaultService.instance) {
      DocumentVaultService.instance = new DocumentVaultService();
    }
    return DocumentVaultService.instance;
  }

  /**
   * Validates magic bytes to prevent MIME spoofing, polyglots, and script injection
   */
  public validateMagicBytes(buffer: Buffer, claimedMime: string): { valid: boolean; detectedMime?: string; error?: string } {
    if (!buffer || buffer.length < 32) {
      return { valid: false, error: 'Document buffer is empty or corrupted (under 32 bytes)' };
    }

    if (buffer.length > 10 * 1024 * 1024) {
      return { valid: false, error: 'Document exceeds maximum authorized size of 10 MB' };
    }

    // Scan for dangerous script headers in any upload
    const headerString = buffer.slice(0, 1024).toString('utf8').toLowerCase();
    if (headerString.includes('<script') || headerString.includes('<?php') || headerString.includes('#!/bin/')) {
      return { valid: false, error: 'Executable script content detected. Document upload rejected.' };
    }

    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return { valid: true, detectedMime: 'image/jpeg' };
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return { valid: true, detectedMime: 'image/png' };
    }

    // WEBP: RIFF....WEBP (52 49 46 46 .... 57 45 42 50)
    if (
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
    ) {
      return { valid: true, detectedMime: 'image/webp' };
    }

    // PDF: %PDF- (25 50 44 46 2D)
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return { valid: true, detectedMime: 'application/pdf' };
    }

    return { 
      valid: false, 
      error: `Unsupported or spoofed file signature. Only standard PDF, JPEG, PNG, and WEBP documents are permitted.` 
    };
  }

  /**
   * Encrypts and saves document in private vault, persisting metadata to database
   */
  public async storeDocument(params: DocumentUploadParams): Promise<DocumentRecord> {
    const magicCheck = this.validateMagicBytes(params.buffer, params.mimeType);
    if (!magicCheck.valid) {
      throw new Error(magicCheck.error || 'Invalid file format');
    }

    const docId = crypto.randomUUID();
    const sha256Hash = crypto.createHash('sha256').update(params.buffer).digest('hex');

    // AES-256-GCM authenticated encryption
    const iv = crypto.randomBytes(12); // 96-bit IV standard for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(params.buffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Sanitized storage filename inside private vault
    const storageFilename = `${docId}.enc`;
    const absolutePath = path.join(this.vaultDirectory, storageFilename);

    fs.writeFileSync(absolutePath, encrypted, { mode: 0o600 });

    const mimeToSave = magicCheck.detectedMime || params.mimeType;

    // Database insertion
    const db = dbInstance.getDatabase();
    db.prepare(`
      INSERT INTO documents (
        id, uploader_id, entity_type, entity_id, document_type,
        storage_path, file_mime_type, file_size_bytes, original_filename,
        sha256_hash, encryption_iv, encryption_tag, is_verified, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
    `).run(
      docId,
      params.uploaderId,
      params.entityType,
      params.entityId,
      params.documentType,
      storageFilename,
      mimeToSave,
      params.buffer.length,
      params.originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_'),
      sha256Hash,
      iv.toString('hex'),
      authTag.toString('hex')
    );

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, after_state)
      VALUES (?, ?, 'DOCUMENT_UPLOADED', 'DOCUMENT', ?, ?)
    `).run(
      crypto.randomUUID(),
      params.uploaderId,
      docId,
      JSON.stringify({
        docId,
        documentType: params.documentType,
        sizeBytes: params.buffer.length,
        sha256: sha256Hash,
        mime: mimeToSave
      })
    );

    return this.getDocumentRecord(docId)!;
  }

  /**
   * Retrieves document metadata record
   */
  public getDocumentRecord(docId: string): DocumentRecord | null {
    const db = dbInstance.getDatabase();
    const row = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId) as DocumentRecord | undefined;
    return row || null;
  }

  /**
   * Authorizes caller and decrypts document contents
   */
  public async retrieveDocument(
    docId: string, 
    callerUserId: string, 
    callerRoles: string[]
  ): Promise<{ buffer: Buffer; mimeType: string; originalFilename: string }> {
    const record = this.getDocumentRecord(docId);
    if (!record) {
      throw new Error('Document not found');
    }

    // Authorization: owner or Admin
    const isAdmin = callerRoles.includes('ADMIN') || callerRoles.includes('SUPER_ADMIN');
    const isOwner = record.uploader_id === callerUserId;

    if (!isAdmin && !isOwner) {
      throw new Error('Unauthorized: You do not have permission to access this document');
    }

    const encryptedPath = path.join(this.vaultDirectory, record.storage_path);
    if (!fs.existsSync(encryptedPath)) {
      throw new Error('Encrypted document file is missing from vault');
    }

    const encryptedBuffer = fs.readFileSync(encryptedPath);
    const iv = Buffer.from(record.encryption_iv, 'hex');
    const authTag = Buffer.from(record.encryption_tag, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);

    // Verify SHA-256 integrity
    const computedHash = crypto.createHash('sha256').update(decrypted).digest('hex');
    if (computedHash !== record.sha256_hash) {
      throw new Error('Document integrity violation: Decrypted hash does not match recorded SHA-256');
    }

    // Audit log access
    const db = dbInstance.getDatabase();
    db.prepare(`
      INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, after_state)
      VALUES (?, ?, 'DOCUMENT_ACCESSED', 'DOCUMENT', ?, ?)
    `).run(
      crypto.randomUUID(),
      callerUserId,
      docId,
      JSON.stringify({ accessedBy: callerUserId, isAdmin, accessedAt: new Date().toISOString() })
    );

    return {
      buffer: decrypted,
      mimeType: record.file_mime_type,
      originalFilename: record.original_filename
    };
  }

  /**
   * Safe deletion if not yet officially verified
   */
  public deleteDocument(docId: string, callerUserId: string, callerRoles: string[]): boolean {
    const record = this.getDocumentRecord(docId);
    if (!record) return false;

    const isAdmin = callerRoles.includes('ADMIN') || callerRoles.includes('SUPER_ADMIN');
    const isOwner = record.uploader_id === callerUserId;

    if (!isAdmin && !isOwner) {
      throw new Error('Unauthorized to delete this document');
    }

    if (record.is_verified === 1) {
      throw new Error('Cannot delete an officially verified compliance document');
    }

    const encryptedPath = path.join(this.vaultDirectory, record.storage_path);
    if (fs.existsSync(encryptedPath)) {
      fs.unlinkSync(encryptedPath);
    }

    const db = dbInstance.getDatabase();
    db.prepare('DELETE FROM documents WHERE id = ?').run(docId);

    db.prepare(`
      INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, after_state)
      VALUES (?, ?, 'DOCUMENT_DELETED', 'DOCUMENT', ?, ?)
    `).run(
      crypto.randomUUID(),
      callerUserId,
      docId,
      JSON.stringify({ deletedBy: callerUserId, at: new Date().toISOString() })
    );

    return true;
  }

  /**
   * Lists documents uploaded by an applicant
   */
  public getApplicantDocuments(uploaderId: string): DocumentRecord[] {
    const db = dbInstance.getDatabase();
    return db.prepare('SELECT id, uploader_id, entity_type, entity_id, document_type, file_mime_type, file_size_bytes, original_filename, sha256_hash, is_verified, verification_notes, created_at FROM documents WHERE uploader_id = ? ORDER BY created_at DESC').all(uploaderId) as unknown as DocumentRecord[];
  }
}
