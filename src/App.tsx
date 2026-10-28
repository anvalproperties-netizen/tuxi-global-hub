import React, { useState, useEffect } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { TuxiProvider, useTuxi } from './context/TuxiContext';
import { TopBar } from './components/navigation/TopBar';
import { CustomerView } from './components/customer/CustomerView';
import { RepView } from './components/rep/RepView';
import { EatsOwnerView } from './components/owner/EatsOwnerView';
import { ShopOwnerView } from './components/owner/ShopOwnerView';
import { DriverView } from './components/driver/DriverView';
import { StandaloneAdminPortal } from './components/admin/StandaloneAdminPortal';
import { CookieConsentBanner } from './components/common/CookieConsentBanner';
import { PrivacyPolicyModal } from './components/common/PrivacyPolicyModal';
import { TermsOfServiceModal } from './components/common/TermsOfServiceModal';
import { DataSafetyModal } from './components/common/DataSafetyModal';
import { AccountDeletionModal } from './components/common/AccountDeletionModal';
import { StoreTestingReviewerHub } from './components/common/StoreTestingReviewerHub';
import { 
  getStoredGoogleMapsApiKey, 
  isValidGoogleMapsKey, 
  isGoogleMapsAuthFailed 
} from './utils/googleMapsConfig';
import { WelcomeScreen } from './components/auth/WelcomeScreen';
import { ShieldAlert } from 'lucide-react';

const checkIsAdminRoute = (): boolean => {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  const search = window.location.search.toLowerCase();
  return path.startsWith('/admin') || hash.startsWith('#/admin') || hash.startsWith('#admin') || search.includes('view=admin');
};

const MainContent: React.FC = () => {
  const { activeRole } = useTuxi();

  return (
    <main className="flex-1 pb-16">
      {activeRole === 'customer' && <CustomerView />}
      {activeRole === 'rep' && <RepView />}
      {activeRole === 'eats_owner' && <EatsOwnerView />}
      {activeRole === 'shop_owner' && <ShopOwnerView />}
      {activeRole === 'driver' && <DriverView />}
    </main>
  );
};

