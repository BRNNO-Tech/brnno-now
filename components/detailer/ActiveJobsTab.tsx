import React, { useState } from 'react';
import { JobDetailModal } from './JobDetailModal';
import type { ActiveJobRow } from '../../services/detailers';

function formatEarn(job: ActiveJobRow): string {
  const payout = job.detailer_payout;
  if (payout != null && payout > 0) return Number(payout).toFixed(0);
  const base = job.subtotal_cents != null ? job.subtotal_cents / 100 : Number(job.cost);
  return (base * 0.8).toFixed(0);
}

function formatScheduled(createdAt: string): string {
  return new Date(createdAt).toLocaleString();
}

interface ActiveJobsTabProps {
  jobs: ActiveJobRow[];
  onJobUpdated: () => void;
}

export function ActiveJobsTab({ jobs, onJobUpdated }: ActiveJobsTabProps) {
  const [selectedJob, setSelectedJob] = useState<ActiveJobRow | null>(null);

  if (jobs.length === 0) {
    return (
      <div className="bg-white rounded-[32px] p-12 text-center shadow-sm border-2 border-gray-100">
        <p className="text-gray-500 font-medium mb-2">No active jobs</p>
        <p className="text-sm text-gray-400">Accept a job from Available Jobs to get started</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {jobs.map((job) => {
          const isAssigned = job.status === 'assigned';
          return (
            <div
              key={job.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedJob(job)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedJob(job);
                }
              }}
              className="bg-white rounded-[32px] p-6 shadow-sm border-2 border-gray-100 hover:border-gray-200 transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-black text-lg text-gray-900">{job.service_name}</h3>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        isAssigned ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {isAssigned ? 'Assigned' : 'In progress'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{job.location ?? 'At your location'}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Scheduled: {formatScheduled(job.created_at)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xl font-black text-green-600">${formatEarn(job)}</p>
                  <p className="text-xs text-gray-500 mt-1">Your earnings</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedJob(job);
                  }}
                  className="w-full py-2.5 rounded-xl font-bold text-sm border-2 border-gray-200 hover:bg-gray-50 transition-all"
                >
                  View details
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {selectedJob && (
        <JobDetailModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onJobUpdated={() => {
            onJobUpdated();
            setSelectedJob(null);
          }}
        />
      )}
    </>
  );
}
