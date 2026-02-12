import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog';
import { updateJobStatus, type ActiveJobRow } from '../../services/detailers';
import { ADD_ONS } from '../../constants';

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

  function handleOpenMaps() {
    const address = encodeURIComponent(job.location ?? '');
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${address}`;
    window.open(mapsUrl, '_blank');
  }

  async function handleMarkArrived() {
    if (!job.detailer_id) return;
    setLoading(true);
    setError(null);
    try {
      await updateJobStatus(job.id, 'in_progress', job.detailer_id);
      onJobUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCompleteJob() {
    if (!job.detailer_id) return;
    if (!confirm('Mark this job as completed?')) return;
    setLoading(true);
    setError(null);
    try {
      await updateJobStatus(job.id, 'completed', job.detailer_id);
      onJobUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save completion. Try again.');
    } finally {
      setLoading(false);
    }
  }

  const isAssigned = job.status === 'assigned';
  const isInProgress = job.status === 'in_progress';

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

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium rounded-2xl px-4 py-3">
              {error}
            </div>
          )}

          <div className="space-y-2 pt-4 border-t border-gray-200">
            {isAssigned && (
              <button
                type="button"
                onClick={handleMarkArrived}
                disabled={loading}
                className="w-full bg-black text-white py-3 rounded-2xl font-black text-sm active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? 'Updating…' : 'Mark arrived'}
              </button>
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