export default function App() {
  const [apiKey, setApiKey] = useState<string>(() => getStoredGoogleMapsApiKey());
  const [authFailed, setAuthFailed] = useState<boolean>(() => isGoogleMapsAuthFailed());
  const [isAdminView, setIsAdminView] = useState<boolean>(() => checkIsAdminRoute());

  // Legal & Testing Modals
  const [isPrivacyOpen, setIsPrivacyOpen] = useState<boolean>(false);
  const [isTermsOpen, setIsTermsOpen] = useState<boolean>(false);
  const [isDataSafetyOpen, setIsDataSafetyOpen] = useState<boolean>(false);
  const [isAccountDeletionOpen, setIsAccountDeletionOpen] = useState<boolean>(false);
  const [isStoreTestingOpen, setIsStoreTestingOpen] = useState<boolean>(false);

  useEffect(() => {
    const handleLocationChange = () => {
      setIsAdminView(checkIsAdminRoute());
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const navigateToMarketplace = () => {
    window.history.pushState(null, '', '/');
    setIsAdminView(false);
  };

  const navigateToAdmin = () => {
    window.history.pushState(null, '', '/admin');
    setIsAdminView(true);
  };

  useEffect(() => {
    const handleKeyUpdated = (e: any) => {
      setApiKey(e.detail || getStoredGoogleMapsApiKey());
      setAuthFailed(false);
    };

    const handleAuthFailure = () => {
      setAuthFailed(true);
    };

    window.addEventListener('gmp-key-updated', handleKeyUpdated);
    window.addEventListener('gmp-auth-failure', handleAuthFailure);
    return () => {
      window.removeEventListener('gmp-key-updated', handleKeyUpdated);
      window.removeEventListener('gmp-auth-failure', handleAuthFailure);
    };
  }, []);

  const canMountGoogleMaps = isValidGoogleMapsKey(apiKey) && !authFailed;

interface AppRouterProps {
  isAdminView: boolean;
  navigateToMarketplace: () => void;
  navigateToAdmin: () => void;
  canMountGoogleMaps: boolean;
  setIsPrivacyOpen: (open: boolean) => void;
  setIsTermsOpen: (open: boolean) => void;
  setIsDataSafetyOpen: (open: boolean) => void;
  setIsAccountDeletionOpen: (open: boolean) => void;
  setIsStoreTestingOpen: (open: boolean) => void;
}

const AppRouter: React.FC<AppRouterProps> = ({
  isAdminView,
  navigateToMarketplace,
  navigateToAdmin,
  canMountGoogleMaps,
  setIsPrivacyOpen,
  setIsTermsOpen,
  setIsDataSafetyOpen,
  setIsAccountDeletionOpen,
  setIsStoreTestingOpen,
}) => {
  const { currentUser, isSessionValidating } = useTuxi();

  // 1. Mandatory Session Validation Gate: Loading State
  if (isSessionValidating) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white select-none">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 p-0.5 shadow-xl shadow-amber-500/20 mb-5 animate-pulse">
          <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
            <span className="text-2xl font-black italic tracking-tighter text-amber-400">T</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5 text-sm font-medium text-slate-300">
          <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span>Verifying secure TUXI session...</span>
        </div>
        <p className="text-[11px] font-mono text-slate-500 mt-2">com.tuxi.marketplace.app</p>
      </div>
    );
  }

  // 2. Mandatory Unauthenticated Gate: Show Welcome Screen
  if (!currentUser) {
    return (
      <WelcomeScreen
        onOpenPrivacy={() => setIsPrivacyOpen(true)}
        onOpenTerms={() => setIsTermsOpen(true)}
        onOpenDataSafety={() => setIsDataSafetyOpen(true)}
      />
    );
  }

  // 3. Admin View Gate
  if (isAdminView) {
    const hasAdminAccess = currentUser.roles.some(
      (r: string) => r === 'ADMIN' || r === 'SUPER_ADMIN'
    );
    if (!hasAdminAccess) {
      return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md w-full p-8 rounded-3xl bg-slate-900 border border-rose-500/30 shadow-2xl space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">Access Denied</h2>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                The Autonomous AI Command Center (/admin) requires authenticated 
                <span className="text-rose-400 font-semibold"> ADMIN</span> or 
                <span className="text-rose-400 font-semibold"> SUPER_ADMIN</span> credentials.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-left text-xs space-y-1 font-mono">
              <div className="text-slate-500">Signed in as:</div>
              <div className="text-slate-200 font-bold truncate">{currentUser.email}</div>
              <div className="text-slate-500 pt-1">Assigned Roles:</div>
              <div className="text-amber-400 font-semibold">{currentUser.roles.join(', ') || 'CUSTOMER'}</div>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={navigateToMarketplace}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-md"
              >
                Return to Marketplace
              </button>
            </div>
          </div>
        </div>
      );
    }

    return <StandaloneAdminPortal onReturnToApp={navigateToMarketplace} />;
  }

  // 4. Authenticated Marketplace & Role Experience
  return (
    <div className="min-h-screen bg-[var(--bg-app)] dark:bg-slate-950 text-[var(--text-primary)] dark:text-slate-100 flex flex-col font-sans antialiased selection:bg-indigo-500 selection:text-white transition-colors duration-200">
      <TopBar />
      <MainContent />

      {/* Global Footer */}
      <footer className="bg-[var(--bg-primary)] dark:bg-slate-900 border-t border-[var(--border-primary)] dark:border-slate-800 py-6 text-xs text-[var(--text-secondary)] dark:text-slate-400 mt-auto transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 dark:text-white tracking-tight">TUXI Global Marketplace</span>
              <span aria-hidden="true">·</span>
              <span>Eats</span>
              <span aria-hidden="true">·</span>
              <span>Shop</span>
              <span aria-hidden="true">·</span>
              <span>Courier</span>
            </div>

            <div className="flex items-center gap-4 text-[11px] text-slate-400 dark:text-slate-500">
              <span>{canMountGoogleMaps ? 'Google Maps Platform Active' : 'Autonomous Geospatial Engine'}</span>
              <span aria-hidden="true">·</span>
              <span>Multi-Role Handoff Compliant</span>
            </div>
          </div>

          {/* Regulatory, Privacy & Store Testing Links */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px]">
            <div className="flex flex-wrap items-center gap-2.5 text-slate-500 dark:text-slate-400">
              <button onClick={() => setIsPrivacyOpen(true)} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors font-medium cursor-pointer">
                Privacy Policy
              </button>
              <span>·</span>
              <button onClick={() => setIsTermsOpen(true)} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors font-medium cursor-pointer">
                Terms of Service
              </button>
              <span>·</span>
              <button onClick={() => setIsDataSafetyOpen(true)} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors font-medium cursor-pointer">
                Data Safety
              </button>
              <span>·</span>
              <button onClick={() => setIsAccountDeletionOpen(true)} className="text-rose-600 hover:text-rose-500 transition-colors font-medium cursor-pointer">
                Delete Account &amp; Data
              </button>
              <span>·</span>
              <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer" className="hover:text-slate-700 dark:hover:text-slate-300 underline">
                Public Policy URL
              </a>
              <span>·</span>
              <a 
                href="/admin" 
                onClick={(e) => {
                  e.preventDefault();
                  navigateToAdmin();
                }}
                className="hover:text-indigo-600 dark:hover:text-indigo-400 font-mono text-[10.5px] font-semibold text-slate-400 hover:underline"
                title="Separate URL route for Autonomous AI Command Center"
              >
                Admin Portal (/admin)
              </a>
            </div>

            <div>
              <button
                onClick={() => setIsStoreTestingOpen(true)}
                className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>Store Reviewer Testing Hub</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

  const appContent = (
    <TuxiProvider>
      <AppRouter
        isAdminView={isAdminView}
        navigateToMarketplace={navigateToMarketplace}
        navigateToAdmin={navigateToAdmin}
        canMountGoogleMaps={canMountGoogleMaps}
        setIsPrivacyOpen={setIsPrivacyOpen}
        setIsTermsOpen={setIsTermsOpen}
        setIsDataSafetyOpen={setIsDataSafetyOpen}
        setIsAccountDeletionOpen={setIsAccountDeletionOpen}
        setIsStoreTestingOpen={setIsStoreTestingOpen}
      />

      {/* Global Store Compliance Modals */}
      <PrivacyPolicyModal
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
        onOpenAccountDeletion={() => setIsAccountDeletionOpen(true)}
      />

      <TermsOfServiceModal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
      />

      <DataSafetyModal
        isOpen={isDataSafetyOpen}
        onClose={() => setIsDataSafetyOpen(false)}
        onOpenAccountDeletion={() => setIsAccountDeletionOpen(true)}
      />

      <AccountDeletionModal
        isOpen={isAccountDeletionOpen}
        onClose={() => setIsAccountDeletionOpen(false)}
      />

      <StoreTestingReviewerHub
        isOpen={isStoreTestingOpen}
        onClose={() => setIsStoreTestingOpen(false)}
        onOpenPrivacy={() => setIsPrivacyOpen(true)}
        onOpenTerms={() => setIsTermsOpen(true)}
        onOpenDataSafety={() => setIsDataSafetyOpen(true)}
        onOpenAccountDeletion={() => setIsAccountDeletionOpen(true)}
      />

      {/* GDPR Cookie Consent Banner */}
      <CookieConsentBanner />
    </TuxiProvider>
  );

  if (canMountGoogleMaps) {
    return (
      <APIProvider apiKey={apiKey}>
        {appContent}
      </APIProvider>
    );
  }

  return appContent;
}
