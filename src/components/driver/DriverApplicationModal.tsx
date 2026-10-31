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
  AlertTriangle,
  Camera,
  CreditCard,
  Lock,
  Building,
  UserCheck
} from 'lucide-react';
import { SecureDocumentUploader } from '../common/SecureDocumentUploader';

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
  const isPending = driverApplication?.status === 'PENDING' || driverApplication?.status === 'PENDING_REVIEW';
  const isChangesRequested = driverApplication?.status === 'CHANGES_REQUESTED';

  // Wizard Step
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Form State
  const [fullLegalName, setFullLegalName] = useState<string>(
    `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim() || 'Alex James Turner'
  );
  const [phone, setPhone] = useState<string>(currentUser?.phone || '+27829998888');
  const [idDocumentNumber, setIdDocumentNumber] = useState<string>('9503125088081');
  const [residenceStreet, setResidenceStreet] = useState<string>('82 Bree Street');
  const [residenceCity, setResidenceCity] = useState<string>('Cape Town');
  const [residencePostalCode, setResidencePostalCode] = useState<string>('8001');

  // Transport details (STRICT APPROVED ONLY - BICYCLES PROHIBITED)
  const [transportType, setTransportType] = useState<ApprovedTransportCategory>('motorcycle');
  const [licenseNumber, setLicenseNumber] = useState<string>('DL-ZA-992184-A');
  const [vehiclePlate, setVehiclePlate] = useState<string>('CA 882-910');
  const [vehicleMakeModel, setVehicleMakeModel] = useState<string>('Honda PCX 150 (2023)');

  // Banking Details
  const [bankName, setBankName] = useState<string>('Standard Bank of South Africa');
  const [accountNumber, setAccountNumber] = useState<string>('10188299102');
  const [branchCode, setBranchCode] = useState<string>('051001');
  const [accountHolder, setAccountHolder] = useState<string>(fullLegalName);

  // Document Vault IDs
  const [idDocId, setIdDocId] = useState<string>('doc-vault-drv-id');
  const [proofOfResidenceDocId, setProofOfResidenceDocId] = useState<string>('doc-vault-drv-por');
  const [driverSelfieDocId, setDriverSelfieDocId] = useState<string>('doc-vault-drv-selfie');
  const [transportSelfieDocId, setTransportSelfieDocId] = useState<string>('doc-vault-drv-trans-selfie');
  const [licenseDocId, setLicenseDocId] = useState<string>('doc-vault-drv-license');
  const [roadworthyDocId, setRoadworthyDocId] = useState<string>('doc-vault-drv-roadworthy');
  const [payloadCertDocId, setPayloadCertDocId] = useState<string>('doc-vault-drv-payload');

  // Compliance Checkboxes
  const [safetyGearConfirmed, setSafetyGearConfirmed] = useState<boolean>(true);
  const [backgroundConsent, setBackgroundConsent] = useState<boolean>(true);
  const [safetyCharterConsent, setSafetyCharterConsent] = useState<boolean>(true);
  const [roadworthyInsuranceConfirmed, setRoadworthyInsuranceConfirmed] = useState<boolean>(true);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleStepNext = () => {
    setErrorMessage(null);
    if (currentStep === 1) {
      if (!fullLegalName.trim() || !idDocumentNumber.trim()) {
        setErrorMessage('Full legal name and National ID / Passport document number are mandatory.');
        return;
      }
      if (!phone.trim()) {
        setErrorMessage('Direct contact phone number is required.');
        return;
      }
    }
    if (currentStep === 2) {
      if (!licenseNumber.trim() || !vehiclePlate.trim() || !vehicleMakeModel.trim()) {
        setErrorMessage('Driver license number, vehicle registration plate, and make/model are required.');
        return;
      }
    }
    if (currentStep === 3) {
      if (!bankName.trim() || !accountNumber.trim() || !branchCode.trim()) {
        setErrorMessage('Bank name, account number, and branch code are required for driver payout settlement.');
        return;
      }
    }
    setCurrentStep(prev => Math.min(prev + 1, 4));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!backgroundConsent || !safetyCharterConsent || !roadworthyInsuranceConfirmed) {
      setErrorMessage('Safety Charter, background check consent, and commercial roadworthiness confirmation are mandatory.');
      return;
    }

    setIsSubmitting(true);
    try {
      const maskedAcct = accountNumber.length > 4 
        ? `••••••••${accountNumber.slice(-4)}` 
        : accountNumber;

      await submitDriverApplication({
        fullLegalName,
        transportType,
        phone,
        idDocumentNumber,
        licenseNumber,
        vehiclePlate: vehiclePlate.toUpperCase().trim(),
        vehicleMakeModel,
        residentialAddress: {
          line1: residenceStreet,
          city: residenceCity,
          postalCode: residencePostalCode
        },
        bankingDetails: {
          bankName,
          accountNumberMasked: maskedAcct,
          branchCode,
          accountHolder: accountHolder || fullLegalName
        },
        idDocumentDocId: idDocId,
        proofOfResidenceDocId,
        driverSelfieDocId,
        driverTransportSelfieDocId: transportSelfieDocId,
        driversLicenseDocId: licenseDocId,
        vehicleRoadworthyDocId: roadworthyDocId,
        payloadCertDocId: (transportType === 'bakkie' || transportType === 'light_truck') ? payloadCertDocId : undefined,
        safetyGearConfirmed,
        backgroundCheckConsent: backgroundConsent,
        safetyCharterConsent,
        roadworthyInsuranceConfirmed
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
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-auto">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-slate-900 dark:text-white text-base tracking-tight">
                TUXI Delivery Driver Onboarding
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-xs">
                Commercial Logistics &amp; Courier Fleet Verification
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
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 overscroll-contain text-xs text-slate-700 dark:text-slate-300">
          
          {/* Policy Notice: Approved Categories Only */}
          <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs text-emerald-900 dark:text-emerald-300">
            <div className="font-bold flex items-center gap-1.5 mb-0.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Approved Commercial Transport &amp; Bicycle Prohibition</span>
            </div>
            <p className="text-[11px] text-emerald-800 dark:text-emerald-300/90 leading-relaxed">
              Commercial deliveries are strictly limited to <strong>Motorcycle / Scooter, Car, Bakkie / Van, and Suitable Light Truck</strong>. Bicycles and electric bicycles are strictly prohibited.
            </p>
          </div>

          {/* STATE 1: Already Approved */}
          {isApproved ? (
            <div className="py-6 px-4 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto ring-8 ring-emerald-50 dark:ring-emerald-950/40">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Driver Credentials Verified &amp; Active
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  Your identity documents, vehicle registration, and driver credentials have been approved by fleet administrators.
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
            /* STATE 2: Pending Review */
            <div className="py-4 px-2 space-y-4">
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 animate-pulse" />
                <div>
                  <h3 className="font-bold text-sm text-amber-900 dark:text-amber-200">
                    Driver Application Under Fleet Compliance Review
                  </h3>
                  <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                    Your documents and transport details have been secured in the encrypted vault. Live dispatch shifts and delivery routing remain blocked until an authorized administrator verifies your license, vehicle roadworthiness, facial selfie, and banking records.
                  </p>
                </div>
              </div>

              {/* Status Verification Checklist */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2.5">
                <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="font-semibold text-slate-600 dark:text-slate-400">Application Status</span>
                  <span className="font-mono font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 rounded text-[11px]">
                    PENDING ADMIN VERIFICATION
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-400 block">Facial Liveness</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      <span>{driverApplication?.facial_liveness_status || 'PENDING'}</span>
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-400 block">Transport Selfie</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      <span>{driverApplication?.transport_selfie_status || 'PENDING'}</span>
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-400 block">Vehicle Docs</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      <span>{driverApplication?.vehicle_documents_status || 'PENDING'}</span>
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-400 block">Banking Status</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      <span>{driverApplication?.banking_verification_status || 'PENDING'}</span>
                    </span>
                  </div>
                </div>

                <div className="text-[11px] space-y-1 text-slate-600 dark:text-slate-400 font-mono pt-1">
                  <div>Applicant: <strong className="text-slate-800 dark:text-slate-200">{driverApplication?.full_legal_name || `${currentUser?.firstName} ${currentUser?.lastName}`}</strong></div>
                  <div>Transport: <strong className="text-emerald-600 dark:text-emerald-400 capitalize">{driverApplication?.transport_type || driverApplication?.transportType || 'Motorcycle'}</strong></div>
                  <div>License Plate: <strong className="text-slate-800 dark:text-slate-200">{driverApplication?.vehicle_plate || driverApplication?.vehiclePlate || 'CA 882-910'}</strong></div>
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
            /* STATE 3: Multi-Step Registration Wizard */
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Step Navigation Bar */}
              <div className="grid grid-cols-4 gap-1.5 pb-2 border-b border-slate-200 dark:border-slate-800">
                {[
                  { step: 1, label: 'Identity & Address' },
                  { step: 2, label: 'Vehicle & Transport' },
                  { step: 3, label: 'Banking Details' },
                  { step: 4, label: 'Compliance & Submit' }
                ].map(s => (
                  <button
                    key={s.step}
                    type="button"
                    onClick={() => { if (s.step < currentStep) setCurrentStep(s.step); }}
                    className={`text-center py-1.5 px-1 rounded-lg text-[10px] sm:text-xs font-semibold transition-all ${
                      currentStep === s.step 
                        ? 'bg-emerald-600 text-white font-bold' 
                        : currentStep > s.step 
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' 
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
                    <span>Corrections Requested by Fleet Dispatch:</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    {driverApplication?.rejectionReason || driverApplication?.rejection_reason || 'Please review and correct the required documentation below, then resubmit for compliance verification.'}
                  </p>
                </div>
              )}

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-start gap-2 text-rose-700 dark:text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="text-[11px] font-medium leading-snug">{errorMessage}</span>
                </div>
              )}

              {/* STEP 1: Identity & Address */}
              {currentStep === 1 && (
                <div className="space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>Legal Identity &amp; Residence</span>
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">1 of 4</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">
                        Driver Full Legal Name *
                      </label>
                      <input
                        type="text"
                        value={fullLegalName}
                        onChange={(e) => setFullLegalName(e.target.value)}
                        required
                        placeholder="Alex James Turner"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                        placeholder="9503125088081"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-2">
                      <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">
                        Residential Address Line 1 *
                      </label>
                      <input
                        type="text"
                        value={residenceStreet}
                        onChange={(e) => setResidenceStreet(e.target.value)}
                        required
                        placeholder="e.g. 82 Bree Street"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">
                        City *
                      </label>
                      <input
                        type="text"
                        value={residenceCity}
                        onChange={(e) => setResidenceCity(e.target.value)}
                        required
                        placeholder="Cape Town"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                  </div>

                  {/* ID Document Vault Upload */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                      <SecureDocumentUploader
                        label="Government ID / Passport Document"
                        documentType="ID_DOCUMENT"
                        entityType="DRIVER_APPLICATION"
                        entityId="driver-applicant"
                        helperText="Front page scan of National ID or Passport."
                        uploadedDocId={idDocId}
                        onUploadSuccess={(docId) => setIdDocId(docId)}
                        required
                      />
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                      <SecureDocumentUploader
                        label="Proof of Residence Document"
                        documentType="PROOF_OF_RESIDENCE"
                        entityType="DRIVER_APPLICATION"
                        entityId="driver-applicant"
                        helperText="Recent utility bill, lease, or statement."
                        uploadedDocId={proofOfResidenceDocId}
                        onUploadSuccess={(docId) => setProofOfResidenceDocId(docId)}
                        required
                      />
                    </div>
                  </div>

                  {/* Biometric Liveness & Selfies */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                        <Camera className="w-4 h-4 text-emerald-600" />
                        <span>Facial Selfie &amp; Verification Checks</span>
                      </span>
                      <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-mono text-[9px] font-bold rounded">
                        LIVENESS: PENDING INTEGRATION
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">
                      Per TUXI safety rules, biometric liveness verification is recorded honestly as pending external service integration until certified by a live provider.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <SecureDocumentUploader
                        label="Facial Selfie (Front Facing)"
                        documentType="DRIVER_SELFIE"
                        entityType="DRIVER_APPLICATION"
                        entityId="driver-applicant"
                        helperText="Clear well-lit photo of your face."
                        uploadedDocId={driverSelfieDocId}
                        onUploadSuccess={(docId) => setDriverSelfieDocId(docId)}
                        required
                      />

                      <SecureDocumentUploader
                        label="Driver-With-Transport Photo"
                        documentType="DRIVER_TRANSPORT_SELFIE"
                        entityType="DRIVER_APPLICATION"
                        entityId="driver-applicant"
                        helperText="Photo of yourself next to your delivery vehicle."
                        uploadedDocId={transportSelfieDocId}
                        onUploadSuccess={(docId) => setTransportSelfieDocId(docId)}
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: Vehicle & Transport (Bicycles Prohibited) */}
              {currentStep === 2 && (
                <div className="space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <Car className="w-4 h-4 text-emerald-600" />
                      <span>Approved Vehicle Category &amp; Registration</span>
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">2 of 4</span>
                  </div>

                  {/* Vehicle Class Selector */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'motorcycle' as const, label: 'Motorcycle / Scooter', desc: 'Scooter / motorbike' },
                      { id: 'car' as const, label: 'Car', desc: 'Sedan / Hatchback' },
                      { id: 'bakkie' as const, label: 'Bakkie / Van', desc: 'Light delivery vehicle' },
                      { id: 'light_truck' as const, label: 'Light Truck', desc: 'Suitable freight truck' }
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
                          <span className="text-xs block">{t.label}</span>
                          <span className="text-[10px] text-slate-400 mt-1 block">{t.desc}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">
                        Driving License Number *
                      </label>
                      <input
                        type="text"
                        value={licenseNumber}
                        onChange={(e) => setLicenseNumber(e.target.value)}
                        required
                        placeholder="DL-ZA-992184-A"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">
                        Vehicle License Plate *
                      </label>
                      <input
                        type="text"
                        value={vehiclePlate}
                        onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                        required
                        placeholder="CA 882-910"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-semibold mb-1">
                        Make &amp; Model *
                      </label>
                      <input
                        type="text"
                        value={vehicleMakeModel}
                        onChange={(e) => setVehicleMakeModel(e.target.value)}
                        required
                        placeholder="Honda PCX 150 (2023)"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Vehicle Documents Upload */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                      <SecureDocumentUploader
                        label="Driving License Document"
                        documentType="DRIVERS_LICENSE"
                        entityType="DRIVER_APPLICATION"
                        entityId="driver-applicant"
                        helperText="Front & back scan of valid code-appropriate driver license."
                        uploadedDocId={licenseDocId}
                        onUploadSuccess={(docId) => setLicenseDocId(docId)}
                        required
                      />
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                      <SecureDocumentUploader
                        label="Roadworthiness & Commercial Insurance"
                        documentType="VEHICLE_ROADWORTHY"
                        entityType="DRIVER_APPLICATION"
                        entityId="driver-applicant"
                        helperText="Vehicle roadworthy certificate & proof of active courier insurance."
                        uploadedDocId={roadworthyDocId}
                        onUploadSuccess={(docId) => setRoadworthyDocId(docId)}
                        required
                      />
                    </div>
                  </div>

                  {/* Freight / Bakkie Payload Certification */}
                  {(transportType === 'bakkie' || transportType === 'light_truck') && (
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                      <SecureDocumentUploader
                        label="Payload & Freight Capacity Certification"
                        documentType="PAYLOAD_CERTIFICATE"
                        entityType="DRIVER_APPLICATION"
                        entityId="driver-applicant"
                        helperText="Tare & GVM certificate confirming payload volume & weight limit."
                        uploadedDocId={payloadCertDocId}
                        onUploadSuccess={(docId) => setPayloadCertDocId(docId)}
                        required
                      />
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: Banking Details */}
              {currentStep === 3 && (
                <div className="space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-emerald-600" />
                      <span>Driver Payout Account &amp; Banking Details</span>
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
                        Driver trip earnings are paid directly into this bank account upon manual administrative account approval. No fake automated clearances are recorded.
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
                        placeholder="Standard Bank / FNB / Nedbank / Absa / Capitec"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                          placeholder="10188299102"
                          className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                          placeholder="051001"
                          className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                        placeholder="Alex James Turner"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                      <FileText className="w-4 h-4 text-emerald-600" />
                      <span>Fleet Safety Charter &amp; Submission</span>
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">4 of 4</span>
                  </div>

                  {/* Delivery Margin & Commercial Policy Notice */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1.5 text-[11px]">
                    <div className="font-bold text-slate-900 dark:text-white">
                      TUXI Delivery Pricing &amp; Driver Remuneration Architecture:
                    </div>
                    <ul className="space-y-1 text-slate-600 dark:text-slate-400 list-disc pl-4 font-mono">
                      <li>Customer Delivery Fee = Underlying Delivery Charge + R10 TUXI Platform Margin</li>
                      <li>Single Combined Customer Delivery Fee (No separate margin line items)</li>
                      <li>Driver Remuneration: Underlying Delivery Charge + 100% of customer tips</li>
                      <li>Rep Commission on Delivery Fees: <strong>0%</strong> (Reps do not earn on delivery charges)</li>
                    </ul>
                  </div>

                  {/* Safety Charter Checkboxes */}
                  <div className="space-y-2">
                    <label className="flex items-start gap-2.5 cursor-pointer p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
                      <input
                        type="checkbox"
                        checked={safetyCharterConsent}
                        onChange={(e) => setSafetyCharterConsent(e.target.checked)}
                        required
                        className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <div className="text-[11px] text-slate-700 dark:text-slate-300 leading-snug">
                        I agree to the <strong>TUXI Commercial Driver Safety Charter</strong>, certifying proper PPE (helmet/vest for motorcycle riders) and strict road safety compliance.
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
                      <input
                        type="checkbox"
                        checked={backgroundConsent}
                        onChange={(e) => setBackgroundConsent(e.target.checked)}
                        required
                        className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <div className="text-[11px] text-slate-700 dark:text-slate-300 leading-snug">
                        I grant consent for criminal record and driving licence verification screening by TUXI compliance officers.
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
                      <input
                        type="checkbox"
                        checked={roadworthyInsuranceConfirmed}
                        onChange={(e) => setRoadworthyInsuranceConfirmed(e.target.checked)}
                        required
                        className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <div className="text-[11px] text-slate-700 dark:text-slate-300 leading-snug">
                        I warrant that my vehicle maintains current roadworthiness certification and valid commercial third-party insurance.
                      </div>
                    </label>
                  </div>
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
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Continue to Step {currentStep + 1}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={isSubmitting || !backgroundConsent || !safetyCharterConsent || !roadworthyInsuranceConfirmed}
                    className={`px-5 py-2.5 rounded-xl font-bold text-xs text-white transition-all shadow-md flex items-center gap-1.5 cursor-pointer ${
                      isSubmitting || !backgroundConsent || !safetyCharterConsent || !roadworthyInsuranceConfirmed
                        ? 'bg-slate-400 cursor-not-allowed opacity-70'
                        : 'bg-emerald-600 hover:bg-emerald-500'
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
                        <span>Submit Driver Registration</span>
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
