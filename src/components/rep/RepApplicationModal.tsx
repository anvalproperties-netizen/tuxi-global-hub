import React, { useState } from 'react';
import { useTuxi } from '../../context/TuxiContext';
import { 
  Users, 
  MapPin, 
  ShieldCheck, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  X, 
  Smartphone, 
  Wifi, 
  Car, 
  FileText,
  ArrowRight,
  Sparkles
} from 'lucide-react';

interface RepApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RepApplicationModal: React.FC<RepApplicationModalProps> = ({ isOpen, onClose }) => {
  const { 
    currentUser, 
    activeRole, 
    setActiveRole, 
    config, 
    repApplication, 
    submitRepApplication 
  } = useTuxi();

  const isApproved = currentUser?.roles?.includes('TUXI_REP');
  const isPending = repApplication?.status === 'PENDING' || repApplication?.status === 'PENDING_REVIEW';
  const isChangesRequested = repApplication?.status === 'CHANGES_REQUESTED';

  // Form State
  const [birthDate, setBirthDate] = useState<string>('1998-05-14');
  const [phone, setPhone] = useState<string>(currentUser?.phone || '+44 7700 900142');
  const [hasMobilePhone, setHasMobilePhone] = useState<boolean>(true);
  const [hasMobileData, setHasMobileData] = useState<boolean>(true);
  const [hasOwnTransport, setHasOwnTransport] = useState<boolean>(true);
  const [transportDetails, setTransportDetails] = useState<string>('Personal Vehicle / Scooter');
  const [streetAddress, setStreetAddress] = useState<string>('42 Redchurch Street');
  const [city, setCity] = useState<string>(config.activeCityName || 'London');
  const [postalCode, setPostalCode] = useState<string>('E2 7DD');
  const [countryCode, setCountryCode] = useState<string>(config.activeCountryCode || 'GB');
  const [agreedToTerms, setAgreedToTerms] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  // Age validation helper (Mandatory 18+)
  const calculateAge = (dobString: string): number => {
    const dob = new Date(dobString);
    if (isNaN(dob.getTime())) return 0;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  };

