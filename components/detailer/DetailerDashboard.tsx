import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  getDetailerByAuthUserId,
  updateDetailerOnline,
  listAvailableJobsForDetailer,
  getActiveJobsForDetailer,
  getCompletedJobsForDetailer,
  type DetailerProfile,
  type AvailableJob,
  type ActiveJobRow,
} from '../../services/detailers';
import { updateDetailerLocation } from '../../services/detailerLocation';
import { getDetailerEarnings } from '../../services/detailerStats';
import { getRecentReviewsForDetailer, type RecentReviewForDetailer } from '../../services/bookingReviews';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs';
import { AvailableJobsTab } from './AvailableJobsTab';
import { ActiveJobsTab } from './ActiveJobsTab';
import { CompletedJobsTab } from './CompletedJobsTab';

type TabValue = 'available' | 'active' | 'completed';

const DetailerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading, signOut } = useAuth();
  const [detailer, setDetailer] = useState<DetailerProfile | null>(null);
  const [detailerError, setDetailerError] = useState<string | null>(null);
  const [availableJobs, setAvailableJobs] = useState<AvailableJob[]>([]);
  const [activeJobs, setActiveJobs] = useState<ActiveJobRow[]>([]);
  const [completedJobs, setCompletedJobs] = useState<ActiveJobRow[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabValue>('available');
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [liveStats, setLiveStats] = useState<{
    totalEarnings: number;
    totalJobs: number;
  } | null>(null);
  const lastLocationUpdateRef = useRef<{ lat: number; lng: number; time: number }>({
    lat: 0,
    lng: 0,
    time: 0,
  });
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recentReviews, setRecentReviews] = useState<RecentReviewForDetailer[]>([]);

  useEffect(() => {
    if (!user?.id) {
      navigate('/detailer/signin', { replace: true });
      return;
    }
    getDetailerByAuthUserId(user.id)
      .then((d) => {
        if (!d) {
          navigate('/detailer/signin', { replace: true });
          return;
        }
        setDetailer(d);
        setDetailerError(null);
      })
      .catch(() => {
        navigate('/detailer/signin', { replace: true });
      });
  }, [user?.id, navigate]);

  async function loadAvailableJobs() {
    if (!detailer) return;
    try {
      const jobs = await listAvailableJobsForDetailer(detailer.id, detailer.service_areas);
      setAvailableJobs(jobs); // Replace, never append
      if (process.env.NODE_ENV === 'development') {
        console.debug('[DetailerDashboard] Loaded available jobs (replacing list):', jobs.length, jobs.map((j) => j.id));
      }
    } catch (err) {
      console.error('Failed to load available jobs:', err);
      setAvailableJobs([]);
    }
  }

  async function loadActiveJobs() {
    if (!detailer) return;
    try {
      const jobs = await getActiveJobsForDetailer(detailer.id);
      setActiveJobs(jobs);
    } catch (err) {
      console.error('Failed to load active jobs:', err);
      setActiveJobs([]);
    }
  }

  async function loadCompletedJobs() {
    if (!detailer) return;
    try {
      const jobs = await getCompletedJobsForDetailer(detailer.id);
      setCompletedJobs(jobs);
    } catch (err) {
      console.error('Failed to load completed jobs:', err);
      setCompletedJobs([]);
    }
  }

  useEffect(() => {
    if (!detailer?.id) return;
    loadActiveJobs();
    loadCompletedJobs();
  }, [detailer?.id]);

  useEffect(() => {
    if (!detailer?.id) return;
    getRecentReviewsForDetailer(detailer.id, 5)
      .then(setRecentReviews)
      .catch(() => setRecentReviews([]));
  }, [detailer?.id]);

  useEffect(() => {
    if (!detailer?.is_online) {
      if (pollIntervalRef.current) {
        console.debug('[DetailerDashboard] Polling stopped (offline)');
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setAvailableJobs([]);
      return;
    }
    console.debug('[DetailerDashboard] Polling started');
    setJobsLoading(true);
    void Promise.all([loadAvailableJobs(), loadActiveJobs(), loadCompletedJobs()]).finally(() => {
      setJobsLoading(false);
    });

    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(() => {
      console.debug('[DetailerDashboard] Polling for jobs...');
      void Promise.all([loadAvailableJobs(), loadActiveJobs(), loadCompletedJobs()]);
    }, 5000);

    return () => {
      console.debug('[DetailerDashboard] Polling stopped (cleanup)');
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [detailer?.id, detailer?.is_online]);

  // Location tracking when detailer has active job in "assigned" status (en route)
  useEffect(() => {
    const activeJob = activeJobs.find((j) => j.status === 'assigned');

    if (!activeJob || !detailer?.id) {
      setIsTracking(false);
      return;
    }

    if (!navigator.geolocation) {
      return;
    }

    setIsTracking(true);

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        const lastUpdate = lastLocationUpdateRef.current;

        // Throttle: only update if 15 seconds passed OR moved >50 meters
        const timeDiff = now - lastUpdate.time;
        const distanceDiff = Math.sqrt(
          Math.pow((position.coords.latitude - lastUpdate.lat) * 111000, 2) +
            Math.pow((position.coords.longitude - lastUpdate.lng) * 111000, 2)
        );

        if (timeDiff > 15000 || distanceDiff > 50) {
          updateDetailerLocation(
            detailer.id,
            position.coords.latitude,
            position.coords.longitude
          );

          lastLocationUpdateRef.current = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            time: now,
          };
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        setIsTracking(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      setIsTracking(false);
    };
  }, [activeJobs, detailer?.id]);

  const handleToggleOnline = async () => {
    if (!detailer) return;
    try {
      await updateDetailerOnline(detailer.id, !detailer.is_online);
      setDetailer((prev) => (prev ? { ...prev, is_online: !prev.is_online } : null));
      if (detailer.is_online) {
        setAvailableJobs([]);
      } else {
        setJobsLoading(true);
        void loadAvailableJobs().finally(() => setJobsLoading(false));
      }
    } catch {
      // keep state unchanged
    }
  };

  function handleJobAccepted() {
    loadAvailableJobs();
    loadActiveJobs();
    setActiveTab('active');
  }

  async function handleJobUpdated() {
    loadActiveJobs();
    loadCompletedJobs();
    if (user?.id) {
      try {
        const d = await getDetailerByAuthUserId(user.id);
        if (d) setDetailer(d);
      } catch {
        // keep current detailer state
      }
    }
  }

  useEffect(() => {
    if (!detailer?.id) return;
    getDetailerEarnings(detailer.id).then(setLiveStats);
  }, [detailer?.id, activeJobs]);

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

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      {isTracking && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg flex items-center gap-2 z-50">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
          Location Tracking Active
        </div>
      )}
      <div className="max-w-4xl mx-auto mb-6">
        <div className="bg-white rounded-[32px] p-6 shadow-sm border-2 border-gray-100">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-black tracking-tighter">Welcome, {detailer.name}</h1>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                <span className="font-bold">{detailer.rating.toFixed(1)} rating</span>
                <span>
                  {(liveStats?.totalJobs ?? detailer.total_completed_jobs ?? 0)} jobs completed
                </span>
                <span className="font-bold">
                  $
                  {(
                    liveStats?.totalEarnings ??
                    detailer.total_earnings ??
                    0
                  ).toFixed(0)}{' '}
                  earned
                </span>
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

      <div className="max-w-4xl mx-auto mb-6">
        <div className="bg-white rounded-[32px] p-6 shadow-sm border-2 border-gray-100">
          <h3 className="text-lg font-black tracking-tight mb-4">Recent Reviews</h3>
          {recentReviews.length === 0 ? (
            <p className="text-gray-500 font-medium">No reviews yet</p>
          ) : (
            <ul className="space-y-4">
              {recentReviews.map((r) => (
                <li key={r.id} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-yellow-500 font-bold">★ {r.rating}</span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  {r.review_text && <p className="text-sm text-gray-700 mb-1">{r.review_text}</p>}
                  <p className="text-xs text-gray-500">{r.service_name}{r.car_name ? ` · ${r.car_name}` : ''}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
          <TabsList className="mb-4">
            <TabsTrigger value="available">
              Available Jobs ({availableJobs.length})
            </TabsTrigger>
            <TabsTrigger value="active">
              Active Jobs ({activeJobs.length})
              {activeJobs.length > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                  {activeJobs.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed">Completed ({completedJobs.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="available" className="mt-0">
            {jobsLoading ? (
              <div className="bg-white rounded-[32px] p-12 text-center shadow-sm border-2 border-gray-100">
                <div className="w-10 h-10 border-4 border-gray-200 border-t-black rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-500 font-medium">Loading jobs…</p>
              </div>
            ) : (
              <AvailableJobsTab
                isOnline={detailer.is_online}
                jobs={availableJobs}
                detailer={detailer}
                onJobAccepted={handleJobAccepted}
                acceptingId={acceptingId}
                setAcceptingId={setAcceptingId}
              />
            )}
          </TabsContent>

          <TabsContent value="active" className="mt-0">
            <ActiveJobsTab jobs={activeJobs} onJobUpdated={handleJobUpdated} />
          </TabsContent>

          <TabsContent value="completed" className="mt-0">
            <CompletedJobsTab jobs={completedJobs} onRefresh={loadCompletedJobs} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default DetailerDashboard;
