import React, { useState, useEffect } from 'react';
import { useTuxi } from '../../context/TuxiContext';
import { 
  AIExceptionItem, 
  AIWorkflowRun, 
  Rep, 
  Business,
  GlobalCity
} from '../../types';
import { InteractiveMap } from '../common/InteractiveMap';
import { AIInsightsDashboard } from './AIInsightsDashboard';
import { AIPersonalizedTipsCarousel } from './AIPersonalizedTipsCarousel';
import { IntegrationsManagementConsole } from './IntegrationsManagementConsole';
import { 
  ShieldAlert, 
  Sliders, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  FileSearch, 
  Map, 
  DollarSign, 
  Activity, 
  Settings, 
  Globe, 
  Check, 
  HelpCircle, 
  ChevronRight, 
  Flame, 
  RefreshCw,
  Users,
  Store,
  Truck,
  Plus,
  Compass,
  PieChart,
  Percent,
  Layers,
  ShoppingBag,
  Sparkles,
  Mic,
  Navigation,
  MapPin,
  TrendingUp,
  Clock,
  Server
} from 'lucide-react';

export const AdminAICommandCenter: React.FC = () => {
  const { 
    config, 
    updateConfig, 
    updateMonetization,
    toggleAIKillSwitch, 
    exceptions, 
    resolveException, 
    aiWorkflowRuns, 
    businesses, 
    allReps, 
    orders, 
    allDrivers,
    globalCities,
    switchGlobalCity,
    launchGlobalCity,
    formatPrice
  } = useTuxi();

  const [activeTab, setActiveTab] = useState<'overview' | 'global_launch' | 'monetization' | 'exceptions' | 'territories' | 'review' | 'finance' | 'integrations' | 'ai_logs' | 'ai_insights' | 'settings'>('overview');
  
  // Exception handling state
  const [selectedException, setSelectedException] = useState<AIExceptionItem | null>(null);
  const [overrideReason, setOverrideReason] = useState<string>('Supervisor verified exceptional border proximity waiver.');

  // Territory management
  const [inspectRep, setInspectRep] = useState<Rep>(allReps[0]);

  // Global City Launch Form State
  const [newCityName, setNewCityName] = useState<string>('');
  const [newCountryName, setNewCountryName] = useState<string>('');
  const [newCountryCode, setNewCountryCode] = useState<string>('US');
  const [newCurrencySymbol, setNewCurrencySymbol] = useState<string>('$');
  const [newCurrencyCode, setNewCurrencyCode] = useState<string>('USD');
  const [newExchangeRate, setNewExchangeRate] = useState<number>(1.0);
  const [newLat, setNewLat] = useState<number>(0);
  const [newLng, setNewLng] = useState<number>(0);
  const [cityLaunchFeedback, setCityLaunchFeedback] = useState<string>('');

  // Monetization Local Form State (initialized from config.monetization)
  const [monetizationForm, setMonetizationForm] = useState(config.monetization);
  const [monetizationSavedFeedback, setMonetizationSavedFeedback] = useState<boolean>(false);

  // High-level calculations
  const pendingExceptions = exceptions.filter(e => e.status === 'pending');
  const criticalCount = pendingExceptions.filter(e => e.priority === 'critical').length;
  const highCount = pendingExceptions.filter(e => e.priority === 'high').length;
  
  const totalGmv = orders.reduce((sum, o) => sum + o.total, 0) + 48250;
  const platformRevenue = Math.round(totalGmv * 0.15);
  const liveStores = businesses.filter(b => b.status === 'live').length;
  const underReviewStores = businesses.filter(b => b.status === 'under_review' || b.status === 'ai_checks').length;

  const handleLaunchCitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCityName.trim() || !newCountryName.trim()) return;

    launchGlobalCity({
      city: newCityName.trim(),
      country: newCountryName.trim(),
      countryCode: newCountryCode.trim().toUpperCase(),
      currencySymbol: newCurrencySymbol.trim(),
      currencyCode: newCurrencyCode.trim().toUpperCase(),
      exchangeRateToUSD: Number(newExchangeRate) || 1.0,
      centerCoords: {
        lat: Number(newLat) || 51.5074,
        lng: Number(newLng) || -0.1278
      }
    });

    setCityLaunchFeedback(`Market "${newCityName}, ${newCountryName}" successfully launched into TUXI Global Network!`);
    setNewCityName('');
    setNewCountryName('');
    setTimeout(() => setCityLaunchFeedback(''), 4000);
  };

  const handleSaveMonetization = (e: React.FormEvent) => {
    e.preventDefault();
    updateMonetization(monetizationForm);
    setMonetizationSavedFeedback(true);
    setTimeout(() => setMonetizationSavedFeedback(false), 3000);
  };

  // Responsive map height state for small screens (320px-430px) up to desktop
  const [mapHeight, setMapHeight] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) return '300px';
    if (typeof window !== 'undefined' && window.innerWidth < 1024) return '380px';
    return '480px';
  });

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 640) setMapHeight('300px');
      else if (window.innerWidth < 1024) setMapHeight('380px');
      else setMapHeight('480px');
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const ADMIN_TABS: { id: typeof activeTab; label: string; shortLabel: string; icon?: React.ReactNode; badge?: string | number; badgeColor?: string }[] = [
    { id: 'overview', label: 'Executive Overview', shortLabel: 'Overview' },
    { id: 'global_launch', label: `Global Launch Control (${globalCities.length})`, shortLabel: `Global (${globalCities.length})`, icon: <Globe className="w-3.5 h-3.5 text-indigo-600" /> },
    { id: 'monetization', label: 'Monetization & Plans Engine', shortLabel: 'Monetization', icon: <Percent className="w-3.5 h-3.5 text-indigo-600" /> },
    { id: 'exceptions', label: 'Exception Queue', shortLabel: 'Exceptions', badge: pendingExceptions.length > 0 ? pendingExceptions.length : undefined, badgeColor: 'bg-amber-500 text-white' },
    { id: 'territories', label: 'Territory Governance (20km)', shortLabel: 'Territories (20km)' },
    { id: 'review', label: `Application Inspector (${businesses.length})`, shortLabel: `Applications (${businesses.length})` },
    { id: 'finance', label: 'Finance & Royalties', shortLabel: 'Finance' },
    { id: 'integrations', label: 'External Integrations', shortLabel: 'Integrations', badge: '2G', badgeColor: 'bg-emerald-600 text-white' },
    { id: 'ai_insights', label: 'AI Insights & Metrics', shortLabel: 'AI Insights', icon: <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />, badge: 'NEW', badgeColor: 'bg-indigo-600 text-white' },
    { id: 'ai_logs', label: `AI Audit Trail (${aiWorkflowRuns.length})`, shortLabel: `Audit Trail (${aiWorkflowRuns.length})`, icon: <Activity className="w-3.5 h-3.5 text-indigo-500" /> },
    { id: 'settings', label: 'Platform Settings', shortLabel: 'Settings' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 overflow-x-hidden">
      
      {/* Top Banner: AI Authority & Kill Switch Bar */}
      <div className={`rounded-xl border p-3.5 sm:p-4 transition-all shadow-xs ${
        config.aiMasterKillSwitch 
          ? 'bg-rose-950 border-rose-800 text-rose-100 ring-2 ring-rose-500' 
          : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-start sm:items-center gap-2.5 sm:gap-3">
            <div className={`p-2 sm:p-2.5 rounded-lg shrink-0 mt-0.5 sm:mt-0 ${
              config.aiMasterKillSwitch ? 'bg-rose-800 text-white' : 'bg-slate-800 text-emerald-400'
            }`}>
              <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h1 className="text-sm sm:text-base font-bold">TUXI AI Autonomous Command Center</h1>
                <span className={`text-[9px] sm:text-[10px] font-mono px-1.5 sm:px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                  config.aiMasterKillSwitch 
                    ? 'bg-rose-600 text-white' 
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}>
                  {config.aiMasterKillSwitch ? 'AI Suspended' : 'Level-2 Active'}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                AI orchestrates routine onboarding, OCR extraction, distance logic, and dispatches. Human supervisors handle exceptions.
              </p>
            </div>
          </div>

          {/* Emergency Kill Switch Button */}
          <div className="flex items-center gap-3 w-full md:w-auto shrink-0">
            <button
              onClick={toggleAIKillSwitch}
              className={`w-full md:w-auto justify-center px-4 py-2 sm:py-2.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 min-h-[40px] cursor-pointer ${
                config.aiMasterKillSwitch
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md'
                  : 'bg-rose-600 hover:bg-rose-700 text-white shadow-md'
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                {config.aiMasterKillSwitch ? 'Resume AI Autonomous Mode' : 'Emergency AI Kill Switch'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Tab Selector Drawer (Discoverable dropdown for all 11 tabs on <1024px) */}
      <div className="lg:hidden bg-slate-100 p-2 sm:p-2.5 rounded-xl flex items-center justify-between gap-2 border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0 pl-1">
            Tab:
          </span>
          <select
            value={activeTab}
            onChange={e => setActiveTab(e.target.value as any)}
            aria-label="Select Admin Workspace"
            className="w-full text-xs font-bold bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer truncate shadow-2xs"
          >
            {ADMIN_TABS.map(tab => (
              <option key={tab.id} value={tab.id}>
                {tab.label}
              </option>
            ))}
          </select>
        </div>

        {pendingExceptions.length > 0 && activeTab !== 'exceptions' && (
          <button
            onClick={() => setActiveTab('exceptions')}
            className="shrink-0 px-2 py-1 bg-amber-500 text-white text-[10px] font-bold rounded-lg flex items-center gap-1 shadow-2xs cursor-pointer"
            title={`${pendingExceptions.length} pending exceptions require review`}
          >
            <span>{pendingExceptions.length} Pending</span>
          </button>
        )}
      </div>

      {/* Main Tabs Navigation (Horizontal pill track with touch scrolling) */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg overflow-x-auto text-xs font-semibold scrollbar-none">
        {ADMIN_TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                isActive ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full ${tab.badgeColor || 'bg-slate-200 text-slate-700'}`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: EXECUTIVE OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Gross Merchandise Value (GMV)</span>
              <div className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums mt-1">
                {config.currencySymbol}{totalGmv.toLocaleString()}
              </div>
              <span className="text-[11px] text-emerald-600 font-semibold mt-1 block">+18.4% this month</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Platform Net Revenue</span>
              <div className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums mt-1">
                {config.currencySymbol}{platformRevenue.toLocaleString()}
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">From Eats 15% &amp; Shop 12% fee</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">AI Automation Rate</span>
              <div className="text-xl sm:text-2xl font-black text-indigo-600 tabular-nums mt-1">
                86.2%
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">Routine workflows autonomous</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Pending Exceptions</span>
              <div className={`text-xl sm:text-2xl font-black tabular-nums mt-1 ${criticalCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                {pendingExceptions.length}
              </div>
              <span className="text-[11px] text-rose-500 font-semibold mt-1 block">{criticalCount} critical territory breach</span>
            </div>
          </div>

          {/* AI-Personalized Tips & Workflow Optimization Carousel */}
          <AIPersonalizedTipsCarousel 
            onNavigateTab={(tab) => setActiveTab(tab)} 
          />

          {/* AI Insights & Efficiency Quick Banner */}
          <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-700/60 rounded-2xl text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-600 text-cyan-300 shadow-xs border border-indigo-500/50 shrink-0">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm">AI Insights &amp; Request Efficiency Engine</h3>
                  <span className="px-2 py-0.5 rounded font-mono text-[9px] font-bold uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    GEMINI 3.8 FLASH
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    99.1% ACCURACY
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Visualizing request frequency &amp; speed across Location Detection (385ms), Voice Search (310ms), and Multi-Stop Route Optimization (64ms, -18.4% distance).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setActiveTab('ai_insights')}
                className="px-4 py-2 bg-gradient-to-r from-cyan-400 to-indigo-400 hover:from-cyan-300 hover:to-indigo-300 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>Open Full AI Insights Dashboard</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* AI Authority Matrix (Brief Section 5) */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">AI Authority Matrix &amp; Operational Guardrails</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Multi-tier governance model ensuring LLMs never make unreviewed legal, financial, or safety decisions alone.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500 bg-slate-50 px-2.5 py-1 rounded border border-slate-200">
                Rule Engine: v3.2.0
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-slate-900">Level 1: Routine Autonomous</span>
                  <span className="text-[10px] font-mono text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">AUTO</span>
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  OCR document extraction, distance calculation, category tagging, missing document reminders, FAQ customer queries.
                </p>
              </div>

              <div className="border border-slate-200 rounded-xl p-3 bg-indigo-50/30 border-indigo-200">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-indigo-950">Level 2: Conditional Approvals</span>
                  <span className="text-[10px] font-mono text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">CONDITIONAL</span>
                </div>
                <p className="text-indigo-900 leading-relaxed text-[11px]">
                  Autonomous store publication ONLY if location &le; 20 km, valid license attached, owner signed consent, and OCR score &ge; 90%.
                </p>
              </div>

              <div className="border border-slate-200 rounded-xl p-3 bg-amber-50/40 border-amber-200">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-amber-950">Level 3: Human Review</span>
                  <span className="text-[10px] font-mono text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">ESCALATE</span>
                </div>
                <p className="text-amber-900 leading-relaxed text-[11px]">
                  Out-of-territory claims (&gt;20km), license name mismatches, duplicate GPS coordinates, driver document anomalies, disputed refunds.
                </p>
              </div>

              <div className="border border-slate-200 rounded-xl p-3 bg-rose-50/40 border-rose-200">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-rose-950">Level 4: Owner / Admin Only</span>
                  <span className="text-[10px] font-mono text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">LOCKED</span>
                </div>
                <p className="text-rose-900 leading-relaxed text-[11px]">
                  Global commission rate adjustments, AI Kill Switch toggling, boundary perimeter overrides, financial reserve release.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Summary Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-indigo-600" />
                  Active Field Reps ({allReps.length})
                </span>
                <button onClick={() => setActiveTab('territories')} className="text-xs text-indigo-600 hover:underline">
                  Manage
                </button>
              </div>
              <div className="space-y-2 text-xs">
                {allReps.map(rep => (
                  <div key={rep.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                    <div>
                      <div className="font-semibold text-slate-900">{rep.name}</div>
                      <div className="text-[11px] text-slate-500">{rep.hubAddress.split(',')[0]} (20km)</div>
                    </div>
                    <span className="font-bold font-mono text-emerald-600">{rep.totalAcquiredBusinesses} stores</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-indigo-600" />
                  Active Couriers &amp; Drivers
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  {allDrivers.filter(d => d.isOnline).length} Online
                </span>
              </div>
              <div className="space-y-2 text-xs">
                {allDrivers.map(drv => (
                  <div key={drv.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                    <div>
                      <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${drv.isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        {drv.name}
                      </div>
                      <div className="text-[11px] text-slate-500 uppercase">{drv.vehicleType} · {drv.vehiclePlate}</div>
                    </div>
                    <span className="text-slate-600 font-mono text-[11px]">★ {drv.rating}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-indigo-600" />
                  Merchant Onboarding Funnel
                </span>
                <span className="text-xs text-slate-500">{businesses.length} Total</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center p-2 rounded bg-slate-50">
                  <span className="text-slate-600">Live Trading Stores</span>
                  <span className="font-bold text-emerald-600">{liveStores}</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded bg-slate-50">
                  <span className="text-slate-600">Under Review / AI Checks</span>
                  <span className="font-bold text-amber-600">{underReviewStores}</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded bg-slate-50">
                  <span className="text-slate-600">Needs Information</span>
                  <span className="font-bold text-indigo-600">{businesses.filter(b => b.status === 'needs_information').length}</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* TAB: GLOBAL LAUNCH CONTROL (WORLDWIDE LAUNCH ENGINE) */}
      {activeTab === 'global_launch' && (
        <div className="space-y-6">
          
          {/* Header Banner */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-indigo-600" />
                <h2 className="text-base font-bold text-slate-900">Global Worldwide Expansion &amp; City Launch Engine</h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Launch TUXI Eats, Shop, and Courier in any country and city worldwide. The app automatically adopts the local currency and geolocation.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Active Viewing Market:</span>
              <span className="font-bold text-xs font-mono px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg">
                {config.activeCityName} ({config.currencySymbol} {config.currencyCode})
              </span>
            </div>
          </div>

          {/* Quick Launch Form */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-indigo-600" />
                  Launch New City &amp; Country
                </h3>
                <p className="text-xs text-slate-500">Provide city coordinates and localized currency to deploy autonomous marketplace services.</p>
              </div>
              {cityLaunchFeedback && (
                <div className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 animate-fade-in">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{cityLaunchFeedback}</span>
                </div>
              )}
            </div>

            <form onSubmit={handleLaunchCitySubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">City Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Tokyo, Berlin, São Paulo"
                  value={newCityName}
                  onChange={e => setNewCityName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Country Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Japan, Germany, Brazil"
                  value={newCountryName}
                  onChange={e => setNewCountryName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Country Code (ISO-2) *</label>
                <input
                  type="text"
                  maxLength={2}
                  placeholder="e.g. JP, DE, BR"
                  value={newCountryCode}
                  onChange={e => setNewCountryCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono uppercase"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Currency Symbol *</label>
                <input
                  type="text"
                  placeholder="e.g. ¥, €, R$, $"
                  value={newCurrencySymbol}
                  onChange={e => setNewCurrencySymbol(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Currency Code (ISO-3) *</label>
                <input
                  type="text"
                  maxLength={3}
                  placeholder="e.g. JPY, EUR, BRL, USD"
                  value={newCurrencyCode}
                  onChange={e => setNewCurrencyCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono uppercase"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Center Latitude</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 35.6762"
                  value={newLat || ''}
                  onChange={e => setNewLat(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Center Longitude</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 139.6503"
                  value={newLng || ''}
                  onChange={e => setNewLng(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Launch Market Worldwide</span>
                </button>
              </div>
            </form>
          </div>

          {/* Launched Global Markets Grid */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Active Worldwide Markets Directory ({globalCities.length})</h3>
                <p className="text-xs text-slate-500">Click &quot;Switch to Market&quot; to test autonomous operations in that territory.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {globalCities.map(city => {
                const isActive = city.id === config.activeCityId;
                return (
                  <div
                    key={city.id}
                    className={`p-4 rounded-xl border transition-all text-xs space-y-3 ${
                      isActive 
                        ? 'border-indigo-600 bg-indigo-50/20 ring-2 ring-indigo-500/20 shadow-xs' 
                        : 'border-slate-200 bg-slate-50/40 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm text-slate-900">{city.city}</span>
                          <span className="font-mono text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-bold">
                            {city.countryCode}
                          </span>
                        </div>
                        <div className="text-slate-500 mt-0.5">{city.country}</div>
                      </div>

                      <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded">
                        {city.currencySymbol} ({city.currencyCode})
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-100">
                      <div className="text-slate-600">
                        Stores: <strong className="text-slate-900 font-mono">{city.activeStoresCount}</strong>
                      </div>
                      <div className="text-slate-600">
                        Couriers: <strong className="text-slate-900 font-mono">{city.activeDriversCount}</strong>
                      </div>
                      <div className="col-span-2 text-slate-400 font-mono text-[10px]">
                        Coords: {city.centerCoords.lat.toFixed(4)}, {city.centerCoords.lng.toFixed(4)}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      {isActive ? (
                        <span className="text-[11px] font-bold text-indigo-600 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />
                          <span>Active Market</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => switchGlobalCity(city.id)}
                          className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded text-[11px] font-semibold transition-colors"
                        >
                          Switch to Market
                        </button>
                      )}

                      <span className="text-[10px] font-mono text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">
                        ● LIVE 24/7
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* TAB: MONETIZATION & PLANS ENGINE (Brief Section 5 Spec) */}
      {activeTab === 'monetization' && (
        <div className="space-y-6">
          
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Percent className="w-5 h-5 text-indigo-600" />
                <h2 className="text-base font-bold text-slate-900">Monetization Plans &amp; Commission Tiering Engine</h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Fine-tune commission rates, subscriber tier incentives, merchant grocery fees, and delivery fulfillment splits.
              </p>
            </div>

            {monetizationSavedFeedback && (
              <div className="px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 animate-fade-in">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span>Monetization Plans Updated Successfully!</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSaveMonetization} className="space-y-6">
            
            {/* Section A: Eats Restaurant Plans */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Store className="w-4 h-4 text-orange-600" />
                  <span>TUXI Eats Restaurant Tiering Architecture</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Tiered options balancing visibility, promotional reach, and delivery radius.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
                
                {/* Lite Plan */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900">Lite Plan</span>
                    <span className="text-[10px] font-mono bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-bold">
                      MINIMAL RADIUS
                    </span>
                  </div>
                  <p className="text-slate-600 text-[11px] leading-relaxed">
                    The lowest delivery commission option. Restricts the restaurant&apos;s delivery radius and offers the lowest visibility in the app.
                  </p>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Delivery Commission (%)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="5"
                        max="50"
                        value={monetizationForm.eatsLiteCommission}
                        onChange={e => setMonetizationForm({ ...monetizationForm, eatsLiteCommission: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                      />
                      <span className="font-bold text-slate-500">%</span>
                    </div>
                  </div>
                </div>

                {/* Plus Plan */}
                <div className="p-4 rounded-xl border-2 border-indigo-200 bg-indigo-50/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-indigo-950">Plus Plan (15% – 20% Base)</span>
                    <span className="text-[10px] font-mono bg-indigo-600 text-white px-1.5 py-0.5 rounded font-bold">
                      POPULAR
                    </span>
                  </div>
                  <p className="text-slate-600 text-[11px] leading-relaxed">
                    Charges 25% for standard deliveries, but rises to 30% if the order is placed by a TUXI One subscription member.
                  </p>
                  <div className="space-y-2">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Standard Delivery Commission (%)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="10"
                          max="50"
                          value={monetizationForm.eatsPlusStandardCommission}
                          onChange={e => setMonetizationForm({ ...monetizationForm, eatsPlusStandardCommission: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                        />
                        <span className="font-bold text-slate-500">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">TUXI One Member Order Commission (%)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="10"
                          max="50"
                          value={monetizationForm.eatsPlusTuxiOneCommission}
                          onChange={e => setMonetizationForm({ ...monetizationForm, eatsPlusTuxiOneCommission: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold text-indigo-700"
                        />
                        <span className="font-bold text-slate-500">%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Premium Plan */}
                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-amber-950">Premium Plan</span>
                    <span className="text-[10px] font-mono bg-amber-500 text-white px-1.5 py-0.5 rounded font-bold">
                      MAX REACH
                    </span>
                  </div>
                  <p className="text-slate-600 text-[11px] leading-relaxed">
                    Charges a flat 20% commission in exchange for maximum placement radius, top search results, and targeted promotional support.
                  </p>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Flat Premium Commission (%)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="10"
                        max="40"
                        value={monetizationForm.eatsPremiumCommission}
                        onChange={e => setMonetizationForm({ ...monetizationForm, eatsPremiumCommission: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold text-amber-700"
                      />
                      <span className="font-bold text-slate-500">%</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Pickup & Self-Delivery */}
              <div className="pt-4 border-t border-slate-100">
                <h4 className="font-bold text-slate-900 text-xs mb-3">Pickup &amp; Self-Delivery Commission Reductions</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <label className="block font-semibold text-slate-700 mb-1">
                      Customer Pickup Commission (Matching In-Store Pricing) (%)
                    </label>
                    <p className="text-[11px] text-slate-500 mb-2">
                      If customer orders for pickup, commission drops to 5% (provided in-app pricing matches in-store pricing) or 7%.
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="2"
                        max="15"
                        value={monetizationForm.pickupDiscountCommission}
                        onChange={e => setMonetizationForm({ ...monetizationForm, pickupDiscountCommission: Number(e.target.value) })}
                        className="w-32 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                      />
                      <span className="font-bold text-slate-500">% (5% - 7%)</span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <label className="block font-semibold text-slate-700 mb-1">
                      Restaurant Self-Delivery Platform Fee (%)
                    </label>
                    <p className="text-[11px] text-slate-500 mb-2">
                      If the restaurant uses its own delivery staff, TUXI takes a reduced 10% platform fee.
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="5"
                        max="20"
                        value={monetizationForm.selfDeliveryCommission}
                        onChange={e => setMonetizationForm({ ...monetizationForm, selfDeliveryCommission: Number(e.target.value) })}
                        className="w-32 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                      />
                      <span className="font-bold text-slate-500">%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Section B: Shop & Retail Grocery Monetization */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-emerald-600" />
                  <span>TUXI Shop &amp; Grocery Retail Partner Economics</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Differentiated commission by partner scale, physical labor fulfillment, and consumer service fees.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
                
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                  <span className="font-bold text-slate-900 block">National Chains Rate (%)</span>
                  <p className="text-slate-500 text-[11px] leading-relaxed">
                    Large national chains (Costco, supermarkets) negotiate lower custom volume rates (10%–12%).
                  </p>
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="number"
                      min="5"
                      max="20"
                      value={monetizationForm.shopChainCommission}
                      onChange={e => setMonetizationForm({ ...monetizationForm, shopChainCommission: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                    />
                    <span className="font-bold text-slate-500">%</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                  <span className="font-bold text-slate-900 block">Independent Stores Rate (%)</span>
                  <p className="text-slate-500 text-[11px] leading-relaxed">
                    Smaller independent grocery stores, bodegas, and boutique retail pay closer to 20%–25%.
                  </p>
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="number"
                      min="15"
                      max="35"
                      value={monetizationForm.shopIndependentCommission}
                      onChange={e => setMonetizationForm({ ...monetizationForm, shopIndependentCommission: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                    />
                    <span className="font-bold text-slate-500">%</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                  <span className="font-bold text-slate-900 block">Shop &amp; Deliver Surcharge (%)</span>
                  <p className="text-slate-500 text-[11px] leading-relaxed">
                    When courier walks aisles &amp; pays with TUXI prepaid card instead of merchant packing (+5%).
                  </p>
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="number"
                      min="0"
                      max="15"
                      value={monetizationForm.shopAndDeliverCourierSurcharge}
                      onChange={e => setMonetizationForm({ ...monetizationForm, shopAndDeliverCourierSurcharge: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold text-indigo-700"
                    />
                    <span className="font-bold text-slate-500">%</span>
                  </div>
                </div>

              </div>

              {/* Customer Grocery Fee */}
              <div className="p-3.5 sm:p-4 bg-emerald-50/40 border border-emerald-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-bold text-slate-900 text-xs block">Customer Grocery Service Fee (%)</span>
                  <p className="text-slate-600 text-[11px] mt-0.5">
                    To balance low grocery margins, consumers pay a 5% service fee on grocery subtotals alongside delivery fees.
                  </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                  <input
                    type="number"
                    min="1"
                    max="15"
                    value={monetizationForm.groceryCustomerServiceFeePercent}
                    onChange={e => setMonetizationForm({ ...monetizationForm, groceryCustomerServiceFeePercent: Number(e.target.value) })}
                    className="w-24 px-3 py-2 border border-emerald-300 rounded-lg text-xs font-mono font-bold text-emerald-800 bg-white"
                  />
                  <span className="font-bold text-slate-600">%</span>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all min-h-[40px] cursor-pointer"
              >
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Save &amp; Propagate Monetization Plans</span>
              </button>
            </div>

          </form>

        </div>
      )}
      {activeTab === 'exceptions' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Admin Exception Queue</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Only items requiring human intervention. Autonomous routine operations bypass this queue.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-600">
                {pendingExceptions.length} Actionable Items
              </span>
            </div>

            {pendingExceptions.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-500">
                <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                <p className="font-bold text-slate-800 text-sm">Exception Queue is Clear</p>
                <p className="text-slate-400 mt-1">All live applications comply with territory boundaries and AI confidence rules.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingExceptions.map(exc => (
                  <div 
                    key={exc.id} 
                    className={`border rounded-xl p-4 transition-all text-xs ${
                      exc.priority === 'critical'
                        ? 'border-rose-200 bg-rose-50/30'
                        : 'border-amber-200 bg-amber-50/20'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                            exc.priority === 'critical' 
                              ? 'bg-rose-600 text-white' 
                              : 'bg-amber-500 text-white'
                          }`}>
                            {exc.priority} priority
                          </span>
                          <span className="font-bold text-sm text-slate-900">{exc.title}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-500 font-mono text-[11px]">{new Date(exc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-slate-700 font-medium">{exc.description}</p>
                        
                        {/* Evidence & AI Reasoning */}
                        <div className="mt-2 p-2.5 rounded-lg bg-white border border-slate-200 space-y-1.5">
                          <div className="text-[11px] text-slate-500">
                            <strong>Evidence:</strong> {exc.evidence}
                          </div>
                          <div className="text-[11px] text-indigo-900 bg-indigo-50 p-1.5 rounded">
                            <strong>AI Summary ({Math.round(exc.confidenceScore * 100)}% confidence):</strong> {exc.aiSummary}
                          </div>
                          <div className="text-[11px] text-emerald-800 font-semibold">
                            <strong>Recommended Action:</strong> {exc.recommendedNextStep}
                          </div>
                        </div>
                      </div>

                      {/* One-Click Resolution Actions */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 md:flex md:flex-col gap-2 w-full md:w-auto shrink-0 pt-2 md:pt-0">
                        <button
                          onClick={() => resolveException(exc.id, 'approve', overrideReason)}
                          className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-xs min-h-[38px] cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span>Approve with Override</span>
                        </button>
                        <button
                          onClick={() => resolveException(exc.id, 'request_info')}
                          className="w-full px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors min-h-[38px] cursor-pointer"
                        >
                          <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Request Missing Info</span>
                        </button>
                        <button
                          onClick={() => resolveException(exc.id, 'reject', 'Violation of platform acquisition policy')}
                          className="w-full px-3 py-2 border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors min-h-[38px] cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Reject Application</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: TERRITORY GOVERNANCE (Brief Section 4 & 6) */}
      {activeTab === 'territories' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Territory Management &amp; Multi-Rep Hub Map</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Backend geospatial engine maps all active Rep home hubs with their 20.0 km acquisition perimeters to prevent claim collisions.
              </p>
            </div>
            <div className="text-xs text-slate-500 font-mono self-start sm:self-auto shrink-0">
              Enforcement Mode: <span className="text-emerald-600 font-bold">STRICT_GEOSPATIAL</span>
            </div>
          </div>

          <InteractiveMap
            center={inspectRep.hubLocation}
            reps={allReps}
            activeRep={inspectRep}
            businesses={businesses}
            drivers={allDrivers}
            height={mapHeight}
          />

          {/* Rep Hub Selector & Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {allReps.map(rep => {
              const isSelected = rep.id === inspectRep.id;
              return (
                <div
                  key={rep.id}
                  onClick={() => setInspectRep(rep)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-cyan-600 bg-cyan-50/30 ring-2 ring-cyan-600/20'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900">{rep.name}</span>
                    <span className="text-[10px] font-mono bg-cyan-100 text-cyan-800 px-1.5 py-0.5 rounded font-bold">
                      {rep.territoryRadiusKm} km Hub
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">{rep.hubAddress}</div>
                  <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs text-slate-600">
                    <span>Acquired: <strong>{rep.totalAcquiredBusinesses}</strong></span>
                    <span>Disputes: <strong className={rep.onboardingDisputes > 0 ? 'text-amber-600' : 'text-slate-600'}>{rep.onboardingDisputes}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: APPLICATION DEEP DIVE REVIEW */}
      {activeTab === 'review' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Application Review &amp; Document Verification</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Inspect raw merchant documents side-by-side with OCR extracted fields and geospatial checks.
              </p>
            </div>
            <span className="text-xs text-slate-500">{businesses.length} Applications</span>
          </div>

          <div className="space-y-4">
            {businesses.map(biz => (
              <div key={biz.id} className="border border-slate-200 rounded-xl p-4 text-xs space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{biz.name}</span>
                      <span className="text-slate-400">·</span>
                      <span className="font-semibold capitalize text-slate-600">{biz.type} ({biz.category})</span>
                    </div>
                    <div className="text-slate-500 mt-0.5">{biz.address} · Owner: {biz.ownerName} ({biz.ownerEmail})</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                    biz.status === 'live' 
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {biz.status}
                  </span>
                </div>

                {/* Document preview if attached */}
                {biz.documents.length > 0 && (
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                    <span className="font-semibold text-slate-700 block">Attached Premises License &amp; OCR Data:</span>
                    {biz.documents.map(doc => (
                      <div key={doc.id} className="text-[11px] font-mono bg-white p-2 rounded border border-slate-200 flex items-center justify-between">
                        <span>{doc.name} (OCR Confidence: {Math.round((doc.confidenceScore || 0.9) * 100)}%)</span>
                        <span className="text-emerald-700 font-bold">✓ VERIFIED SEAL</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-slate-500">
                  <span>Registered by Rep: <strong>{biz.repName}</strong></span>
                  <span>Distance to Hub: <strong>{biz.distanceFromRepHubKm || 0} km</strong></span>
                  <div className="flex items-center gap-2">
                    {biz.status !== 'live' && (
                      <button
                        onClick={() => resolveException(`manual-${biz.id}`, 'approve')}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-medium"
                      >
                        Grant Approval
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: FINANCE & SETTLEMENTS */}
      {activeTab === 'finance' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900">Multi-Sided Financial Ledger &amp; Payout Batches</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Automated reconciliation of merchant revenues, driver delivery earnings, Rep bounties, and platform fees.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-xs text-slate-500 font-medium">Driver Payout Queue</span>
              <div className="text-2xl font-black text-slate-900 tabular-nums mt-1">{config.currencySymbol}530.50</div>
              <span className="text-[11px] text-slate-400 mt-1 block">2 online drivers pending payout</span>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-xs text-slate-500 font-medium">Merchant Payouts Pending</span>
              <div className="text-2xl font-black text-slate-900 tabular-nums mt-1">{config.currencySymbol}4,890.00</div>
              <span className="text-[11px] text-slate-400 mt-1 block">Net of platform commission</span>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-xs text-slate-500 font-medium">Rep Acquisition Bounties Accrued</span>
              <div className="text-2xl font-black text-indigo-600 tabular-nums mt-1">{config.currencySymbol}1,350.00</div>
              <span className="text-[11px] text-slate-400 mt-1 block">£150 per verified business</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB: EXTERNAL INTEGRATIONS & RELEASE READINESS (PHASE 2G) */}
      {activeTab === 'integrations' && (
        <IntegrationsManagementConsole />
      )}

      {/* TAB 6: AI AUDIT TRAIL (Brief Section 6) */}
      {activeTab === 'ai_logs' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Real-Time AI Activity &amp; Decision Stream</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Every consequential autonomous action logged with model version, confidence score, evidence, and outcome.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded">
              Auditable Stream
            </span>
          </div>

          <div className="space-y-2">
            {aiWorkflowRuns.map(run => (
              <div key={run.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-400">
                      {new Date(run.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="font-bold text-slate-800">{run.workflow.toUpperCase()}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-600">{run.targetName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-500">{run.modelVersion}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                      run.outcome === 'auto_approved'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {run.outcome}
                    </span>
                  </div>
                </div>
                <p className="text-slate-700 font-medium">{run.actionTaken}</p>
                <div className="text-[11px] text-slate-500 font-mono">
                  Reason: {run.reason} · Confidence: {Math.round(run.confidenceScore * 100)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 7: PLATFORM SETTINGS */}
      {activeTab === 'settings' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900">Global Marketplace Configuration &amp; Policies</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Target country configuration, commission structures, and AI autonomous approval thresholds.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            <div className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Operating Country &amp; Currency</label>
                <select
                  value={config.activeCountry}
                  onChange={e => {
                    const country = e.target.value as any;
                    let symbol = '£';
                    let code = 'GBP';
                    if (country === 'US') { symbol = '$'; code = 'USD'; }
                    else if (country === 'ZA') { symbol = 'R'; code = 'ZAR'; }
                    else if (country === 'CA') { symbol = 'CA$'; code = 'CAD'; }
                    updateConfig({ activeCountry: country, currencySymbol: symbol, currencyCode: code });
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                >
                  <option value="GB">United Kingdom (GBP £)</option>
                  <option value="US">United States (USD $)</option>
                  <option value="ZA">South Africa (ZAR R)</option>
                  <option value="CA">Canada (CAD CA$)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Rep Business-Acquisition Territory Radius (Default: 20 km)
                </label>
                <input
                  type="number"
                  value={config.repDefaultRadiusKm}
                  onChange={e => updateConfig({ repDefaultRadiusKm: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Rep One-Off Acquisition Bounty ({config.currencySymbol})
                </label>
                <input
                  type="number"
                  value={config.repAcquisitionBounty}
                  onChange={e => updateConfig({ repAcquisitionBounty: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  AI Level 2 Auto-Approval Confidence Threshold ({Math.round(config.autoApprovalMinConfidence * 100)}%)
                </label>
                <input
                  type="range"
                  min="0.70"
                  max="0.99"
                  step="0.01"
                  value={config.autoApprovalMinConfidence}
                  onChange={e => updateConfig({ autoApprovalMinConfidence: parseFloat(e.target.value) })}
                  className="w-full cursor-pointer"
                />
                <span className="text-[11px] text-slate-500 block mt-1">
                  Submissions with AI confidence below this threshold require Level 3 manual supervisor review.
                </span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Eats Platform Commission Rate (%)
                </label>
                <input
                  type="number"
                  value={config.monetization.eatsLiteCommission}
                  onChange={e => updateMonetization({ eatsLiteCommission: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Shop Platform Commission Rate (%)
                </label>
                <input
                  type="number"
                  value={config.monetization.shopChainCommission}
                  onChange={e => updateMonetization({ shopChainCommission: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: AI INSIGHTS & REQUEST TELEMETRY */}
      {activeTab === 'ai_insights' && (
        <AIInsightsDashboard />
      )}

    </div>
  );
};