  const applicantAge = calculateAge(birthDate);
  const isAgeValid = applicantAge >= 18;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!isAgeValid) {
      setErrorMessage('Age Requirement: TUXI Rep applicants must be at least 18 years of age.');
      return;
    }

    if (!hasMobilePhone || !hasMobileData) {
      setErrorMessage('Connectivity Requirement: Reps must operate their own smartphone/tablet and maintain an active cellular mobile data plan.');
      return;
    }

    if (!hasOwnTransport) {
      setErrorMessage('Transport Requirement: Reps must confirm access to reliable personal transport to conduct on-site merchant territory visits.');
      return;
    }

    if (!streetAddress.trim() || !city.trim() || !postalCode.trim()) {
      setErrorMessage('Home Hub Requirement: Please specify your registered home hub address to establish your 10 km territory boundary.');
      return;
    }

    if (!agreedToTerms) {
      setErrorMessage('Terms Acceptance: You must affirmatively agree to the TUXI Rep Operating Agreement and Code of Conduct.');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitRepApplication({
        birthDate,
        phone,
        hasMobilePhone,
        hasMobileData,
        hasOwnTransport,
        transportDetails,
        hubAddress: {
          streetLine1: streetAddress,
          city,
          postalCode,
          countryCode,
          latitude: 51.5230,
          longitude: -0.0780
        },
        termsAccepted: true
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Application submission failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-auto">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center shadow-md">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight">TUXI Field Rep Application</h2>
              <p className="text-[11px] text-indigo-200">Merchant Acquisition &amp; 10 km Territory Development</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-xs text-slate-700 dark:text-slate-300">
          
          {/* STATE 1: Already Approved */}
          {isApproved ? (
            <div className="space-y-4 py-2">
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-sm text-emerald-900 dark:text-emerald-200">
                    Authorized &amp; Verified TUXI Rep
                  </h3>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1 leading-relaxed">
                    Your account holds verified <span className="font-mono font-bold">TUXI_REP</span> credentials with an active 10 km acquisition territory. You can access the Rep Hub at any time.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1.5 font-mono text-[11px]">
                <div className="text-slate-500 dark:text-slate-400">Rep Account: <span className="text-slate-900 dark:text-white font-bold">{currentUser?.email}</span></div>
                <div className="text-slate-500 dark:text-slate-400">Territory Limit: <span className="text-indigo-600 dark:text-indigo-400 font-bold">Strictly 10 km (10,000 metres) from home hub</span></div>
                <div className="text-slate-500 dark:text-slate-400">Authority: <span className="text-emerald-600 dark:text-emerald-400 font-bold">Autonomous Business Acquisition &amp; OCR Onboarding</span></div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveRole('rep');
                    onClose();
                  }}
                  className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer text-xs"
                >
                  <span>Open Rep Workspace</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : isPending ? (
            /* STATE 2: Application Pending Review */
            <div className="space-y-4 py-2">
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 animate-pulse" />
                <div>
                  <h3 className="font-bold text-sm text-amber-900 dark:text-amber-200">
                    Application Under Compliance Review
                  </h3>
                  <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                    Your TUXI Rep application has been registered and is pending verification by a platform administrator. In accordance with platform governance, the Rep Workspace remains locked until your identity, equipment eligibility, and 10 km territory hub are certified.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between text-[11px] pb-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500">Application Status</span>
                  <span className="font-mono font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 rounded">
                    PENDING ADMIN VERIFICATION
                  </span>
                </div>
                <div className="text-[11px] space-y-1 text-slate-600 dark:text-slate-400 font-mono">
                  <div>Applicant: <strong className="text-slate-800 dark:text-slate-200">{currentUser?.firstName} {currentUser?.lastName}</strong> ({currentUser?.email})</div>
                  <div>Registered Hub: <strong className="text-slate-800 dark:text-slate-200">{repApplication?.hubAddress || streetAddress}</strong></div>
                  <div>Assigned Radius: <strong className="text-indigo-600 dark:text-indigo-400">10 km (10,000 metres)</strong></div>
                  <div>Eligibility Checks: <strong className="text-emerald-600">Age 18+ • Device • Mobile Data Verified</strong></div>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                * TUXI maintains server-authoritative role verification. Once approved by administration, your profile switcher will automatically unlock the Rep Workspace.
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Close Window
                </button>
              </div>
            </div>
          ) : (
            /* STATE 3: Application Form */
            <form onSubmit={handleSubmit} className="space-y-5">
              
              {/* Notice Banner */}
              <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 text-indigo-950 dark:text-indigo-200">
                <div className="flex items-center gap-2 font-bold text-xs mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Become an Authorized TUXI Territory Representative</span>
                </div>
                <p className="text-[11px] text-indigo-800 dark:text-indigo-300 leading-relaxed">
                  Reps acquire and onboard local restaurants and shops within an exclusive <strong>10 km radius</strong> from their registered home hub. Earn autonomous commissions and recurring bounties for certified merchants.
                </p>
              </div>

              {isChangesRequested && (
                <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl space-y-1 text-xs text-amber-900 dark:text-amber-200">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Corrections Requested by Compliance Officer:</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    {repApplication?.rejectionReason || 'Please review and correct the required information below, then resubmit your registration for verification.'}
                  </p>
                </div>
              )}

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-start gap-2 text-rose-700 dark:text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="text-[11px] font-medium leading-snug">{errorMessage}</span>
                </div>
              )}

              {/* SECTION 1: Identity & Age Requirement */}
              <div className="space-y-3">
                <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                  <span>1. Identity &amp; Minimum Age (18+)</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">
                      Applicant Full Name
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
                      Date of Birth (Mandatory 18+)
                    </label>
                    <input
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      required
                      className={`w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border ${
                        !isAgeValid ? 'border-rose-400 focus:ring-rose-400' : 'border-slate-200 dark:border-slate-700 focus:ring-indigo-500'
                      } focus:outline-none focus:ring-2`}
                    />
                    {!isAgeValid && (
                      <span className="text-[10px] text-rose-600 font-semibold block mt-1">
                        Must be at least 18 years old (Current age: {applicantAge}).
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">
                    Direct Contact Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    placeholder="+44 7700 900142"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* SECTION 2: Equipment & Mobility Checklist */}
              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                  <span>2. Operational Equipment &amp; Field Mobility</span>
                </h3>

                <div className="space-y-2 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasMobilePhone}
                      onChange={(e) => setHasMobilePhone(e.target.checked)}
                      className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <div className="text-[11px]">
                      <span className="font-semibold text-slate-900 dark:text-white block">Own Smartphone or Tablet</span>
                      <span className="text-slate-500 dark:text-slate-400 text-[10.5px]">Must have high-resolution camera for AI OCR document scanning and photo catalog generation.</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                    <input
                      type="checkbox"
                      checked={hasMobileData}
                      onChange={(e) => setHasMobileData(e.target.checked)}
                      className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <div className="text-[11px]">
                      <span className="font-semibold text-slate-900 dark:text-white block">Active Cellular Mobile Data</span>
                      <span className="text-slate-500 dark:text-slate-400 text-[10.5px]">Requires real-time GPS boundary validation and merchant digital consent signing in the field.</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                    <input
                      type="checkbox"
                      checked={hasOwnTransport}
                      onChange={(e) => setHasOwnTransport(e.target.checked)}
                      className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <div className="text-[11px]">
                      <span className="font-semibold text-slate-900 dark:text-white block">Own Vehicle or Mobility Access</span>
                      <span className="text-slate-500 dark:text-slate-400 text-[10.5px]">Ability to travel independently across your assigned 10 km territory circle.</span>
                    </div>
                  </label>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">
                    Primary Mode of Transport
                  </label>
                  <select
                    value={transportDetails}
                    onChange={(e) => setTransportDetails(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Personal Car">Personal Motor Vehicle (Car)</option>
                    <option value="Motorcycle / Scooter">Motorcycle / Scooter</option>
                    <option value="Bakkie / Light Delivery">Bakkie / Light Delivery Vehicle</option>
                    <option value="Public Transit & Walking">Rapid Transit &amp; Walking</option>
                  </select>
                </div>
              </div>

              {/* SECTION 3: 10 km Territory Hub Address */}
              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                  <span>3. Home Hub &amp; 10 km Territory Perimeter</span>
                </h3>

                <div className="p-3 bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 rounded-xl text-cyan-950 dark:text-cyan-200 text-[11px] leading-relaxed">
                  <strong>Strict 10 km Rule:</strong> Your home hub establishes the permanent geographic center of your acquisition territory. You are authorized to onboard businesses residing strictly within <strong>10,000 metres (10 km)</strong> of this point.
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">
                      Street Address
                    </label>
                    <input
                      type="text"
                      value={streetAddress}
                      onChange={(e) => setStreetAddress(e.target.value)}
                      required
                      placeholder="e.g. 42 Redchurch Street"
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">City</label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        required
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">Postal Code</label>
                      <input
                        type="text"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        required
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">Country</label>
                      <input
                        type="text"
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                        required
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 4: Terms & Conditions Consent */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    required
                    className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                    I affirmatively certify that I am at least 18 years old, own required equipment and cellular data, and agree to the <strong>TUXI Rep Operating Agreement</strong>. I understand that all submissions undergo server-side territory verification and admin approval before activation.
                  </div>
                </label>
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
                  disabled={isSubmitting || !isAgeValid || !agreedToTerms}
                  className={`px-5 py-2.5 rounded-xl font-bold text-xs text-white transition-all shadow-md flex items-center gap-1.5 cursor-pointer ${
                    isSubmitting || !isAgeValid || !agreedToTerms
                      ? 'bg-slate-400 cursor-not-allowed opacity-70'
                      : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Submitting Application...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-3.5 h-3.5" />
                      <span>Submit Rep Application</span>
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
