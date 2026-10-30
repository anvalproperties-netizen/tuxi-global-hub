import React from 'react';
import { Shield, X, Lock, MapPin, Eye, FileText, CheckCircle2, UserCheck, AlertTriangle } from 'lucide-react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAccountDeletion?: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({
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
            <div className="p-2 rounded-xl bg-indigo-600 text-white">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base">TUXI Global Privacy &amp; Data Policy</h2>
              <p className="text-[11px] text-slate-300">
                Compliant with Apple App Store (5.1.1), Google Play Data Safety, Microsoft Store, GDPR, and CCPA
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

        {/* Scrollable Policy Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-700 leading-relaxed">
          
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-950 text-xs">
            <span className="font-bold block mb-1">Effective Date: September 2026 · Version 2.4</span>
            <span>
              This Privacy Policy explains how TUXI Global Marketplace (&quot;TUXI&quot;, &quot;we&quot;, &quot;us&quot;) collects, processes, encrypts, and retains personal data when you use the TUXI Eats, TUXI Shop, TUXI Courier, and Merchant Partner platforms.
            </span>
          </div>

          {/* Section 1 */}
          <section className="space-y-2">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">1</span>
              <span>Information We Collect &amp; Legal Bases</span>
            </h3>
            <p>
              We collect information to operate the marketplace, deliver orders, process secure payments, and prevent fraud:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
              <li><strong>Contact &amp; Account Details:</strong> Name, verified email address, phone number, and physical delivery addresses.</li>
              <li><strong>Precise Geolocation Data:</strong> High-precision GPS coordinates during active order transit (see Section 2 for Driver Background Location disclosure).</li>
              <li><strong>Financial &amp; Payment Data:</strong> Payment card tokens via PCI-DSS compliant vaulting (Stripe / Apple Pay / Google Pay). Card numbers never touch our servers directly.</li>
              <li><strong>Biometric Credentials:</strong> WebAuthn Passkeys (Face ID / Touch ID / Windows Hello) for high-value transaction authorizations. Biometric sensor data remains exclusively inside your device&apos;s Secure Enclave; TUXI never receives raw biometric data.</li>
              <li><strong>Documents &amp; Photos:</strong> Courier proof-of-delivery photos, merchant food hygiene licenses, and tax certificates submitted during onboarding.</li>
            </ul>
          </section>

          {/* Section 2: Precise Location & Google Play Background Location Disclosure */}
          <section className="space-y-2 p-4 bg-amber-50/80 border border-amber-200 rounded-xl">
            <h3 className="font-bold text-sm text-amber-950 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-amber-600" />
              <span>2. Special Disclosure: Courier &amp; Driver Location Tracking</span>
            </h3>
            <p className="text-amber-900 text-xs">
              <strong>Prominent In-App Disclosure (Google Play &amp; Apple Guideline):</strong>
            </p>
            <p className="text-amber-900">
              TUXI collects location data from active delivery couriers to enable real-time order tracking for customers, compute fuel-efficient route navigation, and calculate live ETAs, <strong>even when the app is running in the background or when the screen is locked</strong>.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-amber-900 text-[11px]">
              <li><strong>State 1 (Driver Offline):</strong> Zero location tracking is performed. 0% battery consumption.</li>
              <li><strong>State 2 (Looking for Orders):</strong> Low-power distance filter mode (50-meter threshold) to preserve device battery.</li>
              <li><strong>State 3 (Trip Active):</strong> High-precision 5-second location pings for passenger/courier safety and precise live GPS radar.</li>
            </ul>
          </section>

          {/* Section 3: Data Security & Encryption */}
          <section className="space-y-2">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">3</span>
              <span>Data Protection &amp; Technical Safeguards</span>
            </h3>
            <p>
              TUXI employs enterprise-grade cryptographic security measures:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="font-bold block text-slate-900">TLS 1.3 In-Transit</span>
                <span className="text-slate-500">All network traffic encrypted with forward-secrecy HTTPS protocols.</span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="font-bold block text-slate-900">AES-256 At-Rest</span>
                <span className="text-slate-500">Databases and backups encrypted using industry-standard AES-256 keys.</span>
              </div>
            </div>
          </section>

          {/* Section 4: Third-Party Processors */}
          <section className="space-y-2">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">4</span>
              <span>Third-Party Sub-Processors</span>
            </h3>
            <p>
              We share data strictly with audited third-party service providers necessary to fulfill your orders:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-600">
              <li><strong>Google Maps Platform:</strong> Live routing, geolocation, and address geocoding (Google LLC).</li>
              <li><strong>Payment Processors:</strong> Stripe, Inc. / Apple Pay / Google Pay for PCI-DSS compliant payment processing.</li>
              <li><strong>Cloud Infrastructure:</strong> Google Cloud Platform (EU &amp; Global regions) with strict regional data residency.</li>
            </ul>
          </section>

          {/* Section 5: User Rights & Account Deletion */}
          <section className="space-y-3 p-4 bg-slate-100 rounded-xl border border-slate-200">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-indigo-600" />
              <span>5. Your Rights &amp; Self-Service Account Deletion (Apple 5.1.1(v) &amp; Google Play)</span>
            </h3>
            <p className="text-slate-600">
              Under GDPR, CCPA, and App Store regulations, you have the right to access, rectify, export, or permanently delete your account and personal data at any time directly within the app.
            </p>

            {onOpenAccountDeletion && (
              <div className="pt-2">
                <button
                  onClick={() => {
                    onClose();
                    onOpenAccountDeletion();
                  }}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Request Account &amp; Data Deletion</span>
                </button>
              </div>
            )}
          </section>

          {/* Contact Details */}
          <section className="space-y-1 text-slate-500 text-[11px] pt-2 border-t border-slate-200">
            <span className="font-bold text-slate-700 block">Data Protection Officer &amp; Contact:</span>
            <span>TUXI Global Data Protection Office · Email: privacy@tuxi-marketplace.com</span>
            <span className="block">Riosol Holdings Ltd · 14 Shoreditch High St, London E1 6PG, UK</span>
          </section>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <span className="text-[11px] text-slate-500">
            Last Reviewed for App Store, Google Play &amp; Microsoft Store Compliance
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-colors"
          >
            Acknowledge &amp; Close
          </button>
        </div>

      </div>
    </div>
  );
};
