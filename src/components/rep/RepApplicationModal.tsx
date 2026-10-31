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
  Sparkles,
  CreditCard,
  Building,
  Lock,
  Compass
} from 'lucide-react';
import { SecureDocumentUploader } from '../common/SecureDocumentUploader';

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

  // Multi-step Wizard Navigation
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Form State
  const [fullLegalName, setFullLegalName] = useState<string>(
    `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim() || 'Marcus Aurelius Rivera'
  );
  const [idDocumentNumber, setIdDocumentNumber] = useState<string>('9805145028084');
  const [birthDate, setBirthDate] = useState<string>('1998-05-14');
  const [phone, setPhone] = useState<string>(currentUser?.phone || '+27821112222');
  
  // Residence & Hub
  const [residenceStreet, setResidenceStreet] = useState<string>('14 Kloof Street');
  const [residenceCity, setResidenceCity] = useState<string>(config.activeCityName || 'Cape Town');
  const [residencePostalCode, setResidencePostalCode] = useState<string>('8001');
  const [hubStreetAddress, setHubStreetAddress] = useState<string>('14 Kloof Street');
  const [hubCity, setHubCity] = useState<string>(config.activeCityName || 'Cape Town');
  const [hubPostalCode, setHubPostalCode] = useState<string>('8001');

  // Eligibility
  const [hasMobilePhone, setHasMobilePhone] = useState<boolean>(true);
  const [hasMobileData, setHasMobileData] = useState<boolean>(true);
  const [hasOwnTransport, setHasOwnTransport] = useState<boolean>(true);
  const [transportDetails, setTransportDetails] = useState<string>('Personal Motor Vehicle (Car)');

  // Banking Details
  const [bankName, setBankName] = useState<string>('First National Bank (FNB)');
  const [accountNumber, setAccountNumber] = useState<string>('62881928374');
  const [branchCode, setBranchCode] = useState<string>('250655');
  const [accountHolder, setAccountHolder] = useState<string>(fullLegalName);

  // Uploaded Vault Document IDs
  const [idDocId, setIdDocId] = useState<string>('doc-vault-initial-id');
  const [proofOfResidenceDocId, setProofOfResidenceDocId] = useState<string>('doc-vault-initial-por');

  // Terms & Submission
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

  const handleStepNext = () => {
    setErrorMessage(null);
    if (currentStep === 1) {
      if (!fullLegalName.trim() || !idDocumentNumber.trim()) {
        setErrorMessage('Full legal name and National ID / Passport number are mandatory.');
        return;
      }
      if (!isAgeValid) {
        setErrorMessage('TUXI Rep applicants must be at least 18 years of age.');
        return;
      }
      if (!phone.trim()) {
        setErrorMessage('Valid mobile phone number is required.');
        return;
      }
    }
    if (currentStep === 2) {
      if (!residenceStreet.trim() || !residenceCity.trim() || !residencePostalCode.trim()) {
        setErrorMessage('Residential address is mandatory for territory hub verification.');
        return;
      }
      if (!hasMobilePhone || !hasMobileData) {
        setErrorMessage('Applicant must confirm ownership of smartphone and active cellular data.');
        return;
      }
    }
    if (currentStep === 3) {
      if (!bankName.trim() || !accountNumber.trim() || !branchCode.trim()) {
        setErrorMessage('Complete bank name, account number, and branch code are required.');
        return;
      }
    }
    setCurrentStep(prev => Math.min(prev + 1, 4));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!isAgeValid) {
      setErrorMessage('Age Requirement: TUXI Rep applicants must be at least 18 years of age.');
      return;
    }

    if (!agreedToTerms) {
      setErrorMessage('Terms Acceptance: You must agree to the TUXI Rep Commercial Representation Terms v2026.1.');
      return;
    }

    setIsSubmitting(true);
    try {
      const maskedAcct = accountNumber.length > 4 
        ? `••••••••${accountNumber.slice(-4)}` 
        : accountNumber;

      await submitRepApplication({
        fullLegalName,
        idDocumentNumber,
        birthDate,
        contactPhone: phone,
        hasMobilePhone,
        hasMobileData,
        hasOwnTransport,
        transportDetails,
        residentialAddress: {
          line1: residenceStreet,
          city: residenceCity,
          postalCode: residencePostalCode,
          country: 'ZA'
        },
        hubAddress: {
          streetLine1: hubStreetAddress,
          city: hubCity,
          postalCode: hubPostalCode,
          latitude: -33.9249,
          longitude: 18.4241
        },
        bankingDetails: {
          bankName,
          accountNumberMasked: maskedAcct,
          branchCode,
          accountHolder: accountHolder || fullLegalName
        },
        proofOfResidenceDocId,
        idDocumentDocId: idDocId,
        termsVersionId: 'v2026.1'
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Application submission failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-auto">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center shadow-md">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight">TUXI Field Rep Onboarding</h2>
              <p className="text-[11px] text-indigo-200">Autonomous Merchant Acquisition • Strict 10 km Territory Hub</p>
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
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs text-slate-700 dark:text-slate-300">
          
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
                    Your account holds verified <span className="font-mono font-bold">TUXI_REP</span> credentials with an active 10 km acquisition territory. You earn exactly <strong>1.0% Rep commission</strong> on eligible Rep-attributed product sales.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2 font-mono text-[11px]">
                <div className="text-slate-500 dark:text-slate-400">Rep Account: <span className="text-slate-900 dark:text-white font-bold">{currentUser?.email}</span></div>
                <div className="text-slate-500 dark:text-slate-400">Territory Limit: <span className="text-indigo-600 dark:text-indigo-400 font-bold">Strictly 10.00 km (10,000 metres)</span></div>
                <div className="text-slate-500 dark:text-slate-400">Commission Policy: <span className="text-emerald-600 dark:text-emerald-400 font-bold">Exact 1.0% attributed product subtotal</span></div>
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
                    Application Under Administrative Verification
                  </h3>
                  <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                    Your application and encrypted compliance documents have been vaulted. Per platform safety governance, Rep operational access remains blocked until manual administrator review verifies all identity, territory hub, and banking records.
                  </p>
                </div>
              </div>

              {/* Status Breakdown */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2.5">
                <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="font-semibold text-slate-600 dark:text-slate-400">Application Review</span>
                  <span className="font-mono font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 rounded text-[11px]">
                    PENDING ADMIN REVIEW
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-400 block text-[10px]">Proof of Residence</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      <span>{repApplication?.proof_of_residence_status || 'PENDING VERIFICATION'}</span>
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-400 block text-[10px]">Banking Verification</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      <span>{repApplication?.banking_verification_status || 'PENDING VERIFICATION'}</span>
                    </span>
                  </div>
                </div>

                <div className="text-[11px] space-y-1 text-slate-600 dark:text-slate-400 font-mono pt-1">
                  <div>Applicant: <strong className="text-slate-800 dark:text-slate-200">{repApplication?.full_legal_name || `${currentUser?.firstName} ${currentUser?.lastName}`}</strong></div>
                  <div>Territory Hub: <strong className="text-slate-800 dark:text-slate-200">{repApplication?.hub_street_line1 || hubStreetAddress}, {repApplication?.hub_city || hubCity}</strong></div>
                  <div>Territory Boundary: <strong className="text-indigo-600 dark:text-indigo-400">Strictly 10.00 km (10,000 metres)</strong></div>
                  <div>Commission Standard: <strong className="text-emerald-600 dark:text-emerald-400">1.0% Rep / 3.0% Admin Fee</strong></div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold rounded-xl transition-colors cursor-pointer text-xs"
                >
                  Close Window
                </button>
              </div>
            </div>
          ) : (
            /* STATE 3: Multi-Step Application Wizard */
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Step Indicator */}
              <div className="grid grid-cols-4 gap-1.5 pb-2 border-b border-slate-200 dark:border-slate-800">
                {[
                  { step: 1, label: 'Identity & Age' },
                  { step: 2, label: 'Hub & Mobility' },
                  { step: 3, label: 'Banking Details' },
                  { step: 4, label: 'Compliance & Submit' }
                ].map(s => (
                  <button
                    key={s.step}
                    type="button"
                    onClick={() => { if (s.step < currentStep) setCurrentStep(s.step); }}
                    className={`text-center py-1.5 px-1 rounded-lg text-[10px] sm:text-xs font-semibold transition-all ${
                      currentStep === s.step 
                        ? 'bg-indigo-600 text-white font-bold' 
                        : currentStep > s.step 
                        ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300' 
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                    }`}
                  >
                    <span className="hidden sm:inline">Step {s.step}: </span>{s.label}
                  </button>
                ))}
              </div>

              {isChangesRequested && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl space-y-1 text-xs text-amber-900 dark:text-amber-200">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Corrections Requested by Reviewer:</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    {repApplication?.rejectionReason || repApplication?.rejection_reason || 'Please review and correct the required information below, then resubmit for compliance verification.'}
                  </p>
                </div>
              )}

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-start gap-2 text-rose-700 dark:text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="text-[11px] font-medium leading-snug">{errorMessage}</span>
                </div>
              )}

              {/* STEP 1: Legal Identity & Minimum Age */}
              {currentStep === 1 && (
                <div className="space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-indigo-600" />
                      <span>Legal Identity &amp; Age Verification (18+)</span>
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">1 of 4</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">
                        Full Legal Name (as on ID) *
                      </label>
                      <input
                        type="text"
                        value={fullLegalName}
                        onChange={(e) => setFullLegalName(e.target.value)}
                        required
                        placeholder="Marcus Aurelius Rivera"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">
                        National ID or Passport Number *
                      </label>
                      <input
                        type="text"
                        value={idDocumentNumber}
                        onChange={(e) => setIdDocumentNumber(e.target.value)}
                        required
                        placeholder="e.g. 9805145028084"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">
                        Date of Birth (Mandatory 18+) *
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
                          Applicant must be at least 18 years old (Current age: {applicantAge}).
                        </span>
                      )}
                    </div>

                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">
                        Mobile Phone Number *
                      </label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        required
                        placeholder="+27821112222"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  {/* ID Document Vault Upload */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <SecureDocumentUploader
                      label="Upload Government Identity Document (ID / Passport)"
                      documentType="ID_DOCUMENT"
                      entityType="REP_APPLICATION"
                      entityId="rep-applicant"
                      helperText="Front page or clear scan of government-issued National ID or Passport. Encrypted in private vault."
                      uploadedDocId={idDocId}
                      onUploadSuccess={(docId) => setIdDocId(docId)}
                      required
                    />
                  </div>
                </div>
              )}

              {/* STEP 2: Residence, Home Hub & 10 km Territory */}
              {currentStep === 2 && (
                <div className="space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-indigo-600" />
                      <span>Residence, Home Hub &amp; 10 km Territory Perimeter</span>
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">2 of 4</span>
                  </div>

                  <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl text-indigo-950 dark:text-indigo-200 text-[11px] leading-relaxed">
                    <strong>Strict 10 km Rule:</strong> Your home hub establishes the permanent geographic boundary of your acquisition territory. You are authorized to acquire businesses strictly within <strong>10,000 metres (10.00 km)</strong> of your registered hub coordinates.
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">
                        Residential Street Address *
                      </label>
                      <input
                        type="text"
                        value={residenceStreet}
                        onChange={(e) => {
                          setResidenceStreet(e.target.value);
                          setHubStreetAddress(e.target.value);
                        }}
                        required
                        placeholder="e.g. 14 Kloof Street"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">City *</label>
                        <input
                          type="text"
                          value={residenceCity}
                          onChange={(e) => {
                            setResidenceCity(e.target.value);
                            setHubCity(e.target.value);
                          }}
                          required
                          className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">Postal Code *</label>
                        <input
                          type="text"
                          value={residencePostalCode}
                          onChange={(e) => {
                            setResidencePostalCode(e.target.value);
                            setHubPostalCode(e.target.value);
                          }}
                          required
                          className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Proof of Residence Vault Upload */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <SecureDocumentUploader
                      label="Proof of Residence (Utility Bill, Bank Statement, Lease)"
                      documentType="PROOF_OF_RESIDENCE"
                      entityType="REP_APPLICATION"
                      entityId="rep-applicant"
                      helperText="Must be dated within the last 3 months and clearly match your registered residential address."
                      uploadedDocId={proofOfResidenceDocId}
                      onUploadSuccess={(docId) => setProofOfResidenceDocId(docId)}
                      required
                    />
                  </div>

                  {/* Equipment & Mobility Checklist */}
                  <div className="space-y-2 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="font-semibold text-slate-900 dark:text-white block text-[11px]">
                      Required Field Equipment &amp; Connectivity
                    </span>
                    <label className="flex items-center gap-2 cursor-pointer text-[11px]">
                      <input
                        type="checkbox"
                        checked={hasMobilePhone}
                        onChange={(e) => setHasMobilePhone(e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span>Own smartphone/tablet with camera for digital merchant catalog onboarding</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-[11px]">
                      <input
                        type="checkbox"
                        checked={hasMobileData}
                        onChange={(e) => setHasMobileData(e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span>Active cellular mobile data plan for real-time 10 km GPS boundary verification</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-[11px]">
                      <input
                        type="checkbox"
                        checked={hasOwnTransport}
                        onChange={(e) => setHasOwnTransport(e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span>Independent personal transport to conduct in-person merchant visits</span>
                    </label>
                  </div>
                </div>
              )}

              {/* STEP 3: Banking Details & Verification */}
              {currentStep === 3 && (
                <div className="space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-indigo-600" />
                      <span>Banking Details &amp; Commission Settlement</span>
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">3 of 4</span>
                  </div>

                  {/* Honest Verification Badge */}
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-2.5">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-amber-900 dark:text-amber-200 text-xs">
                          Banking Status: PENDING VERIFICATION
                        </span>
                        <span className="px-1.5 py-0.5 bg-amber-200 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 text-[10px] font-mono font-bold rounded">
                          PENDING INTEGRATION
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-800 dark:text-amber-300/90 mt-1 leading-relaxed">
                        In strict adherence to financial honesty, banking verification remains pending until account confirmation is completed by an authorized administrator. Payouts require verified banking credentials.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">
                        Bank Name *
                      </label>
                      <input
                        type="text"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        required
                        placeholder="e.g. First National Bank (FNB)"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">
                          Account Number *
                        </label>
                        <input
                          type="text"
                          value={accountNumber}
                          onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                          required
                          placeholder="62881928374"
                          className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">
                          Branch Code *
                        </label>
                        <input
                          type="text"
                          value={branchCode}
                          onChange={(e) => setBranchCode(e.target.value.replace(/\D/g, ''))}
                          required
                          placeholder="250655"
                          className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">
                        Account Holder Full Legal Name *
                      </label>
                      <input
                        type="text"
                        value={accountHolder}
                        onChange={(e) => setAccountHolder(e.target.value)}
                        required
                        placeholder="Marcus Aurelius Rivera"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: Compliance & Submit */}
              {currentStep === 4 && (
                <div className="space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-indigo-600" />
                      <span>Commercial Terms &amp; Final Certification</span>
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">4 of 4</span>
                  </div>

                  {/* Commercial Policy Summary */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2 text-[11px]">
                    <div className="font-bold text-slate-900 dark:text-white">
                      TUXI Commercial Rules &amp; Remuneration Policy (v2026.1):
                    </div>
                    <ul className="space-y-1 text-slate-600 dark:text-slate-400 list-disc pl-4 font-mono">
                      <li>Customer Admin Fee: <strong>3.0%</strong> of eligible product subtotal</li>
                      <li>Rep Commission: <strong>EXACTLY 1.0%</strong> of qualifying Rep-attributed product subtotal</li>
                      <li>TUXI Platform Retained Fee on Attributed Orders: <strong>2.0%</strong></li>
                      <li>Merchant Sales Commission: <strong>0%</strong></li>
                      <li>Delivery Fees: <strong>0% Rep commission</strong> (delivery charges generate no rep earnings)</li>
                      <li>Territory Boundary: <strong>Strictly 10.00 km radius</strong> from registered home hub</li>
                    </ul>
                  </div>

                  {/* Terms Acceptance Checkbox */}
                  <label className="flex items-start gap-2.5 cursor-pointer p-3 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-xl border border-indigo-200 dark:border-indigo-800">
                    <input
                      type="checkbox"
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      required
                      className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <div className="text-[11px] text-slate-700 dark:text-slate-300 leading-snug">
                      I formally certify that all information submitted is true and accurate. I acknowledge that Rep operational privileges remain blocked until manual compliance verification completes, and I unconditionally accept the <strong>TUXI Rep Terms &amp; Conditions (v2026.1)</strong> including the exact 1.0% Rep commission policy.
                    </div>
                  </label>
                </div>
              )}

              {/* Wizard Footer Controls */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                {currentStep > 1 ? (
                  <button
                    type="button"
                    onClick={() => setCurrentStep(prev => prev - 1)}
                    className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Previous
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                )}

                {currentStep < 4 ? (
                  <button
                    type="button"
                    onClick={handleStepNext}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Continue to Step {currentStep + 1}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
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
                )}
              </div>

            </form>
          )}

        </div>

      </div>
    </div>
  );
};
