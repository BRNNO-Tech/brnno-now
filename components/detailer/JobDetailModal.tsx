import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog';
import { updateJobStatus, type ActiveJobRow } from '../../services/detailers';
import { supabase } from '../../lib/supabase';
import { sendMessage } from '../../services/bookingChat';
import { capturePaymentForJob } from '../../services/paymentMethods';
import { ADD_ONS } from '../../constants';
import BookingChat from '../BookingChat';

function formatEarn(job: ActiveJobRow): string {
  const payout = job.detailer_payout;
  if (payout != null && payout > 0) return payout.toFixed(0);
  const base = job.subtotal_cents != null ? job.subtotal_cents / 100 : Number(job.cost);
  return (base * 0.8).toFixed(0);
}

interface JobDetailModalProps {
  job: ActiveJobRow;
  onClose: () => void;
  onJobUpdated: () => void;
}

export function JobDetailModal({ job, onClose, onJobUpdated }: JobDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPriceAdjustment, setShowPriceAdjustment] = useState(false);
  const [adjustedPrice, setAdjustedPrice] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');

  const effectiveDetailerId = job.detailer_id ?? job.assigned_detailer_id ?? null;

  function handleOpenMaps() {
    const address = encodeURIComponent(job.location ?? '');
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${address}`;
    window.open(mapsUrl, '_blank');
  }

  async function handleMarkArrived() {
    if (!effectiveDetailerId) return;
    setLoading(true);
    setError(null);
    try {
      await updateJobStatus(job.id, 'in_progress', effectiveDetailerId);
      onJobUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeclineJob() {
    if (!effectiveDetailerId) return;
    if (!confirm('Are you sure you want to decline this job? It will go back to pending and admin will reassign.')) return;
    setLoading(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('detailer_bookings')
        .update({
          assigned_detailer_id: null,
          detailer_id: null,
          detailer_name: null,
          car_name: null,
          status: 'pending',
        })
        .eq('id', job.id)
        .or(`detailer_id.eq.${effectiveDetailerId},assigned_detailer_id.eq.${effectiveDetailerId}`);

      if (updateError) throw updateError;

      await sendMessage(job.id, 'detailer', 'Detailer declined this job. Admin will assign someone else.');

      onJobUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decline. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCompleteJob() {
    if (!effectiveDetailerId) return;
    if (!confirm('Mark this job as completed?')) return;
    setLoading(true);
    setError(null);
    try {
      await capturePaymentForJob(job.id);
      await updateJobStatus(job.id, 'completed', effectiveDetailerId);
      onJobUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save completion. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestPriceAdjustment() {
    const newPrice = parseFloat(adjustedPrice);
    if (!adjustedPrice.trim() || !adjustmentReason.trim()) {
      setError('Please provide new price and reason');
      return;
    }
    if (isNaN(newPrice) || newPrice <= 0) {
      setError('Invalid price');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('detailer_bookings')
        .update({
          price_adjustment_requested: true,
          adjusted_price: Math.round(newPrice * 100),
          adjustment_reason: adjustmentReason.trim(),
          status: 'pending_approval',
        })
        .eq('id', job.id);

      if (updateError) throw updateError;

      await sendMessage(
        job.id,
        'detailer',
        `Price adjustment requested: $${adjustedPrice}. Reason: ${adjustmentReason.trim()}. Please approve to continue.`
      );

      setShowPriceAdjustment(false);
      setAdjustedPrice('');
      setAdjustmentReason('');
      onJobUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request price adjustment');
    } finally {
      setLoading(false);
    }
  }

  const isAssigned = job.status === 'assigned';
  const isInProgress = job.status === 'in_progress';
  const canRequestPriceAdjustment =
    (isAssigned || isInProgress) && job.status !== 'pending_approval';

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{job.service_name}</DialogTitle>
        </DialogHeader>

        <div className="p-6 pt-2 space-y-6">
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                isAssigned ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
              }`}
            >
              {isAssigned ? 'Assigned to You' : 'In Progress'}
            </span>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Scheduled</h4>
            <p className="text-gray-700">
              {new Date(job.created_at).toLocaleString('en-US', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Service Location</h4>
            <p className="text-gray-700 mb-2">{job.location ?? 'At your location'}</p>
            {job.address_zip && (
              <p className="text-sm text-gray-500">Zip: {job.address_zip}</p>
            )}
            <button
              type="button"
              onClick={handleOpenMaps}
              className="mt-3 w-full px-4 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-all"
            >
              🗺️ Open in Google Maps
            </button>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Customer</h4>
            {job.is_guest ? (
              <div className="space-y-1">
                <p className="text-gray-700 font-medium">{job.guest_name || 'Guest Customer'}</p>
                {job.guest_phone && (
                  <a
                    href={`tel:${job.guest_phone}`}
                    className="block text-blue-600 hover:underline text-sm"
                  >
                    📱 {job.guest_phone}
                  </a>
                )}
                {job.guest_email && (
                  <a
                    href={`mailto:${job.guest_email}`}
                    className="block text-blue-600 hover:underline text-sm"
                  >
                    ✉️ {job.guest_email}
                  </a>
                )}
              </div>
            ) : (
              <p className="text-gray-700">Registered Customer</p>
            )}
          </div>

          {job.car_name && (
            <div>
              <h4 className="font-semibold mb-2">Vehicle</h4>
              <p className="text-gray-700">{job.car_name}</p>
            </div>
          )}

          {(job.add_ons?.length || job.dirtiness_level) && (
            <div>
              <h4 className="font-semibold mb-2">Add-ons & condition</h4>
              {job.add_ons?.length ? (
                <p className="text-gray-700 text-sm">
                  {job.add_ons.map((id) => ADD_ONS.find((a) => a.id === id)?.name ?? id).join(', ')}
                </p>
              ) : null}
              {job.dirtiness_level && (
                <p className="text-gray-700 text-sm mt-1">Condition: {job.dirtiness_level}</p>
              )}
            </div>
          )}

          <div>
            <h4 className="font-semibold mb-2">Payment</h4>
            <div className="bg-green-50 rounded-xl p-4 border border-green-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Total:</span>
                <span className="font-semibold">${Number(job.cost).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">You earn (80%):</span>
                <span className="text-2xl font-bold text-green-600">${formatEarn(job)}</span>
              </div>
            </div>
          </div>

          {canRequestPriceAdjustment && (
            <div className="mt-4">
              {!showPriceAdjustment ? (
                <button
                  type="button"
                  onClick={() => setShowPriceAdjustment(true)}
                  className="w-full px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-medium"
                >
                  Request Price Adjustment
                </button>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="font-semibold mb-3">Request Price Adjustment</h4>
                  <label className="block text-sm font-medium mb-1">New Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={adjustedPrice}
                    onChange={(e) => setAdjustedPrice(e.target.value)}
                    placeholder="129.00"
                    className="w-full px-3 py-2 border rounded-lg mb-3"
                  />
                  <label className="block text-sm font-medium mb-1">Reason</label>
                  <textarea
                    value={adjustmentReason}
                    onChange={(e) => setAdjustmentReason(e.target.value)}
                    placeholder="Car is much dirtier than expected - heavy pet hair, mud, etc."
                    className="w-full px-3 py-2 border rounded-lg mb-3"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleRequestPriceAdjustment}
                      disabled={loading}
                      className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
                    >
                      Send Request
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowPriceAdjustment(false);
                        setAdjustedPrice('');
                        setAdjustmentReason('');
                        setError(null);
                      }}
                      className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {job.status === 'pending_approval' && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4">
              <p className="text-sm font-medium text-yellow-800">
                Price adjustment requested. Waiting for customer approval.
              </p>
            </div>
          )}

          <div>
            <h4 className="font-semibold mb-2">Chat with Customer</h4>
            <BookingChat
              bookingId={job.id}
              currentUserType="detailer"
              otherPartyName={job.guest_name ?? 'Customer'}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium rounded-2xl px-4 py-3">
              {error}
            </div>
          )}

          <div className="space-y-2 pt-4 border-t border-gray-200">
            {isAssigned && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleMarkArrived}
                  disabled={loading}
                  className="flex-1 bg-black text-white py-3 rounded-2xl font-black text-sm active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? 'Updating…' : 'Mark arrived'}
                </button>
                <button
                  type="button"
                  onClick={handleDeclineJob}
                  disabled={loading}
                  className="px-4 py-3 rounded-2xl font-bold text-sm border-2 border-red-300 bg-red-50 text-red-700 hover:bg-red-100 active:scale-[0.98] disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            )}
            {isInProgress && (
              <button
                type="button"
                onClick={handleCompleteJob}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-2xl font-black text-sm active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? 'Completing…' : 'Complete job'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-2xl font-bold text-sm border-2 border-gray-200 hover:bg-gray-50 transition-all"
            >
              Close
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
