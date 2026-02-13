import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import AdminDashboard from './AdminDashboard';

export default function AdminRoute() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState<{ userId?: string; error?: string } | null>(null);

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setDebugInfo({ error: 'Not logged in' });
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .single();

    setDebugInfo({ userId: user.id, error: error?.message });
    setIsAdmin(!error && !!data);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl">Checking permissions...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600">You don&apos;t have permission to access this page.</p>
          {debugInfo && (
            <div className="mt-6 p-4 bg-gray-100 rounded-xl text-left text-sm font-mono">
              <p className="font-bold text-gray-700 mb-2">Debug info (copy this to add yourself):</p>
              {debugInfo.userId && (
                <p className="text-gray-600 break-all">
                  <span className="font-semibold">Your user ID:</span> {debugInfo.userId}
                </p>
              )}
              {debugInfo.error && (
                <p className="text-red-600 mt-1">
                  <span className="font-semibold">Error:</span> {debugInfo.error}
                </p>
              )}
              <p className="mt-3 text-gray-500 text-xs">
                In Supabase SQL Editor, run:
                <br />
                <code className="block mt-1 p-2 bg-white rounded text-left break-all">
                  INSERT INTO public.admin_users (user_id, email) VALUES (&apos;{debugInfo.userId ?? 'paste-your-id'}&apos;, &apos;your@email.com&apos;) ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;
                </code>
              </p>
            </div>
          )}
          <a href="/" className="mt-6 inline-block text-blue-600 hover:underline">
            Go back home
          </a>
        </div>
      </div>
    );
  }

  return <AdminDashboard />;
}
