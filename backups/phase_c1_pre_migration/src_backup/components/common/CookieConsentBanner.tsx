import React, { useState, useEffect } from 'react';
import { Cookie, Shield, Check, X, SlidersHorizontal } from 'lucide-react';

const STORAGE_CONSENT_KEY = 'tuxi_cookie_consent_v1';

export const CookieConsentBanner: React.FC = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [showPreferences, setShowPreferences] = useState<boolean>(false);

  // Granular settings
  const [preferences, setPreferences] = useState({
    necessary: true,
    location: true,
    analytics: true,
    marketing: false
  });

  useEffect(() => {
    const existing = localStorage.getItem(STORAGE_CONSENT_KEY);
    if (!existing) {
      // Delay slightly for smooth load
      const timer = setTimeout(() => setIsOpen(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAcceptAll = () => {
    const full = { necessary: true, location: true, analytics: true, marketing: true };
    localStorage.setItem(STORAGE_CONSENT_KEY, JSON.stringify(full));
    setIsOpen(false);
  };

  const handleAcceptNecessary = () => {
    const essential = { necessary: true, location: true, analytics: false, marketing: false };
    localStorage.setItem(STORAGE_CONSENT_KEY, JSON.stringify(essential));
    setIsOpen(false);
  };

  const handleSaveCustom = () => {
    localStorage.setItem(STORAGE_CONSENT_KEY, JSON.stringify(preferences));
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-slate-700 text-xs animate-fade-in space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-indigo-600 text-white shrink-0">
            <Cookie className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-white">Privacy &amp; Cookie Consent</h4>
            <span className="text-[10px] text-slate-400">EU ePrivacy &amp; App Store Compliant</span>
          </div>
        </div>
        <button
          onClick={handleAcceptNecessary}
          className="text-slate-400 hover:text-white"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-[11px] text-slate-300 leading-relaxed">
        We use essential cookies and local storage to preserve your cart, deliver real-time GPS courier tracking, and enable secure biometric passkey authorizations.
      </p>

      {showPreferences && (
        <div className="p-3 bg-slate-800/80 rounded-xl space-y-2 border border-slate-700 text-[11px]">
          <label className="flex items-center justify-between">
            <span>Strictly Necessary (Auth &amp; Cart)</span>
            <input type="checkbox" checked disabled className="rounded text-indigo-500" />
          </label>
          <label className="flex items-center justify-between">
            <span>Location &amp; Delivery Telemetry</span>
            <input
              type="checkbox"
              checked={preferences.location}
              onChange={e => setPreferences(p => ({ ...p, location: e.target.checked }))}
              className="rounded text-indigo-500"
            />
          </label>
          <label className="flex items-center justify-between">
            <span>Performance &amp; Diagnostics</span>
            <input
              type="checkbox"
              checked={preferences.analytics}
              onChange={e => setPreferences(p => ({ ...p, analytics: e.target.checked }))}
              className="rounded text-indigo-500"
            />
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <button
          onClick={() => setShowPreferences(!showPreferences)}
          className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold"
        >
          <SlidersHorizontal className="w-3 h-3" />
          <span>{showPreferences ? 'Hide Options' : 'Customize'}</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleAcceptNecessary}
            className="px-2.5 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:text-white font-semibold text-[11px]"
          >
            Essential Only
          </button>
          <button
            onClick={showPreferences ? handleSaveCustom : handleAcceptAll}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] transition-colors"
          >
            {showPreferences ? 'Save Choices' : 'Accept All'}
          </button>
        </div>
      </div>
    </div>
  );
};
