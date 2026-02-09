import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { hasRole } from '../../lib/auth-helpers';
import {
  getDetailerByAuthUserId,
  updateDetailerOnline,
  listAvailableJobsForDetailer,
  acceptJob,
  type DetailerProfile,
  type AvailableJob,
} from '../../services/detailers';

const DetailerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading, signOut } = useAuth();
  const [detailer, setDetailer] = useState<DetailerProfile | null>(null);
  const [detailerError, setDetailerError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<AvailableJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user?.id) {
      navigate('/', { replace: true });
      return;
    }
    hasRole(user.id, 'detailer')
      .then((isDetailer) => {
        if (!isDetailer) {
          navigate('/', { replace: true });
          return;
        }
        return getDetailerByAuthUserId(user.id);
      })
      .then((d) => {
        if (!d) {
          navigate('/', { replace: true });
          return;
        }
        setDetailer(d);
        setDetailerError(null);
      })
      .catch(() => {
        navigate('/', { replace: true });
      });
  }, [user?.id, navigate]);

  useEffect(() => {
    if (!detailer?.is_online) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setJobs([]);
      return;
    }
    setJobsLoading(true);
    listAvailableJobsForDetailer(detailer.id, detailer.service_areas)
      .then((list) => setJobs(list))
      .catch(() => setJobs([]))
      .finally(() => setJobsLoading(false));

    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(() => {
      listAvailableJobsForDetailer(detailer.id, detailer.service_areas)
        .then((list) => setJobs(list))
        .catch(() => setJobs([]));
    }, 5000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [detailer?.id, detailer?.is_online, detailer?.service_areas]);

  const handleToggleOnline = async () => {
    if (!detailer) return;
    try {
      await updateDetailerOnline(detailer.id, !detailer.is_online);
      setDetailer((prev) => (prev ? { ...prev, is_online: !prev.is_online } : null));
      if (detailer.is_online) {
        setJobs([]);
      } else {
        setJobsLoading(true);
        listAvailableJobsForDetailer(detailer.id, detailer.service_areas)
          .then(setJobs)
          .catch(() => setJobs([]))
          .finally(() => setJobsLoading(false));
      }
    } catch {
      // keep state unchanged
    }
  };

  const handleAcceptJob = async (jobId: string) => {
    if (!detailer) return;
    setAcceptingId(jobId);
    try {
      await acceptJob(jobId, detailer);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    } catch {
      // leave job in list
    } finally {
      setAcceptingId(null);
    }
  };

  if (loading || (!detailer && !detailerError)) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-black rounded-full animate-spin mx-auto mb-4" />
          <p className="font-bold text-gray-600">Loading…</p>
        </div>
      </div>
    );
  }

  if (detailerError || !detailer) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gray-100 p-6">
        <div className="text-center">
          <p className="text-gray-600 font-medium mb-4">{detailerError ?? 'Not an approved detailer.'}</p>
          <button
            type="button"
            onClick={() => navigate('/detailer/signin')}
            className="bg-black text-white py-3 px-6 rounded-2xl font-bold"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  const earnPct = 0.8;

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-4xl mx-auto mb-6">
        <div className="bg-white rounded-[32px] p-6 shadow-sm border-2 border-gray-100">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-black tracking-tighter">Welcome, {detailer.name}</h1>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                <span className="font-bold">{detailer.rating.toFixed(1)} rating</span>
                <span>{detailer.total_completed_jobs} jobs completed</span>
                <span className="font-bold">${Number(detailer.total_earnings).toFixed(0)} earned</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => signOut().then(() => navigate('/detailer/signin'))}
                className="px-4 py-2.5 rounded-2xl font-bold text-sm text-gray-600 hover:text-black hover:bg-gray-100 transition-all active:scale-[0.98]"
              >
                Sign out
              </button>
              <button
                type="button"
                onClick={handleToggleOnline}
                className={`px-6 py-3 rounded-2xl font-black text-sm transition-all active:scale-[0.98] ${
                  detailer.is_online
                    ? 'bg-green-600 text-white shadow-lg'
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                {detailer.is_online ? 'Online' : 'Offline'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto">
        {!detailer.is_online ? (
          <div className="bg-white rounded-[32px] p-12 text-center shadow-sm border-2 border-gray-100">
            <p className="text-gray-500 font-medium mb-2">You&apos;re offline</p>
            <p className="text-sm text-gray-400">Go online to see available jobs near you</p>
          </div>
        ) : jobsLoading ? (
          <div className="bg-white rounded-[32px] p-12 text-center shadow-sm border-2 border-gray-100">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-black rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500 font-medium">Loading jobs…</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="bg-white rounded-[32px] p-12 text-center shadow-sm border-2 border-gray-100">
            <p className="text-gray-500 font-medium mb-2">No jobs available right now</p>
            <p className="text-sm text-gray-400">We&apos;ll notify you when a job comes in</p>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-black tracking-tight">Available jobs ({jobs.length})</h2>
            {jobs.map((job) => (
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
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-2xl font-black text-green-600">${Number(job.cost).toFixed(2)}</p>
                    <p className="text-xs text-gray-500 font-medium">
                      You earn: ${(Number(job.cost) * earnPct).toFixed(0)}
                    </p>
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DetailerDashboard;
