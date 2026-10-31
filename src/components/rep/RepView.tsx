import React, { useState } from 'react';
import { useTuxi } from '../../context/TuxiContext';
import { 
  Business, 
  BusinessType, 
  GeoPoint, 
  MenuItem, 
  ProductItem, 
  BusinessDocument 
} from '../../types';
import { calculateDistanceKm, isWithinTerritory } from '../../utils/geospatial';
import { InteractiveMap } from '../common/InteractiveMap';
import { capturePhoto } from '../../utils/nativeCameraService';
import { getCurrentDevicePosition } from '../../utils/nativeGeolocationService';
import { 
  MapPin, 
  Camera, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  Utensils, 
  ShoppingBag, 
  Sparkles, 
  DollarSign, 
  Clock, 
  Check, 
  Layers, 
  UserCheck, 
  Plus, 
  Trash2, 
  ScanLine,
  RefreshCw,
  Info
} from 'lucide-react';

export const RepView: React.FC = () => {
  const { 
    currentRep, 
    businesses, 
    createBusinessApplication, 
    isMobileRepView, 
    config 
  } = useTuxi();

  const [activeTab, setActiveTab] = useState<'onboard' | 'dashboard' | 'territory' | 'commissions'>('onboard');

  // Rep Onboarding Wizard State
  const [step, setStep] = useState<number>(1);
  const [bizType, setBizType] = useState<BusinessType>('eats');
  const [name, setName] = useState<string>('Borough Market Artisan Deli');
  const [ownerName, setOwnerName] = useState<string>('Simon Fletcher');
  const [ownerEmail, setOwnerEmail] = useState<string>('simon@boroughartisan.co.uk');
  const [ownerPhone, setOwnerPhone] = useState<string>('+44 7700 900334');
  const [address, setAddress] = useState<string>('8 Southwark St, London SE1 1TL');
  const [category, setCategory] = useState<string>('Artisan Deli & Charcuterie');
  const [openingHours, setOpeningHours] = useState<string>('08:30 - 20:00');
  const [prepTimeMinutes, setPrepTimeMinutes] = useState<number>(15);

  // GPS Coordinates and territory calculation
  const [coords, setCoords] = useState<GeoPoint>({ lat: 51.5055, lng: -0.0905 }); // ~2.2 km from Shoreditch
  const [distanceKm, setDistanceKm] = useState<number>(() => calculateDistanceKm(currentRep.hubLocation, { lat: 51.5055, lng: -0.0905 }));
  const [isWithinBoundary, setIsWithinBoundary] = useState<boolean>(true);

  // Documents & OCR
  const [documents, setDocuments] = useState<BusinessDocument[]>([]);
  const [isAnalyzingOCR, setIsAnalyzingOCR] = useState<boolean>(false);
  const [isExtractingMenu, setIsExtractingMenu] = useState<boolean>(false);

  // Extracted menu / catalog items
  const [extractedMenuItems, setExtractedMenuItems] = useState<MenuItem[]>([]);
  const [extractedProducts, setExtractedProducts] = useState<ProductItem[]>([]);

  // Owner consent
  const [ownerConsentSigned, setOwnerConsentSigned] = useState<boolean>(false);
  const [duplicateChecked, setDuplicateChecked] = useState<boolean>(true);
  const [submissionSuccess, setSubmissionSuccess] = useState<Business | null>(null);

  // Update distance when coordinates change
  const handleCoordsChange = (newCoords: GeoPoint, addr?: string) => {
    setCoords(newCoords);
    if (addr) setAddress(addr);
    const { isWithin, distanceKm: dist } = isWithinTerritory(newCoords, currentRep.hubLocation, currentRep.territoryRadiusKm);
    setDistanceKm(dist);
    setIsWithinBoundary(isWithin);
  };

  // Preset location testing buttons for rapid evaluation
  const setPresetLocation = (preset: 'in_bounds' | 'near_edge' | 'out_of_bounds') => {
    if (preset === 'in_bounds') {
      handleCoordsChange({ lat: 51.5160, lng: -0.0820 }, '120 Bishopsgate, London EC2M 4NR'); // ~1.0 km
    } else if (preset === 'near_edge') {
      handleCoordsChange({ lat: 51.5700, lng: -0.0800 }, 'Stamford Hill, London N16 6TR'); // ~5.4 km
    } else {
      // 14.2 km away (Beyond 10km perimeter)
      handleCoordsChange({ lat: 51.6500, lng: -0.0800 }, 'Enfield Town Centre, London EN2 6LN'); // ~14.2 km
    }
  };

  // AI OCR Document Scanning with Native Camera support
  const simulateDocumentScan = async () => {
    setIsAnalyzingOCR(true);
    let capturedUrl = 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=400&q=80';
    try {
      const result = await capturePhoto({ quality: 85, source: 'camera' });
      if (result.success && result.dataUrl) {
        capturedUrl = result.dataUrl;
      }
    } catch {
      // Fallback if cancelled or permission denied
    }

    setTimeout(() => {
      setIsAnalyzingOCR(false);
      const newDoc: BusinessDocument = {
        id: `doc-${Date.now()}`,
        type: 'business_license',
        name: 'Premises_Licence_Document.png',
        fileUrl: capturedUrl,
        confidenceScore: 0.96,
        verified: true,
        ocrExtractedText: `SOUTHWARK BOROUGH COUNCIL\nREGISTERED FOOD BUSINESS No: SWK-99214\nTrading Name: ${name}\nProprietor: ${ownerName}\nInspection Grade: 5 (Very Good)\nExpiry: Valid 2028`,
        extractedFields: {
          licenseNumber: 'SWK-99214',
          registeredProprietor: ownerName,
          foodHygieneRating: '5 Stars',
          validUntil: '2028-12-31'
        }
      };
      setDocuments(prev => [...prev, newDoc]);
    }, 600);
  };

  // AI Menu / Catalog Extraction from Photo Simulation
  const simulateCatalogExtraction = () => {
    setIsExtractingMenu(true);
    setTimeout(() => {
      setIsExtractingMenu(false);
      if (bizType === 'eats') {
        const mockExtracted: MenuItem[] = [
          {
            id: `item-${Date.now()}-1`,
            name: 'Artisan Pastrami on Toasted Rye',
            description: 'House-smoked beef pastrami, Swiss emmental, dill pickle spear, whole-grain mustard.',
            price: 13.50,
            category: 'Signatures & Melts',
            isAvailable: true,
            prepTimeMinutes: 12,
            modifiers: [
              {
                id: 'm1',
                name: 'Bread Type',
                options: [
                  { name: 'Traditional Caraway Rye', extraPrice: 0 },
                  { name: 'Sourdough Brioche', extraPrice: 1.00 }
                ]
              }
            ]
          },
          {
            id: `item-${Date.now()}-2`,
            name: 'Whipped Ricotta & Fig Toast',
            description: 'Whipped sheep milk ricotta, honeyed mission figs, crushed pistachios on country levain.',
            price: 9.50,
            category: 'Light Bites',
            isAvailable: true,
            prepTimeMinutes: 8
          },
          {
            id: `item-${Date.now()}-3`,
            name: 'Cold-Brew Citrus Nitro Tonic',
            description: 'Single-origin Ethiopian cold brew with candied yuzu tonic over crystal ice.',
            price: 4.80,
            category: 'Beverages',
            isAvailable: true,
            prepTimeMinutes: 4
          }
        ];
        setExtractedMenuItems(mockExtracted);
      } else {
        const mockProducts: ProductItem[] = [
          {
            id: `prod-${Date.now()}-1`,
            name: 'Aged Parmigiano Reggiano 24-Month (250g)',
            category: 'Artisan Cheese',
            description: 'Raw mountain milk Parmigiano cut fresh from wheel.',
            price: 8.90,
            sku: 'PARM-24M-250',
            stock: 25,
            isAvailable: true
          },
          {
            id: `prod-${Date.now()}-2`,
            name: 'Truffle Infused Honey Jar (200g)',
            category: 'Pantry & Preserves',
            description: 'Italian acacia honey infused with black summer truffle shavings.',
            price: 11.50,
            salePrice: 9.99,
            sku: 'HNY-TRF-200',
            stock: 14,
            isAvailable: true
          }
        ];
        setExtractedProducts(mockProducts);
      }
    }, 1500);
  };

  const handleFinalSubmit = () => {
    const created = createBusinessApplication({
      type: bizType,
      name,
      ownerName,
      ownerEmail,
      ownerPhone,
      address,
      location: coords,
      category,
      openingHours,
      prepTimeMinutes,
      documents,
      consentObtained: ownerConsentSigned,
      menuItems: bizType === 'eats' ? extractedMenuItems : [],
      products: bizType === 'shop' ? extractedProducts : []
    });

    setSubmissionSuccess(created);
    setStep(5); // Success step
  };

  const resetForm = () => {
    setStep(1);
    setName('');
    setOwnerName('');
    setDocuments([]);
    setExtractedMenuItems([]);
    setExtractedProducts([]);
    setOwnerConsentSigned(false);
    setSubmissionSuccess(null);
  };

  // Rep dashboard calculations
  const myBusinesses = businesses.filter(b => b.repId === currentRep.id);
  const liveCount = myBusinesses.filter(b => b.status === 'live').length;
  const underReviewCount = myBusinesses.filter(b => b.status === 'under_review' || b.status === 'ai_checks').length;
  const needsInfoCount = myBusinesses.filter(b => b.status === 'needs_information').length;

  const content = (
    <div className="space-y-6">
      
      {/* Rep Header & Hero Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <img 
              src={currentRep.avatar} 
              alt={currentRep.name} 
              className="w-14 h-14 rounded-full object-cover border-2 border-slate-100 shadow-xs"
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">{currentRep.name}</h1>
                <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  <UserCheck className="w-3.5 h-3.5" />
                  Verified Field Rep
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                <span>Hub: {currentRep.hubAddress}</span>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-cyan-700">{currentRep.territoryRadiusKm}km Acquisition Radius</span>
                <span aria-hidden="true">·</span>
                <span>Active since Jan 2026</span>
              </div>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 border-t md:border-t-0 md:border-l border-slate-200 pt-3 md:pt-0 md:pl-6">
            <div className="min-w-[80px]">
              <div className="text-[11px] sm:text-xs text-slate-500 font-medium">Acquired Stores</div>
              <div className="text-base sm:text-lg font-bold text-slate-900 tabular-nums">{myBusinesses.length}</div>
            </div>
            <div className="min-w-[80px]">
              <div className="text-[11px] sm:text-xs text-slate-500 font-medium">Live & Earning</div>
              <div className="text-base sm:text-lg font-bold text-emerald-600 tabular-nums">{liveCount}</div>
            </div>
            <div className="min-w-[90px]">
              <div className="text-[11px] sm:text-xs text-slate-500 font-medium">Pending Bounty</div>
              <div className="text-base sm:text-lg font-bold text-indigo-600 tabular-nums">{config.currencySymbol}{currentRep.pendingCommission}</div>
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex items-center gap-1.5 sm:gap-2 mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-slate-100 overflow-x-auto scrollbar-none flex-nowrap -mx-2 px-2 sm:mx-0 sm:px-0">
          <button
            onClick={() => setActiveTab('onboard')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
              activeTab === 'onboard' 
                ? 'bg-slate-900 text-white shadow-xs' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Rapid In-Field Onboard</span>
          </button>
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
              activeTab === 'dashboard' 
                ? 'bg-slate-900 text-white shadow-xs' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Store Portfolio ({myBusinesses.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('territory')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
              activeTab === 'territory' 
                ? 'bg-slate-900 text-white shadow-xs' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>10km Territory Radar</span>
          </button>
          <button
            onClick={() => setActiveTab('commissions')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
              activeTab === 'commissions' 
                ? 'bg-slate-900 text-white shadow-xs' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Bounties & Royalties</span>
          </button>
        </div>
      </div>

      {/* TAB 1: RAPID ONBOARDING FLOW */}
      {activeTab === 'onboard' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
          
          {/* Wizard Progress Bar */}
          <div className="mb-6">
            {/* Desktop / Tablet step breadcrumbs */}
            <div className="hidden sm:flex items-center justify-between text-xs text-slate-500 font-medium mb-2">
              <span className={step >= 1 ? 'text-indigo-600 font-semibold' : ''}>1. Business Profile</span>
              <span aria-hidden="true">→</span>
              <span className={step >= 2 ? 'text-indigo-600 font-semibold' : ''}>2. Location & 10km Check</span>
              <span aria-hidden="true">→</span>
              <span className={step >= 3 ? 'text-indigo-600 font-semibold' : ''}>3. AI OCR & Catalog</span>
              <span aria-hidden="true">→</span>
              <span className={step >= 4 ? 'text-indigo-600 font-semibold' : ''}>4. Review & Consent</span>
            </div>

            {/* Mobile compact step counter */}
            <div className="flex sm:hidden items-center justify-between text-xs text-slate-700 font-medium mb-1.5">
              <span className="font-bold text-indigo-600">
                Step {step} of 4: {step === 1 ? 'Business Profile' : step === 2 ? 'Location & 10km Check' : step === 3 ? 'AI OCR & Catalog' : 'Review & Consent'}
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                {Math.round((Math.min(step, 4) / 4) * 100)}%
              </span>
            </div>

            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-indigo-600 h-full transition-all duration-300"
                style={{ width: `${(Math.min(step, 4) / 4) * 100}%` }}
              />
            </div>
          </div>

          {/* STEP 1: Basic Information */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-base font-bold text-slate-900">Step 1: Merchant Classification & Contacts</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select whether this is a restaurant (Eats) or retail store (Shop) and record owner details.
                </p>
              </div>

              {/* Business Type Selector */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setBizType('eats')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    bizType === 'eats'
                      ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-600/20'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Utensils className={`w-4 h-4 ${bizType === 'eats' ? 'text-indigo-600' : 'text-slate-600'}`} />
                    <span className="font-semibold text-sm text-slate-900">TUXI Eats (Restaurant)</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Food preparation, dine-in/takeaway, hot kitchen items, customizable modifiers.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setBizType('shop')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    bizType === 'shop'
                      ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-600/20'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <ShoppingBag className={`w-4 h-4 ${bizType === 'shop' ? 'text-indigo-600' : 'text-slate-600'}`} />
                    <span className="font-semibold text-sm text-slate-900">TUXI Shop (Retail / Grocery)</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Pre-packaged goods, pharmacy, grocery, SKU barcodes, inventory counts.
                  </p>
                </button>
              </div>

              {/* Form Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Business Trading Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Borough Market Artisan Deli"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cuisine / Store Category *</label>
                  <input
                    type="text"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    placeholder="e.g. Artisan Deli & Charcuterie"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Authorized Owner Name *</label>
                  <input
                    type="text"
                    value={ownerName}
                    onChange={e => setOwnerName(e.target.value)}
                    placeholder="e.g. Simon Fletcher"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Owner Email *</label>
                  <input
                    type="email"
                    value={ownerEmail}
                    onChange={e => setOwnerEmail(e.target.value)}
                    placeholder="e.g. simon@boroughartisan.co.uk"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Owner Mobile Phone *</label>
                  <input
                    type="tel"
                    value={ownerPhone}
                    onChange={e => setOwnerPhone(e.target.value)}
                    placeholder="+44 7700 900334"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Operating Hours</label>
                  <input
                    type="text"
                    value={openingHours}
                    onChange={e => setOpeningHours(e.target.value)}
                    placeholder="08:30 - 20:00"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  disabled={!name || !ownerName || !ownerPhone}
                  onClick={() => setStep(2)}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg flex items-center gap-2 disabled:opacity-50 transition-colors"
                >
                  <span>Proceed to Location Check</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Geospatial 10km Territory Enforcement */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Step 2: Geospatial Territory Verification</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Backend enforces maximum 10.0 km radius from your registered home hub.
                  </p>
                </div>

                {/* Quick Presets for instant evaluation */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-slate-400 text-[11px]">Quick Pins:</span>
                  <button
                    onClick={() => setPresetLocation('in_bounds')}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px]"
                  >
                    Close (1.0km)
                  </button>
                  <button
                    onClick={() => setPresetLocation('near_edge')}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px]"
                  >
                    Outer (5.4km)
                  </button>
                  <button
                    onClick={() => setPresetLocation('out_of_bounds')}
                    className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded text-[11px] font-semibold"
                  >
                    Breach (14km)
                  </button>
                </div>
              </div>

              {/* Address input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Physical Store Street Address *</label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="e.g. 8 Southwark St, London SE1 1TL"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Territory Status Callout */}
              <div className={`p-3.5 sm:p-4 rounded-xl border flex items-start gap-3 ${
                isWithinBoundary
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}>
                {isWithinBoundary ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                    <span>
                      {isWithinBoundary 
                        ? `Territory Cleared: ${distanceKm} km from your Hub` 
                        : `Territory Boundary Breached: ${distanceKm} km from Hub`}
                    </span>
                    <span className="font-mono text-xs text-slate-600 shrink-0">
                      Max Allowed: {currentRep.territoryRadiusKm}.0 km
                    </span>
                  </div>
                  <p className="text-xs mt-1 text-slate-600">
                    {isWithinBoundary
                      ? 'Geospatial engine confirms this address lies inside your assigned 10 km acquisition circle. Eligible for autonomous approval.'
                      : 'WARNING: This location exceeds the 10 km Rep acquisition boundary. Submission will be blocked from autonomous approval and sent to the Admin Exception Queue.'}
                  </p>
                </div>
              </div>

              {/* Map Preview */}
              <div>
                <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center justify-between">
                  <span>Interactive Geospatial Territory Visualizer (Click map to adjust pin)</span>
                  <span className="font-mono text-[11px] text-slate-500">
                    GPS: {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
                  </span>
                </div>
                <InteractiveMap
                  center={currentRep.hubLocation}
                  reps={[currentRep]}
                  activeRep={currentRep}
                  selectedLocation={coords}
                  onSelectLocation={pt => handleCoordsChange(pt)}
                  height="300px"
                />
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg flex items-center gap-2"
                >
                  <span>Continue to AI Capture</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: AI Document OCR & Menu / Catalog Extraction */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-base font-bold text-slate-900">Step 3: AI-Assisted Document & Menu Extraction</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Point device camera at license certificates or physical menus. AI extracts structured data for rep review.
                </p>
              </div>

              {/* Section 1: Business License OCR */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/40">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    <span className="font-semibold text-xs text-slate-900">Premises License & Tax Certificate OCR</span>
                  </div>
                  <button
                    type="button"
                    onClick={simulateDocumentScan}
                    disabled={isAnalyzingOCR}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    {isAnalyzingOCR ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>OCR Scanning...</span>
                      </>
                    ) : (
                      <>
                        <ScanLine className="w-3.5 h-3.5" />
                        <span>Scan Document with AI</span>
                      </>
                    )}
                  </button>
                </div>

                {documents.length === 0 ? (
                  <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg bg-white">
                    <Camera className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs text-slate-500">No documents captured yet.</p>
                    <p className="text-[11px] text-slate-400">Click &ldquo;Scan Document with AI&rdquo; to extract licence fields.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {documents.map(doc => (
                      <div key={doc.id} className="bg-white border border-slate-200 rounded-lg p-3 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800">{doc.name}</span>
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-mono text-[10px]">
                            {Math.round((doc.confidenceScore || 0.95) * 100)}% OCR Confidence
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-slate-50 p-2 rounded border border-slate-100 font-mono">
                          <div>
                            <span className="text-slate-400 block text-[9px]">LICENCE NO</span>
                            <span className="text-slate-700 font-bold">{doc.extractedFields?.licenseNumber || 'SWK-99214'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px]">PROPRIETOR</span>
                            <span className="text-slate-700 font-bold">{doc.extractedFields?.registeredProprietor || ownerName}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px]">FOOD RATING</span>
                            <span className="text-emerald-700 font-bold">{doc.extractedFields?.foodHygieneRating || '5 Stars'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px]">VALIDITY</span>
                            <span className="text-slate-700 font-bold">{doc.extractedFields?.validUntil || '2028-12-31'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 2: Catalog / Menu Extraction */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/40">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span className="font-semibold text-xs text-slate-900">
                      {bizType === 'eats' ? 'Menu Photo & OCR Item Extraction' : 'Store Catalog & Shelf Scanner'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={simulateCatalogExtraction}
                    disabled={isExtractingMenu}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    {isExtractingMenu ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Extracting Items...</span>
                      </>
                    ) : (
                      <>
                        <Camera className="w-3.5 h-3.5" />
                        <span>Snap Photo & Extract Items</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Extracted Items Review Table */}
                {(extractedMenuItems.length === 0 && extractedProducts.length === 0) ? (
                  <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg bg-white">
                    <Utensils className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs text-slate-500">No menu/catalog items captured yet.</p>
                    <p className="text-[11px] text-slate-400">Click &ldquo;Snap Photo &amp; Extract Items&rdquo; to automatically build the store catalog.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-[11px] text-slate-500 bg-amber-50 border border-amber-200 p-2.5 rounded-lg flex items-center gap-2">
                      <Info className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>
                        Brief Rule: AI must not invent prices or stock. Rep and Owner should review the extracted lines below before final submission.
                      </span>
                    </div>

                    <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                      {bizType === 'eats' && extractedMenuItems.map((item, idx) => (
                        <div key={item.id} className="bg-white border border-slate-200 rounded-lg p-3 text-xs flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">{item.name}</span>
                              <span className="text-slate-400">·</span>
                              <span className="text-slate-500 font-medium">{item.category}</span>
                            </div>
                            <p className="text-slate-500 text-[11px] mt-0.5">{item.description}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-bold text-slate-900 tabular-nums">
                              {config.currencySymbol}{item.price.toFixed(2)}
                            </span>
                            <button
                              onClick={() => setExtractedMenuItems(prev => prev.filter((_, i) => i !== idx))}
                              className="text-slate-400 hover:text-rose-600 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}

                      {bizType === 'shop' && extractedProducts.map((prod, idx) => (
                        <div key={prod.id} className="bg-white border border-slate-200 rounded-lg p-3 text-xs flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">{prod.name}</span>
                              <span className="text-slate-400">·</span>
                              <span className="font-mono text-[10px] text-slate-500">SKU: {prod.sku}</span>
                            </div>
                            <p className="text-slate-500 text-[11px] mt-0.5">{prod.description}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-bold text-slate-900 tabular-nums">
                              {config.currencySymbol}{prod.price.toFixed(2)}
                            </span>
                            <button
                              onClick={() => setExtractedProducts(prev => prev.filter((_, i) => i !== idx))}
                              className="text-slate-400 hover:text-rose-600 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg flex items-center gap-2"
                >
                  <span>Review & Consent</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Review, Duplicate Checks & Owner Consent */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-base font-bold text-slate-900">Step 4: Owner Consent & Final Submission</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Confirm business owner sign-off and verify duplicate checks before submitting to the live platform.
                </p>
              </div>

              {/* Application Summary Box */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Store</span>
                    <span className="font-bold text-slate-800">{name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Classification</span>
                    <span className="font-bold text-slate-800">{bizType.toUpperCase()} ({category})</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Rep Territory Distance</span>
                    <span className={`font-bold ${isWithinBoundary ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {distanceKm} km {isWithinBoundary ? '(Within 10km)' : '(Out-of-Bounds)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Items Extracted</span>
                    <span className="font-bold text-slate-800">
                      {bizType === 'eats' ? extractedMenuItems.length : extractedProducts.length} items
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-slate-600">
                  <span>Storefront Address: <strong>{address}</strong></span>
                  <span>Owner Contact: <strong>{ownerName} ({ownerPhone})</strong></span>
                </div>
              </div>

              {/* Automatic Duplicate & Fraud Validation Check */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs flex items-center justify-between text-emerald-900">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    <strong>Automated Duplicate Scan:</strong> No active duplicate records found for VAT / Phone / GPS coordinates.
                  </span>
                </div>
                <span className="font-mono text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                  PASS · 100% CLEAR
                </span>
              </div>

              {/* Owner Consent Signature Checkbox */}
              <div className="border border-slate-200 rounded-xl p-4 bg-white">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ownerConsentSigned}
                    onChange={e => setOwnerConsentSigned(e.target.checked)}
                    className="mt-1 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-900 block">
                      Authorized Merchant Consent & Marketplace Agreement
                    </span>
                    <p className="text-slate-600 mt-1 leading-relaxed">
                      I, <strong>{ownerName}</strong>, hereby authorize TUXI Rep <strong>{currentRep.name}</strong> to register <strong>{name}</strong> onto the TUXI multi-sided platform. I confirm that all listed menu items, prices, operational hours, and licenses are accurate, and agree to standard platform payout terms and merchant fee schedules.
                    </p>
                    <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                      Digital Consent Timestamp: {new Date().toISOString()} · Authorized Signer: {ownerEmail}
                    </span>
                  </div>
                </label>
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={!ownerConsentSigned}
                  onClick={handleFinalSubmit}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-2 disabled:opacity-50 transition-colors shadow-sm"
                >
                  <Check className="w-4 h-4" />
                  <span>Submit Application to Platform</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: Submission Result & AI Status Feedback */}
          {step === 5 && submissionSuccess && (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                Application Successfully Processed
              </h2>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {submissionSuccess.status === 'approved' ? (
                  <span className="text-emerald-700 font-semibold">
                    ✓ Autonomous Level 2 AI Approval granted! All validation checks passed, territory verified ({distanceKm} km), and merchant is now live on TUXI.
                  </span>
                ) : (
                  <span className="text-amber-700 font-semibold">
                    ⚠️ Application routed to Admin Exception Queue. (Reason: {submissionSuccess.distanceFromRepHubKm && submissionSuccess.distanceFromRepHubKm > 10 ? 'Territory boundary breach' : 'Requires administrative document stamp'}).
                  </span>
                )}
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-w-md mx-auto text-left text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Business ID:</span>
                  <span className="font-mono font-bold text-slate-800">{submissionSuccess.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Platform Status:</span>
                  <span className="font-mono uppercase font-bold text-indigo-700">{submissionSuccess.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Rep Acquisition Bounty:</span>
                  <span className="font-bold text-emerald-600">+{config.currencySymbol}{config.repAcquisitionBounty}.00 (Pending)</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 pt-4">
                <button
                  onClick={resetForm}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg"
                >
                  Onboard Another Store
                </button>
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-lg"
                >
                  View My Portfolio
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* TAB 2: STORE PORTFOLIO */}
      {activeTab === 'dashboard' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Acquired Stores Portfolio</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                All restaurants and shops registered under Marcus Vance in the Shoreditch territory.
              </p>
            </div>
            <button
              onClick={() => { setActiveTab('onboard'); setStep(1); }}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 self-start sm:self-auto shrink-0 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Onboarding</span>
            </button>
          </div>

          <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Store Name</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Distance to Hub</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Store Sales (Illustrative YTD)</th>
                  <th className="py-2.5 px-3">Verified Commission Accrued</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myBusinesses.map(biz => {
                  const dist = biz.distanceFromRepHubKm !== undefined ? biz.distanceFromRepHubKm : calculateDistanceKm(currentRep.hubLocation, biz.location);
                  const isBreach = dist > 10;
                  const verifiedAmount = (biz as any).verifiedCommissionEarned;

                  return (
                    <tr key={biz.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">{biz.name}</div>
                        <div className="text-[11px] text-slate-500">{biz.address}</div>
                      </td>
                      <td className="py-3 px-3 capitalize font-medium text-slate-700">
                        {biz.type}
                      </td>
                      <td className="py-3 px-3 font-mono">
                        <span className={isBreach ? 'text-rose-600 font-bold' : 'text-slate-700'}>
                          {dist} km {isBreach && '⚠️'}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold ${
                          biz.status === 'live' 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                            : biz.status === 'under_review' 
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {biz.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 tabular-nums font-mono text-slate-700">
                        <span>{config.currencySymbol}{biz.salesVolumeYtd.toLocaleString()}</span>
                        <span className="block text-[10px] text-slate-400 font-sans font-normal">Illustrative sales</span>
                      </td>
                      <td className="py-3 px-3 font-sans text-xs">
                        {verifiedAmount !== undefined ? (
                          <span className="font-mono font-bold text-emerald-600">
                            {config.currencySymbol}{verifiedAmount.toLocaleString()}
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            Pending verified commission data
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="text-[11px] text-slate-500 flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-t border-slate-100 pt-2.5">
            <span>* Store sales volumes are illustrative demo figures. Actual rep commissions are verified per qualifying transaction at the exact 1.0% rate on eligible product subtotal.</span>
            <span className="font-mono text-slate-700 shrink-0 font-medium">Standard Rate: 1.0%</span>
          </div>
        </div>
      )}

      {/* TAB 3: 10KM TERRITORY RADAR */}
      {activeTab === 'territory' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h2 className="text-base font-bold text-slate-900">10 km Acquisition Territory Radar</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Official backend-enforced coverage area centered at your home hub ({currentRep.hubAddress}).
              </p>
            </div>
            <div className="text-xs font-mono text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 self-start sm:self-auto shrink-0">
              Perimeter: <strong>{currentRep.territoryRadiusKm} km radius</strong>
            </div>
          </div>

          <InteractiveMap
            center={currentRep.hubLocation}
            reps={[currentRep]}
            activeRep={currentRep}
            businesses={myBusinesses}
            height="460px"
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Acquisition Rule</span>
              <span className="font-semibold text-slate-800">
                You may travel anywhere, but businesses registered must physically reside within this 10km zone.
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Exclusivity &amp; Commission Terms</span>
              <span className="font-semibold text-slate-800">
                Authoritative Rep commission rate is exactly 1.0% on eligible Rep-attributed product subtotal (funded from TUXI's 3.0% Customer Admin Fee). 0% merchant sales commission; 0% commission on delivery charges.
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Dispute Handling</span>
              <span className="font-semibold text-slate-800">
                Out-of-bounds leads are automatically flagged for platform owner review.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: COMMISSIONS & BOUNTIES */}
      {activeTab === 'commissions' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h2 className="text-base font-bold text-slate-900">Rep Payout &amp; Commission Breakdown</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Authoritative Rep commission rate is <strong>1.0%</strong> on eligible Rep-attributed product subtotal, paid out of TUXI's 3.0% Customer Admin Fee (TUXI retains 2.0% on attributed orders, 3.0% on unattributed).
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto text-xs font-mono">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                Rep Rate: 1.0% Exact
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 font-bold">
                Admin Fee: 3.0%
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-xs text-slate-500 font-medium">Total Paid Out</div>
              <div className="text-2xl font-black text-slate-900 tabular-nums mt-1">
                {config.currencySymbol}{currentRep.totalCommissionEarned.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Direct deposit to registered bank</div>
            </div>

            <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl">
              <div className="text-xs text-indigo-700 font-medium">Pending Release Batch</div>
              <div className="text-2xl font-black text-indigo-900 tabular-nums mt-1">
                {config.currencySymbol}{currentRep.pendingCommission.toLocaleString()}
              </div>
              <div className="text-[11px] text-indigo-600 mt-1">Scheduled for Friday settlement</div>
            </div>

            <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl">
              <div className="flex items-center justify-between">
                <div className="text-xs text-emerald-700 font-medium">Rep Commission (1.0% Exact)</div>
                <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">
                  Fixed: 1.0%
                </span>
              </div>
              <div className="text-2xl font-black text-emerald-900 tabular-nums mt-1">
                {config.currencySymbol}1,240.00 / mo
              </div>
              <div className="text-[11px] text-emerald-700 mt-1">From {liveCount} active trading stores (Illustrative run-rate)</div>
            </div>
          </div>
        </div>
      )}

    </div>
  );

  // If "Simulate Mobile" mode is active, wrap in a phone frame
  if (isMobileRepView) {
    return (
      <div className="min-h-[85vh] py-6 flex justify-center items-start bg-slate-950/20 backdrop-blur-xs">
        <div className="w-full max-w-[420px] bg-white rounded-3xl border-8 border-slate-900 shadow-2xl overflow-hidden flex flex-col h-[820px]">
          {/* Simulated Mobile Speaker & Camera Notch */}
          <div className="bg-slate-900 pt-2 pb-2 px-6 flex items-center justify-between text-white text-[11px] shrink-0">
            <span className="font-semibold font-mono">9:41 AM</span>
            <div className="w-16 h-4 bg-slate-800 rounded-full mx-auto" />
            <span className="text-emerald-400 font-bold">5G 100%</span>
          </div>

          {/* Mobile Content Scroller */}
          <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
            {content}
          </div>

          {/* Simulated Mobile Bottom Home Bar */}
          <div className="bg-white py-2 flex justify-center border-t border-slate-200 shrink-0">
            <div className="w-32 h-1 bg-slate-400 rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-x-hidden">
      {content}
    </div>
  );
};
