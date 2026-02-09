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
import { createBooking, updateBookingStatus, getBookingById } from '../services/bookings';

const FINDING_DETAILER_STEPS = [
  'Searching for available pros in your area',
  'Notifying nearby detailers',
  'Waiting for a pro to accept your request',
  'A pro accepted! Getting your detailer ready...',
];

const SEARCH_STEP_INTERVAL_MS = 1500;
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
  const { user, signOut } = useAuth();
  const userProfile: UserProfile = user ? userProfileFromAuth(user) : { name: '', rating: 0, trips: 0, balance: 0 };
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [status, setStatus] = useState<BookingStatus>(BookingStatus.IDLE);
  const [searchStep, setSearchStep] = useState(0);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [assignedDetailer, setAssignedDetailer] = useState<Detailer | null>(null);
  const [scheduledTime, setScheduledTime] = useState<string | null>(null);
  const [vehicleInfo, setVehicleInfo] = useState<VehicleInfo | null>(null);
  const [chargedAmountCents, setChargedAmountCents] = useState<number | null>(null);
  const [currentPaymentIntentId, setCurrentPaymentIntentId] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodDisplay[]>([]);
  const [currentBookingId, setCurrentBookingId] = useState<string | null>(null);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    if (status !== BookingStatus.SEARCHING || !user || !selectedService) return;

    setSearchStep(0);
    stepIntervalRef.current = setInterval(() => {
      setSearchStep((prev) =>
        prev < FINDING_DETAILER_STEPS.length - 1 ? prev + 1 : prev
      );
    }, SEARCH_STEP_INTERVAL_MS);

    let cancelled = false;
    const cost = chargedAmountCents != null ? chargedAmountCents / 100 : getServicePrice(selectedService.id, vehicleInfo?.size ?? 'sedan');

    (async () => {
      if (currentPaymentIntentId) {
        try {
          await capturePayment(currentPaymentIntentId);
        } catch (err) {
          console.warn('Capture failed; payment may need manual handling:', err);
        }
      }
      let bookingId: string | null = null;
      try {
        const { id } = await createBooking({
          userId: user.id,
          serviceName: selectedService.name,
          cost,
          status: 'pending',
          location: 'At your location',
          addressZip: null,
        });
        bookingId = id;
        setCurrentBookingId(id);
        setChargedAmountCents(null);
        setCurrentPaymentIntentId(null);
      } catch (err) {
        console.warn('createBooking failed:', err);
        if (stepIntervalRef.current) {
          clearInterval(stepIntervalRef.current);
          stepIntervalRef.current = null;
        }
        return;
      }

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
            if (stepIntervalRef.current) {
              clearInterval(stepIntervalRef.current);
              stepIntervalRef.current = null;
            }
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
      if (stepIntervalRef.current) {
        clearInterval(stepIntervalRef.current);
        stepIntervalRef.current = null;
      }
    };
  }, [status, user, selectedService, vehicleInfo, chargedAmountCents, currentPaymentIntentId]);

  const handleConfirmBooking = (service: Service, schedule?: string, vehicle?: VehicleInfo | null, amountCents?: number, paymentIntentId?: string) => {
    setSelectedService(service);
    setVehicleInfo(vehicle ?? null);
    setChargedAmountCents(amountCents ?? null);
    setCurrentPaymentIntentId(paymentIntentId ?? null);

    if (schedule) {
      setScheduledTime(schedule);
      setStatus(BookingStatus.COMPLETED);
    } else {
      setStatus(BookingStatus.SEARCHING);
    }
  };

  const handleCancel = async () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (stepIntervalRef.current) {
      clearInterval(stepIntervalRef.current);
      stepIntervalRef.current = null;
    }
    if (currentPaymentIntentId) {
      try {
        await cancelPayment(currentPaymentIntentId);
      } catch (err) {
        console.warn('Failed to release payment hold:', err);
      }
      setCurrentPaymentIntentId(null);
    }
    if (currentBookingId) {
      try {
        await updateBookingStatus(currentBookingId, 'cancelled');
      } catch (err) {
        console.warn('Failed to mark booking as cancelled:', err);
      }
      setCurrentBookingId(null);
    }
    setStatus(BookingStatus.IDLE);
    setSelectedService(null);
    setAssignedDetailer(null);
    setScheduledTime(null);
    setVehicleInfo(null);
    setSearchStep(0);
  };

  const handleComplete = async () => {
    if (currentBookingId) {
      try {
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
          onConfirm={handleConfirmBooking}
          onClose={() => setStatus(BookingStatus.IDLE)}
          paymentMethods={paymentMethods}
          defaultPaymentMethod={paymentMethods.find((p) => p.isDefault) ?? paymentMethods[0] ?? undefined}
        />
      )}

      {status === BookingStatus.SEARCHING && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/60 backdrop-blur-sm px-6">
          <div className="relative">
            <div className="w-32 h-32 border-8 border-gray-100 border-t-black rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center text-3xl">✨</div>
          </div>
          <p className="mt-4 text-sm font-semibold text-green-700">Payment processed – finding your detailer</p>
          <h2 className="mt-4 text-2xl font-black text-center">Finding you the best detailers near you</h2>
          <div className="mt-6 w-full max-w-sm space-y-3">
            {FINDING_DETAILER_STEPS.map((step, i) => {
              const isDone = i < searchStep;
              const isCurrent = i === searchStep;
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all ${
                    isCurrent ? 'bg-black/5 border-2 border-black/10' : ''
                  } ${isDone ? 'opacity-80' : ''}`}
                >
                  {isDone ? (
                    <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : (
                    <div className={`w-6 h-6 rounded-full flex-shrink-0 ${isCurrent ? 'border-2 border-black animate-pulse' : 'border-2 border-gray-200'}`} />
                  )}
                  <span className={`text-sm font-medium ${isCurrent ? 'text-black font-semibold' : 'text-gray-500'}`}>
                    {step}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {status === BookingStatus.COMPLETED && scheduledTime && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-6">
          <div className="bg-white rounded-[40px] p-8 w-full max-w-sm text-center shadow-2xl animate-in fade-in zoom-in-90 duration-300">
            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <h2 className="text-3xl font-black mb-2">Service Booked!</h2>
            <p className="text-gray-500 font-medium mb-6">
              Your {selectedService?.name} is scheduled for<br/>
              <span className="text-black font-bold">{new Date(scheduledTime.replace(' ', 'T')).toLocaleString([], { dateStyle: 'long', timeStyle: 'short' })}</span>
            </p>
            <button
              onClick={handleCancel}
              className="w-full bg-black text-white py-4 rounded-2xl font-bold text-lg active:scale-95 transition-transform"
            >
              Done
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
