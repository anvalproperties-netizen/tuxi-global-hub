import React, { useState, useEffect } from 'react';
import { 
  Scan, 
  Fingerprint, 
  ShieldCheck, 
  Plus, 
  Trash2, 
  KeyRound, 
  Sparkles, 
  CheckCircle2, 
  Smartphone,
  Laptop,
  Check,
  Zap,
  Lock,
  Sliders,
  DollarSign
} from 'lucide-react';
import { 
  BiometricSecuritySettings, 
  RegisteredPasskey, 
  BiometricAuthType 
} from '../../types';
import { 
  getBiometricSettings, 
  saveBiometricSettings, 
  registerNewPasskey, 
  removeRegisteredPasskey, 
  detectPlatformBiometrics 
} from '../../utils/biometricAuthService';
import { BiometricAuthModal } from '../common/BiometricAuthModal';
import { useTuxi } from '../../context/TuxiContext';

interface BiometricSecurityManagerProps {
  className?: string;
}

export const BiometricSecurityManager: React.FC<BiometricSecurityManagerProps> = ({
  className = ''
}) => {
  const { formatPrice, config } = useTuxi();
  const [settings, setSettings] = useState<BiometricSecuritySettings>(getBiometricSettings());
  const [detectedPlatform, setDetectedPlatform] = useState(detectPlatformBiometrics());
  const [isTestModalOpen, setIsTestModalOpen] = useState<boolean>(false);
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState<boolean>(false);
  const [newDeviceName, setNewDeviceName] = useState<string>('');
  const [newDeviceType, setNewDeviceType] = useState<BiometricAuthType>(detectedPlatform.type);
  const [testSuccessMessage, setTestSuccessMessage] = useState<string>('');

  useEffect(() => {
    const handleSettingsChange = (e: Event) => {
      const customEvent = e as CustomEvent<BiometricSecuritySettings>;
      if (customEvent.detail) {
        setSettings(customEvent.detail);
      }
    };
    window.addEventListener('tuxi-biometric-settings-changed', handleSettingsChange);
    return () => window.removeEventListener('tuxi-biometric-settings-changed', handleSettingsChange);
  }, []);

  const handleToggleEnabled = () => {
    const updated: BiometricSecuritySettings = {
      ...settings,
      isEnabled: !settings.isEnabled
    };
    setSettings(updated);
    saveBiometricSettings(updated);
  };

  const handleToggleLargePayments = () => {
    const updated: BiometricSecuritySettings = {
      ...settings,
      requireForLargePayments: !settings.requireForLargePayments
    };
    setSettings(updated);
    saveBiometricSettings(updated);
  };

  const handleToggleAccountAccess = () => {
    const updated: BiometricSecuritySettings = {
      ...settings,
      requireForAccountAccess: !settings.requireForAccountAccess
    };
    setSettings(updated);
    saveBiometricSettings(updated);
  };

  const handleThresholdChange = (newThreshold: number) => {
    const updated: BiometricSecuritySettings = {
      ...settings,
      largePaymentThreshold: newThreshold
    };
    setSettings(updated);
    saveBiometricSettings(updated);
  };

  const handleEnrollPasskey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceName.trim()) return;

    await registerNewPasskey(newDeviceName.trim(), newDeviceType);
    setNewDeviceName('');
    setIsEnrollModalOpen(false);
    setSettings(getBiometricSettings());
    setTestSuccessMessage('New biometric passkey registered successfully!');
    setTimeout(() => setTestSuccessMessage(''), 4000);
  };

  const handleDeletePasskey = (id: string) => {
    removeRegisteredPasskey(id);
    setSettings(getBiometricSettings());
  };

  const thresholdPresets = [15, 25, 50, 100];

  return (
    <div className={`bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6 ${className}`}>
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-200">
              <Scan className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Biometric Authentication &amp; Passkeys
              </h3>
              <p className="text-xs text-slate-500">
                Confirm large payments and access your account using Face ID, Touch ID, or Windows Hello.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsTestModalOpen(true)}
            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Test Face ID / Touch ID</span>
          </button>

          <button
            onClick={handleToggleEnabled}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors border ${
              settings.isEnabled
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
            }`}
          >
            {settings.isEnabled ? 'Biometrics Active' : 'Enable Biometrics'}
          </button>
        </div>
      </div>

      {testSuccessMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2 animate-fade-in font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{testSuccessMessage}</span>
        </div>
      )}

      {/* Hardware Capability Card */}
      <div className="p-4 bg-gradient-to-r from-slate-900 to-indigo-950 rounded-2xl text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-white/10 text-cyan-300 border border-white/10 shrink-0">
            {detectedPlatform.type === 'touch_id' ? (
              <Fingerprint className="w-6 h-6 text-cyan-300" />
            ) : (
              <Scan className="w-6 h-6 text-cyan-300" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white">Hardware Authenticator: {detectedPlatform.label}</span>
              <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-cyan-400/20 text-cyan-300 border border-cyan-400/30">
                FIDO2 / WEBAUTHN READY
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Secure Enclave hardware cryptography confirms transactions without storing raw biometric data.
            </p>
          </div>
        </div>

        <div className="text-right shrink-0">
          <span className="text-[10px] text-slate-400 block font-mono">Enrolled Passkeys</span>
          <span className="text-lg font-black text-emerald-400 font-mono">
            {settings.registeredPasskeys.length} Active Key{settings.registeredPasskeys.length > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Security Policies Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Policy 1: Large Payment Confirmation */}
        <div className={`p-4 rounded-xl border transition-all ${
          settings.requireForLargePayments 
            ? 'bg-indigo-50/40 border-indigo-200' 
            : 'bg-slate-50 border-slate-200 opacity-70'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              <span className="font-bold text-xs text-slate-900">Mandatory Large Payment Check</span>
            </div>
            <input
              type="checkbox"
              checked={settings.requireForLargePayments}
              onChange={handleToggleLargePayments}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
          </div>

          <p className="text-[11px] text-slate-600 mb-3">
            Orders exceeding this threshold require Face ID or Touch ID approval before card token charge.
          </p>

          {/* Threshold Selector */}
          <div className="space-y-1.5 pt-2 border-t border-indigo-100">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Threshold Amount:</span>
              <span className="font-mono text-indigo-700 font-bold">
                {formatPrice(settings.largePaymentThreshold)}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {thresholdPresets.map(preset => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleThresholdChange(preset)}
                  className={`py-1 rounded-lg text-xs font-mono font-bold transition-colors border ${
                    settings.largePaymentThreshold === preset
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {config.currencySymbol}{preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Policy 2: Account Access & Passkey Login */}
        <div className={`p-4 rounded-xl border transition-all ${
          settings.requireForAccountAccess 
            ? 'bg-emerald-50/40 border-emerald-200' 
            : 'bg-slate-50 border-slate-200 opacity-70'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-600" />
              <span className="font-bold text-xs text-slate-900">Account Access &amp; Profile Lock</span>
            </div>
            <input
              type="checkbox"
              checked={settings.requireForAccountAccess}
              onChange={handleToggleAccountAccess}
              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
          </div>

          <p className="text-[11px] text-slate-600 mb-3">
            Quickly authenticate with Face ID or Touch ID to inspect saved card numbers, change profile addresses, and unlock rewards without typing passwords.
          </p>

          <div className="pt-2 border-t border-emerald-100 flex items-center justify-between text-xs">
            <span className="text-[11px] text-slate-500">Security Standard:</span>
            <span className="font-mono text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
              W3C WEBAUTHN LEVEL 3
            </span>
          </div>
        </div>

      </div>

      {/* Enrolled Passkeys List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
            <span>Enrolled Biometric Devices &amp; Passkeys</span>
          </span>

          <button
            onClick={() => setIsEnrollModalOpen(true)}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Enroll New Device</span>
          </button>
        </div>

        <div className="space-y-2">
          {settings.registeredPasskeys.map(pk => (
            <div
              key={pk.id}
              className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white rounded-lg border border-slate-200 text-slate-700 shrink-0">
                  {pk.type === 'touch_id' ? (
                    <Fingerprint className="w-4 h-4 text-cyan-600" />
                  ) : (
                    <Scan className="w-4 h-4 text-indigo-600" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{pk.name}</span>
                    <span className="px-1.5 py-0.2 rounded font-mono text-[9px] uppercase font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {pk.type.replace('_', ' ')}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 block font-mono">
                    {pk.deviceLabel} · Last active: {pk.lastUsedAt || 'Recently'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  <span>Enrolled</span>
                </span>

                {settings.registeredPasskeys.length > 1 && (
                  <button
                    onClick={() => handleDeletePasskey(pk.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                    title="Remove enrolled biometric device"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Enrollment Modal */}
      {isEnrollModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Scan className="w-4 h-4 text-indigo-600" />
                <span>Enroll Biometric Passkey</span>
              </h3>
              <button
                onClick={() => setIsEnrollModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEnrollPasskey} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Device Label *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Emma's iPad Air (Touch ID)"
                  value={newDeviceName}
                  onChange={e => setNewDeviceName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Sensor Modality</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewDeviceType('face_id')}
                    className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      newDeviceType === 'face_id'
                        ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Scan className="w-4 h-4" />
                    <span>Face ID</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewDeviceType('touch_id')}
                    className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      newDeviceType === 'touch_id'
                        ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Fingerprint className="w-4 h-4" />
                    <span>Touch ID</span>
                  </button>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl text-[11px] text-slate-500 border border-slate-200/60">
                Registering creates a cryptographic key pair bound to your device Secure Enclave.
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-colors shadow-xs"
              >
                Register &amp; Verify Biometric
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Test Biometric Auth Modal */}
      <BiometricAuthModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        mode="settings_test"
        onSuccess={(auth) => {
          setIsTestModalOpen(false);
          setTestSuccessMessage(`Biometric verified via ${auth.method} (${auth.verifiedAt})!`);
          setTimeout(() => setTestSuccessMessage(''), 4500);
        }}
      />

    </div>
  );
};
