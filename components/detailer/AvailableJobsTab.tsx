import React from 'react';
import { acceptJob, type DetailerProfile, type AvailableJob } from '../../services/detailers';

const EARN_PCT = 0.8;

interface AvailableJobsTabProps {
  isOnline: boolean;
  jobs: AvailableJob[];
  detailer: DetailerProfile | null;
  onJobAccepted: () => void;
  acceptingId: string | null;
  setAcceptingId: (id: string | null) => void;
}

export function AvailableJobsTab({
  isOnline,
  jobs,
  detailer,
  onJobAccepted,
  acceptingId,
  setAcceptingId,
}: AvailableJobsTabProps) {
  async function handleAcceptJob(jobId: string) {
    if (!detailer) return;
    setAcceptingId(jobId);
    try {
      await acceptJob(jobId, detailer);
      onJobAccepted();
    } catch {
      // leave job in list
    } finally {
      setAcceptingId(null);
    }
  }

  if (!isOnline) {
    return (
      <div className="bg-white rounded-[32px] p-12 text-center shadow-sm border-2 border-gray-100">
        <p className="text-gray-500 font-medium mb-2">You&apos;re offline</p>
        <p className="text-sm text-gray-400">Go online to see available jobs near you</p>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="bg-white rounded-[32px] p-12 text-center shadow-sm border-2 border-gray-100">
        <p className="text-gray-500 font-medium mb-2">No jobs available right now</p>
        <p className="text-sm text-gray-400">We&apos;ll notify you when a job comes in</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {jobs.map((job) => {
        const earn =
          (job.subtotal_cents != null ? job.subtotal_cents / 100 : Number(job.cost)) * EARN_PCT;
        return (
          <div
            key={job.id}
            className="bg-white rounded-[32px] p-6 shadow-sm border-2 border-gray-100 hover:border-gray-200 transition-all"
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <h3 className="font-black text-lg text-gray-900">{job.service_name}</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {job.location ?? 'At your location'}
                  {job.address_zip ? ` (${job.address_zip})` : ''}
                </p>
                {(job.add_ons?.length || job.dirtiness_level) && (
                  <p className="text-xs text-gray-500 mt-1">
                    {job.add_ons?.length ? `Add-ons: ${job.add_ons.length}` : ''}
                    {job.add_ons?.length && job.dirtiness_level ? ' • ' : ''}
                    {job.dirtiness_level ? `Condition: ${job.dirtiness_level}` : ''}
                  </p>
                )}
                <p className="text-sm text-gray-600 mt-2">Customer: Guest</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-2xl font-black text-green-600">${Number(job.cost).toFixed(2)}</p>
                <p className="text-xs text-gray-500 font-medium">You earn: ${earn.toFixed(0)}</p>
                <button
                  type="button"
                  onClick={() => handleAcceptJob(job.id)}
                  disabled={acceptingId === job.id}
                  className="mt-4 w-full bg-black text-white py-3 rounded-2xl font-black text-sm active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {acceptingId === job.id ? 'Accepting…' : 'Accept job'}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
