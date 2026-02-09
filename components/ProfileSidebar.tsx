import React, { useState, useEffect, useMemo } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { UserProfile, PastBooking, VehicleInfo, vehicleDisplayString } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { listBookingsByUser } from '../services/bookings';
import { loadSavedVehicle, saveSavedVehicle, clearSavedVehicle } from '../utils/savedVehicle';
import { VEHICLE_YEARS, VEHICLE_MAKES, VEHICLE_COLORS } from '../constants';
import { submitDetailerApplication } from '../services/detailerApplications';
import { TERMS_SECTIONS, PRIVACY_SECTIONS } from '../content/legal';
import {
  listPaymentMethods,
  createSetupIntent,
  savePaymentMethod,
  setDefaultPaymentMethod,
  removePaymentMethod,
  type PaymentMethodDisplay,
} from '../services/paymentMethods';

// Read Stripe publishable key: trim and strip optional quotes so .env quirks don't break it
function getStripePublishableKey(): string | undefined {
  const raw = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined)?.trim() ?? '';
  const key = raw.replace(/^["']|["']$/g, '').trim();
  return key || undefined;
}

const stripePublishableKey = getStripePublishableKey();
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

interface ProfileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onLogout?: () => void | Promise<void>;
}

type SidebarView = 'menu' | 'history' | 'detail' | 'support' | 'payment' | 'settings' | 'vehicle' | 'joinBrnno' | 'terms' | 'privacy';

function brandDisplay(brand: string): string {
  return brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase();
}

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      fontFamily: 'system-ui, sans-serif',
      '::placeholder': { color: '#9ca3af' },
    },
  },
};

