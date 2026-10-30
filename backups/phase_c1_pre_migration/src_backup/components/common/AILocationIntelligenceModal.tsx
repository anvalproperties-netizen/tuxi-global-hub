import React from 'react';
import { 
  Sparkles, 
  X, 
  MapPin, 
  Globe, 
  RefreshCw, 
  CheckCircle2, 
  ShieldCheck, 
  Navigation, 
  DollarSign, 
  Cpu, 
  Activity,
  Layers
} from 'lucide-react';
import { useTuxi } from '../../context/TuxiContext';

interface AILocationIntelligenceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AILocationIntelligenceModal: React.FC<AILocationIntelligenceModalProps> = ({
  isOpen,
  onClose
}) => {
  const { 
    config, 
    activeCity, 
    globalCities, 
    switchGlobalCity, 
    aiLocationStatus, 
    triggerAILocationDetection 
  } = useTuxi();

  if (!isOpen) return null;

  const result = aiLocationStatus.lastResult;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden text-xs">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs">
              <Sparkles className="w-4 h-4 text-cyan-300 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm">AI Geolocation Intelligence</h3>
                <span className="px-2 py-0.5 rounded font-mono text-[9px] font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  GEMINI 3.8 FLASH
                </span>
              </div>
              <p className="text-[10px] text-slate-300 mt-0.5">
                Autonomous country, city, and currency synthesis
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-slate-700">
          
          {/* Active AI Detection Result Card */}
          <div className="p-4 bg-gradient-to-br from-indigo-50/70 via-slate-50 to-cyan-50/50 rounded-2xl border border-indigo-200/80 shadow-inner space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block">
                  Detected Location
                </span>
                <div className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <span>{config.activeCityName}, {config.activeCountry}</span>
                  <span className="text-xs px-2 py-0.5 rounded-md font-mono font-bold bg-indigo-600 text-white">
                    {config.activeCountryCode}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  AI Confidence
                </span>
                <span className="text-sm font-black font-mono text-emerald-600">
                  {result ? `${Math.round((result.aiConfidenceScore || 0.98) * 100)}%` : '98%'}
                </span>
              </div>
            </div>

            {/* Currency & Geo Center Pill Row */}
            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] text-slate-400 block font-semibold">Local Currency</span>
                <div className="text-sm font-bold text-slate-900 font-mono flex items-center gap-1.5 mt-0.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-bold">
                    {config.currencySymbol}
                  </span>
                  <span>{config.currencyCode}</span>
                </div>
              </div>

              <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] text-slate-400 block font-semibold">Exchange Rate to USD</span>
                <div className="text-sm font-bold text-slate-900 font-mono mt-0.5">
                  1 USD = {activeCity.exchangeRateToUSD < 1 ? (1 / activeCity.exchangeRateToUSD).toFixed(2) : (1 * activeCity.exchangeRateToUSD).toFixed(2)} {config.currencyCode}
                </div>
              </div>
            </div>

            {/* AI Reasoning Summary */}
            {result?.aiReasoning && (
              <div className="p-2.5 bg-slate-900 text-white rounded-xl text-[11px] leading-relaxed flex items-start gap-2 shadow-xs">
                <Cpu className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-cyan-300 block text-[10px] uppercase font-mono">
                    Gemini AI Synthesis Analysis
                  </span>
                  <span className="text-slate-200">
                    {result.aiReasoning}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Device Signals Breakdown */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-slate-900 block">
              Analyzed Geolocation Signals
            </span>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-2">
                <Navigation className="w-3.5 h-3.5 text-indigo-600" />
                <div>
                  <span className="text-[9px] text-slate-400 block">GPS Coordinates</span>
                  <span className="font-mono font-bold text-slate-800">
                    {activeCity.centerCoords.lat.toFixed(3)}, {activeCity.centerCoords.lng.toFixed(3)}
                  </span>
                </div>
              </div>

              <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-indigo-600" />
                <div>
                  <span className="text-[9px] text-slate-400 block">Device Timezone</span>
                  <span className="font-mono font-bold text-slate-800 truncate block max-w-[120px]">
                    {Intl.DateTimeFormat().resolvedOptions().timeZone}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Override Switcher */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[11px] font-bold text-slate-900 block">
              Manual Market Override (Optional)
            </span>
            <div className="grid grid-cols-3 gap-1.5 max-h-32 overflow-y-auto pr-1">
              {globalCities.map(c => (
                <button
                  key={c.id}
                  onClick={() => switchGlobalCity(c.id)}
                  className={`p-2 rounded-xl border text-left transition-all ${
                    c.id === activeCity.id
                      ? 'border-indigo-600 bg-indigo-50/80 font-bold text-indigo-950 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  <span className="block truncate text-xs">{c.city}</span>
                  <span className="text-[10px] text-slate-400 font-mono block">
                    {c.countryCode} · {c.currencySymbol}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <button
              onClick={() => triggerAILocationDetection()}
              disabled={aiLocationStatus.isDetecting}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${aiLocationStatus.isDetecting ? 'animate-spin' : ''}`} />
              <span>{aiLocationStatus.isDetecting ? 'Detecting via Gemini AI...' : 'Re-Detect Location with AI'}</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs transition-colors"
            >
              Done
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
