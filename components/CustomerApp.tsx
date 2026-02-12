import React, { useState, useRef, useEffect } from 'react';
import Map from './Map';
import ProfileSidebar from './ProfileSidebar';
import BookingFlow from './BookingFlow';
import ActiveBooking from './ActiveBooking';
import { BookingStatus, Service, Detailer, VehicleInfo, vehicleDisplayString } from '../types';
import { UserProfile } from '../types';
import { getServicePrice } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { listPaymentMethods, capturePayment, cancelPayment, type PaymentMethodDisplay } from '../services/paymentMethods';
import { supabase } from '../lib/supabase';
import { createBooking, updateBookingStatus, getBookingById, cancelBooking } from '../services/bookings';
import { getDetailerLocation } from '../services/detailerLocation';

const POLL_INTERVAL_MS = 2500;

function userProfileFromAuth(user: { email?: string | null; user_metadata?: { full_name?: string } }): UserProfile {
  const name = user.user_metadata?.full_name ?? user.email ?? 'Customer';
  return {
    name,
    rating: 0,
    trips: 0,
    balance: 0,
  };
}

const CustomerApp: React.FC = () => {
  const { user, signOut, signUp } = useAuth();
  const userProfile: UserProfile = user ? userProfileFromAuth(user) : { name: '', rating: 0, trips: 0, balance: 0 };
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [status, setStatus] = useState<BookingStatus>(BookingStatus.IDLE);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [assignedDetailer, setAssignedDetailer] = useState<Detailer | null>(null);
  const [scheduledTime, setScheduledTime] = useState<string | null>(null);
  const [vehicleInfo, setVehicleInfo] = useState<VehicleInfo | null>(null);
  const [chargedAmountCents, setChargedAmountCents] = useState<number | null>(null);
  const [currentPaymentIntentId, setCurrentPaymentIntentId] = useState<string | null>(null);
  const [taxCents, setTaxCents] = useState<number | null>(null);
  const [subtotalCents, setSubtotalCents] = useState<number | null>(null);
  const [bookingAddOnIds, setBookingAddOnIds] = useState<string[]>([]);
  const [bookingDirtinessLevel, setBookingDirtinessLevel] = useState<string | null>(null);
  const [bookingGuestInfo, setBookingGuestInfo] = useState<{ guestName: string; guestEmail: string; guestPhone: string } | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodDisplay[]>([]);
  const [currentBookingId, setCurrentBookingId] = useState<string | null>(null);
  const [showCreateAccountModal, setShowCreateAccountModal] = useState(false);
  const [createAccountPassword, setCreateAccountPassword] = useState('');
  const [createAccountError, setCreateAccountError] = useState<string | null>(null);
  const [createAccountSubmitting, setCreateAccountSubmitting] = useState(false);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Prevents duplicate createBooking when effect re-runs due to state updates after creating. */
  const bookingCreatedForSearchRef = useRef(false);
  const currentSearchBookingIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setPaymentMethods([]);
      return;
    }
    listPaymentMethods()
      .then(setPaymentMethods)
      .catch(() => setPaymentMethods([]));
  }, [user?.id]);

  useEffect(() => {
    if (status !== BookingStatus.SELECTING || !user?.id) return;
    listPaymentMethods()
      .then(setPaymentMethods)
      .catch(() => setPaymentMethods([]));
  }, [status, user?.id]);

  useEffect(() => {
    if (status !== BookingStatus.SEARCHING || !selectedService) return;

    let cancelled = false;
    const cost = chargedAmountCents != null ? chargedAmountCents / 100 : getServicePrice(selectedService.id, vehicleInfo?.size ?? 'sedan');

    (async () => {
      let bookingId: string | null = null;

      if (bookingCreatedForSearchRef.current && currentSearchBookingIdRef.current) {
        bookingId = currentSearchBookingIdRef.current;
      } else {
        try {
          const { id } = await createBooking({
            userId: user?.id ?? null,
            serviceName: selectedService.name,
            cost,
            status: 'pending',
            detailerName: null,
            carName: null,
            location: 'At your location',
            addressZip: null,
            payment_intent_id: currentPaymentIntentId ?? null,
            tax_cents: taxCents ?? null,
            subtotal_cents: subtotalCents ?? null,
            add_ons: bookingAddOnIds.length > 0 ? bookingAddOnIds : null,
            dirtiness_level: bookingDirtinessLevel ?? null,
            is_guest: !user,
            guest_name: bookingGuestInfo?.guestName ?? null,
            guest_email: bookingGuestInfo?.guestEmail ?? null,
            guest_phone: bookingGuestInfo?.guestPhone ?? null,
          });
          bookingId = id;
          bookingCreatedForSearchRef.current = true;
          currentSearchBookingIdRef.current = id;
          setCurrentBookingId(id);
          setChargedAmountCents(null);
          setCurrentPaymentIntentId(null);
          setTaxCents(null);
          setSubtotalCents(null);
          setBookingAddOnIds([]);
          setBookingDirtinessLevel(null);
          setBookingGuestInfo(null);
        } catch (err) {
          console.warn('createBooking failed:', err);
          return;
        }
      }

      if (!bookingId) return;

      const poll = async () => {
        if (cancelled || !bookingId) return;
        try {
          const row = await getBookingById(bookingId);
          if (!row || row.status === 'cancelled') return;
          if (row.status === 'assigned' && row.detailer_id && row.detailer_name && row.car_name) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            bookingCreatedForSearchRef.current = false;
            currentSearchBookingIdRef.current = null;
            const detailer: Detailer = {
              id: row.detailer_id,
              name: row.detailer_name,
              rating: 5,
              trips: 0,
              car: row.car_name,
              lat: 0,
              lng: 0,
              avatar: '',
              startingAddress: '',
            };
            setAssignedDetailer(detailer);
            setStatus(BookingStatus.EN_ROUTE);
            return;
          }
        } catch {
          // keep polling
        }
      };

      pollIntervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
      poll();
    })();

    return () => {
      cancelled = true;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [status, user, selectedService, vehicleInfo, chargedAmountCents, currentPaymentIntentId, taxCents, subtotalCents, bookingAddOnIds, bookingDirtinessLevel]);

  // Poll detailer location when en route so map shows real position
  useEffect(() => {
    if (status !== BookingStatus.EN_ROUTE || !assignedDetailer?.id) return;

    const pollDetailerLocation = async () => {
      const location = await getDetailerLocation(assignedDetailer.id);
      if (location) {
        setAssignedDetailer((prev) =>
          prev ? { ...prev, lat: location.lat, lng: location.lng } : prev
        );
      }
    };

    pollDetailerLocation();
    const interval = setInterval(pollDetailerLocation, 10000);

    return () => clearInterval(interval);
  }, [status, assignedDetailer?.id]);

  const handleConfirmBooking = (
    service: Service,
    schedule?: string,
    vehicle?: VehicleInfo | null,
    totalCents?: number,
    paymentIntentId?: string,
    taxCentsParam?: number,
    subtotalCentsParam?: number,
    addOnIds?: string[],
    dirtinessLevel?: string,
    guestInfo?: { guestName: string; guestEmail: string; guestPhone: string } | null
  ) => {
    setSelectedService(service);
    setVehicleInfo(vehicle ?? null);
    setChargedAmountCents(totalCents ?? null);
    setCurrentPaymentIntentId(paymentIntentId ?? null);
    setTaxCents(taxCentsParam ?? null);
    setSubtotalCents(subtotalCentsParam ?? null);
    setBookingAddOnIds(addOnIds ?? []);
    setBookingDirtinessLevel(dirtinessLevel ?? null);
    setBookingGuestInfo(guestInfo ?? null);

    if (schedule) {
      setScheduledTime(schedule);
      setStatus(BookingStatus.COMPLETED);
    } else {
      setStatus(BookingStatus.SEARCHING);
    }
  };

  const handleCancel = async () => {
    bookingCreatedForSearchRef.current = false;
    currentSearchBookingIdRef.current = null;
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (currentBookingId) {
      try {
        await cancelBooking(currentBookingId);
      } catch (err) {
        console.warn('Failed to cancel booking:', err);
      }
      setCurrentBookingId(null);
    } else if (currentPaymentIntentId) {
      try {
        await cancelPayment(currentPaymentIntentId);
      } catch (err) {
        console.warn('Failed to release payment hold:', err);
      }
      setCurrentPaymentIntentId(null);
    }
    setStatus(BookingStatus.IDLE);
    setSelectedService(null);
    setAssignedDetailer(null);
    setScheduledTime(null);
    setVehicleInfo(null);
    setSearchStep(0);
  };

  const handleComplete = async () => {
    bookingCreatedForSearchRef.current = false;
    currentSearchBookingIdRef.current = null;
    if (currentBookingId) {
      try {
        const row = await getBookingById(currentBookingId);
        if (row?.payment_intent_id) {
          await capturePayment(row.payment_intent_id);
        }
        await updateBookingStatus(currentBookingId, 'completed');
      } catch {
        // continue clearing state
      }
      setCurrentBookingId(null);
    }
    setStatus(BookingStatus.IDLE);
    setSelectedService(null);
    setAssignedDetailer(null);
    setScheduledTime(null);
    setVehicleInfo(null);
  };

  const handleCreateAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingGuestInfo?.guestEmail || !createAccountPassword.trim()) return;
    setCreateAccountError(null);
    setCreateAccountSubmitting(true);
    try {
      const { data, error } = await signUp(
        bookingGuestInfo.guestEmail,
        createAccountPassword,
        bookingGuestInfo.guestName
      );
      if (error) throw error;
      if (data?.user?.id) {
        const { error: updateError } = await supabase
          .from('detailer_bookings')
          .update({ converted_user_id: data.user.id })
          .eq('guest_email', bookingGuestInfo.guestEmail)
          .is('user_id', null)
          .is('converted_user_id', null);
        if (updateError) {
          console.error('Failed to link guest booking:', updateError);
        }
      }
      setShowCreateAccountModal(false);
      setCreateAccountPassword('');
      handleCancel();
    } catch (err) {
      setCreateAccountError((err as Error).message || 'Failed to create account');
    } finally {
      setCreateAccountSubmitting(false);
    }
  };

  return (
    <div className="relative h-screen w-full bg-white overflow-hidden select-none">
      <div className="absolute top-0 left-0 right-0 z-40 p-4 flex justify-between items-center pointer-events-none">
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="pointer-events-auto w-12 h-12 glass rounded-2xl shadow-lg flex items-center justify-center active:scale-90 transition-transform"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" />
          </svg>
        </button>

        <div className="glass px-6 py-2 rounded-2xl shadow-lg flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="font-black text-sm tracking-tighter">BRNNO NOW</span>
        </div>

        <button className="pointer-events-auto w-12 h-12 glass rounded-2xl shadow-lg flex items-center justify-center">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </div>

      <Map status={status} assignedDetailer={assignedDetailer} />

      {status === BookingStatus.IDLE && (
        <div className="absolute bottom-10 left-0 right-0 flex justify-center z-30 px-4">
          <button
            onClick={() => setStatus(BookingStatus.SELECTING)}
            className="bg-black text-white px-10 py-5 rounded-3xl font-black text-xl shadow-2xl active:scale-95 transition-all w-full max-w-sm flex justify-between items-center"
          >
            <span>Book Service</span>
            <span className="text-2xl">→</span>
          </button>
        </div>
      )}

      {status === BookingStatus.SELECTING && (
        <BookingFlow
          user={user ?? undefined}
          onConfirm={handleConfirmBooking}
          onClose={() => setStatus(BookingStatus.IDLE)}
          paymentMethods={paymentMethods}
          defaultPaymentMethod={paymentMethods.find((p) => p.isDefault) ?? paymentMethods[0] ?? undefined}
        />
      )}

      {status === BookingStatus.SEARCHING && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/60 backdrop-blur-sm px-6">
          {/* Spinner */}
          <div className="relative mb-6">
            <div className="w-24 h-24 border-8 border-gray-100 border-t-black rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center text-3xl">🚗</div>
          </div>

          {/* Heading */}
          <h2 className="text-2xl font-black text-center mb-2">
            We&apos;re on it!
          </h2>

          {/* Subtext */}
          <p className="text-gray-500 text-center text-sm font-medium max-w-xs mb-8">
            We&apos;re finding the perfect detailer for you. Sit tight while we process your booking.
          </p>

          {/* Info card */}
          <div className="w-full max-w-sm bg-black/5 rounded-2xl p-5 space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-lg">📱</span>
              <p className="text-sm text-gray-600">
                <span className="font-semibold text-black">You&apos;ll hear from us within 10 minutes</span> via text and email once your detailer is confirmed.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-lg">📍</span>
              <p className="text-sm text-gray-600">
                <span className="font-semibold text-black">Your detailer comes to you</span> — no need to go anywhere.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-lg">✨</span>
              <p className="text-sm text-gray-600">
                <span className="font-semibold text-black">Payment is held securely</span> and only released once the job is complete.
              </p>
            </div>
          </div>

        </div>
      )}

      {status === BookingStatus.COMPLETED && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-6">
          <div className="bg-white rounded-[40px] p-8 w-full max-w-sm text-center shadow-2xl animate-in fade-in zoom-in-90 duration-300">
            {/* Success icon */}
            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            {/* Heading */}
            <h2 className="text-3xl font-black mb-2">You&apos;re Booked!</h2>

            {/* Subtext — async messaging for manual dispatch */}
            <p className="text-gray-500 font-medium mb-2">
              We&apos;re finding the perfect detailer for you.
            </p>
            <p className="text-gray-400 text-sm mb-6">
              {bookingGuestInfo
                ? `You'll receive a text and email at ${bookingGuestInfo.guestEmail} within 10 minutes.`
                : "You'll receive a notification within 10 minutes once confirmed."}
            </p>

            {/* Booking summary */}
            <div className="bg-gray-50 rounded-2xl p-4 text-left mb-6 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Service</span>
                <span className="font-semibold text-black">{selectedService?.name}</span>
              </div>
              {scheduledTime && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Scheduled</span>
                  <span className="font-semibold text-black">
                    {new Date(scheduledTime.replace(' ', 'T')).toLocaleString([], {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Location</span>
                <span className="font-semibold text-black">At your location</span>
              </div>
            </div>

            {/* Guest account creation prompt */}
            {bookingGuestInfo && (
              <div className="mb-4 p-4 bg-black/5 rounded-2xl text-left">
                <p className="text-sm font-semibold text-black mb-1">Save your booking</p>
                <p className="text-xs text-gray-500 mb-3">
                  Create an account to track your detail, rebook easily, and manage your vehicle.
                </p>
                <button
                  type="button"
                  onClick={() => setShowCreateAccountModal(true)}
                  className="w-full bg-black text-white py-3 rounded-xl font-bold text-sm active:scale-95 transition-transform mb-2"
                >
                  Create Account
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="w-full text-gray-400 text-sm py-1"
                >
                  Maybe later
                </button>
              </div>
            )}

            {/* Done button — only shows for logged in users */}
            {!bookingGuestInfo && (
              <button
                type="button"
                onClick={handleCancel}
                className="w-full bg-black text-white py-4 rounded-2xl font-bold text-lg active:scale-95 transition-transform"
              >
                Done
              </button>
            )}
          </div>
        </div>
      )}

      {/* Create account modal for guests */}
      {showCreateAccountModal && bookingGuestInfo && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-md p-6">
          <div className="bg-white rounded-[40px] p-8 w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-black mb-2">Create account</h3>
            <p className="text-gray-500 text-sm mb-6">
              Use a password to sign in later and track your booking.
            </p>
            <form onSubmit={handleCreateAccountSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">Email</label>
                <input
                  type="email"
                  value={bookingGuestInfo.guestEmail}
                  readOnly
                  className="w-full bg-gray-100 border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-medium text-gray-600"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">Password</label>
                <input
                  type="password"
                  value={createAccountPassword}
                  onChange={(e) => setCreateAccountPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full bg-white border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black"
                  autoComplete="new-password"
                />
              </div>
              {createAccountError && (
                <div className="bg-red-50 border border-red-100 text-red-600 text-sm font-medium rounded-2xl px-4 py-2">
                  {createAccountError}
                </div>
              )}
              <button
                type="submit"
                disabled={createAccountSubmitting}
                className="w-full bg-black text-white py-4 rounded-2xl font-bold text-lg active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createAccountSubmitting ? 'Creating…' : 'Create Account'}
              </button>
            </form>
            <button
              type="button"
              onClick={() => {
                setShowCreateAccountModal(false);
                setCreateAccountError(null);
                setCreateAccountPassword('');
              }}
              className="w-full mt-4 text-gray-500 text-sm font-bold hover:text-black transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {(status === BookingStatus.EN_ROUTE || status === BookingStatus.ARRIVED) && assignedDetailer && selectedService && (
        <ActiveBooking
          status={status}
          detailer={assignedDetailer}
          service={selectedService}
          vehicleInfo={vehicleInfo}
          onCancel={handleCancel}
          onComplete={currentBookingId ? handleComplete : undefined}
        />
      )}

      <ProfileSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        user={userProfile}
        onLogout={signOut}
      />
    </div>
  );
};

export default CustomerApp;
