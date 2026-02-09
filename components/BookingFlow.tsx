import React, { useState, useEffect, useMemo } from 'react';
import { SERVICES, VEHICLE_SIZES, VEHICLE_YEARS, VEHICLE_MAKES, VEHICLE_COLORS, getServicePrice } from '../constants';
import { Service, VehicleInfo, vehicleDisplayString, type VehicleSize } from '../types';
import { inferVehicleSize, isSizeSmallerThan } from '../utils/vehicleSize';
import { loadSavedVehicle, saveSavedVehicle } from '../utils/savedVehicle';
import { getDetailingRecommendation } from '../services/gemini';
import { createPaymentIntent } from '../services/paymentMethods';
import type { PaymentMethodDisplay } from '../services/paymentMethods';

interface BookingFlowProps {
  onConfirm: (service: Service, scheduledAt?: string, vehicle?: VehicleInfo | null, chargedAmountCents?: number, paymentIntentId?: string) => void;
  onClose?: () => void;
  paymentMethods?: PaymentMethodDisplay[];
  defaultPaymentMethod?: PaymentMethodDisplay;
}

const currentYear = new Date().getFullYear();
const emptyVehicle: VehicleInfo = { year: String(currentYear), make: '', model: '', color: '' };

const BookingFlow: React.FC<BookingFlowProps> = ({ onConfirm, onClose, paymentMethods = [], defaultPaymentMethod }) => {
  const [selectedSize, setSelectedSize] = useState<VehicleSize>('sedan');
  const [selectedId, setSelectedId] = useState<string>(SERVICES[0].id);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ recommendation: string; reasoning: string } | null>(null);
  const [carInfo, setCarInfo] = useState('');
  const [showAiInput, setShowAiInput] = useState(false);
  const [viewingDetailService, setViewingDetailService] = useState<Service | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);

  const [vehicle, setVehicle] = useState<VehicleInfo>(emptyVehicle);
  const [saveVehicleForNextTime, setSaveVehicleForNextTime] = useState(false);
  const [savedVehicle, setSavedVehicle] = useState<VehicleInfo | null>(null);
  const [usingSavedVehicle, setUsingSavedVehicle] = useState(false);
  const [vehicleError, setVehicleError] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadSavedVehicle();
    setSavedVehicle(saved);
    if (saved?.size) setSelectedSize(saved.size);
  }, []);

  const inferredSize: VehicleSize | null = useMemo(() => {
    if (usingSavedVehicle && savedVehicle?.make?.trim() && savedVehicle?.model?.trim()) {
      return inferVehicleSize(savedVehicle.make, savedVehicle.model);
    }
    if (vehicle.make?.trim() && vehicle.model?.trim()) {
      return inferVehicleSize(vehicle.make, vehicle.model);
    }
    return null;
  }, [usingSavedVehicle, savedVehicle?.make, savedVehicle?.model, vehicle.make, vehicle.model]);

  useEffect(() => {
    if (inferredSize != null && isSizeSmallerThan(selectedSize, inferredSize)) {
      setSelectedSize(inferredSize);
    }
  }, [inferredSize, selectedSize]);

  const baseVehicle: VehicleInfo | null =
    usingSavedVehicle && savedVehicle
      ? savedVehicle
      : vehicle.year?.trim() && vehicle.make?.trim() && vehicle.model?.trim()
        ? { ...vehicle, color: vehicle.color?.trim() || undefined }
        : null;
  const effectiveVehicle: VehicleInfo | null = baseVehicle ? { ...baseVehicle, size: selectedSize } : null;

  const selectedPaymentMethod =
    paymentMethods.find((p) => p.id === selectedPaymentId) ?? defaultPaymentMethod ?? paymentMethods[0];

  useEffect(() => {
    if (defaultPaymentMethod) setSelectedPaymentId(defaultPaymentMethod.id);
    else if (paymentMethods.length > 0) setSelectedPaymentId(paymentMethods[0].id);
    else setSelectedPaymentId(null);
  }, [defaultPaymentMethod?.id, paymentMethods]);
  
  // Scheduling states
  const [bookingMode, setBookingMode] = useState<'now' | 'later'>('now');
  const [scheduledDate, setScheduledDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [scheduledTime, setScheduledTime] = useState('10:00');

  const handleAiAsk = async () => {
    if (!carInfo) return;
    setAiLoading(true);
    const result = await getDetailingRecommendation(carInfo, "A bit dirty after a road trip");
    setAiResult(result);
    setAiLoading(false);
    
    // Auto-select recommended service
    const matched = SERVICES.find(s => s.name.toLowerCase().includes(result.recommendation.toLowerCase()) || result.recommendation.toLowerCase().includes(s.name.toLowerCase()));
    if (matched) setSelectedId(matched.id);
  };

  const selectedService = SERVICES.find(s => s.id === selectedId)!;

  const handleContinueToPayment = () => {
    setVehicleError(null);
    if (!effectiveVehicle) {
      setVehicleError('Please enter vehicle year, make, and model.');
      return;
    }
    setShowPayment(true);
  };

  const resolvedPrice = getServicePrice(selectedService.id, selectedSize);

  const handlePaymentComplete = async () => {
    console.log('Pay button clicked', { selectedPaymentMethod: !!selectedPaymentMethod, effectiveVehicle: !!effectiveVehicle });
    if (!selectedPaymentMethod || !effectiveVehicle) {
      const msg = !selectedPaymentMethod
        ? 'Please add a payment method in your profile (Wallet & Pay) first.'
        : 'Missing vehicle info. Please go back and enter your vehicle.';
      setPaymentError(msg);
      console.warn('handlePaymentComplete early return:', msg);
      return;
    }
    setPaymentError(null);
    setIsProcessingPayment(true);
    try {
      const amountCents = Math.round(resolvedPrice * 100);
      console.log('Calling createPaymentIntent...', { amountCents, service_id: selectedService.id });
      const result = await createPaymentIntent({
        amount_cents: amountCents,
        payment_method_id: selectedPaymentMethod.stripePaymentMethodId,
        metadata: { service: selectedService.name },
        service_id: selectedService.id,
        vehicle: { make: effectiveVehicle.make, model: effectiveVehicle.model, year: effectiveVehicle.year },
      });
      const chargedCents = result.amount_cents ?? amountCents;
      console.log('Payment processed', { amount_cents: chargedCents, amount: `$${(chargedCents / 100).toFixed(2)}`, status: result.status });
      if (saveVehicleForNextTime && effectiveVehicle) {
        try {
          saveSavedVehicle(effectiveVehicle);
        } catch {
          // ignore
        }
      }
      const scheduledAt = bookingMode === 'later' ? `${scheduledDate} ${scheduledTime}` : undefined;
      onConfirm(selectedService, scheduledAt, effectiveVehicle, chargedCents, result.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payment failed';
      console.error('createPaymentIntent failed:', err);
      setPaymentError(message);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleBackFromPayment = () => {
    setShowPayment(false);
  };

  // Payment Review Screen
  if (showPayment) {
    return (
      <>
        <div className="absolute bottom-0 left-0 right-0 p-4 z-30 max-h-[90vh] flex flex-col">
          <div
            className="glass rounded-3xl shadow-2xl overflow-hidden max-w-md mx-auto border border-white/40 flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-shrink-0 p-6 pb-2">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-xl">Review & Pay</h3>
                <button
                  onClick={handleBackFromPayment}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors active:scale-90"
                  aria-label="Back"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-6 pt-2">
              {/* Service Summary */}
              <div className="bg-gray-50 rounded-2xl p-4 mb-4 border border-gray-100">
                <div className="flex items-center gap-4 mb-3">
                  <div className="text-3xl">{selectedService.icon}</div>
                  <div className="flex-grow">
                    <h4 className="font-bold text-lg">{selectedService.name}</h4>
                    <p className="text-xs text-gray-500">{selectedService.duration}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-xl">${resolvedPrice.toFixed(2)}</p>
                  </div>
                </div>
                {effectiveVehicle && (
                  <div className="pt-3 border-t border-gray-200">
                    <p className="text-xs text-gray-500 font-medium">Vehicle</p>
                    <p className="text-sm font-bold text-gray-900">{vehicleDisplayString(effectiveVehicle)}</p>
                  </div>
                )}
                {bookingMode === 'later' && (
                  <div className="pt-3 border-t border-gray-200">
                    <p className="text-xs text-gray-500 font-medium">
                      Scheduled for {new Date(scheduledDate + 'T' + scheduledTime).toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                )}
              </div>

              {/* Payment Method */}
              <div className="mb-6">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-2">Payment Method</label>
                {selectedPaymentMethod ? (
                  <div className="space-y-2">
                    {paymentMethods.length > 1 ? (
                      <select
                        value={selectedPaymentId ?? ''}
                        onChange={(e) => setSelectedPaymentId(e.target.value || null)}
                        className="w-full bg-white border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black mb-2"
                      >
                        {paymentMethods.map((pm) => (
                          <option key={pm.id} value={pm.id}>
                            •••• {pm.last4} {pm.brand} {pm.expiry}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <div className="bg-white border-2 border-black rounded-2xl p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-8 bg-black text-white rounded-lg flex items-center justify-center font-black text-[10px] uppercase">
                          {selectedPaymentMethod.brand}
                        </div>
                        <div>
                          <p className="font-black text-base">•••• {selectedPaymentMethod.last4}</p>
                          <p className="text-[10px] text-gray-400 font-bold uppercase">
                            {selectedPaymentMethod.isDefault ? 'Default' : ''} Exp. {selectedPaymentMethod.expiry}
                          </p>
                        </div>
                      </div>
                      <div className="w-6 h-6 bg-black rounded-full flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-4 text-center">
                    <p className="text-sm font-bold text-gray-400">No payment method</p>
                    <p className="text-xs text-gray-400 mt-1">Add a card in your wallet</p>
                  </div>
                )}
              </div>
              {paymentError && (
                <p className="text-red-600 text-sm font-medium mb-4">{paymentError}</p>
              )}

              {/* Price Breakdown */}
              <div className="mb-6 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 font-medium">Subtotal</span>
                  <span className="font-bold">${resolvedPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 font-medium">Service Fee</span>
                  <span className="font-bold">$0.00</span>
                </div>
                <div className="pt-2 border-t border-gray-200 flex justify-between">
                  <span className="font-black text-lg">Total</span>
                  <span className="font-black text-xl">${resolvedPrice.toFixed(2)}</span>
                </div>
              </div>

              {/* Pay & Book Button - type="button" so it never submits a form; onClick fires the request */}
              <button
                type="button"
                onClick={handlePaymentComplete}
                disabled={isProcessingPayment || !selectedPaymentMethod}
                title={!selectedPaymentMethod ? 'Add a payment method in Profile (Wallet & Pay) first' : undefined}
                className="w-full bg-black text-white py-4 rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessingPayment ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Pay ${resolvedPrice.toFixed(2)} & Book
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Service Selection Screen
  return (
    <>
    <div className="absolute bottom-0 left-0 right-0 p-4 z-30 max-h-[90vh] flex flex-col">
        <div
          className="glass rounded-3xl shadow-2xl overflow-hidden max-w-md mx-auto border border-white/40 flex flex-col max-h-[85vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex-shrink-0 p-6 pb-2">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-xl">Choose your detail</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAiInput(!showAiInput)}
                  className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-full font-bold flex items-center gap-1 border border-blue-100 transition-all hover:bg-blue-100"
                >
                  <span>✨</span> Ask AI Pro
                </button>
                {onClose && (
                  <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors active:scale-90"
                    aria-label="Close"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-6 pt-2">
          {showAiInput && (
            <div className="mb-6 bg-blue-50/50 p-4 rounded-2xl border border-blue-100 animate-in fade-in zoom-in-95 duration-200">
               <p className="text-xs font-bold text-blue-700 mb-2 uppercase tracking-tight">AI Detailing Assistant</p>
               <input 
                 className="w-full bg-white border border-blue-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 mb-2"
                 placeholder="Tell us about your car (e.g. 2022 Honda Civic, muddy mats)"
                 value={carInfo}
                 onChange={(e) => setCarInfo(e.target.value)}
               />
               <button 
                 onClick={handleAiAsk}
                 disabled={aiLoading}
                 className="w-full bg-blue-600 text-white py-2 rounded-xl text-xs font-bold disabled:opacity-50 active:scale-[0.98] transition-all"
               >
                 {aiLoading ? 'Analyzing...' : 'Get Personalized Recommendation'}
               </button>
               {aiResult && (
                 <div className="mt-3 text-xs bg-white/80 p-2 rounded-lg border border-blue-100 animate-in fade-in slide-in-from-top-1">
                   <p className="font-bold text-blue-800">Recommendation: {aiResult.recommendation}</p>
                   <p className="text-gray-600 italic mt-1">{aiResult.reasoning}</p>
                 </div>
               )}
            </div>
          )}

          {/* Vehicle size (drives price); cannot select smaller than inferred from make/model */}
          <div className="mb-4">
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-2">Vehicle type</h4>
            {inferredSize != null && (
              <p className="text-xs text-gray-500 mb-2 ml-2">Based on your vehicle, only these sizes apply for fair pricing.</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {VEHICLE_SIZES.map((sz) => {
                const disabled = inferredSize != null && isSizeSmallerThan(sz.id, inferredSize);
                return (
                  <button
                    key={sz.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => !disabled && setSelectedSize(sz.id)}
                    className={`min-h-[52px] w-full rounded-xl text-left px-3 py-2.5 text-sm font-bold transition-all ${
                      disabled
                        ? 'bg-gray-50 border-2 border-gray-100 text-gray-400 cursor-not-allowed opacity-70'
                        : selectedSize === sz.id
                          ? 'bg-black text-white shadow-md'
                          : 'bg-white border-2 border-gray-100 text-gray-700 hover:border-gray-200'
                    }`}
                  >
                    <span className="block">{sz.label}</span>
                    {sz.sublabel && (
                      <span className={`block text-[10px] font-medium -mt-0.5 truncate ${selectedSize === sz.id ? 'opacity-90' : 'opacity-70'}`}>
                        {sz.sublabel}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 mb-6 no-scrollbar overflow-y-auto max-h-[35vh]">
            {SERVICES.map((service) => (
              <button
                key={service.id}
                onClick={() => setSelectedId(service.id)}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${
                  selectedId === service.id 
                    ? 'border-black bg-gray-50' 
                    : 'border-transparent bg-white hover:border-gray-200 shadow-sm'
                }`}
              >
                <div className="text-3xl">{service.icon}</div>
                <div className="flex-grow text-left">
                  <div className="flex justify-between items-center">
                    <span className="font-bold">{service.name}</span>
                    <span className="font-bold text-lg">${getServicePrice(service.id, selectedSize)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-500 font-medium">
                    <span>{service.duration}</span>
                    <span 
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewingDetailService(service);
                      }}
                      className="text-blue-600 hover:text-blue-800 transition-colors py-1 px-2 -mr-2 cursor-pointer"
                    >
                      Details &rsaquo;
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Vehicle */}
          <div className="mb-6">
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-2">Vehicle</h4>
            {savedVehicle && usingSavedVehicle ? (
              <div className="bg-gray-50 rounded-2xl p-4 border-2 border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-0.5">Using saved vehicle</p>
                  <p className="font-bold text-gray-900">{vehicleDisplayString(savedVehicle)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setUsingSavedVehicle(false)}
                  className="text-sm font-bold text-blue-600 hover:text-blue-800"
                >
                  Different vehicle
                </button>
              </div>
            ) : (
              <>
                {savedVehicle && !usingSavedVehicle && (
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm text-gray-600">Use saved: {vehicleDisplayString(savedVehicle)}</p>
                    <button
                      type="button"
                      onClick={() => setUsingSavedVehicle(true)}
                      className="text-sm font-bold text-black hover:underline"
                    >
                      Use this
                    </button>
                  </div>
                )}
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">Year</label>
                      <select
                        value={vehicle.year}
                        onChange={(e) => setVehicle((v) => ({ ...v, year: e.target.value }))}
                        className="w-full bg-white border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-black"
                      >
                        <option value="">Year</option>
                        {VEHICLE_YEARS.map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">Make</label>
                      <select
                        value={vehicle.make}
                        onChange={(e) => setVehicle((v) => ({ ...v, make: e.target.value }))}
                        className="w-full bg-white border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-black"
                      >
                        <option value="">Make</option>
                        {VEHICLE_MAKES.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">Model</label>
                      <input
                        type="text"
                        value={vehicle.model}
                        onChange={(e) => setVehicle((v) => ({ ...v, model: e.target.value }))}
                        placeholder="e.g. Civic, Camry"
                        className="w-full bg-white border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-black"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">Color (optional)</label>
                      <select
                        value={vehicle.color ?? ''}
                        onChange={(e) => setVehicle((v) => ({ ...v, color: e.target.value || undefined }))}
                        className="w-full bg-white border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-black"
                      >
                        <option value="">—</option>
                        {VEHICLE_COLORS.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveVehicleForNextTime}
                      onChange={(e) => setSaveVehicleForNextTime(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm font-medium text-gray-600">Save for next time</span>
                  </label>
                </div>
              </>
            )}
          </div>
          {vehicleError && (
            <p className="text-red-600 text-sm font-medium mb-3">{vehicleError}</p>
          )}

          {/* Scheduling Section */}
          <div className="mb-6 bg-gray-100/50 p-2 rounded-2xl">
            <div className="flex p-1 bg-white/50 rounded-xl gap-1">
              <button 
                onClick={() => setBookingMode('now')}
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${bookingMode === 'now' ? 'bg-black text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                Now
              </button>
              <button 
                onClick={() => setBookingMode('later')}
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${bookingMode === 'later' ? 'bg-black text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                Schedule
              </button>
            </div>

            {bookingMode === 'later' && (
              <div className="mt-4 flex gap-2 animate-in slide-in-from-top-2 duration-300">
                <div className="flex-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">Date</label>
                  <input 
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:border-black"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">Time</label>
                  <input 
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:border-black"
                  />
                </div>
              </div>
            )}
          </div>

          <button 
            onClick={handleContinueToPayment}
            className="w-full bg-black text-white py-4 rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2"
          >
            {bookingMode === 'now' ? (
              <>
                Continue to Payment
              </>
            ) : (
              <>
                Continue to Payment
              </>
            )}
          </button>
        </div>
      </div>
    </div>

      {/* Service Details Modal */}
      {viewingDetailService && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6 animate-in fade-in duration-200"
          onClick={() => setViewingDetailService(null)}
        >
          <div 
            className="bg-white rounded-[40px] shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-40 bg-gray-900 flex items-center justify-center text-8xl">
              {viewingDetailService.icon}
              <button 
                onClick={() => setViewingDetailService(null)}
                className="absolute top-6 right-6 w-10 h-10 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-all active:scale-90"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="p-8">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-3xl font-black">{viewingDetailService.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-tight">Premium Service</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black">${getServicePrice(viewingDetailService.id, selectedSize)}</p>
                  <p className="text-xs text-gray-400 font-bold uppercase">Estimated Cost</p>
                </div>
              </div>

              <div className="space-y-6">
                <section>
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Description</h4>
                  <p className="text-gray-600 leading-relaxed text-sm">
                    {viewingDetailService.description}
                  </p>
                </section>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Duration</h4>
                    <p className="font-bold text-gray-900">{viewingDetailService.duration}</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Warranty</h4>
                    <p className="font-bold text-gray-900">7-Day Shine</p>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => {
                  setSelectedId(viewingDetailService.id);
                  setViewingDetailService(null);
                }}
                className="w-full bg-black text-white py-4 rounded-2xl font-bold text-lg mt-8 active:scale-95 transition-transform shadow-lg"
              >
                Select this Service
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BookingFlow;
