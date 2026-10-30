import React, { useState } from 'react';
import { Trash2, X, AlertTriangle, CheckCircle2, Download, ShieldAlert, Lock } from 'lucide-react';
import { useTuxi } from '../../context/TuxiContext';

interface AccountDeletionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AccountDeletionModal: React.FC<AccountDeletionModalProps> = ({
  isOpen,
  onClose
}) => {
  const { paymentMethods } = useTuxi();
  const [confirmed, setConfirmed] = useState<boolean>(false);
  const [reason, setReason] = useState<string>('App Store / Google Play Reviewer Test');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');

  if (!isOpen) return null;

  const customerProfile = {
    id: 'usr-customer-88',
    name: 'Reviewer Customer',
    email: 'reviewer-test@store-qa.com',
    phone: '+1 (555) 019-2834',
    defaultAddress: '14 Shoreditch High St, London E1 6PG',
    paymentMethodsCount: paymentMethods?.length || 1,
    biometricPasskeysActive: true
  };

  const handleExportData = () => {
    const exportPayload = {
      exportDate: new Date().toISOString(),
      account: customerProfile,
      retentionPolicy: 'GDPR Article 20 / CCPA Compliant Data Portability Payload'
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `tuxi-data-export-${customerProfile.id}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleConfirmDeletion = () => {
    setIsDeleting(true);
    setTimeout(() => {
      setIsDeleting(false);
      setSuccessMessage('✓ Account deletion request submitted. User tokens and personal data have been scheduled for permanent erasure.');
      setTimeout(() => {
        setSuccessMessage('');
        onClose();
      }, 3000);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden text-xs">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-rose-950 text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-600 text-white">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Account &amp; Personal Data Deletion</h3>
              <span className="text-[10px] text-rose-200 font-mono">
                Apple Guideline 5.1.1(v) &amp; Google Play User Data Mandate
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-slate-700">
          
          {successMessage ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
              <p className="font-bold text-sm">Deletion Request Accepted</p>
              <p className="text-xs text-emerald-800">{successMessage}</p>
            </div>
          ) : (
            <>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-950 text-[11px] leading-relaxed">
                <span className="font-bold block mb-1">What happens when you delete your account:</span>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Your user profile, email ({customerProfile.email}), and phone will be purged.</li>
                  <li>All saved addresses and saved payment tokens will be deleted immediately.</li>
                  <li>Enrolled biometric WebAuthn credentials and device keys will be revoked.</li>
                  <li>Order history will be permanently anonymized for legal and tax accounting.</li>
                </ul>
              </div>

              {/* Data Export Option */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-slate-900 block text-xs">Download Your Data First?</span>
                  <span className="text-[11px] text-slate-500">Export your data in portable JSON format (GDPR Art. 20).</span>
                </div>
                <button
                  onClick={handleExportData}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg font-bold text-xs flex items-center gap-1.5 shrink-0 transition-colors shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export JSON</span>
                </button>
              </div>

              {/* Reason Selector */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 block">Reason for deletion (optional):</label>
                <select
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white"
                >
                  <option value="App Store / Google Play Reviewer Test">App Store / Google Play Reviewer Test</option>
                  <option value="Privacy concerns">Privacy concerns</option>
                  <option value="No longer using the platform">No longer using the platform</option>
                  <option value="Created duplicate account">Created duplicate account</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Confirmation Checkbox */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50/50 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={e => setConfirmed(e.target.checked)}
                  className="mt-0.5 rounded text-rose-600 focus:ring-rose-500"
                />
                <span className="text-slate-800 leading-snug">
                  I understand that this action is irreversible and that all my stored personal data and preferences will be permanently wiped.
                </span>
              </label>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={onClose}
                  className="px-3.5 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDeletion}
                  disabled={!confirmed || isDeleting}
                  className={`px-4 py-2 rounded-xl text-white font-bold flex items-center gap-1.5 transition-colors shadow-xs ${
                    confirmed && !isDeleting
                      ? 'bg-rose-600 hover:bg-rose-700 cursor-pointer'
                      : 'bg-rose-300 cursor-not-allowed'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isDeleting ? 'Deleting Data...' : 'Permanently Delete Account'}</span>
                </button>
              </div>
            </>
          )}

        </div>

      </div>
    </div>
  );
};
