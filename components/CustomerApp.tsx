import React, { useState, useRef, useEffect } from 'react';
import Map from './Map';
import ProfileSidebar from './ProfileSidebar';
import BookingFlow from './BookingFlow';
import type { VehicleEntry } from '../services/bookings';
import ActiveBooking from './ActiveBooking';
import { BookingStatus, Service, Detailer, VehicleInfo, vehicleDisplayString } from '../types';
import { UserProfile } from '../types';
import { getServicePrice, SERVICES } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import LandingScreen from './LandingScreen';
import {
  listPaymentMethods,
  cancelPayment,
  updatePaymentAmount,
  chargeCancellationFee,
  type PaymentMethodDisplay,
} from '../services/paymentMethods';
import { supabase } from '../lib/supabase';
import { createBooking, updateBookingStatus, getBookingById, cancelBooking, getActiveBookingForUser } from '../services/bookings';
import { sendMessage } from '../services/bookingChat';
import { getDetailerLocation } from '../services/detailerLocation';
import { chargeTipForBooking, submitBookingReview } from '../services/bookingReviews';
import JobCompletionModal, { type CompletedBookingSnapshot } from './JobCompletionModal';

const POLL_INTERVAL_MS = 2500;

function userProfileFromAuth(user: { email?: string | null; user_metadata?: { full_name?: string; avatar_url?: string | null } }): UserProfile {
  const name = user.user_metadata?.full_name ?? user.email ?? 'Customer';
  return {
    name,
    rating: 0,
    trips: 0,
    balance: 0,
    avatarUrl: user.user_metadata?.avatar_url ?? null,
  };
}

