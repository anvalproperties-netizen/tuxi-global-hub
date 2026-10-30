import React from 'react';
import { ShieldCheck, X, Lock, CheckCircle2, AlertCircle, Trash2, ArrowUpRight, FileCheck } from 'lucide-react';

interface DataSafetyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAccountDeletion?: () => void;
}

export const DataSafetyModal: React.FC<DataSafetyModalProps> = ({
  isOpen,
  onClose,
  onOpenAccountDeletion
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden text-xs">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-600 text-white">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base">Store Data Safety &amp; Nutrition Label</h2>
                <span className="px-2 py-0.5 rounded font-mono text-[9px] font-bold uppercase bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                  PLAY STORE &amp; APPLE VERIFIED
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Official Google Play Data Safety Section &amp; Apple Privacy Nutrition Labels declaration
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-700 leading-relaxed">
          
          {/* Quick Safety Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
              <div className="flex items-center gap-2 text-emerald-800 font-bold">
                <Lock className="w-4 h-4 text-emerald-600" />
                <span>Encrypted in Transit</span>
              </div>
              <p className="text-[11px] text-emerald-950">
                All data is transferred over an audited, secure HTTPS connection with TLS 1.3 protocol.
              </p>
            </div>

            <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl space-y-1">
              <div className="flex items-center gap-2 text-indigo-800 font-bold">
                <Trash2 className="w-4 h-4 text-indigo-600" />
                <span>Data Deletion Available</span>
              </div>
              <p className="text-[11px] text-indigo-950">
                Users can request immediate erasure of their account and all associated personal data from within the app.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="flex items-center gap-2 text-slate-800 font-bold">
                <FileCheck className="w-4 h-4 text-slate-600" />
                <span>No Data Sold</span>
              </div>
              <p className="text-[11px] text-slate-600">
                TUXI never sells, rents, or monetizes personal data or location coordinates to third-party data brokers.
              </p>
            </div>
          </div>

          {/* Data Category Breakdown Table */}
          <div className="space-y-3">
            <h3 className="font-bold text-sm text-slate-900">Data Types Collected &amp; Purposes</h3>

            <div className="space-y-2.5">
              {[
                {
                  category: 'Location (Approximate & Precise)',
                  collected: true,
                  shared: true,
                  purpose: 'Order delivery dispatch, live courier tracking radar, dynamic surge pricing, and road safety navigation.',
                  retention: 'Retained during active order lifecycle; archived GPS breadcrumbs pseudonymized after 30 days.'
                },
                {
                  category: 'Personal Info (Name, Email, Phone, Address)',
                  collected: true,
                  shared: false,
                  purpose: 'Account authentication, delivery address verification, order receipts, and customer support inquiries.',
                  retention: 'Retained while account remains active or until self-service deletion is requested.'
                },
                {
                  category: 'Financial Info (Payment Tokens & Transaction History)',
                  collected: true,
                  shared: true,
                  purpose: 'Processing customer purchases, driver payouts, and group order payment splits via Stripe tokenization.',
                  retention: 'Raw card numbers are never stored; PCI-DSS compliant payment tokens retained for re-orders.'
                },
                {
                  category: 'Photos & Documents (Proof of Delivery, Business Licenses)',
                  collected: true,
                  shared: false,
                  purpose: 'Courier contactless dropoff verification, merchant food hygiene licensing, and driver vehicle checks.',
                  retention: 'Encrypted in secure Cloud Storage; delivery photos purged after 60 days.'
                },
                {
                  category: 'App Diagnostics & Performance (Crash Logs)',
                  collected: true,
                  shared: false,
                  purpose: 'Monitoring app stability, offline service worker synchronization, and performance optimization.',
                  retention: 'Aggregated, non-identifiable telemetry purged every 90 days.'
                }
              ].map((item, idx) => (
                <div key={idx} className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 space-y-1.5 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className="font-bold text-slate-900 text-xs">{item.category}</span>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        Collected
                      </span>
                      {item.shared ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          Shared with Couriers/Merchants
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          Not Shared with 3rd Parties
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600"><strong>Purpose:</strong> {item.purpose}</p>
                  <p className="text-[10px] text-slate-400 font-mono"><strong>Retention:</strong> {item.retention}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Action Row */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <span className="font-bold text-slate-900 block">Manage or Delete Your Stored Data</span>
              <span className="text-slate-500 text-[11px]">Request an instant export of your data or permanently delete your account.</span>
            </div>

            {onOpenAccountDeletion && (
              <button
                onClick={() => {
                  onClose();
                  onOpenAccountDeletion();
                }}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg transition-colors shrink-0 flex items-center gap-1.5 shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Account Deletion Portal</span>
              </button>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <span className="text-[11px] text-slate-500">
            Complies with Google Play Data Safety &amp; Apple Privacy Nutrition Labels
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
