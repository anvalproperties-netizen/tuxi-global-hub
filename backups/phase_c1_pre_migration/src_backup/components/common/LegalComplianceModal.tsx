import React, { useState } from 'react';
import { useTuxi } from '../../context/TuxiContext';
import { 
  ShieldCheck, 
  FileText, 
  Trash2, 
  Lock, 
  CheckCircle, 
  AlertCircle, 
  X, 
  ExternalLink,
  UserCheck,
  Scale
} from 'lucide-react';

interface LegalComplianceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LegalComplianceModal: React.FC<LegalComplianceModalProps> = ({ isOpen, onClose }) => {
  const { legalCompliance, toggleDoNotSellCCPA, togglePOPIAConsent, requestDataDeletion, config } = useTuxi();
  const [activeTab, setActiveTab] = useState<'popia' | 'ccpa' | 'deletion'>('popia');
  const [deletionEmail, setDeletionEmail] = useState<string>('emma.watson@example.com');
  const [deletionSuccess, setDeletionSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleDeletionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletionEmail.trim()) return;
    requestDataDeletion(deletionEmail);
    setDeletionSuccess(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-5 text-xs text-slate-800 animate-fade-in my-8">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-700">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Legal, Privacy &amp; Regulatory Compliance</h2>
              <p className="text-[11px] text-slate-500">Statutory protection under POPIA (South Africa) and CCPA (California/US)</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-700 p-1 rounded-md"
            title="Close legal modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2 font-semibold">
          <button
            onClick={() => setActiveTab('popia')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'popia' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>South Africa (POPIA Clause)</span>
          </button>
          <button
            onClick={() => setActiveTab('ccpa')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'ccpa' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>California/US (CCPA Clause)</span>
          </button>
          <button
            onClick={() => setActiveTab('deletion')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'deletion' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
            <span>Request Data Deletion ({legalCompliance.dataDeletionRequests.length})</span>
          </button>
        </div>

        {/* TAB 1: POPIA (SOUTH AFRICA) */}
        {activeTab === 'popia' && (
          <div className="space-y-4 leading-relaxed">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950 flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-xs block">Protection of Personal Information Act (POPIA) Notice</span>
                <p className="text-[11px] text-emerald-900 mt-0.5">
                  TUXI is fully registered with the Information Regulator of South Africa. We enforce end-to-end cryptographic protection over all sensitive records.
                </p>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3 text-[11px] text-slate-700">
              <h4 className="font-bold text-slate-900 text-xs">POPIA Statutory Declaration:</h4>
              <p>
                <strong>1. Driver Biometric Data &amp; Selfies:</strong> In compliance with POPIA Section 26 (Special Personal Information), driver facial biometric scans and real-time liveness selfies are collected strictly for anti-impersonation security, anti-fraud defense, and passenger physical safety. Biometric signatures are salted, hashed, and never repurposed for commercial profiling.
              </p>
              <p>
                <strong>2. Professional Driving Permits (PrDP):</strong> South African driver PrDP details, driver licenses, and criminal record verification certificates are validated via authorized statutory conduits. Records are stored in encrypted vaults and made available only to certified safety auditors.
              </p>
              <p>
                <strong>3. Real-Time Route History &amp; GPS Telemetry:</strong> Customer drop-off coordinates and live GPS transit logs are processed exclusively to fulfill delivery contracts, calculate distance-based fares, and provide emergency SOS telemetry.
              </p>
            </div>

            <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl">
              <div>
                <span className="font-bold text-slate-900 block text-xs">POPIA Data Processing Verification</span>
                <span className="text-slate-500 text-[11px]">Enforce lawful justification under POPIA Condition 2.</span>
              </div>
              <button
                onClick={() => togglePOPIAConsent(!legalCompliance.popiaConsentAccepted)}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-colors ${
                  legalCompliance.popiaConsentAccepted
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {legalCompliance.popiaConsentAccepted ? '✓ POPIA Compliant' : 'Acknowledge Notice'}
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: CCPA (CALIFORNIA / US) */}
        {activeTab === 'ccpa' && (
          <div className="space-y-4 leading-relaxed">
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-950 flex items-start gap-2.5">
              <Lock className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-xs block">California Consumer Privacy Act (CCPA/CPRA) Disclosure</span>
                <p className="text-[11px] text-indigo-900 mt-0.5">
                  Notice to California consumers (including Los Angeles, San Francisco, and San Diego users).
                </p>
              </div>
            </div>

            {/* Do Not Sell My Personal Information Toggle (Mandatory) */}
            <div className="flex items-center justify-between p-4 bg-slate-900 text-white rounded-xl">
              <div>
                <span className="font-bold text-sm block">Do Not Sell or Share My Personal Information</span>
                <span className="text-slate-400 text-[11px]">
                  Opt-out of third-party behavioral targeting and cross-context advertising.
                </span>
              </div>
              <button
                onClick={() => toggleDoNotSellCCPA(!legalCompliance.doNotSellMyDataCCPA)}
                className={`px-4 py-2 rounded-lg font-bold text-xs transition-all ${
                  legalCompliance.doNotSellMyDataCCPA
                    ? 'bg-emerald-500 text-slate-950 shadow-md font-mono'
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                }`}
              >
                {legalCompliance.doNotSellMyDataCCPA ? '✓ Opted Out (Data Not Sold)' : 'Opt Out Now'}
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3 text-[11px] text-slate-700">
              <h4 className="font-bold text-slate-900 text-xs">Mandatory Third-Party Disclosure:</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-900 block">Checkr Inc.</span>
                  <span className="text-slate-500 text-[10px] block mt-1">Background Screening API</span>
                  <p className="text-[10px] text-slate-600 mt-1">
                    Motor vehicle records (MVR), felony records, and identity check verification.
                  </p>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-900 block">Stripe Inc.</span>
                  <span className="text-slate-500 text-[10px] block mt-1">PCI-DSS Payment Processor</span>
                  <p className="text-[10px] text-slate-600 mt-1">
                    Credit/debit card tokenization, direct driver bank payouts, fraud radar.
                  </p>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-900 block">PayPal &amp; Digital Wallets</span>
                  <span className="text-slate-500 text-[10px] block mt-1">Wallet Settlements</span>
                  <p className="text-[10px] text-slate-600 mt-1">
                    Encrypted Apple Pay, Google Pay, and PayPal checkout settlements.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: REQUEST ABSOLUTE DATA DELETION */}
        {activeTab === 'deletion' && (
          <div className="space-y-4">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-950 flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-xs block">Right to Erasure &amp; Complete Account Purge</span>
                <p className="text-[11px] text-rose-900 mt-0.5">
                  Under POPIA Section 24 and CCPA Section 1798.105, you have the right to request deletion of all personal identifiers, addresses, and order history.
                </p>
              </div>
            </div>

            {deletionSuccess ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950 text-center space-y-2">
                <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto" />
                <h4 className="font-bold text-sm">Deletion Request Dispatched</h4>
                <p className="text-xs text-emerald-800 max-w-md mx-auto">
                  Your request for <strong>{deletionEmail}</strong> has been logged. Under statutory schedules, all non-tax transactional records will be completely expunged within 30 days.
                </p>
                <button
                  onClick={() => setDeletionSuccess(false)}
                  className="px-3 py-1 bg-emerald-700 text-white rounded text-xs font-semibold"
                >
                  Submit Another Request
                </button>
              </div>
            ) : (
              <form onSubmit={handleDeletionSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Registered Account Email for Deletion Verification *
                  </label>
                  <input
                    type="email"
                    required
                    value={deletionEmail}
                    onChange={e => setDeletionEmail(e.target.value)}
                    placeholder="Enter account email..."
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-600">
                  ⚠️ Note: Tax and VAT transaction receipts will be archived for statutory accounting compliance before automated deletion occurs on the 30-day purge cycle.
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Submit Data Deletion &amp; Account Erasure Request</span>
                </button>
              </form>
            )}

            {/* List of active deletion tickets */}
            {legalCompliance.dataDeletionRequests.length > 0 && (
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <span className="font-bold text-slate-700 text-xs block">Active Deletion Logs:</span>
                {legalCompliance.dataDeletionRequests.map(req => (
                  <div key={req.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-[11px]">
                    <div>
                      <span className="font-semibold text-slate-900">{req.userEmail}</span>
                      <span className="text-slate-400 block text-[10px]">Requested: {new Date(req.requestedAt).toLocaleDateString()}</span>
                    </div>
                    <span className="font-mono text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-bold uppercase text-[10px]">
                      Scheduled Purge: {req.retentionPurgeDate}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span>Active Jurisdiction: {config.activeCountry} ({config.activeCityName})</span>
          <button onClick={onClose} className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold">
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