const CustomerApp: React.FC = () => {
  const { user, session, loading: authLoading, signOut, signUp } = useAuth();
  const userProfile: UserProfile = user ? userProfileFromAuth(user) : { name: '', rating: 0, trips: 0, balance: 0, avatarUrl: null };
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [stage, setStage] = useState<'landing' | 'main'>('landing');
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
  const [pendingApprovalBooking, setPendingApprovalBooking] = useState<Awaited<ReturnType<typeof getBookingById>> | null>(null);
  const [bookingAddress, setBookingAddress] = useState<string | null>(null);
  const [bookingAddressZip, setBookingAddressZip] = useState<string | null>(null);
  const [completedBookingForReview, setCompletedBookingForReview] = useState<CompletedBookingSnapshot | null>(null);
  const [creatingScheduledBooking, setCreatingScheduledBooking] = useState(false);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Prevents duplicate createBooking when effect re-runs due to state updates after creating. */
  const bookingCreatedForSearchRef = useRef(false);
  const currentSearchBookingIdRef = useRef<string | null>(null);
  /** Restore active booking only once per user on load; do not overwrite if we already restored for this user. */
  const restoredForUserIdRef = useRef<string | null>(null);

  // After logout, return to LandingScreen
  useEffect(() => {
    if (!user?.id) setStage('landing');
  }, [user?.id]);

  // After successful login on LandingScreen, proceed to main map screen
  useEffect(() => {
    if (stage !== 'landing') return;
    if (!user?.id) return;
    setIsSidebarOpen(false);
    setStage('main');
  }, [stage, user?.id]);

  // Restore active booking from DB when session is ready (e.g. after refresh) so live UI reappears
  useEffect(() => {
    if (authLoading || !user?.id || !session) {
      if (!user?.id) restoredForUserIdRef.current = null;
      return;
    }
    if (restoredForUserIdRef.current === user.id) return;
    let cancelled = false;

    function applyRestore(row: Awaited<ReturnType<typeof getActiveBookingForUser>>) {
      if (!row || cancelled) return;
      restoredForUserIdRef.current = user!.id;
      const service = SERVICES.find((s) => s.name === row.service_name) ?? null;
      setCurrentBookingId(row.id);
      setSelectedService(service);
      setBookingAddress(row.location ?? null);
      setBookingAddressZip(row.address_zip ?? null);
      if (row.detailer_id && row.detailer_name) {
        setAssignedDetailer({
          id: row.detailer_id,
          name: row.detailer_name,
          rating: 5,
          trips: 0,
          car: row.detailer_vehicle ?? row.car_name ?? 'Pro vehicle',
          lat: 0,
          lng: 0,
          avatar: '',
          startingAddress: '',
        });
      } else {
        setAssignedDetailer(null);
      }
      if (row.status === 'pending_approval') {
        setPendingApprovalBooking(row);
        setStatus(BookingStatus.PENDING_APPROVAL);
      } else if (row.status === 'in_progress') {
        setStatus(BookingStatus.IN_PROGRESS);
      } else if (row.status === 'assigned' || row.status === 'en_route') {
        setStatus(BookingStatus.EN_ROUTE);
      } else if (row.status === 'pending' && row.scheduled_at) {
        setScheduledTime(row.scheduled_at);
        setStatus(BookingStatus.SCHEDULED);
      } else {
        setStatus(BookingStatus.SEARCHING);
      }
    }

    let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
    getActiveBookingForUser(user.id)
      .then((row) => {
        if (cancelled) return;
        if (row) {
          applyRestore(row);
          return;
        }
        // Retry once after a short delay in case session wasn't attached on first request
        retryTimeoutId = setTimeout(() => {
          getActiveBookingForUser(user.id).then((retryRow) => {
            if (!cancelled) {
              if (retryRow) applyRestore(retryRow);
              else restoredForUserIdRef.current = user.id;
            }
          });
        }, 800);
      })
      .catch(() => {
        if (!cancelled) restoredForUserIdRef.current = user.id;
      });

    return () => {
      cancelled = true;
      if (retryTimeoutId != null) clearTimeout(retryTimeoutId);
    };
  }, [user?.id, session, authLoading]);

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
            carName: vehicleInfo ? vehicleDisplayString(vehicleInfo) || null : null,
            location: bookingAddress ?? 'At your location',
            addressZip: bookingAddressZip ?? null,
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
          if (row.status === 'assigned' && row.detailer_id && row.detailer_name) {
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
              car: row.detailer_vehicle ?? row.car_name ?? 'Pro vehicle',
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
  }, [status, user, selectedService, vehicleInfo, chargedAmountCents, currentPaymentIntentId, taxCents, subtotalCents, bookingAddOnIds, bookingDirtinessLevel, bookingAddress, bookingAddressZip]);

  // Poll detailer location when en route so map shows real position
  useEffect(() => {
    if (status !== BookingStatus.EN_ROUTE || !assignedDetailer?.id) return;

    const pollDetailerLocation = async () => {
      const location = await getDetailerLocation(assignedDetailer.id);
      setAssignedDetailer((prev) => {
        if (!prev) return prev;
        if (location) return { ...prev, lat: location.lat, lng: location.lng };
        // Detailer offline or no position: clear coords so map removes their marker
        return { ...prev, lat: NaN, lng: NaN };
      });
    };

    pollDetailerLocation();
    const interval = setInterval(pollDetailerLocation, 10000);

    return () => clearInterval(interval);
  }, [status, assignedDetailer?.id]);

  // Poll for in_progress or pending_approval so customer sees chat/status when detailer has arrived or price adjustment requested
  useEffect(() => {
    if ((status !== BookingStatus.EN_ROUTE && status !== BookingStatus.IN_PROGRESS) || !currentBookingId) return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const row = await getBookingById(currentBookingId);
        if (!row) return;
        if (row.status === 'pending_approval') {
          setPendingApprovalBooking(row);
          setStatus(BookingStatus.PENDING_APPROVAL);
        } else if (row.status === 'in_progress') {
          setStatus(BookingStatus.IN_PROGRESS);
        } else if (row.status === 'completed') {
          setCompletedBookingForReview({
            bookingId: row.id,
            detailerId: row.detailer_id ?? assignedDetailer?.id ?? '',
            detailerName: row.detailer_name ?? assignedDetailer?.name ?? 'Your detailer',
            serviceName: row.service_name,
          });
          setPendingApprovalBooking(null);
        } else if (row.status === 'cancelled') {
          setStatus(BookingStatus.IDLE);
          setCurrentBookingId(null);
          setAssignedDetailer(null);
          setSelectedService(null);
        }
      } catch {
        // ignore
      }
    };
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    poll();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [status, currentBookingId]);

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
    guestInfo?: { guestName: string; guestEmail: string; guestPhone: string } | null,
    address?: string | null,
    addressZip?: string | null,
    vehicles?: VehicleEntry[] | null
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
    setBookingAddress(address ?? null);
    setBookingAddressZip(addressZip ?? null);

    if (!schedule) {
      setStatus(BookingStatus.SEARCHING);
      return;
    }

    const scheduledAtIso = (() => {
      const d = new Date(schedule.replace(' ', 'T'));
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    })();
    if (!scheduledAtIso) {
      alert('Invalid scheduled date or time. Please go back and choose again.');
      return;
    }

    setCreatingScheduledBooking(true);
    void (async () => {
      try {
        const cost = totalCents != null ? totalCents / 100 : getServicePrice(service.id, vehicle?.size ?? 'sedan');
        const multiVehicle = vehicles && vehicles.length > 1;
        const { id } = await createBooking({
          userId: user?.id ?? null,
          serviceName: multiVehicle ? `${vehicles!.length} vehicles` : service.name,
          cost,
          status: 'pending',
          detailerName: null,
          carName: vehicle ? vehicleDisplayString(vehicle) || null : null,
          location: address ?? 'At your location',
          addressZip: addressZip ?? null,
          payment_intent_id: paymentIntentId ?? null,
          tax_cents: taxCentsParam ?? null,
          subtotal_cents: subtotalCentsParam ?? null,
          add_ons: addOnIds && addOnIds.length > 0 ? addOnIds : null,
          dirtiness_level: dirtinessLevel ?? null,
          is_guest: !user,
          guest_name: guestInfo?.guestName ?? null,
          guest_email: guestInfo?.guestEmail ?? null,
          guest_phone: guestInfo?.guestPhone ?? null,
          scheduledAt: scheduledAtIso,
          vehicles: multiVehicle ? vehicles! : null,
        });
        setCurrentBookingId(id);
        setScheduledTime(schedule);
        setChargedAmountCents(null);
        setCurrentPaymentIntentId(null);
        setTaxCents(null);
        setSubtotalCents(null);
        setBookingAddOnIds([]);
        setBookingDirtinessLevel(null);
        setStatus(BookingStatus.SCHEDULED);
      } catch (err) {
        console.warn('Scheduled createBooking failed:', err);
        alert(err instanceof Error ? err.message : 'Failed to save your scheduled booking. Please try again.');
      } finally {
        setCreatingScheduledBooking(false);
      }
    })();
  };

  /** Close scheduled success UI without cancelling the persisted booking. */
  const dismissScheduledSuccessToIdle = () => {
    bookingCreatedForSearchRef.current = false;
    currentSearchBookingIdRef.current = null;
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setStatus(BookingStatus.IDLE);
    setSelectedService(null);
    setAssignedDetailer(null);
    setScheduledTime(null);
    setVehicleInfo(null);
    setBookingAddress(null);
    setBookingAddressZip(null);
    setCurrentBookingId(null);
    setChargedAmountCents(null);
    setCurrentPaymentIntentId(null);
    setTaxCents(null);
    setSubtotalCents(null);
    setBookingAddOnIds([]);
    setBookingDirtinessLevel(null);
    setBookingGuestInfo(null);
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
    setBookingAddress(null);
    setBookingAddressZip(null);
  };

  const handleCompletionModalSubmit = async (tipCents: number, rating: number, reviewText: string) => {
    const snapshot = completedBookingForReview;
    if (!snapshot) return;
    let effectiveTip = tipCents;
    if (tipCents > 0) {
      try {
        await chargeTipForBooking(snapshot.bookingId, tipCents);
      } catch {
        effectiveTip = 0;
      }
    }
    await submitBookingReview({
      bookingId: snapshot.bookingId,
      detailerId: snapshot.detailerId,
      rating,
      reviewText: reviewText || null,
      tipAmountCents: effectiveTip,
    });
    setCompletedBookingForReview(null);
    setCurrentBookingId(null);
    setAssignedDetailer(null);
    setSelectedService(null);
    setPendingApprovalBooking(null);
    setStatus(BookingStatus.IDLE);
    setScheduledTime(null);
    setVehicleInfo(null);
    setBookingAddress(null);
    setBookingAddressZip(null);
  };

  const handleApproveAdjustment = async () => {
    if (!pendingApprovalBooking || !currentBookingId) return;
    const { payment_intent_id, adjusted_price, id } = pendingApprovalBooking;
    if (!payment_intent_id || adjusted_price == null) return;
    let paymentUpdated = false;
    try {
      await updatePaymentAmount(payment_intent_id, adjusted_price);
      paymentUpdated = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes("can't increase the amount") && !msg.includes("can't change the charge amount")) {
        alert(msg || 'Failed to approve adjustment');
        return;
      }
    }

    try {
      const updatePayload: { customer_approved_adjustment: boolean; status: string; cost?: number } = {
        customer_approved_adjustment: true,
        status: 'in_progress',
      };
      if (paymentUpdated) {
        updatePayload.cost = adjusted_price / 100;
      }
      const { error } = await supabase
        .from('detailer_bookings')
        .update(updatePayload)
        .eq('id', id);

      if (error) throw error;

      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        await sendMessage(id, 'customer', 'Price adjustment approved. Please proceed with the service.');
      }

      setPendingApprovalBooking(null);
      setStatus(BookingStatus.IN_PROGRESS);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save approval');
    }
  };

  const handleDeclineAdjustment = async () => {
    if (!pendingApprovalBooking || !currentBookingId) return;
    const { payment_intent_id, id } = pendingApprovalBooking;
    if (!payment_intent_id) return;
    if (!confirm('Are you sure? A $25 cancellation fee will be charged.')) return;
    try {
      await chargeCancellationFee(payment_intent_id);
      const { error } = await supabase
        .from('detailer_bookings')
        .update({
          customer_approved_adjustment: false,
          cancellation_fee_charged: true,
          status: 'cancelled',
        })
        .eq('id', id);

      if (error) throw error;

      setPendingApprovalBooking(null);
      setCurrentBookingId(null);
      setAssignedDetailer(null);
      setSelectedService(null);
      setStatus(BookingStatus.IDLE);
      alert('Booking cancelled. $25 cancellation fee has been charged.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to process cancellation fee');
    }
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
      dismissScheduledSuccessToIdle();
    } catch (err) {
      setCreateAccountError((err as Error).message || 'Failed to create account');
    } finally {
      setCreateAccountSubmitting(false);
    }
  };

  if (stage === 'landing') {
    return (
      <>
        <LandingScreen
          onOpenProfile={() => setIsSidebarOpen(true)}
          onContinue={({ address, zip }) => {
            setBookingAddress(address);
            setBookingAddressZip(zip);
            setStage('main');
          }}
        />
        {isSidebarOpen && (
          <ProfileSidebar
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
            user={userProfile}
            onLogout={async () => {
              await signOut();
              setIsSidebarOpen(false);
              setStage('landing');
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className="relative h-screen w-full bg-white overflow-hidden select-none">
      {completedBookingForReview && (
        <JobCompletionModal
          booking={completedBookingForReview}
          mode="completion"
          onSubmit={handleCompletionModalSubmit}
        />
      )}
      <div className="absolute top-0 left-0 right-0 z-40 p-4 flex justify-between items-center pointer-events-none">
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="pointer-events-auto w-12 h-12 glass rounded-2xl shadow-lg flex items-center justify-center active:scale-90 transition-transform"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </button>

        <div className="glass px-6 py-2 rounded-2xl shadow-lg flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="font-black text-sm tracking-tighter">BRNNO NOW</span>
        </div>
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
        <>
          <BookingFlow
            user={user ?? undefined}
            onConfirm={handleConfirmBooking}
            onClose={() => setStatus(BookingStatus.IDLE)}
            paymentMethods={paymentMethods}
            defaultPaymentMethod={paymentMethods.find((p) => p.isDefault) ?? paymentMethods[0] ?? undefined}
            initialAddress={bookingAddress}
            initialAddressZip={bookingAddressZip}
          />
          {creatingScheduledBooking && (
            <div className="absolute inset-0 z-[45] flex items-center justify-center bg-white/70 backdrop-blur-sm pointer-events-auto">
              <p className="text-sm font-bold text-gray-700">Saving your booking…</p>
            </div>
          )}
        </>
      )}

      {status === BookingStatus.SEARCHING && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/60 backdrop-blur-sm px-6 pointer-events-auto">
          {/* Spinner */}
          <div className="relative mb-6">
            <div className="w-24 h-24 border-8 border-gray-100 border-t-black rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center text-3xl pointer-events-none">🚗</div>
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

      {status === BookingStatus.SCHEDULED && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-6 pointer-events-auto">
          <div className="bg-white rounded-[40px] p-8 w-full max-w-sm text-center shadow-2xl animate-in fade-in zoom-in-90 duration-300">
            {/* Success icon */}
            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            {/* Heading */}
            <h2 className="text-3xl font-black mb-2">You&apos;re Booked!</h2>

            <p className="text-gray-500 font-medium mb-2">
              We&apos;ll match you with a detailer before your appointment.
            </p>
            <p className="text-gray-400 text-sm mb-6">
              {bookingGuestInfo
                ? `You'll receive a text and email at ${bookingGuestInfo.guestEmail} with updates.`
                : "You'll receive a notification with confirmation details."}
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
                    {new Date(scheduledTime.includes('T') ? scheduledTime : scheduledTime.replace(' ', 'T')).toLocaleString([], {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Location</span>
                <span className="font-semibold text-black text-right max-w-[60%] truncate">
                  {bookingAddress ?? 'At your location'}
                </span>
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
                  onClick={dismissScheduledSuccessToIdle}
                  className="w-full text-gray-400 text-sm py-1"
                >
                  Maybe later
                </button>
              </div>
            )}

            {!bookingGuestInfo && (
              <button
                type="button"
                onClick={dismissScheduledSuccessToIdle}
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
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-md p-6 pointer-events-auto">
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

      {status === BookingStatus.PENDING_APPROVAL && pendingApprovalBooking && (
        <div className="absolute bottom-0 left-0 right-0 p-4 z-50">
          <div className="max-w-md mx-auto bg-yellow-50 border-2 border-yellow-400 rounded-2xl p-6 shadow-xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="text-3xl">⚠️</div>
              <div>
                <h3 className="font-bold text-yellow-900 text-lg mb-2">Price Adjustment Request</h3>
                <p className="text-yellow-800 mb-2">
                  Your detailer has requested to change the price from{' '}
                  <span className="font-semibold">${Number(pendingApprovalBooking.cost).toFixed(2)}</span> to{' '}
                  <span className="font-semibold">${((pendingApprovalBooking.adjusted_price ?? 0) / 100).toFixed(2)}</span>
                </p>
                <div className="bg-white rounded p-3 mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-1">Reason:</p>
                  <p className="text-sm text-gray-600">{pendingApprovalBooking.adjustment_reason ?? '—'}</p>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleApproveAdjustment}
                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
              >
                Approve New Price
              </button>
              <button
                onClick={handleDeclineAdjustment}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold"
              >
                Decline & Cancel
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-3 text-center">
              If you decline, a $25 cancellation fee will be charged for the detailer&apos;s travel time.
            </p>
          </div>
        </div>
      )}

      {(status === BookingStatus.EN_ROUTE || status === BookingStatus.ARRIVED || status === BookingStatus.IN_PROGRESS) && assignedDetailer && selectedService && (
        <ActiveBooking
          status={status}
          detailer={assignedDetailer}
          service={selectedService}
          vehicleInfo={vehicleInfo}
          bookingId={currentBookingId}
          onCancel={handleCancel}
        />
      )}

      {isSidebarOpen && (
        <ProfileSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          user={userProfile}
          onLogout={signOut}
        />
      )}
    </div>
  );
};

export default CustomerApp;
