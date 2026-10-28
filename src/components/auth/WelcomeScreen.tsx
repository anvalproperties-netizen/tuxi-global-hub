import React, { useState } from 'react';
import { 
  Mail, 
  Smartphone, 
  KeyRound, 
  Search, 
  ArrowRight, 
  Sun, 
  Moon, 
  ShieldCheck, 
  Store, 
  Utensils, 
  Truck 
} from 'lucide-react';
import { useTuxi } from '../../context/TuxiContext';
import { EmailAuthModal } from './EmailAuthModal';
import { UnavailableMethodModal } from './UnavailableMethodModal';

export interface WelcomeScreenProps {
  onOpenPrivacy: () => void;
  onOpenTerms: () => void;
  onOpenDataSafety: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onOpenPrivacy,
  onOpenTerms,
  onOpenDataSafety
}) => {
  const { theme, toggleTheme } = useTuxi();
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailDefaultMode, setEmailDefaultMode] = useState<'login' | 'register'>('login');

  // Customer-friendly informational modal for upcoming authentication methods
  const [unavailableModal, setUnavailableModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
  }>({
    isOpen: false,
    title: '',
    description: ''
  });

  const handleOpenGoogle = () => {
    setUnavailableModal({
      isOpen: true,
      title: 'Google Sign-In Coming Soon',
      description: 'Google Sign-In will be available in an upcoming update. In the meantime, please use Continue with Email to sign in or create your verified TUXI account.'
    });
  };

  const handleOpenApple = () => {
    setUnavailableModal({
      isOpen: true,
      title: 'Sign in with Apple Coming Soon',
      description: 'Sign in with Apple will be available in an upcoming update. In the meantime, please use Continue with Email to access or create your verified TUXI account.'
    });
  };

  const handleOpenMobile = () => {
    setUnavailableModal({
      isOpen: true,
      title: 'Mobile SMS Sign-In Coming Soon',
      description: 'Mobile phone SMS verification is arriving soon. Please sign in or register with your email address.'
    });
  };

  const handleOpenPasskeys = () => {
    setUnavailableModal({
      isOpen: true,
      title: 'Passkeys Coming Soon',
      description: 'Biometric Passkey sign-in (Face ID and Touch ID) is currently in development. Please use your email and password to sign in.'
    });
  };

  const handleOpenFindAccount = () => {
    setUnavailableModal({
      isOpen: true,
      title: 'Account Recovery Coming Soon',
      description: 'Self-service account recovery will be available in an upcoming update. Please sign in with your email address and password.'
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      
      {/* Top Utility Bar */}
      <header className="w-full px-4 sm:px-8 py-3.5 flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/40 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="bg-slate-900 dark:bg-indigo-600 text-white px-2 py-0.5 rounded font-mono text-xs font-black tracking-widest shadow-xs">
            AI
          </span>
          <span className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
            TUXI
          </span>
        </div>

        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          aria-label="Toggle Theme"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
        </button>
      </header>

      {/* Main Centered Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 w-full max-w-md mx-auto">
        <div className="w-full space-y-6">
          
          {/* Hero Branding & Restrained Vector Illustration */}
          <div className="text-center space-y-3">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-slate-900 via-indigo-950 to-slate-900 dark:from-indigo-900 dark:via-indigo-950 dark:to-slate-900 border border-indigo-500/30 shadow-xl flex items-center justify-center relative p-3">
              <svg viewBox="0 0 48 48" className="w-full h-full text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {/* Minimalist modern logistics geometry */}
                <path d="M6 16 L24 6 L42 16 L24 26 Z" className="text-cyan-400 fill-cyan-400/20" />
                <path d="M6 16 L6 32 L24 42 L24 26 Z" className="text-indigo-400 fill-indigo-400/10" />
                <path d="M42 16 L42 32 L24 42 L24 26 Z" className="text-indigo-300 fill-indigo-300/10" />
                <circle cx="24" cy="24" r="3" className="fill-white text-white" />
              </svg>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                Welcome to TUXI
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
                Move, Eat, Shop, Deliver — one unified account across every role.
              </p>
            </div>
          </div>

          {/* Authentication Options (Uber-inspired minimal, clean list) */}
          <div className="space-y-3 pt-2">
            
            {/* 1. Continue with Google */}
            <button
              type="button"
              onClick={handleOpenGoogle}
              className="w-full min-h-[48px] px-4 py-3 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-xs flex items-center justify-between shadow-2xs transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                {/* Official Google G Logo */}
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.27 21.43 7.35 24 12 24z"/>
                  <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.27 2.57 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                </svg>
                <span>Continue with Google</span>
              </div>
              <span className="text-[10px] font-mono font-semibold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                Coming Soon
              </span>
            </button>

            {/* 2. Continue with Apple */}
            <button
              type="button"
              onClick={handleOpenApple}
              className="w-full min-h-[48px] px-4 py-3 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-xs flex items-center justify-between shadow-2xs transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                {/* Official Apple Logo */}
                <svg className="w-5 h-5 shrink-0 fill-current text-slate-900 dark:text-white" viewBox="0 0 24 24">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.62-.75 1.04-1.8 1.01-2.87-.9.04-2 .6-2.65 1.35-.58.65-1.08 1.73-1.02 2.78 1.01.08 2.04-.51 2.66-1.26z"/>
                </svg>
                <span>Continue with Apple</span>
              </div>
              <span className="text-[10px] font-mono font-semibold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                Coming Soon
              </span>
            </button>

            {/* 3. Continue with Mobile */}
            <button
              type="button"
              onClick={handleOpenMobile}
              className="w-full min-h-[48px] px-4 py-3 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-xs flex items-center justify-between shadow-2xs transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <Smartphone className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>Continue with Mobile</span>
              </div>
              <span className="text-[10px] font-mono font-semibold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                Coming Soon
              </span>
            </button>

            {/* 4. Continue with Email (REAL OPERATIONAL METHOD IN THIS PHASE) */}
            <button
              type="button"
              onClick={() => {
                setEmailDefaultMode('login');
                setIsEmailModalOpen(true);
              }}
              className="w-full min-h-[48px] px-4 py-3 bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-2xl font-bold text-xs flex items-center justify-between shadow-md transition-all cursor-pointer group border border-slate-700 dark:border-indigo-400/40"
            >
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-indigo-300 dark:text-white shrink-0" />
                <span className="text-white">Continue with Email</span>
              </div>
              <div className="flex items-center gap-1.5 text-white/90 font-medium">
                <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold">Live</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>

            {/* 5. Continue with Passkeys */}
            <button
              type="button"
              onClick={handleOpenPasskeys}
              className="w-full min-h-[48px] px-4 py-3 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-xs flex items-center justify-between shadow-2xs transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <KeyRound className="w-5 h-5 text-cyan-600 dark:text-cyan-400 shrink-0" />
                <span>Continue with Passkeys</span>
              </div>
              <span className="text-[10px] font-mono font-semibold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                Coming Soon
              </span>
            </button>

          </div>

          {/* Account Recovery */}
          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={handleOpenFindAccount}
              className="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors inline-flex items-center gap-1.5 py-1 px-2 cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Find My Account</span>
            </button>
          </div>

          {/* Terms, Privacy & Trust Disclaimer */}
          <div className="pt-4 border-t border-slate-200/60 dark:border-slate-800/60 text-center space-y-2">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              By continuing, you agree to TUXI&apos;s{' '}
              <button
                type="button"
                onClick={onOpenTerms}
                className="underline hover:text-indigo-600 dark:hover:text-indigo-400 font-medium"
              >
                Terms of Service
              </button>{' '}
              and{' '}
              <button
                type="button"
                onClick={onOpenPrivacy}
                className="underline hover:text-indigo-600 dark:hover:text-indigo-400 font-medium"
              >
                Privacy Policy
              </button>.
            </p>

            <div className="flex items-center justify-center gap-3 text-[10px] text-slate-400 dark:text-slate-500 font-mono">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-500" />
                TLS Encrypted Session
              </span>
              <span>·</span>
              <button
                type="button"
                onClick={onOpenDataSafety}
                className="hover:underline"
              >
                Data Safety
              </button>
            </div>
          </div>

        </div>
      </main>

      {/* Real Email Auth Modal */}
      <EmailAuthModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        defaultMode={emailDefaultMode}
      />

      {/* Informative Modal for Unavailable Methods */}
      <UnavailableMethodModal
        isOpen={unavailableModal.isOpen}
        onClose={() => setUnavailableModal(prev => ({ ...prev, isOpen: false }))}
        methodTitle={unavailableModal.title}
        description={unavailableModal.description}
        onSwitchToEmail={() => {
          setEmailDefaultMode('login');
          setIsEmailModalOpen(true);
        }}
      />

    </div>
  );
};
