import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface PendingBooking {
  id: string;
  created_at: string;
  service_name: string;
  location: string | null;
  cost: number;
  is_guest?: boolean;
  guest_name?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
  status: string;
}

interface Detailer {
  id: string;
  name: string;
  email: string;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
}

export default function AdminDashboard() {
  const [pendingBookings, setPendingBookings] = useState<PendingBooking[]>([]);
  const [detailers, setDetailers] = useState<Detailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningJobId, setAssigningJobId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setAssignError(null);
    setAssignSuccess(null);

    const { data: bookings, error: bookingsError } = await supabase
      .from('detailer_bookings')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      setPendingBookings([]);
    } else {
      setPendingBookings((bookings ?? []) as PendingBooking[]);
    }

    const { data: detailersData, error: detailersError } = await supabase
      .from('detailers')
      .select('id, name, email, vehicle_year, vehicle_make, vehicle_model')
      .eq('is_approved', true)
      .order('name');

    if (detailersError) {
      console.error('Error fetching detailers:', detailersError);
      setDetailers([]);
    } else {
      setDetailers((detailersData ?? []) as Detailer[]);
    }

    setLoading(false);
  };

  const handleAssignJob = async (bookingId: string, detailerId: string) => {
    if (!detailerId) {
      setAssignError('Please select a detailer');
      return;
    }

    const detailer = detailers.find((d) => d.id === detailerId);
    if (!detailer) {
      setAssignError('Detailer not found');
      return;
    }

    setAssigningJobId(bookingId);
    setAssignError(null);
    setAssignSuccess(null);

    const carName =
      [detailer.vehicle_year, detailer.vehicle_make, detailer.vehicle_model]
        .filter(Boolean)
        .join(' ') || 'Pro vehicle';

    const { error } = await supabase
      .from('detailer_bookings')
      .update({
        assigned_detailer_id: detailer.id,
        detailer_id: detailer.id,
        detailer_name: detailer.name,
        car_name: carName,
        status: 'assigned',
        detailer_assigned_at: new Date().toISOString(),
        detailer_accepted_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .eq('status', 'pending');

    setAssigningJobId(null);

    if (error) {
      setAssignError(error.message ?? 'Failed to assign job');
    } else {
      setAssignSuccess('Job assigned successfully!');
      fetchData();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl font-medium text-gray-600">Loading admin dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-600 mt-2">Manage pending bookings and assign detailers</p>
        </div>

        {assignError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm font-medium">
            {assignError}
          </div>
        )}
        {assignSuccess && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-2xl text-green-700 text-sm font-medium">
            {assignSuccess}
          </div>
        )}

        {pendingBookings.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
            <p className="text-gray-500 text-lg font-medium">No pending bookings</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Booking Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Service
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Assign Detailer
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pendingBookings.map((booking) => (
                  <BookingRow
                    key={booking.id}
                    booking={booking}
                    detailers={detailers}
                    onAssign={handleAssignJob}
                    isAssigning={assigningJobId === booking.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function BookingRow({
  booking,
  detailers,
  onAssign,
  isAssigning,
}: {
  booking: PendingBooking;
  detailers: Detailer[];
  onAssign: (bookingId: string, detailerId: string) => void;
  isAssigning: boolean;
}) {
  const [selectedDetailer, setSelectedDetailer] = useState('');

  return (
    <tr>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm font-medium text-gray-900">
          {new Date(booking.created_at).toLocaleString()}
        </div>
        <div className="text-sm text-gray-600 font-semibold">${Number(booking.cost).toFixed(2)}</div>
      </td>

      <td className="px-6 py-4">
        {booking.is_guest ? (
          <div>
            <div className="text-sm font-medium text-gray-900">{booking.guest_name ?? '—'}</div>
            <div className="text-sm text-gray-500">{booking.guest_email ?? '—'}</div>
            <div className="text-sm text-gray-500">{booking.guest_phone ?? '—'}</div>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 mt-1">
              Guest
            </span>
          </div>
        ) : (
          <div>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
              Registered
            </span>
          </div>
        )}
      </td>

      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-900">{booking.service_name}</div>
      </td>

      <td className="px-6 py-4">
        <div className="text-sm text-gray-500 max-w-xs truncate">{booking.location ?? 'At your location'}</div>
      </td>

      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <select
            value={selectedDetailer}
            onChange={(e) => setSelectedDetailer(e.target.value)}
            className="block w-48 px-3 py-2 text-sm border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
            disabled={isAssigning}
          >
            <option value="">Select detailer...</option>
            {detailers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => onAssign(booking.id, selectedDetailer)}
            disabled={!selectedDetailer || isAssigning}
            className="px-4 py-2 bg-black text-white text-sm font-bold rounded-xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isAssigning ? 'Assigning...' : 'Assign'}
          </button>
        </div>
      </td>
    </tr>
  );
}
