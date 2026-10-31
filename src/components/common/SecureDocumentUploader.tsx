import React, { useState, useRef } from 'react';
import { Upload, CheckCircle2, AlertCircle, FileText, Lock, Eye, Trash2 } from 'lucide-react';

interface SecureDocumentUploaderProps {
  label: string;
  documentType: 'ID_DOCUMENT' | 'PROOF_OF_RESIDENCE' | 'DRIVER_SELFIE' | 'DRIVER_TRANSPORT_SELFIE' | 'DRIVERS_LICENSE' | 'VEHICLE_ROADWORTHY' | 'PAYLOAD_CERTIFICATE';
  entityType: 'REP_APPLICATION' | 'DRIVER_APPLICATION';
  entityId: string;
  helperText?: string;
  uploadedDocId?: string;
  onUploadSuccess: (docId: string, filename: string) => void;
  onDeleteSuccess?: () => void;
  required?: boolean;
}

export const SecureDocumentUploader: React.FC<SecureDocumentUploaderProps> = ({
  label,
  documentType,
  entityType,
  entityId,
  helperText,
  uploadedDocId,
  onUploadSuccess,
  onDeleteSuccess,
  required = false
}) => {
  const [docId, setDocId] = useState<string | undefined>(uploadedDocId);
  const [docName, setDocName] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);

    // Validate size (10 MB max)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File exceeds 10 MB limit');
      return;
    }

    // Validate type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      setUploadError('Only PDF, JPG, PNG, and WEBP files are accepted');
      return;
    }

    setIsUploading(true);

    try {
      const token = localStorage.getItem('tuxi_auth_token');
      if (!token) throw new Error('Unauthenticated');

      // Read file into base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          // Strip data url prefix
          const base64Data = result.split(',')[1] || result;
          resolve(base64Data);
        };
        reader.onerror = reject;
      });

      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          entityType,
          entityId: entityId || 'pending-submission',
          documentType,
          originalFilename: file.name,
          base64Data,
          mimeType: file.type
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Document upload failed');
      }

      const result = await res.json();
      setDocId(result.document.id);
      setDocName(file.name);
      onUploadSuccess(result.document.id, file.name);
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePreview = async () => {
    if (!docId) return;
    try {
      const token = localStorage.getItem('tuxi_auth_token');
      const res = await fetch(`/api/documents/${docId}/preview`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to retrieve preview');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err: any) {
      setUploadError('Unable to preview document');
    }
  };

  const handleDelete = async () => {
    if (!docId) return;
    try {
      const token = localStorage.getItem('tuxi_auth_token');
      const res = await fetch(`/api/documents/${docId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Deletion failed');
      setDocId(undefined);
      setDocName('');
      if (onDeleteSuccess) onDeleteSuccess();
    } catch (err: any) {
      setUploadError(err.message || 'Failed to delete document');
    }
  };

  return (
    <div className="space-y-1.5 text-left">
      <div className="flex items-center justify-between">
        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
        <span className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
          <Lock className="w-2.5 h-2.5 text-emerald-500" />
          <span>AES-256 Vault</span>
        </span>
      </div>

      {helperText && (
        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
          {helperText}
        </p>
      )}

      {uploadError && (
        <div className="flex items-center gap-1.5 p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-[11px]">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {docId ? (
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60">
          <div className="flex items-center gap-2 truncate">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="truncate">
              <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-200 block truncate">
                {docName || 'Encrypted Vault Document'}
              </span>
              <span className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 font-mono">
                Stored &amp; Encrypted at Rest
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button
              type="button"
              onClick={handlePreview}
              className="p-1.5 rounded-lg text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
              title="Preview decrypted document"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="p-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors"
              title="Delete and re-upload"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={handleFileChange}
            disabled={isUploading}
            className="hidden"
            id={`file-upload-${documentType}`}
          />
          <label
            htmlFor={`file-upload-${documentType}`}
            className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed transition-all cursor-pointer text-xs font-medium ${
              isUploading
                ? 'border-indigo-400 bg-indigo-50/40 text-indigo-700 dark:text-indigo-300'
                : 'border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 bg-slate-50/60 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300'
            }`}
          >
            {isUploading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <span>Encrypting &amp; Vaulting...</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />
                <span>Select Document (PDF, JPG, PNG)</span>
              </>
            )}
          </label>
        </div>
      )}
    </div>
  );
};