function AddCardForm({
  onSuccess,
  onCancel,
  userName,
}: {
  onSuccess: () => void;
  onCancel: () => void;
  userName: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    const cardEl = elements.getElement(CardElement);
    if (!cardEl) return;

    setSubmitting(true);
    setError(null);
    try {
      const { client_secret } = await createSetupIntent();
      const { setupIntent, error } = await stripe.confirmCardSetup(client_secret, {
        payment_method: { card: cardEl },
        return_url: `${window.location.origin}/`,
      });
      if (error) {
        setError(error.message ?? 'Card setup failed');
        return;
      }
      if (setupIntent?.payment_method) {
        await savePaymentMethod(
          typeof setupIntent.payment_method === 'string'
            ? setupIntent.payment_method
            : setupIntent.payment_method.id
        );
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="bg-gradient-to-br from-gray-900 to-black p-8 rounded-[40px] shadow-2xl mb-8 text-white relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -mr-20 -mt-20 group-hover:scale-110 transition-transform duration-1000" />
        <div className="flex justify-between items-center mb-12 relative z-10">
          <div className="w-14 h-9 bg-white/20 rounded-xl" />
          <div className="text-[11px] font-black tracking-widest opacity-30">BRNNO PAY</div>
        </div>
        <p className="text-[10px] font-black opacity-50 uppercase tracking-widest mb-2 relative z-10">Secure card entry</p>
        <div className="relative z-10 py-2">
          <CardElement options={CARD_ELEMENT_OPTIONS} className="bg-white/10 rounded-xl p-4" />
        </div>
        <div className="flex justify-between items-end mt-6 relative z-10">
          <div>
            <p className="text-[9px] font-black opacity-30 uppercase tracking-[0.2em] mb-1.5">Card Member</p>
            <p className="text-base font-black tracking-tight uppercase">{userName}</p>
          </div>
        </div>
      </div>
      {error && (
        <p className="text-red-600 text-sm font-medium">{error}</p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-5 rounded-[32px] font-black border-2 border-gray-200 text-gray-600 hover:bg-gray-50 transition-all"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || submitting}
          className="flex-1 bg-black text-white py-5 rounded-[32px] font-black text-lg active:scale-95 transition-all shadow-2xl hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Saving…' : 'Secure card'}
        </button>
      </div>
    </form>
  );
}

const ProfileSidebar: React.FC<ProfileSidebarProps> = ({ isOpen, onClose, user, onLogout }) => {
  const { user: authUser } = useAuth();
  const [currentView, setCurrentView] = useState<SidebarView>('menu');
  const [selectedBooking, setSelectedBooking] = useState<PastBooking | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  // History (bookings) state – fetched when History view is shown
  const [bookings, setBookings] = useState<PastBooking[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  
  // Payment states (loaded from API when Wallet is opened)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodDisplay[]>([]);
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(false);
  const [paymentMethodsError, setPaymentMethodsError] = useState<string | null>(null);
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [locationEnabled, setLocationEnabled] = useState(true);

  // Join BRNNO (detailer application) state
  const [joinForm, setJoinForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    businessName: '',
    ein: '',
    businessType: 'Sole Proprietorship',
    dba: '',
    businessStreet: '',
    businessCity: '',
    businessState: '',
    businessZip: '',
    vehicleYear: String(new Date().getFullYear()),
    vehicleMake: '',
    vehicleModel: '',
    vehicleColor: '',
    serviceArea: '',
    message: '',
  });
  const [joinSubmitted, setJoinSubmitted] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSubmitting, setJoinSubmitting] = useState(false);

  // My vehicle view state
  const [savedVehicleInView, setSavedVehicleInView] = useState<VehicleInfo | null>(null);
  const [vehicleForm, setVehicleForm] = useState({ year: String(new Date().getFullYear()), make: '', model: '', color: '' });
  const [vehicleShowForm, setVehicleShowForm] = useState(true);
  const [vehicleSaveMessage, setVehicleSaveMessage] = useState<string | null>(null);

  // Reset view when sidebar closes
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setCurrentView('menu');
        setSelectedBooking(null);
        setExpandedFaq(null);
        setIsAddingCard(false);
        setJoinSubmitted(false);
        setJoinError(null);
      }, 300);
    }
  }, [isOpen]);

  // Prefill Join BRNNO form from auth user
  useEffect(() => {
    if (authUser && currentView === 'joinBrnno' && !joinSubmitted) {
      setJoinForm(prev => ({
        ...prev,
        email: authUser.email ?? prev.email,
        fullName: (authUser.user_metadata?.full_name as string) ?? prev.fullName,
      }));
    }
  }, [authUser, currentView, joinSubmitted]);

  // Load payment methods when Wallet view is opened
  useEffect(() => {
    if (currentView !== 'payment' || !authUser) return;
    setPaymentMethodsError(null);
    setPaymentMethodsLoading(true);
    listPaymentMethods()
      .then(setPaymentMethods)
      .catch((err) => setPaymentMethodsError(err instanceof Error ? err.message : 'Failed to load cards'))
      .finally(() => setPaymentMethodsLoading(false));
  }, [currentView, authUser]);

  // Load bookings when Menu or History view is opened (menu needs count for Orders card)
  useEffect(() => {
    if ((currentView !== 'history' && currentView !== 'menu') || !authUser?.id) return;
    setHistoryError(null);
    setHistoryLoading(true);
    listBookingsByUser(authUser.id)
      .then(setBookings)
      .catch((err) => {
        setHistoryError(err instanceof Error ? err.message : 'Failed to load history');
        setBookings([]);
      })
      .finally(() => setHistoryLoading(false));
  }, [currentView, authUser?.id]);

  // Sync saved vehicle when My vehicle view is opened
  useEffect(() => {
    if (currentView !== 'vehicle') return;
    const loaded = loadSavedVehicle();
    setSavedVehicleInView(loaded);
    if (loaded) {
      setVehicleShowForm(false);
      setVehicleForm({ year: loaded.year, make: loaded.make, model: loaded.model, color: loaded.color ?? '' });
    } else {
      setVehicleShowForm(true);
      setVehicleForm({ year: String(new Date().getFullYear()), make: '', model: '', color: '' });
    }
    setVehicleSaveMessage(null);
  }, [currentView]);

  const handleRemoveCard = async (id: string) => {
    try {
      await removePaymentMethod(id);
      setPaymentMethods((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // keep UI as is on error
    }
  };

  const handleSetDefaultCard = async (id: string) => {
    try {
      await setDefaultPaymentMethod(id);
      setPaymentMethods((prev) =>
        prev.map((c) => ({ ...c, isDefault: c.id === id }))
      );
    } catch {
      // keep UI as is on error
    }
  };

  const faqs = [
    {
      q: "How do I cancel a booking?",
      a: "You can cancel any on-demand booking before the detailer arrives using the 'X' button on the active booking card. Scheduled services can be managed in 'Your Bookings'."
    },
    {
      q: "Do I need to be present?",
      a: "No! As long as we have access to the vehicle and a water/power source (if required), our pros can complete the detail while you go about your day."
    },
    {
      q: "What's included in a Deep Reset?",
      a: "A Deep Reset includes a thorough interior vacuum, steam cleaning of seats/carpets, dash rejuvenation, and a premium exterior wash with hand-applied wax."
    },
    {
      q: "How do I tip my detailer?",
      a: "Tipping is entirely optional but appreciated. You can add a tip through the app once the service is marked as completed."
    }
  ];

  const BackButton = ({ onClick, label }: { onClick: () => void, label: string }) => (
    <button 
      onClick={onClick}
      className="flex items-center gap-2 text-gray-400 font-bold mb-6 hover:text-black transition-all active:scale-95 group"
    >
      <div className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center group-hover:bg-gray-100 group-hover:shadow-md transition-all">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"></path></svg>
      </div>
      <span className="text-sm tracking-tight font-black uppercase text-gray-300 group-hover:text-black">Back to {label}</span>
    </button>
  );

  const renderContent = () => {
    switch (currentView) {
      case 'payment':
        return (
          <div className="animate-in fade-in slide-in-from-right-8 duration-500 ease-out h-full flex flex-col">
            <BackButton 
              onClick={() => {
                if (isAddingCard) setIsAddingCard(false);
                else setCurrentView('menu');
              }}
              label={isAddingCard ? 'Wallet' : 'Menu'}
            />
            <h2 className="text-4xl font-black mb-8 tracking-tighter">Wallet</h2>

            <div className="flex-grow overflow-y-auto no-scrollbar pb-6">
              {!isAddingCard ? (
                <div className="space-y-6">
                  {paymentMethodsError && (
                    <p className="text-red-600 text-sm font-medium">{paymentMethodsError}</p>
                  )}
                  <section>
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 ml-2">Preferred Methods</h4>
                    {paymentMethodsLoading ? (
                      <p className="text-gray-500 text-sm font-medium">Loading…</p>
                    ) : (
                      <div className="space-y-3">
                        {paymentMethods.length === 0 && !paymentMethodsLoading && (
                          <div className="text-center py-12 bg-gray-50 rounded-[32px] border-2 border-dashed border-gray-100">
                            <p className="text-sm font-bold text-gray-300">Secure your first card</p>
                          </div>
                        )}
                        {paymentMethods.map((card) => (
                          <div
                            key={card.id}
                            onClick={() => !card.isDefault && handleSetDefaultCard(card.id)}
                            className={`group relative overflow-hidden bg-white border-2 p-5 rounded-[32px] flex items-center justify-between transition-all cursor-pointer active:scale-[0.97] ${card.isDefault ? 'border-black shadow-xl ring-1 ring-black/5' : 'border-gray-50 hover:border-gray-200 hover:shadow-lg'}`}
                          >
                            <div className="flex items-center gap-4">
                              <div className={`w-14 h-9 rounded-xl flex items-center justify-center font-black text-[11px] uppercase tracking-tighter border-2 transition-colors ${card.isDefault ? 'bg-black text-white border-black' : 'bg-gray-50 border-gray-100 group-hover:bg-gray-100'}`}>
                                {brandDisplay(card.brand)}
                              </div>
                              <div>
                                <p className="text-lg font-black tracking-tight">•••• {card.last4}</p>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Exp. {card.expiry}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {card.isDefault ? (
                                <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white shadow-lg">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveCard(card.id);
                                  }}
                                  className="text-gray-200 hover:text-red-500 transition-colors p-2"
                                >
                                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {stripePromise ? (
                    <button
                      type="button"
                      onClick={() => setIsAddingCard(true)}
                      className="w-full flex items-center justify-center gap-3 py-6 border-2 border-dashed border-gray-200 rounded-[32px] text-gray-400 font-black text-sm hover:border-black hover:text-black hover:bg-gray-50 transition-all active:scale-[0.98]"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                      ADD NEW CARD
                    </button>
                  ) : (
                    <p className="text-gray-400 text-xs">Add card requires Stripe (set VITE_STRIPE_PUBLISHABLE_KEY).</p>
                  )}
                </div>
              ) : stripePromise ? (
                <Elements stripe={stripePromise}>
                  <AddCardForm
                    userName={user.name}
                    onSuccess={() => {
                      listPaymentMethods().then(setPaymentMethods);
                      setIsAddingCard(false);
                    }}
                    onCancel={() => setIsAddingCard(false)}
                  />
                </Elements>
              ) : (
                <p className="text-gray-500 text-sm">Stripe not configured.</p>
              )}
            </div>
          </div>
        );

      case 'history':
        return (
          <div className="animate-in fade-in slide-in-from-right-8 duration-500 ease-out h-full flex flex-col">
            <BackButton onClick={() => setCurrentView('menu')} label="Menu" />
            <h2 className="text-4xl font-black mb-8 tracking-tighter">History</h2>
            <div className="flex-grow overflow-y-auto no-scrollbar space-y-4 pb-6">
              {historyLoading ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <div className="w-10 h-10 border-2 border-gray-200 border-t-black rounded-full animate-spin mb-4" />
                  <p className="text-sm font-bold">Loading history…</p>
                </div>
              ) : historyError ? (
                <p className="text-red-600 text-sm font-medium py-4">{historyError}</p>
              ) : bookings.length === 0 ? (
                <p className="text-gray-500 font-medium py-8">No bookings yet.</p>
              ) : (
                bookings.map((booking) => (
                  <button 
                    key={booking.id}
                    onClick={() => {
                      setSelectedBooking(booking);
                      setCurrentView('detail');
                    }}
                    className={`w-full text-left p-6 rounded-[32px] border-2 transition-all active:scale-[0.98] group ${
                      booking.status === 'Cancelled'
                        ? 'bg-gray-100/80 border-gray-200 hover:border-gray-300 hover:bg-gray-100'
                        : 'bg-gray-50 border-transparent hover:border-black/5 hover:bg-white hover:shadow-xl'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2 gap-2">
                      <div className="flex-1 min-w-0">
                        {booking.status === 'Cancelled' && (
                          <span className="inline-block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 px-2.5 py-0.5 rounded-full bg-gray-200/80">
                            Cancelled
                          </span>
                        )}
                        <span className={`font-black text-xl tracking-tight block truncate ${booking.status === 'Cancelled' ? 'text-gray-600' : 'text-gray-900'}`}>{booking.serviceName}</span>
                      </div>
                      <span className={`font-black text-xl flex-shrink-0 ${booking.status === 'Cancelled' ? 'text-gray-500' : 'text-black'}`}>${booking.cost.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-2 mb-6">
                       <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{booking.date}</span>
                       {booking.status === 'Completed' && <span className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.4)]" />}
                       {booking.status === 'In progress' && <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />}
                       {booking.status === 'Cancelled' && <span className="text-[10px] font-bold text-gray-500 uppercase">Cancelled</span>}
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 bg-gray-200 rounded-xl flex-shrink-0 group-hover:bg-black group-hover:text-white transition-colors flex items-center justify-center">
                            <span className="text-[10px] font-black">PRO</span>
                         </div>
                         <span className="text-xs font-black text-gray-600 group-hover:text-black transition-colors">{booking.detailerName}</span>
                      </div>
                      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-transparent group-hover:bg-black group-hover:text-white transition-all transform group-hover:translate-x-1">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" /></svg>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        );

      case 'detail':
        if (!selectedBooking) return null;
        const isCancelled = selectedBooking.status === 'Cancelled';
        const isInProgress = selectedBooking.status === 'In progress';
        return (
          <div className="animate-in fade-in slide-in-from-right-8 duration-500 ease-out h-full flex flex-col">
            <BackButton onClick={() => setCurrentView('history')} label="History" />
            
            <div className={`p-10 rounded-[48px] mb-10 shadow-2xl relative overflow-hidden group ${
              isCancelled ? 'bg-gray-200 text-gray-700' : isInProgress ? 'bg-gray-800 text-gray-200' : 'bg-black text-white'
            }`}>
              <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -mr-12 -mt-12 transition-transform duration-1000 group-hover:scale-110" />
              <p className="text-[11px] opacity-60 uppercase font-black tracking-[0.3em] mb-2">
                {isCancelled ? 'Amount (not charged)' : 'Transaction Amount'}
              </p>
              <h3 className="text-5xl font-black tracking-tighter leading-none">${selectedBooking.cost.toFixed(2)}</h3>
              <div className={`mt-8 flex items-center gap-3 w-fit px-5 py-2 rounded-full border backdrop-blur-md ${
                isCancelled
                  ? 'bg-gray-300/50 border-gray-300 text-gray-600'
                  : isInProgress
                    ? 'bg-white/10 border-white/10 text-gray-300'
                    : 'bg-white/10 border-white/10'
              }`}>
                {selectedBooking.status === 'Completed' && (
                  <>
                    <div className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse shadow-[0_0_12px_rgba(74,222,128,0.5)]" />
                    <span className="text-[11px] font-black uppercase tracking-widest text-white">Verified Paid</span>
                  </>
                )}
                {isCancelled && <span className="text-[11px] font-black uppercase tracking-widest">Cancelled</span>}
                {isInProgress && <span className="text-[11px] font-black uppercase tracking-widest">In progress</span>}
              </div>
            </div>

            <div className="flex-grow overflow-y-auto no-scrollbar space-y-10 pb-8">
              <section className="px-2">
                <h4 className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em] mb-6 ml-1">Summary</h4>
                <div className="space-y-6">
                  {[
                    { label: 'Service Plan', value: selectedBooking.serviceName },
                    { label: 'Completion', value: selectedBooking.date },
                    { label: 'Vehicle Info', value: selectedBooking.carName },
                    { label: 'Service Point', value: selectedBooking.location }
                  ].map((item, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{item.label}</span>
                      <span className="text-base font-black text-gray-900 leading-tight">{item.value}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="px-2">
                <h4 className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em] mb-6 ml-1">Assigned Professional</h4>
                <div className="flex items-center gap-5 bg-gray-50 p-6 rounded-[40px] border border-gray-100 hover:shadow-lg transition-all active:scale-[0.98] cursor-pointer">
                  <div className="w-16 h-16 bg-gray-200 rounded-[20px] flex-shrink-0 overflow-hidden shadow-inner border-2 border-white">
                     <img src={`https://picsum.photos/seed/${selectedBooking.detailerName}/120/120`} alt="Avatar" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <p className="font-black text-xl tracking-tight leading-none mb-1.5">{selectedBooking.detailerName}</p>
                    <p className="text-[10px] text-blue-600 font-black uppercase tracking-widest">Master Detailer</p>
                  </div>
                </div>
              </section>

              <div className="pt-4 px-2">
                 <button className="w-full py-6 bg-gray-100 rounded-[32px] font-black text-sm text-gray-900 hover:bg-black hover:text-white transition-all active:scale-95 shadow-sm">
                  RE-DOWNLOAD RECEIPT
                </button>
              </div>
            </div>
          </div>
        );

      case 'support':
        return (
          <div className="animate-in fade-in slide-in-from-right-8 duration-500 ease-out h-full flex flex-col">
            <BackButton onClick={() => setCurrentView('menu')} label="Menu" />
            <h2 className="text-4xl font-black mb-8 tracking-tighter">Support</h2>
            
            <div className="flex-grow overflow-y-auto no-scrollbar space-y-10 pb-8">
              <section>
                <h4 className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em] mb-6 ml-2">Knowledge Base</h4>
                <div className="space-y-3">
                  {faqs.map((faq, index) => (
                    <div key={index} className={`rounded-[32px] overflow-hidden border-2 transition-all duration-300 ${expandedFaq === index ? 'bg-gray-50 border-gray-100 shadow-md' : 'bg-white border-gray-50 hover:border-gray-100'}`}>
                      <button 
                        onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
                        className="w-full p-6 flex justify-between items-center text-left"
                      >
                        <span className="text-sm font-black text-gray-800 pr-6 tracking-tight">{faq.q}</span>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${expandedFaq === index ? 'bg-black text-white rotate-180' : 'bg-gray-100 text-gray-400'}`}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>
                      {expandedFaq === index && (
                        <div className="px-8 pb-8 pt-0 text-sm text-gray-500 font-medium leading-relaxed animate-in fade-in slide-in-from-top-4">
                          {faq.a}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section className="px-2">
                <h4 className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em] mb-6 ml-1">Connect</h4>
                <div className="grid grid-cols-1 gap-4">
                  <button className="flex items-center gap-6 bg-blue-600 text-white p-7 rounded-[40px] shadow-2xl shadow-blue-300/40 active:scale-95 transition-all group overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 group-hover:scale-125 transition-transform duration-700" />
                    <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center group-hover:bg-white/30 transition-all relative z-10">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                    </div>
                    <div className="text-left relative z-10">
                      <p className="font-black text-xl leading-tight">Instant Help</p>
                      <p className="text-[10px] font-black opacity-70 uppercase tracking-[0.2em] mt-1">Chat live now</p>
                    </div>
                  </button>
                </div>
              </section>
            </div>
          </div>
        );

      case 'settings':
        return (
          <div className="animate-in fade-in slide-in-from-right-8 duration-500 ease-out h-full flex flex-col">
            <BackButton onClick={() => setCurrentView('menu')} label="Menu" />
            <h2 className="text-4xl font-black mb-8 tracking-tighter">Settings</h2>
            
            <div className="flex-grow overflow-y-auto no-scrollbar space-y-8 pb-8">
              {/* Notifications Section */}
              <section>
                <h4 className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em] mb-4 ml-2">Notifications</h4>
                <div className="space-y-3">
                  <div className="bg-white border-2 border-gray-50 rounded-[32px] p-5 flex items-center justify-between hover:border-gray-100 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center">
                        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-black text-base">Booking Updates</p>
                        <p className="text-xs text-gray-400 font-medium">Get notified about your bookings</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                      className={`w-14 h-8 rounded-full transition-all relative ${notificationsEnabled ? 'bg-black' : 'bg-gray-200'}`}
                    >
                      <div className={`w-6 h-6 bg-white rounded-full absolute top-1 transition-all ${notificationsEnabled ? 'right-1' : 'left-1'}`} />
                    </button>
                  </div>
                </div>
              </section>

              {/* Location Section */}
              <section>
                <h4 className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em] mb-4 ml-2">Location</h4>
                <div className="bg-white border-2 border-gray-50 rounded-[32px] p-5 hover:border-gray-100 transition-all">
                  <div className="flex items-center gap-4 mb-3">
                    <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center">
                      <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div className="flex-grow">
                      <p className="font-black text-base">Location Services</p>
                      <p className="text-xs text-gray-400 font-medium">{locationEnabled ? 'Enabled' : 'Disabled'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${locationEnabled ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <button
                        onClick={() => setLocationEnabled(!locationEnabled)}
                        className="text-xs font-black text-blue-600 hover:text-blue-800"
                      >
                        {locationEnabled ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* Account Section */}
              <section>
                <h4 className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em] mb-4 ml-2">Account</h4>
                <div className="space-y-3">
                  <div className="bg-white border-2 border-gray-50 rounded-[32px] p-5 hover:border-gray-100 transition-all">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Name</p>
                    <p className="font-black text-base">{user.name}</p>
                  </div>
                  <div className="bg-white border-2 border-gray-50 rounded-[32px] p-5 hover:border-gray-100 transition-all">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Email</p>
                    <p className="font-black text-base">{authUser?.email ?? '—'}</p>
                  </div>
                </div>
              </section>

              {/* About Section */}
              <section>
                <h4 className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em] mb-4 ml-2">About</h4>
                <div className="space-y-3">
                  <div className="bg-white border-2 border-gray-50 rounded-[32px] p-5 hover:border-gray-100 transition-all">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">App Version</p>
                    <p className="font-black text-base">1.0.5</p>
                  </div>
                  <button
                    onClick={() => setCurrentView('terms')}
                    className="w-full bg-white border-2 border-gray-50 rounded-[32px] p-5 hover:border-gray-100 transition-all text-left"
                  >
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Terms of Service</p>
                    <p className="font-black text-base">View terms</p>
                  </button>
                  <button
                    onClick={() => setCurrentView('privacy')}
                    className="w-full bg-white border-2 border-gray-50 rounded-[32px] p-5 hover:border-gray-100 transition-all text-left"
                  >
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Privacy Policy</p>
                    <p className="font-black text-base">View policy</p>
                  </button>
                </div>
              </section>

              {/* Logout Section */}
              <section className="pt-4">
                <button
                  onClick={() => {
                    onLogout?.();
                    onClose();
                  }}
                  className="w-full bg-red-50 border-2 border-red-100 text-red-600 rounded-[32px] p-5 hover:bg-red-100 hover:border-red-200 transition-all font-black"
                >
                  Log Out
                </button>
              </section>
            </div>
          </div>
        );

      case 'terms':
        return (
          <div className="animate-in fade-in slide-in-from-right-8 duration-500 ease-out h-full flex flex-col">
            <BackButton onClick={() => setCurrentView('settings')} label="Settings" />
            <h2 className="text-4xl font-black mb-6 tracking-tighter">Terms of Service</h2>
            <div className="flex-grow overflow-y-auto no-scrollbar space-y-6 pb-8">
              {TERMS_SECTIONS.map((section, i) => (
                <section key={i} className="px-1">
                  <h4 className="text-sm font-black text-gray-900 mb-2">{section.title}</h4>
                  {section.paragraphs.map((p, j) => (
                    <p key={j} className="text-sm text-gray-600 leading-relaxed mb-3 last:mb-0">
                      {p}
                    </p>
                  ))}
                </section>
              ))}
            </div>
          </div>
        );

      case 'privacy':
        return (
          <div className="animate-in fade-in slide-in-from-right-8 duration-500 ease-out h-full flex flex-col">
            <BackButton onClick={() => setCurrentView('settings')} label="Settings" />
            <h2 className="text-4xl font-black mb-6 tracking-tighter">Privacy Policy</h2>
            <div className="flex-grow overflow-y-auto no-scrollbar space-y-6 pb-8">
              {PRIVACY_SECTIONS.map((section, i) => (
                <section key={i} className="px-1">
                  <h4 className="text-sm font-black text-gray-900 mb-2">{section.title}</h4>
                  {section.paragraphs.map((p, j) => (
                    <p key={j} className="text-sm text-gray-600 leading-relaxed mb-3 last:mb-0">
                      {p}
                    </p>
                  ))}
                </section>
              ))}
            </div>
          </div>
        );

      case 'joinBrnno':
        const handleJoinSubmit = async (e: React.FormEvent) => {
          e.preventDefault();
          setJoinError(null);
          const { fullName, email, phone, businessName, ein, businessType } = joinForm;
          if (!fullName.trim()) {
            setJoinError('Please enter your name.');
            return;
          }
          if (!email.trim()) {
            setJoinError('Please enter your email.');
            return;
          }
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            setJoinError('Please enter a valid email address.');
            return;
          }
          if (!phone.trim()) {
            setJoinError('Please enter your phone number.');
            return;
          }
          if (!businessName.trim()) {
            setJoinError('Please enter your business name.');
            return;
          }
          const einDigits = (ein || '').replace(/\D/g, '');
          if (einDigits.length !== 9) {
            setJoinError('Please enter a valid EIN (9 digits). You may use format 12-3456789.');
            return;
          }
          if (!businessType.trim()) {
            setJoinError('Please select a business type.');
            return;
          }
          setJoinSubmitting(true);
          const { error } = await submitDetailerApplication({
            full_name: fullName.trim(),
            email: email.trim(),
            phone: phone.trim(),
            business_name: businessName.trim(),
            ein: ein.trim(),
            business_type: businessType.trim(),
            dba: joinForm.dba?.trim() || undefined,
            business_street: joinForm.businessStreet?.trim() || undefined,
            business_city: joinForm.businessCity?.trim() || undefined,
            business_state: joinForm.businessState?.trim() || undefined,
            business_zip: joinForm.businessZip?.trim() || undefined,
            vehicle_type: [joinForm.vehicleYear?.trim(), joinForm.vehicleMake?.trim(), joinForm.vehicleModel?.trim(), joinForm.vehicleColor?.trim()]
              .filter(Boolean)
              .join(' ') || undefined,
            service_area: joinForm.serviceArea?.trim() || undefined,
            message: joinForm.message?.trim() || undefined,
            user_id: authUser?.id ?? null,
          });
          setJoinSubmitting(false);
          if (error) {
            setJoinError(error.message ?? 'Something went wrong. Please try again.');
            return;
          }
          setJoinSubmitted(true);
        };

        if (joinSubmitted) {
          return (
            <div className="animate-in fade-in slide-in-from-right-8 duration-500 ease-out h-full flex flex-col">
              <BackButton onClick={() => { setJoinSubmitted(false); setCurrentView('menu'); }} label="Menu" />
              <div className="flex-grow flex flex-col items-center justify-center text-center py-12 px-4">
                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                </div>
                <h2 className="text-2xl font-black mb-2">Application received</h2>
                <p className="text-gray-600 font-medium mb-4">
                  Thanks for applying to join BRNNO as a detailer.
                </p>
                <p className="text-gray-500 text-sm font-medium mb-8 max-w-sm">
                  We&apos;ll review your application and email you when you&apos;re approved. You&apos;ll then sign in at the detailer portal to go online and accept jobs.
                </p>
                <button
                  onClick={() => { setJoinSubmitted(false); setCurrentView('menu'); }}
                  className="bg-black text-white py-4 px-8 rounded-2xl font-bold text-sm active:scale-95 transition-transform"
                >
                  Back to Menu
                </button>
              </div>
            </div>
          );
        }

        const businessTypes = ['Sole Proprietorship', 'LLC', 'Corporation', 'Partnership', 'Other'];

        return (
          <div className="animate-in fade-in slide-in-from-right-8 duration-500 ease-out h-full flex flex-col">
            <BackButton onClick={() => setCurrentView('menu')} label="Menu" />
            <h2 className="text-4xl font-black mb-2 tracking-tighter">Join BRNNO</h2>
            <p className="text-gray-500 text-sm font-medium mb-6">Become a detailing pro.</p>
            <form onSubmit={handleJoinSubmit} className="flex-grow overflow-y-auto no-scrollbar space-y-6 pb-8">
              {/* Contact */}
              <section>
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-2">Contact</h4>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">Full name *</label>
                    <input
                      type="text"
                      value={joinForm.fullName}
                      onChange={(e) => setJoinForm(prev => ({ ...prev, fullName: e.target.value }))}
                      placeholder="Your name"
                      className="w-full bg-white border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black"
                      autoComplete="name"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">Email *</label>
                    <input
                      type="email"
                      value={joinForm.email}
                      onChange={(e) => setJoinForm(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="you@example.com"
                      className="w-full bg-white border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black"
                      autoComplete="email"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">Phone *</label>
                    <input
                      type="tel"
                      value={joinForm.phone}
                      onChange={(e) => setJoinForm(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="(555) 000-0000"
                      className="w-full bg-white border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black"
                      autoComplete="tel"
                    />
                  </div>
                </div>
              </section>

              {/* Business */}
              <section>
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-2">Business</h4>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">Business name *</label>
                    <input
                      type="text"
                      value={joinForm.businessName}
                      onChange={(e) => setJoinForm(prev => ({ ...prev, businessName: e.target.value }))}
                      placeholder="Legal business name"
                      className="w-full bg-white border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">EIN *</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={joinForm.ein}
                      onChange={(e) => {
                        let val = e.target.value.replace(/\D/g, '');
                        if (val.length > 2) val = val.slice(0, 2) + '-' + val.slice(2, 9);
                        setJoinForm(prev => ({ ...prev, ein: val }));
                      }}
                      placeholder="12-3456789"
                      maxLength={10}
                      className="w-full bg-white border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black"
                    />
                    {joinError && /EIN|9 digits/i.test(joinError) && (
                      <p className="text-red-600 text-xs font-medium mt-1 ml-2">{joinError}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">Business type *</label>
                    <select
                      value={joinForm.businessType}
                      onChange={(e) => setJoinForm(prev => ({ ...prev, businessType: e.target.value }))}
                      className="w-full bg-white border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black appearance-none cursor-pointer"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '20px', paddingRight: '40px' }}
                    >
                      {businessTypes.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">DBA (optional)</label>
                    <input
                      type="text"
                      value={joinForm.dba}
                      onChange={(e) => setJoinForm(prev => ({ ...prev, dba: e.target.value }))}
                      placeholder="Doing Business As / trade name"
                      className="w-full bg-white border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black"
                    />
                  </div>
                </div>
              </section>

              {/* Business address (optional) */}
              <section>
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-2">Business address (optional)</h4>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">Street</label>
                    <input
                      type="text"
                      value={joinForm.businessStreet}
                      onChange={(e) => setJoinForm(prev => ({ ...prev, businessStreet: e.target.value }))}
                      placeholder="Street address"
                      className="w-full bg-white border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">City</label>
                      <input
                        type="text"
                        value={joinForm.businessCity}
                        onChange={(e) => setJoinForm(prev => ({ ...prev, businessCity: e.target.value }))}
                        placeholder="City"
                        className="w-full bg-white border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">State</label>
                      <input
                        type="text"
                        value={joinForm.businessState}
                        onChange={(e) => setJoinForm(prev => ({ ...prev, businessState: e.target.value }))}
                        placeholder="State"
                        className="w-full bg-white border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">Zip</label>
                    <input
                      type="text"
                      value={joinForm.businessZip}
                      onChange={(e) => setJoinForm(prev => ({ ...prev, businessZip: e.target.value }))}
                      placeholder="ZIP code"
                      className="w-full bg-white border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black"
                    />
                  </div>
                </div>
              </section>

              {/* Operations */}
              <section>
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-2">Vehicle / rig</h4>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">Year</label>
                      <select
                        value={joinForm.vehicleYear}
                        onChange={(e) => setJoinForm((prev) => ({ ...prev, vehicleYear: e.target.value }))}
                        className="w-full bg-white border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black"
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
                        value={joinForm.vehicleMake}
                        onChange={(e) => setJoinForm((prev) => ({ ...prev, vehicleMake: e.target.value }))}
                        className="w-full bg-white border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black"
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
                        value={joinForm.vehicleModel}
                        onChange={(e) => setJoinForm((prev) => ({ ...prev, vehicleModel: e.target.value }))}
                        placeholder="e.g. Transit, Sprinter, Camry"
                        className="w-full bg-white border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">Color</label>
                      <select
                        value={joinForm.vehicleColor}
                        onChange={(e) => setJoinForm((prev) => ({ ...prev, vehicleColor: e.target.value }))}
                        className="w-full bg-white border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black"
                      >
                        <option value="">—</option>
                        {VEHICLE_COLORS.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">Service area</label>
                    <input
                      type="text"
                      value={joinForm.serviceArea}
                      onChange={(e) => setJoinForm(prev => ({ ...prev, serviceArea: e.target.value }))}
                      placeholder="City, state or zip"
                      className="w-full bg-white border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">Why do you want to join?</label>
                    <textarea
                      value={joinForm.message}
                      onChange={(e) => setJoinForm(prev => ({ ...prev, message: e.target.value }))}
                      placeholder="Optional"
                      rows={3}
                      className="w-full bg-white border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black resize-none"
                    />
                  </div>
                </div>
              </section>

              {joinError && !/EIN|9 digits/i.test(joinError) && (
                <div className="bg-red-50 border border-red-100 text-red-600 text-sm font-medium rounded-2xl px-4 py-2">
                  {joinError}
                </div>
              )}
              <button
                type="submit"
                disabled={joinSubmitting}
                className="w-full bg-black text-white py-4 rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {joinSubmitting ? 'Submitting…' : 'Submit application'}
              </button>
            </form>
          </div>
        );

      case 'vehicle':
        return (
          <div className="animate-in fade-in slide-in-from-right-8 duration-500 ease-out h-full flex flex-col">
            <BackButton onClick={() => setCurrentView('menu')} label="Menu" />
            <h2 className="text-4xl font-black mb-8 tracking-tighter">My vehicle</h2>
            <div className="flex-grow overflow-y-auto no-scrollbar space-y-6 pb-8">
              {vehicleSaveMessage && (
                <p className="text-sm font-medium text-green-600 bg-green-50 p-3 rounded-2xl">{vehicleSaveMessage}</p>
              )}
              {!vehicleShowForm && savedVehicleInView ? (
                <>
                  <div className="bg-gray-50 rounded-[32px] p-6 border-2 border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Saved vehicle</p>
                    <p className="font-black text-xl text-gray-900">{vehicleDisplayString(savedVehicleInView)}</p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setVehicleForm({ year: savedVehicleInView.year, make: savedVehicleInView.make, model: savedVehicleInView.model, color: savedVehicleInView.color ?? '' });
                        setVehicleShowForm(true);
                        setVehicleSaveMessage(null);
                      }}
                      className="flex-1 py-4 rounded-[28px] border-2 border-gray-200 font-black text-sm text-gray-700 hover:bg-gray-50 transition-all active:scale-[0.98]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        clearSavedVehicle();
                        setSavedVehicleInView(null);
                        setVehicleShowForm(true);
                        setVehicleForm({ year: String(new Date().getFullYear()), make: '', model: '', color: '' });
                        setVehicleSaveMessage(null);
                      }}
                      className="flex-1 py-4 rounded-[28px] border-2 border-red-100 font-black text-sm text-red-600 hover:bg-red-50 transition-all active:scale-[0.98]"
                    >
                      Remove
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">Year</label>
                        <select
                          value={vehicleForm.year}
                          onChange={(e) => setVehicleForm((f) => ({ ...f, year: e.target.value }))}
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
                          value={vehicleForm.make}
                          onChange={(e) => setVehicleForm((f) => ({ ...f, make: e.target.value }))}
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
                          value={vehicleForm.model}
                          onChange={(e) => setVehicleForm((f) => ({ ...f, model: e.target.value }))}
                          placeholder="e.g. Civic, Camry"
                          className="w-full bg-white border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-black"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">Color (optional)</label>
                        <select
                          value={vehicleForm.color}
                          onChange={(e) => setVehicleForm((f) => ({ ...f, color: e.target.value }))}
                          className="w-full bg-white border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-black"
                        >
                          <option value="">—</option>
                          {VEHICLE_COLORS.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!vehicleForm.year?.trim() || !vehicleForm.make?.trim() || !vehicleForm.model?.trim()) return;
                      const v: VehicleInfo = {
                        year: vehicleForm.year.trim(),
                        make: vehicleForm.make.trim(),
                        model: vehicleForm.model.trim(),
                        color: vehicleForm.color?.trim() || undefined,
                      };
                      saveSavedVehicle(v);
                      setSavedVehicleInView(loadSavedVehicle());
                      setVehicleShowForm(false);
                      setVehicleSaveMessage('Vehicle saved. It will be used next time you book.');
                      setTimeout(() => setVehicleSaveMessage(null), 4000);
                    }}
                    disabled={!vehicleForm.year?.trim() || !vehicleForm.make?.trim() || !vehicleForm.model?.trim()}
                    className="w-full py-5 rounded-[28px] bg-black text-white font-black text-sm active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save vehicle
                  </button>
                </>
              )}
            </div>
          </div>
        );

      default:
        return (
          <div className="animate-in fade-in duration-700 h-full flex flex-col">
            <div className="flex items-center gap-6 mb-12 pt-6 px-2">
              <div className="w-24 h-24 bg-gray-50 rounded-[40px] flex-shrink-0 overflow-hidden shadow-2xl border-4 border-white ring-1 ring-gray-100 group relative">
                <img src={`https://picsum.photos/seed/user/300/300`} alt="Avatar" className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700" />
                <div className="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-colors" />
              </div>
              <div>
                <h2 className="font-black text-3xl tracking-tighter leading-none mb-3">{user.name}</h2>
                <div className="flex items-center gap-2 text-[9px] bg-black text-white px-4 py-1.5 rounded-full w-fit font-black uppercase tracking-[0.2em] shadow-lg shadow-black/20">
                  <span className="text-yellow-400">★</span>
                  <span>{user.rating} VIP</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-5 mb-12 px-2">
              <button
                type="button"
                onClick={() => setCurrentView('history')}
                className="bg-gray-50 p-6 rounded-[40px] border-2 border-transparent hover:border-gray-100 hover:bg-white hover:shadow-xl transition-all group text-left active:scale-[0.98]"
              >
                <p className="text-gray-300 text-[10px] uppercase tracking-[0.3em] font-black mb-2 group-hover:text-black transition-colors">Orders</p>
                <p className="text-3xl font-black text-gray-900 group-hover:scale-110 transition-transform origin-left">
                  {currentView === 'menu' && historyLoading ? '…' : bookings.length}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setCurrentView('payment')}
                className="bg-gray-50 p-6 rounded-[40px] border-2 border-transparent hover:border-gray-100 hover:bg-white hover:shadow-xl transition-all group text-left active:scale-[0.98]"
              >
                <p className="text-gray-300 text-[10px] uppercase tracking-[0.3em] font-black mb-2 group-hover:text-black transition-colors">Wallet</p>
                <p className="text-3xl font-black text-gray-900 group-hover:scale-110 transition-transform origin-left">Pay</p>
              </button>
            </div>

            <nav className="flex-grow space-y-2 px-1">
              {[
                { id: 'history', label: 'Booking History', icon: '📅' },
                { id: 'vehicle', label: 'My vehicle', icon: '🚗' },
                { id: 'payment', label: 'Wallet & Pay', icon: '💳' },
                { id: 'support', label: 'Help Center', icon: '❓' },
                { id: 'settings', label: 'Settings', icon: '⚙️' }
              ].map((item) => {
                const isActive = currentView === item.id;
                return (
                  <button 
                    key={item.id}
                    onClick={() => ['history', 'vehicle', 'payment', 'support', 'settings'].includes(item.id) && setCurrentView(item.id as SidebarView)}
                    className={`w-full text-left font-black p-5 rounded-[28px] transition-all flex justify-between items-center group active:scale-[0.98] relative overflow-hidden ${
                      isActive 
                        ? 'bg-black text-white shadow-2xl translate-x-1' 
                        : 'bg-transparent text-gray-600 hover:bg-gray-50 hover:text-black'
                    }`}
                  >
                    {/* Active Accent Bar */}
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-blue-500 rounded-r-full shadow-[0_0_15px_rgba(59,130,246,0.8)]" />
                    )}
                    
                    <div className="flex items-center gap-5">
                       <span className={`text-xl transition-all duration-500 ${isActive ? 'scale-125 rotate-6' : 'opacity-60 group-hover:opacity-100 group-hover:scale-110'}`}>{item.icon}</span>
                       <span className={`text-sm tracking-tight ${isActive ? 'ml-1' : ''}`}>{item.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {item.badge && (
                        <span className="text-[8px] bg-blue-600 text-white px-2.5 py-1 rounded-full font-black tracking-[0.15em] animate-pulse">{item.badge}</span>
                      )}
                      <svg className={`w-5 h-5 transition-all duration-500 ${isActive ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 group-hover:opacity-40 group-hover:translate-x-0'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                );
              })}
            </nav>

            <div className="pt-10 border-t border-gray-100 mt-auto px-2 pb-2">
              <button
                onClick={() => setCurrentView('joinBrnno')}
                className="w-full py-6 bg-black text-white rounded-[32px] font-black text-sm active:scale-95 transition-all shadow-[0_20px_40px_rgba(0,0,0,0.15)] hover:bg-gray-900 group"
              >
                <span className="flex items-center justify-center gap-3">
                   JOIN BRNNO
                   <span className="group-hover:translate-x-1 transition-transform">→</span>
                </span>
              </button>
              <p className="text-center text-[9px] text-gray-300 mt-8 uppercase tracking-[0.4em] font-black opacity-50">V1.0.5 • BRNNO PLATFORM</p>
            </div>
          </div>
        );
    }
  };

  return (
    <>
      {/* Backdrop with enhanced blur */}
      <div 
        className={`fixed inset-0 bg-black/60 backdrop-blur-[6px] z-40 transition-opacity duration-700 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Drawer with cubic-bezier for physics-based feel */}
      <div className={`fixed top-0 left-0 h-full w-[420px] bg-white z-50 transform transition-transform duration-700 cubic-bezier(0.2, 1, 0.2, 1) shadow-[0_0_100px_rgba(0,0,0,0.2)] ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-8 h-full flex flex-col overflow-y-auto no-scrollbar relative">
          {renderContent()}
        </div>
      </div>
    </>
  );
};

export default ProfileSidebar;
