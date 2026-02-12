import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { hasRole, addRole } from '../../lib/auth-helpers';
import { getDetailerByAuthUserId } from '../../services/detailers';

const DetailerSignIn: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkingDetailer, setCheckingDetailer] = useState(false);
  const [redirectMessage, setRedirectMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    setCheckingDetailer(true);
    setRedirectMessage(null);
    getDetailerByAuthUserId(user.id)
      .then((d) => {
        if (d) {
          addRole(user.id, 'detailer').catch(() => {});
          navigate('/detailer/dashboard', { replace: true });
          return;
        }
        return hasRole(user.id, 'detailer').then((isDetailer) => {
          if (isDetailer) {
            setRedirectMessage('No detailer profile found. Redirecting to main app.');
          } else {
            setRedirectMessage('This account is not set up as a detailer. Redirecting to main app.');
          }
          setTimeout(() => navigate('/', { replace: true }), 2200);
        });
      })
      .catch(() => {
        setRedirectMessage('Something went wrong. Redirecting to main app.');
        setTimeout(() => navigate('/', { replace: true }), 2200);
      })
      .finally(() => setCheckingDetailer(false));
  }, [user?.id, navigate]);

  if (redirectMessage) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gray-100 p-6">
        <div className="text-center max-w-sm">
          <p className="text-gray-700 font-medium">{redirectMessage}</p>
        </div>
      </div>
    );
  }

  if (loading || (user && checkingDetailer)) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-black rounded-full animate-spin mx-auto mb-4" />
          <p className="font-bold text-gray-600">Loading…</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const { error: err } = await signIn(email, password);
    if (err) {
      setError(err.message ?? 'Sign in failed');
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-sm">
        <div className="glass rounded-[40px] shadow-2xl border border-white/40 p-8 mb-6">
          <h1 className="text-3xl font-black tracking-tighter text-center mb-2">BRNNO Drive</h1>
          <p className="text-gray-500 text-sm font-medium text-center mb-8">
            Sign in as a detailer
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full bg-white border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full bg-white border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-sm font-medium rounded-2xl px-4 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-black text-white py-4 rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
        <p className="text-center text-[10px] text-gray-400 font-medium uppercase tracking-widest">
          BRNNO Platform • Detailer
        </p>
      </div>
    </div>
  );
};

export default DetailerSignIn;
