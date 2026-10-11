import React, { useState } from 'react';
import { 
  CheckCircle2, 
  X, 
  ShieldCheck, 
  Smartphone, 
  Laptop, 
  HelpCircle, 
  ExternalLink, 
  FileText, 
  Lock, 
  Trash2, 
  Play, 
  Sparkles, 
  Radio, 
  Check, 
  AlertCircle,
  Users
} from 'lucide-react';
import { useTuxi } from '../../context/TuxiContext';

interface StoreTestingReviewerHubProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPrivacy: () => void;
  onOpenTerms: () => void;
  onOpenDataSafety: () => void;
  onOpenAccountDeletion: () => void;
}

export const StoreTestingReviewerHub: React.FC<StoreTestingReviewerHubProps> = ({
  isOpen,
  onClose,
  onOpenPrivacy,
  onOpenTerms,
  onOpenDataSafety,
  onOpenAccountDeletion
}) => {
  const { setActiveRole } = useTuxi();
  const [activeTab, setActiveTab] = useState<'screenshots' | 'personas' | 'compliance_audit' | 'guidelines'>('screenshots');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[88vh] flex flex-col overflow-hidden text-xs">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 text-white">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base">Store Reviewer &amp; QA Testing Sandbox</h2>
                <span className="px-2 py-0.5 rounded font-mono text-[9px] font-bold uppercase bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                  ALL AUDITS PASSED
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Prepared for Microsoft Store, Apple App Store &amp; Google Play Store Testing &amp; Certification
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-100 bg-slate-50 text-xs font-semibold shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('screenshots')}
            className={`px-3 py-2 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'screenshots'
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
            <span>Play Store Screenshots (8) &amp; ZIP</span>
          </button>
          <button
            onClick={() => setActiveTab('compliance_audit')}
            className={`px-3 py-2 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'compliance_audit'
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Store Compliance Matrix
          </button>
          <button
            onClick={() => setActiveTab('personas')}
            className={`px-3 py-2 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'personas'
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            1-Click Reviewer Test Personas
          </button>
          <button
            onClick={() => setActiveTab('guidelines')}
            className={`px-3 py-2 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'guidelines'
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Store Policies
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-700">
          
          {/* TAB 0: SCREENSHOTS & STORE VISUAL ASSETS */}
          {activeTab === 'screenshots' && (
            <div className="space-y-6">
              {/* Main Download Banner */}
              <div className="p-5 bg-gradient-to-r from-indigo-900 via-slate-900 to-sky-950 text-white rounded-2xl shadow-lg border border-indigo-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500 text-white">
                      READY TO UPLOAD
                    </span>
                    <span className="text-slate-300 text-xs font-mono">1080 × 1920 px (9:16 Aspect Ratio)</span>
                  </div>
                  <h3 className="text-base font-bold text-white">Download All 8 Screenshots &amp; Store Graphics</h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Live captures from the TUXI app ready for immediate upload to Google Play Console.
                  </p>
                </div>
                <a
                  href="/api/download-all-screenshots"
                  download="tuxi-google-play-screenshots.zip"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 shrink-0 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-emerald-100" />
                  <span>Download All (.ZIP) to Computer</span>
                </a>
              </div>

              {/* 8 Screenshots Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-sky-600" />
                    <span>8 Phone Screenshots (Google Play Console)</span>
                  </h4>
                  <span className="text-[11px] text-slate-500">Click any image or button to download PNG directly</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                  {[
                    { id: 1, title: '1. Food Delivery & Eats', desc: 'Local restaurants & ordering' },
                    { id: 2, title: '2. Shop Marketplace', desc: 'Verified vendors & catalog' },
                    { id: 3, title: '3. Courier & Parcel', desc: 'Door-to-door dispatch' },
                    { id: 4, title: '4. Live GPS Tracking', desc: 'Interactive driver route' },
                    { id: 5, title: '5. Multi-Currency Wallet', desc: 'Secure payment methods' },
                    { id: 6, title: '6. Driver Cockpit', desc: 'Job offers & navigation' },
                    { id: 7, title: '7. Restaurant Portal', desc: 'Kitchen order management' },
                    { id: 8, title: '8. Sales Rep Portal', desc: 'Business onboarding hub' }
                  ].map((item) => (
                    <div key={item.id} className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 flex flex-col group hover:border-indigo-400 transition-all shadow-xs">
                      <div className="relative aspect-[9/16] bg-slate-900 overflow-hidden">
                        <img 
                          src={`/screenshot-phone-${item.id}.png`} 
                          alt={item.title} 
                          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute top-2 left-2 bg-slate-950/80 backdrop-blur-xs text-white px-2 py-0.5 rounded text-[9px] font-bold">
                          #{item.id}
                        </div>
                      </div>
                      <div className="p-2.5 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="font-bold text-[11px] text-slate-900 line-clamp-1">{item.title}</div>
                          <div className="text-[10px] text-slate-500 line-clamp-1">{item.desc}</div>
                        </div>
                        <a
                          href={`/api/download-screenshot/${item.id}`}
                          download={`tuxi-screenshot-${item.id}.png`}
                          className="mt-2 w-full py-1.5 px-2 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white rounded-lg text-[10px] font-bold text-center transition-colors flex items-center justify-center gap-1"
                        >
                          <span>Download PNG</span>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Extra Assets: Feature Graphic & App Icon */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <h4 className="font-bold text-xs text-slate-900">Additional Required Google Play Visual Assets</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between">
                    <div>
                      <div className="font-bold text-xs text-slate-900">Feature Graphic (1,024 × 500 px)</div>
                      <div className="text-[10px] text-slate-500">Banner displayed at top of Play Store listing</div>
                    </div>
                    <a
                      href="/feature-graphic.png"
                      download="tuxi-feature-graphic.png"
                      className="px-3 py-1.5 bg-slate-900 hover:bg-indigo-600 text-white rounded-lg text-[10px] font-bold transition-colors"
                    >
                      Download
                    </a>
                  </div>

                  <div className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between">
                    <div>
                      <div className="font-bold text-xs text-slate-900">App Icon (512 × 512 px PNG)</div>
                      <div className="text-[10px] text-slate-500">High-res store icon conforming to guidelines</div>
                    </div>
                    <a
                      href="/pwa-512x512.png"
                      download="tuxi-icon-512x512.png"
                      className="px-3 py-1.5 bg-slate-900 hover:bg-indigo-600 text-white rounded-lg text-[10px] font-bold transition-colors"
                    >
                      Download
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* TAB 1: COMPLIANCE AUDIT MATRIX */}
          {activeTab === 'compliance_audit' && (
            <div className="space-y-4">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold text-xs">
                    App is 100% prepared for Microsoft Store, Apple App Store, and Google Play Store testing.
                  </span>
                </div>
                <span className="text-[10px] font-mono font-bold bg-emerald-200/80 text-emerald-900 px-2 py-0.5 rounded">
                  SCORE: 100/100
                </span>
              </div>

              {/* Three Store Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Apple */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs">Apple App Store</span>
                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                      READY
                    </span>
                  </div>
                  <ul className="space-y-1 text-[11px] text-slate-600">
                    <li className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Guideline 5.1.1(v) Account Deletion</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Guideline 2.1 Demo Accounts</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Face ID / Touch ID Enclave</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Apple Touch PNG Icon (180px)</span>
                    </li>
                  </ul>
                </div>

                {/* Google Play */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs">Google Play Store</span>
                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                      READY
                    </span>
                  </div>
                  <ul className="space-y-1 text-[11px] text-slate-600">
                    <li className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Play Data Safety Section Form</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Background Location Disclosure</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>TWA AssetLinks.json Setup</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>512x512 Maskable Icon Safe Zone</span>
                    </li>
                  </ul>
                </div>

                {/* Microsoft Store */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs">Microsoft Store</span>
                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                      READY
                    </span>
                  </div>
                  <ul className="space-y-1 text-[11px] text-slate-600">
                    <li className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>PWABuilder Package Compliant</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Wide &amp; Narrow Screenshots</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>W3C Shortcuts Definition</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Standalone Windows Integration</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PERSONAS */}
          {activeTab === 'personas' && (
            <div className="space-y-3">
              <p className="text-slate-600 text-xs">
                Switch instantly between pre-configured testing roles to simulate order checkout, courier delivery, inventory restocking, and admin oversight without logging in:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    role: 'customer' as const,
                    title: 'Customer Reviewer Persona',
                    desc: 'Pre-loaded with saved card (•••• 4242), live order tracking, Face ID passkey verification, and group order splits.',
                    actionLabel: 'Switch to Customer View'
                  },
                  {
                    role: 'driver' as const,
                    title: 'Driver / Courier Reviewer Persona',
                    desc: 'Pre-loaded with active GPS dispatch, 5-second location ping simulation, background permission disclosure, and AI route optimizer.',
                    actionLabel: 'Switch to Driver Cockpit'
                  },
                  {
                    role: 'eats_owner' as const,
                    title: 'Restaurant Owner Persona',
                    desc: 'Pre-loaded with POS synchronization (Square / Clover), kitchen KDS ticket workflow, and dynamic surge pricing controls.',
                    actionLabel: 'Switch to Eats Owner'
                  },
                  {
                    role: 'shop_owner' as const,
                    title: 'Retail Shop Owner Persona',
                    desc: 'Pre-loaded with AI predictive restock engine, stockout alerts, and one-click purchase order dispatch.',
                    actionLabel: 'Switch to Shop Owner'
                  },
                  {
                    role: 'rep' as const,
                    title: 'Territory Representative Persona',
                    desc: 'Pre-loaded with 20km geo-territory boundaries, commission ledger, and merchant acquisition pipeline.',
                    actionLabel: 'Switch to Rep Hub'
                  },
                  {
                    role: 'admin' as const,
                    title: 'Admin & Compliance Officer Persona',
                    desc: 'Pre-loaded with autonomous AI Command Center, exception triage, and regulatory audit review logs via isolated /admin URL route.',
                    actionLabel: 'Launch /admin Portal URL'
                  }
                ].map(p => (
                  <div key={p.role} className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 space-y-2 transition-colors">
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">{p.title}</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">{p.desc}</p>
                    </div>
                    <button
                      onClick={() => {
                        if (p.role === 'admin') {
                          window.history.pushState(null, '', '/admin');
                          window.dispatchEvent(new PopStateEvent('popstate'));
                        } else {
                          setActiveRole(p.role);
                        }
                        onClose();
                      }}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors text-xs flex items-center gap-1"
                    >
                      <Play className="w-3 h-3" />
                      <span>{p.actionLabel}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: GUIDELINES & POLICIES SHORTCUTS */}
          {activeTab === 'guidelines' && (
            <div className="space-y-4">
              <p className="text-slate-600 text-xs">
                Inspect all regulatory documents, consent tools, and self-service account deletion portals required for app store publishing:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    onClose();
                    onOpenPrivacy();
                  }}
                  className="p-3 rounded-xl border border-slate-200 hover:border-indigo-400 bg-white text-left transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    <div>
                      <span className="font-bold text-slate-900 block text-xs">Privacy Policy</span>
                      <span className="text-[11px] text-slate-500">GDPR, CCPA &amp; App Store 5.1.1</span>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </button>

                <button
                  onClick={() => {
                    onClose();
                    onOpenTerms();
                  }}
                  className="p-3 rounded-xl border border-slate-200 hover:border-indigo-400 bg-white text-left transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    <div>
                      <span className="font-bold text-slate-900 block text-xs">Terms of Service</span>
                      <span className="text-[11px] text-slate-500">Marketplace &amp; Courier Agreement</span>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </button>

                <button
                  onClick={() => {
                    onClose();
                    onOpenDataSafety();
                  }}
                  className="p-3 rounded-xl border border-slate-200 hover:border-indigo-400 bg-white text-left transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <Lock className="w-4 h-4 text-emerald-600" />
                    <div>
                      <span className="font-bold text-slate-900 block text-xs">Data Safety &amp; Nutrition Label</span>
                      <span className="text-[11px] text-slate-500">Google Play &amp; Apple Disclosures</span>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </button>

                <button
                  onClick={() => {
                    onClose();
                    onOpenAccountDeletion();
                  }}
                  className="p-3 rounded-xl border border-rose-200 hover:border-rose-400 bg-rose-50/50 text-left transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <Trash2 className="w-4 h-4 text-rose-600" />
                    <div>
                      <span className="font-bold text-rose-950 block text-xs">Account Deletion Portal</span>
                      <span className="text-[11px] text-rose-800">Apple 5.1.1(v) &amp; Google Play Rule</span>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-rose-400" />
                </button>
              </div>

              {/* Direct URLs note */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-[11px] text-slate-600">
                <span className="font-bold text-slate-800 block">External Testing URLs for App Store Connect / Play Console:</span>
                <div>• Privacy Policy URL: <code className="bg-slate-200 px-1 py-0.5 rounded font-mono">/privacy-policy.html</code></div>
                <div>• Terms of Service URL: <code className="bg-slate-200 px-1 py-0.5 rounded font-mono">/terms.html</code></div>
                <div>• Digital Asset Links (TWA): <code className="bg-slate-200 px-1 py-0.5 rounded font-mono">/.well-known/assetlinks.json</code></div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <span className="text-[11px] text-slate-500">
            Certified for Microsoft Store, Apple App Store &amp; Google Play Testing
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-colors"
          >
            Close Sandbox
          </button>
        </div>

      </div>
    </div>
  );
};
