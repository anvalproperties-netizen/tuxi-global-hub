import React from 'react';
import { FileText, X, Scale, ShieldCheck, CheckCircle2, AlertOctagon } from 'lucide-react';

interface TermsOfServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TermsOfServiceModal: React.FC<TermsOfServiceModalProps> = ({
  isOpen,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden text-xs">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-600 text-white">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base">TUXI Terms of Service &amp; User Agreement</h2>
              <p className="text-[11px] text-slate-300">
                Governing marketplace purchases, restaurant orders, delivery courier services, and merchant operations
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

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-700 leading-relaxed">
          
          <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-800 text-xs">
            <span className="font-bold block mb-1">Last Updated: September 2026</span>
            <span>
              By downloading, testing, accessing, or using the TUXI application on the Apple App Store, Google Play Store, Microsoft Store, or Web, you agree to be bound by these Terms of Service.
            </span>
          </div>

          {/* Section 1 */}
          <section className="space-y-2">
            <h3 className="font-bold text-sm text-slate-900">1. Marketplace Platform Services</h3>
            <p>
              TUXI operates a technology marketplace connecting independent consumers, retail shops, restaurants (&quot;Merchants&quot;), independent delivery contractors (&quot;Couriers&quot;), and community territory representatives (&quot;Reps&quot;). TUXI does not prepare food or manufacture retail products; all restaurant items are prepared by their respective merchant operators.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-2">
            <h3 className="font-bold text-sm text-slate-900">2. Customer Orders, Group Splitting &amp; Payments</h3>
            <ul className="list-disc pl-5 space-y-1 text-slate-600">
              <li><strong>Payment Authorizations:</strong> All orders are authorized and charged via PCI-DSS compliant payment tokens upon checkout confirmation or biometric passkey verification.</li>
              <li><strong>Group Orders:</strong> When participating in an automated group order session, each member authorizes charges according to the designated split mode (&quot;by items&quot;, &quot;equal split&quot;, or &quot;host pays&quot;).</li>
              <li><strong>Pricing &amp; Delivery Fees:</strong> Delivery fees and applicable service fees are visibly disclosed before payment authorization.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-2">
            <h3 className="font-bold text-sm text-slate-900">3. Cancellations &amp; Refund Policy</h3>
            <p>
              Customers may cancel an order free of charge prior to the merchant initiating preparation. Once preparation begins or a driver is dispatched, cancellations are subject to costs incurred. In the event of missing items or damaged goods, claims can be submitted through the in-app AI Support Assistant within 48 hours for immediate credit or refund.
            </p>
          </section>

          {/* Section 4: Driver & Courier Independent Contractor Standards */}
          <section className="space-y-2">
            <h3 className="font-bold text-sm text-slate-900">4. Independent Delivery Couriers &amp; Road Safety</h3>
            <p>
              Couriers provide delivery services as independent contractors. Couriers are required to hold valid vehicle licenses, motor insurance, and submit verified background checks. Couriers must adhere to local road traffic safety regulations and maintain temperature-controlled insulated delivery bags.
            </p>
          </section>

          {/* Section 5: Age Restrictions */}
          <section className="space-y-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-950">
            <h3 className="font-bold text-sm flex items-center gap-1.5">
              <AlertOctagon className="w-4 h-4 text-amber-600" />
              <span>5. Age Verification &amp; Regulated Goods</span>
            </h3>
            <p className="text-xs">
              Certain items offered on the marketplace (e.g. alcoholic beverages, age-restricted pharmaceuticals) require recipients to be at least 18 or 21 years of age (dependent on local jurisdiction). Couriers are required to verify government-issued photo identification prior to physical handoff.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-2">
            <h3 className="font-bold text-sm text-slate-900">6. Merchant Compliance &amp; Food Hygiene</h3>
            <p>
              Merchants onboarding to TUXI certify that they hold valid municipal business licenses, health department approvals, and adhere strictly to food hygiene standards. Merchant inventory synced via POS (Square, Clover, Toast, etc.) must accurately reflect available items.
            </p>
          </section>

          {/* Section 7: Governing Law */}
          <section className="space-y-1 text-slate-500 text-[11px] pt-2 border-t border-slate-200">
            <span className="font-bold text-slate-700 block">7. Governing Law &amp; Jurisdiction</span>
            <span>These Terms are governed by the laws of England and Wales (for European operations) and the State of Delaware (for International operations), without regard to conflict of laws principles.</span>
          </section>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <span className="text-[11px] text-slate-500">
            Apple App Store, Google Play &amp; Microsoft Store Testing Approved
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-colors"
          >
            I Accept Terms
          </button>
        </div>

      </div>
    </div>
  );
};
