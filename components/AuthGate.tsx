import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getUserRoles, addRole } from '../lib/auth-helpers';

const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const { user, loading, signIn, signUp } = useAuth();
  const grantCustomerRoleAfterSignInRef = useRef(false);
  const [hasCustomerRole, setHasCustomerRole] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setHasCustomerRole(null);
      return;
    }
    if (grantCustomerRoleAfterSignInRef.current) {
      grantCustomerRoleAfterSignInRef.current = false;
      addRole(user.id, 'customer')
        .then(() => setHasCustomerRole(true))
        .catch(() => setHasCustomerRole(false));
      return;
    }
    getUserRoles(user.id)
      .then((roles) => {
        if (roles.includes('customer')) {
          setHasCustomerRole(true);
        } else if (roles.includes('detailer')) {
          navigate('/detailer/dashboard', { replace: true });
        } else {
          setHasCustomerRole(false);
        }
      })
      .catch(() => setHasCustomerRole(false));
  }, [user?.id, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-black rounded-full animate-spin mx-auto mb-4" />
          <p className="font-bold text-gray-600">Loading…</p>
        </div>
      </div>
    );
  }

  if (user && hasCustomerRole === true) {
    return <>{children}</>;
  }

  if (user && hasCustomerRole === null) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-black rounded-full animate-spin mx-auto mb-4" />
          <p className="font-bold text-gray-600">Checking access…</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);

    if (mode === 'login') {
      const { error: err } = await signIn(email, password);
      if (err) {
        setError(err.message ?? 'Sign in failed');
      }
    } else {
      const { error: err } = await signUp(email, password, fullName || undefined);
      if (err) {
        const status = (err as { status?: number }).status;
        const isAlreadyRegistered =
          status === 422 ||
          /already|registered|exists/i.test(err.message ?? '');
        if (isAlreadyRegistered) {
          const { error: signInErr } = await signIn(email, password);
          if (signInErr) {
            setError('That email is already registered. Sign in with your password.');
          } else {
            grantCustomerRoleAfterSignInRef.current = true;
            setMessage('That email is already registered. Signed you in.');
          }
        } else {
          setError(err.message ?? 'Sign up failed');
        }
      } else {
        setMessage('Account created! You can sign in now.');
      }
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-sm">
        {user && hasCustomerRole === false && (
          <p className="text-center text-sm text-gray-600 mb-4">
            Create a BRNNO customer account to continue.
          </p>
        )}
        <div className="glass rounded-[40px] shadow-2xl border border-white/40 p-8 mb-6">
          <h1 className="text-3xl font-black tracking-tighter text-center mb-2">BRNNO NOW</h1>
          <p className="text-gray-500 text-sm font-medium text-center mb-8">
            {mode === 'login' ? 'Sign in to book detailing' : 'Create an account'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                  className="w-full bg-white border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black"
                  autoComplete="name"
                />
              </div>
            )}
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
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-sm font-medium rounded-2xl px-4 py-2">
                {error}
              </div>
            )}
            {message && (
              <div className="bg-green-50 border border-green-100 text-green-700 text-sm font-medium rounded-2xl px-4 py-2">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-black text-white py-4 rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setError(null);
              setMessage(null);
            }}
            className="w-full mt-4 text-gray-500 text-sm font-bold hover:text-black transition-colors"
          >
            {mode === 'login' ? 'Create an account' : 'Already have an account? Sign in'}
          </button>
        </div>
        <p className="text-center text-[10px] text-gray-400 font-medium uppercase tracking-widest">
          BRNNO Platform • Customer
        </p>
      </div>
    </div>
  );
};

export default AuthGate;
