import React, { useState } from 'react';
import { useTuxi } from '../../context/TuxiContext';
import { UserRole } from '../../types';
import { LegalComplianceModal } from '../common/LegalComplianceModal';
import { LoyaltyPointsTracker } from './LoyaltyPointsTracker';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { StoreTestingReviewerHub } from '../common/StoreTestingReviewerHub';
import { PrivacyPolicyModal } from '../common/PrivacyPolicyModal';
import { TermsOfServiceModal } from '../common/TermsOfServiceModal';
import { DataSafetyModal } from '../common/DataSafetyModal';
import { AccountDeletionModal } from '../common/AccountDeletionModal';
import { AILocationIntelligenceModal } from '../common/AILocationIntelligenceModal';
import { AIVoiceSearchModal } from '../common/AIVoiceSearchModal';
import { 
  ShoppingBag, 
  Store, 
  Truck, 
  ShieldCheck, 
  MapPin, 
  Smartphone, 
  AlertTriangle,
  Globe,
  Navigation,
  Scale,
  CreditCard,
  Sparkles,
  RefreshCw,
  Mic,
  Sun,
  Moon
} from 'lucide-react';

export const TopBar: React.FC = () => {
  const { 
    activeRole, 
    setActiveRole, 
    theme,
    toggleTheme,
    isMobileRepView, 
    setIsMobileRepView, 
    config, 
    cart, 
    exceptions,
    currentRep,
    globalCities,
    activeCity,
    switchGlobalCity,
    autoDetectLocationAndCurrency,
    triggerAILocationDetection,
    aiLocationStatus
  } = useTuxi();

  const [isCityDropdownOpen, setIsCityDropdownOpen] = useState<boolean>(false);
  const [isLegalModalOpen, setIsLegalModalOpen] = useState<boolean>(false);
  const [isStoreTestingOpen, setIsStoreTestingOpen] = useState<boolean>(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState<boolean>(false);
  const [isTermsOpen, setIsTermsOpen] = useState<boolean>(false);
  const [isDataSafetyOpen, setIsDataSafetyOpen] = useState<boolean>(false);
  const [isAccountDeletionOpen, setIsAccountDeletionOpen] = useState<boolean>(false);
  const [isAILocationModalOpen, setIsAILocationModalOpen] = useState<boolean>(false);
  const [isVoiceSearchOpen, setIsVoiceSearchOpen] = useState<boolean>(false);

  // Global keyboard shortcut to open Voice Search (/ or Ctrl+K / Cmd+K)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === 'k' && (e.metaKey || e.ctrlKey)) ||
        (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement))
      ) {
        e.preventDefault();
        setIsVoiceSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const roles: { role: UserRole; label: string; icon: React.ReactNode }[] = [
    { role: 'customer', label: 'Customer', icon: <ShoppingBag className="w-3.5 h-3.5" /> },
    { role: 'rep', label: 'TUXI Rep (Field)', icon: <MapPin className="w-3.5 h-3.5" /> },
    { role: 'eats_owner', label: 'Eats Kitchen', icon: <Store className="w-3.5 h-3.5" /> },
    { role: 'shop_owner', label: 'Shop Merchant', icon: <Store className="w-3.5 h-3.5" /> },
    { role: 'driver', label: 'Driver Cockpit', icon: <Truck className="w-3.5 h-3.5" /> },
  ];

  const pendingExceptionsCount = exceptions.filter(e => e.status === 'pending').length;
  const totalCartItems = cart.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <>
      <header className="sticky top-0 z-40 bg-[var(--bg-header)] dark:bg-slate-900/95 backdrop-blur-md border-b border-[var(--border-primary)] dark:border-slate-800 transition-colors duration-200 pt-[env(safe-area-inset-top,0px)]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-2 sm:gap-3">
            
            {/* Zone 1: Wordmark & Quiet Identity */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <span className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-1 sm:gap-1.5 transition-colors">
                <span className="bg-slate-900 dark:bg-indigo-600 text-white px-1.5 sm:px-2 py-0.5 rounded font-mono text-xs sm:text-sm tracking-widest shadow-xs">AI</span>
                TUXI
              </span>
              <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
                <span>Eats</span>
                <span aria-hidden="true">·</span>
                <span>Shop</span>
                <span aria-hidden="true">·</span>
                <span>Courier</span>
              </div>
            </div>

            {/* Zone 2: Worldwide Location & AI Auto-Detection (Desktop Inline lg+) */}
            <div className="relative shrink-0 hidden lg:flex items-center gap-1.5">
              <button
                onClick={() => setIsAILocationModalOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 dark:hover:bg-slate-700 border border-slate-700 dark:border-slate-600 rounded-lg text-xs font-semibold transition-all shadow-xs"
                title="AI Geolocation Intelligence · Click to view AI detected country & city"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-300 animate-pulse" />
                <span className="font-bold">{config.activeCityName}, {config.activeCountryCode}</span>
                <span className="font-mono text-cyan-300 font-bold bg-slate-800 dark:bg-slate-900 px-1 rounded border border-slate-700 dark:border-slate-700">
                  {config.currencySymbol} ({config.currencyCode})
                </span>
                {aiLocationStatus.isDetecting && (
                  <RefreshCw className="w-3 h-3 text-cyan-400 animate-spin" />
                )}
              </button>

              <button
                onClick={() => setIsCityDropdownOpen(!isCityDropdownOpen)}
                className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 transition-colors"
                title="Select from launched global cities"
              >
                <Globe className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              </button>
            </div>

            {/* AI Voice Search Trigger Button */}
            <button
              onClick={() => setIsVoiceSearchOpen(true)}
              className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-lg sm:rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 group border border-indigo-400/30 cursor-pointer"
              title="AI Voice Search (Press / or Ctrl+K) · Vocally search dishes, groceries, or couriers"
            >
              <Mic className="w-3.5 h-3.5 text-cyan-200 group-hover:scale-110 transition-transform animate-pulse shrink-0" />
              <span className="hidden sm:inline">Voice Search</span>
              <span className="hidden md:inline text-[9px] font-mono px-1 py-0.2 bg-white/20 rounded font-semibold text-cyan-200">
                AI
              </span>
            </button>

            {/* Zone 3: Role Switcher (Compact below XL, full pills on XL+) */}
            <div className="flex xl:hidden items-center shrink-0">
              <div className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 px-1.5 sm:px-2 py-1 rounded-lg">
                <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider hidden sm:inline">
                  Role:
                </span>
                <select
                  value={activeRole}
                  onChange={e => setActiveRole(e.target.value as UserRole)}
                  aria-label="Switch Role View"
                  className="text-xs font-bold bg-transparent text-indigo-950 dark:text-indigo-100 focus:outline-none cursor-pointer max-w-[105px] sm:max-w-none truncate"
                >
                  {roles.map(r => (
                    <option key={r.role} value={r.role} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <nav className="hidden xl:flex items-center p-1 bg-slate-100 dark:bg-slate-800/90 rounded-lg overflow-x-auto max-w-xl scrollbar-none transition-colors">
              {roles.map(({ role, label, icon }) => {
                const isActive = activeRole === role;
                return (
                  <button
                    key={role}
                    onClick={() => setActiveRole(role)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    {icon}
                    <span>{label}</span>
                    {role === 'customer' && totalCartItems > 0 && (
                      <span className="ml-1 bg-indigo-600 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center font-bold">
                        {totalCartItems}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Zone 4: Quick Context Actions & Store QA Hub */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              
              {/* Store Testing & Certification Hub (Desktop lg+) */}
              <button
                onClick={() => setIsStoreTestingOpen(true)}
                className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-slate-900 to-indigo-950 text-white border-2 border-indigo-400/80 shadow-md hover:from-slate-800 hover:to-indigo-900 transition-all cursor-pointer shrink-0"
                title="Store Reviewer QA Testing Sandbox & Certification Guidelines"
                aria-label="Open Store QA Hub"
              >
                <Smartphone className="w-4 h-4 text-cyan-300" />
                <span className="tracking-wide">Store QA Hub</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
              </button>

              {/* Global Dark Mode / Light Mode Toggle */}
              <button
                onClick={toggleTheme}
                className="flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1.5 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-2xs transition-all cursor-pointer group shrink-0"
                title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode (Current: ${theme === 'dark' ? 'Dark' : 'Light'})`}
                aria-label={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400 group-hover:rotate-45 transition-transform" />
                    <span className="hidden xl:inline">Light</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 group-hover:-rotate-12 transition-transform" />
                    <span className="hidden xl:inline">Dark</span>
                  </>
                )}
              </button>

              {/* Rep In-Field Mobile Device Simulator Toggle (Desktop) */}
              {activeRole === 'rep' && (
                <button
                  onClick={() => setIsMobileRepView(!isMobileRepView)}
                  title="Toggle Field Tablet / Phone Frame"
                  className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors shrink-0 ${
                    isMobileRepView
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">
                    {isMobileRepView ? 'Field Mobile' : 'Simulate Mobile'}
                  </span>
                </button>
              )}

              {/* PWA In-App Install Prompt */}
              <PWAInstallButton />

              {/* User Profile & Loyalty Points Tracker */}
              <LoyaltyPointsTracker />

              {/* Legal & Compliance (CCPA & POPIA) Trigger */}
              <button
                onClick={() => setIsLegalModalOpen(true)}
                className="hidden md:flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
                title="CCPA & POPIA Legal Compliance & Privacy"
              >
                <Scale className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                <span>Legal / Privacy</span>
              </button>

              {/* AI Autonomous Status Indicator */}
              <div className="hidden 2xl:flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800 text-xs">
                {config.aiMasterKillSwitch ? (
                  <div className="flex items-center gap-1.5 text-rose-700 dark:rose-400 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 px-2 py-1 rounded-md">
                    <AlertTriangle className="w-3.5 h-3.5 animate-pulse" />
                    <span className="font-semibold">AI Paused</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="font-medium">AI Live</span>
                  </div>
                )}
              </div>

            </div>

          </div>
        </div>

        {/* Mobile Quick Action Ribbon (Eliminates horizontal overflow on < 1024px while keeping all features accessible) */}
        <div className="lg:hidden border-t border-slate-200/80 dark:border-slate-800/80 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-xs px-3 sm:px-4 py-1.5 flex items-center justify-between gap-2 overflow-x-auto scrollbar-none">
          {/* Mobile Location & AI Auto-Detection */}
          <div className="relative shrink-0 flex items-center gap-1">
            <button
              onClick={() => setIsAILocationModalOpen(true)}
              className="flex items-center gap-1 px-2 py-1 bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 dark:hover:bg-slate-700 border border-slate-700 dark:border-slate-600 rounded-lg text-xs font-semibold transition-all shadow-xs max-w-[185px] sm:max-w-xs"
              title="AI Geolocation Intelligence · Click to view AI detected country & city"
            >
              <Sparkles className="w-3 h-3 text-cyan-300 animate-pulse shrink-0" />
              <span className="font-bold truncate">{config.activeCityName}, {config.activeCountryCode}</span>
              <span className="font-mono text-cyan-300 font-bold bg-slate-800 dark:bg-slate-900 px-1 rounded text-[10px] shrink-0">
                {config.currencySymbol}
              </span>
              {aiLocationStatus.isDetecting && (
                <RefreshCw className="w-2.5 h-2.5 text-cyan-400 animate-spin shrink-0" />
              )}
            </button>

            <button
              onClick={() => setIsCityDropdownOpen(!isCityDropdownOpen)}
              className="p-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 transition-colors shrink-0"
              title="Select from launched global cities"
              aria-label="Open global cities dropdown"
            >
              <Globe className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            </button>
          </div>

          {/* Mobile Right Controls: Store QA Hub & Rep Simulator */}
          <div className="flex items-center gap-1.5 shrink-0">
            {activeRole === 'rep' && (
              <button
                onClick={() => setIsMobileRepView(!isMobileRepView)}
                title="Toggle Field Tablet / Phone Frame"
                className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg border transition-colors shrink-0 ${
                  isMobileRepView
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="text-[11px]">{isMobileRepView ? 'Field' : 'Simulate'}</span>
              </button>
            )}

            <button
              onClick={() => setIsStoreTestingOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-gradient-to-r from-slate-900 to-indigo-950 text-white border border-indigo-400/80 shadow-xs hover:from-slate-800 hover:to-indigo-900 transition-all cursor-pointer shrink-0"
              title="Store Reviewer QA Testing Sandbox & Certification Guidelines"
              aria-label="Open Store QA Hub"
            >
              <Smartphone className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
              <span className="tracking-wide text-[11px]">Store QA Hub</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block shrink-0" />
            </button>
          </div>
        </div>
      </header>

      {/* City & Currency Dropdown with safe viewport boundaries and outside-click backdrop */}
      {isCityDropdownOpen && (
        <>
          <div 
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-2xs" 
            onClick={() => setIsCityDropdownOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-x-3 top-24 sm:top-16 sm:inset-x-auto sm:left-6 lg:left-28 w-auto sm:w-80 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 z-50 text-xs animate-fade-in">
            <div className="p-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="font-bold text-slate-900 dark:text-white">Active Market &amp; Currency</span>
              <button
                onClick={() => {
                  autoDetectLocationAndCurrency();
                  setIsCityDropdownOpen(false);
                }}
                className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center gap-1 font-bold"
              >
                <Sparkles className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                <span>AI Auto-Detect</span>
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto py-1 space-y-1">
              {globalCities.map(city => {
                const isSelected = city.id === config.activeCityId;
                return (
                  <button
                    key={city.id}
                    onClick={() => {
                      switchGlobalCity(city.id);
                      setIsCityDropdownOpen(false);
                    }}
                    className={`w-full text-left p-2 rounded-lg transition-colors flex items-center justify-between ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-950 dark:text-indigo-200 font-bold'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="text-xs">{city.city}, {city.country}</div>
                      <span className="text-[10px] text-slate-400 font-normal">
                        {city.activeStoresCount} stores · {city.activeDriversCount} couriers
                      </span>
                    </div>
                    <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-200">
                      {city.currencySymbol} {city.currencyCode}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Legal & Privacy Compliance Modal */}
      <LegalComplianceModal
        isOpen={isLegalModalOpen}
        onClose={() => setIsLegalModalOpen(false)}
      />

      {/* Store Testing & Certification Hub Modal */}
      <StoreTestingReviewerHub
        isOpen={isStoreTestingOpen}
        onClose={() => setIsStoreTestingOpen(false)}
        onOpenPrivacy={() => setIsPrivacyOpen(true)}
        onOpenTerms={() => setIsTermsOpen(true)}
        onOpenDataSafety={() => setIsDataSafetyOpen(true)}
        onOpenAccountDeletion={() => setIsAccountDeletionOpen(true)}
      />

      {/* Store Privacy Policy Modal */}
      <PrivacyPolicyModal
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
        onOpenAccountDeletion={() => setIsAccountDeletionOpen(true)}
      />

      {/* Store Terms of Service Modal */}
      <TermsOfServiceModal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
      />

      {/* Store Data Safety & Nutrition Labels Modal */}
      <DataSafetyModal
        isOpen={isDataSafetyOpen}
        onClose={() => setIsDataSafetyOpen(false)}
        onOpenAccountDeletion={() => setIsAccountDeletionOpen(true)}
      />

      {/* Self-Service Account & Data Deletion Modal (Apple 5.1.1(v) & Google Play) */}
      <AccountDeletionModal
        isOpen={isAccountDeletionOpen}
        onClose={() => setIsAccountDeletionOpen(false)}
      />

      {/* AI Voice Search Modal (Microphone, Gemini 3.8 Flash, Multi-Modal Synthesis) */}
      <AIVoiceSearchModal
        isOpen={isVoiceSearchOpen}
        onClose={() => setIsVoiceSearchOpen(false)}
      />
    </>
  );
};
