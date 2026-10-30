import React, { useState } from 'react';
import { useTuxi } from '../../context/TuxiContext';
import { 
  Truck, 
  Car, 
  ShieldCheck, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  FileText, 
  ArrowRight,
  Check,
  AlertTriangle
} from 'lucide-react';

interface DriverApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export type ApprovedTransportCategory = 'motorcycle' | 'car' | 'bakkie' | 'light_truck';

export const DriverApplicationModal: React.FC<DriverApplicationModalProps> = ({ isOpen, onClose }) => {
  const { 
    currentUser, 
    activeRole, 
    setActiveRole, 
    driverApplication, 
    submitDriverApplication 
  } = useTuxi();

  const isApproved = currentUser?.roles?.includes('TUXI_DELIVERY_DRIVER');
  const isPending = driverApplication?.status === 'PENDING';

  // Form State - strictly approved transport categories only (NO BICYCLES)
  const [transportType, setTransportType] = useState<ApprovedTransportCategory>('motorcycle');
  const [phone, setPhone] = useState<string>(currentUser?.phone || '+44 7700 900552');
  const [idDocumentNumber, setIdDocumentNumber] = useState<string>('ID-9928174');
  const [licenseNumber, setLicenseNumber] = useState<string>('DL-MOT-882104');
  const [vehiclePlate, setVehiclePlate] = useState<string>('LD24-TUX');
  const [vehicleMakeModel, setVehicleMakeModel] = useState<string>('Honda PCX 125 (2023)');
  
  // Transport-Specific Eligibility Checkboxes
  const [motorcycleGear, setMotorcycleGear] = useState<boolean>(true);
  const [vehicleRoadworthyInsurance, setVehicleRoadworthyInsurance] = useState<boolean>(true);
  const [backgroundConsent, setBackgroundConsent] = useState<boolean>(true);
  const [safetyPolicyConsent, setSafetyPolicyConsent] = useState<boolean>(true);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Mandatory National ID or Passport
    if (!idDocumentNumber.trim()) {
      setErrorMessage('Identity Verification: Valid National ID or Passport document number is required.');
      return;
    }

    // Mandatory Driving License across all approved transport classes
    if (!licenseNumber.trim()) {
      setErrorMessage(`Driving License: Valid motor vehicle driving license number is mandatory for ${transportType}.`);
      return;
    }

    // Mandatory License Plate / Registration
    if (!vehiclePlate.trim()) {
      setErrorMessage(`Vehicle Registration: Valid license plate number is mandatory for ${transportType}.`);
      return;
    }

    // Transport safety checks
    if (transportType === 'motorcycle' && !motorcycleGear) {
      setErrorMessage('Safety Requirement: Motorcycle riders must confirm Code A/A1 license, certified helmet, and reflective gear.');
      return;
    }

    if ((transportType === 'car' || transportType === 'bakkie' || transportType === 'light_truck') && !vehicleRoadworthyInsurance) {
      setErrorMessage('Insurance & Roadworthiness: Four-wheeled and commercial freight vehicles must hold valid commercial insurance and roadworthiness certification.');
      return;
    }

    if (!backgroundConsent || !safetyPolicyConsent) {
      setErrorMessage('Compliance Consent: Background screening consent and TUXI Safety Charter acceptance are mandatory.');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitDriverApplication({
        transportType,
        phone,
        idDocumentNumber,
        licenseNumber,
        vehiclePlate: vehiclePlate.toUpperCase().trim(),
        vehicleMakeModel,
        safetyGearConfirmed: true,
        backgroundCheckConsent: true
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Driver registration submission failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="driver-modal-title"
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-auto">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 id="driver-modal-title" className="font-black text-slate-900 dark:text-white text-base tracking-tight">
                TUXI Delivery Driver Registration
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-xs">
                Independent commercial courier &amp; logistics onboarding
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 overscroll-contain">
          
          {/* Policy Notice: Approved Categories Only */}
          <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-xs text-emerald-900 dark:text-emerald-300">
            <div className="font-bold flex items-center gap-1.5 mb-0.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Commercial Transport Policy &amp; Safety Standards</span>
            </div>
            <p className="text-[11px] text-emerald-800 dark:text-emerald-300/90 leading-relaxed">
              Approved commercial delivery transport is strictly limited to <strong>Motorcycle / Scooter, Car, Bakkie / Van, and Suitable Light Truck</strong>. All drivers require an approved driving licence, registered motor vehicle, and background verification before live shift activation.
            </p>
          </div>

          {/* Already Approved Driver View */}
          {isApproved ? (
            <div className="py-6 px-4 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto ring-8 ring-emerald-50 dark:ring-emerald-950/40">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Driver Account Verified &amp; Active
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  Your identity documents and vehicle licensing have been approved by TUXI Fleet Dispatch.
                </p>
              </div>
              <div className="pt-2 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveRole('driver');
                    onClose();
                  }}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Open Driver Cockpit</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : isPending ? (
            /* Pending Review State */
            <div className="py-6 px-4 text-center space-y-4">
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center mx-auto ring-8 ring-amber-50 dark:ring-amber-950/40">
                <Clock className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <div className="inline-block px-2.5 py-0.5 bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 text-[10px] font-mono font-bold rounded-full mb-1">
                  STATUS: IN REVIEW
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Driver Application Submitted
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                  Your application has been received and queued for administrative compliance verification. Live dispatch shifts and trip acceptance are locked until full identity and transport eligibility checks complete.
                </p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-left text-xs space-y-1.5 max-w-md mx-auto">
                <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Application Summary:
                </div>
                <div className="flex justify-between text-[11px] text-slate-600 dark:text-slate-400">
                  <span>Transport Category:</span>
                  <span className="font-semibold text-slate-900 dark:text-white capitalize">
                    {driverApplication?.transportType === 'light_truck' ? 'Light Truck' : driverApplication?.transportType || 'Motorcycle'}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-600 dark:text-slate-400">
                  <span>Registration Plate:</span>
                  <span className="font-mono text-slate-900 dark:text-white font-semibold">
                    {driverApplication?.vehiclePlate || 'LD24-TUX'}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-600 dark:text-slate-400">
                  <span>Driver's License:</span>
                  <span className="font-mono text-slate-900 dark:text-white font-semibold">
                    {driverApplication?.licenseNumber || 'DL-MOT-882104'}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-600 dark:text-slate-400">
                  <span>Submitted At:</span>
                  <span className="text-slate-900 dark:text-white">
                    {driverApplication?.submittedAt ? new Date(driverApplication.submittedAt).toLocaleDateString() : 'Just now'}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl text-left flex items-start gap-2 max-w-md mx-auto">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-[11px] text-amber-900 dark:text-amber-300">
                  <span className="font-semibold block">Protected Driver Cockpit Access</span>
                  Admin review is mandatory. No live shifts, delivery assignments, or customer location data can be accessed until verification is completed by fleet administrators.
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            /* Registration Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {errorMessage && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-start gap-2 text-xs text-rose-800 dark:text-rose-300">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* SECTION 1: Approved Transport Category Selection (NO BICYCLES) */}
              <div className="space-y-2">
                <label className="block text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wider">
                  1. Select Approved Commercial Transport Category
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'motorcycle' as const, label: 'Motorcycle / Scooter', icon: <Truck className="w-4 h-4" />, desc: 'Scooter / motorbike' },
                    { id: 'car' as const, label: 'Car', icon: <Car className="w-4 h-4" />, desc: 'Sedan / Hatchback' },
                    { id: 'bakkie' as const, label: 'Bakkie / Van', icon: <Truck className="w-4 h-4" />, desc: 'Light delivery vehicle' },
                    { id: 'light_truck' as const, label: 'Light Truck', icon: <Truck className="w-4 h-4" />, desc: 'Suitable freight truck' }
                  ].map(t => {
                    const isSelected = transportType === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTransportType(t.id)}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40 ring-2 ring-emerald-600/20 text-emerald-950 dark:text-emerald-200 font-bold'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={isSelected ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}>
                            {t.icon}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                        </div>
                        <div>
                          <div className="text-xs">{t.label}</div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">{t.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SECTION 2: Identity & Vehicle Verification Details */}
              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>2. Driver Identity &amp; Licensing</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">
                      Full Legal Name
                    </label>
                    <input
                      type="text"
                      disabled
                      value={`${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim() || 'TUXI Member'}
                      className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">
                      Government ID / Passport Number
                    </label>
                    <input
                      type="text"
                      value={idDocumentNumber}
                      onChange={(e) => setIdDocumentNumber(e.target.value)}
                      required
                      placeholder="e.g. ID-9928174"
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">
                      Contact Phone Number
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      placeholder="+44 7700 900552"
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">
                      Driver's License Number
                    </label>
                    <input
                      type="text"
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      required
                      placeholder="e.g. DL-MOT-882104"
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">
                      Vehicle License Plate Number
                    </label>
                    <input
                      type="text"
                      value={vehiclePlate}
                      onChange={(e) => setVehiclePlate(e.target.value)}
                      required
                      placeholder="e.g. LD24-TUX"
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono uppercase"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">
                      Vehicle Make, Model &amp; Year
                    </label>
                    <input
                      type="text"
                      value={vehicleMakeModel}
                      onChange={(e) => setVehicleMakeModel(e.target.value)}
                      required
                      placeholder="e.g. Honda PCX 125 / Toyota Hilux"
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 3: Transport-Specific Eligibility & Safety Checks */}
              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>3. Transport Eligibility &amp; Safety Compliance</span>
                </h3>

                <div className="space-y-2 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  {transportType === 'motorcycle' && (
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={motorcycleGear}
                        onChange={(e) => setMotorcycleGear(e.target.checked)}
                        className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <div className="text-[11px]">
                        <span className="font-semibold text-slate-900 dark:text-white block">Certified Helmet &amp; Reflective Safety Gear</span>
                        <span className="text-slate-500 dark:text-slate-400 text-[10.5px]">I hold a valid motorcycle license (Code A/A1), DOT/ECE certified helmet, and reflective gear.</span>
                      </div>
                    </label>
                  )}

                  {(transportType === 'car' || transportType === 'bakkie' || transportType === 'light_truck') && (
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={vehicleRoadworthyInsurance}
                        onChange={(e) => setVehicleRoadworthyInsurance(e.target.checked)}
                        className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <div className="text-[11px]">
                        <span className="font-semibold text-slate-900 dark:text-white block">Roadworthiness &amp; Goods-In-Transit Insurance</span>
                        <span className="text-slate-500 dark:text-slate-400 text-[10.5px]">I certify that the vehicle is roadworthy, passes statutory inspections, and maintains valid commercial or goods insurance.</span>
                      </div>
                    </label>
                  )}

                  <label className="flex items-start gap-2.5 cursor-pointer pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                    <input
                      type="checkbox"
                      checked={backgroundConsent}
                      onChange={(e) => setBackgroundConsent(e.target.checked)}
                      className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div className="text-[11px]">
                      <span className="font-semibold text-slate-900 dark:text-white block">Background Check &amp; Driving Record Consent</span>
                      <span className="text-slate-500 dark:text-slate-400 text-[10.5px]">I authorize TUXI compliance officers to perform mandatory criminal history and driving license status checks.</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                    <input
                      type="checkbox"
                      checked={safetyPolicyConsent}
                      onChange={(e) => setSafetyPolicyConsent(e.target.checked)}
                      className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div className="text-[11px]">
                      <span className="font-semibold text-slate-900 dark:text-white block">TUXI Courier Safety Charter</span>
                      <span className="text-slate-500 dark:text-slate-400 text-[10.5px]">Strict adherence to zero-tolerance substance policy, contactless parcel handling, and proof-of-delivery photo standards.</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Sticky Submit Footer - Always Visible on All Viewports */}
              <div className="sticky bottom-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-t border-slate-100 dark:border-slate-800 pt-3 pb-1 -mx-4 sm:-mx-6 px-4 sm:px-6 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !backgroundConsent || !safetyPolicyConsent}
                  className={`px-5 py-2.5 rounded-xl font-bold text-xs text-white transition-all shadow-md flex items-center gap-1.5 cursor-pointer ${
                    isSubmitting || !backgroundConsent || !safetyPolicyConsent
                      ? 'bg-slate-400 cursor-not-allowed opacity-70'
                      : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Submitting Registration...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-3.5 h-3.5" />
                      <span>Submit Driver Registration</span>
                    </>
                  )}
                </button>
              </div>

            </form>
          )}

        </div>

      </div>
    </div>
  );
};
