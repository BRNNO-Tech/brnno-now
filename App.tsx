import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import AuthGate from './components/AuthGate';

const CustomerApp = lazy(() => import('./components/CustomerApp'));
const DetailerSignIn = lazy(() => import('./components/detailer/DetailerSignIn'));
const DetailerDashboard = lazy(() => import('./components/detailer/DetailerDashboard'));
const DetailerSignUp = lazy(() =>
  import('./components/DetailerSignUp').then((m) => ({ default: m.DetailerSignUp }))
);
const AdminRoute = lazy(() => import('./components/AdminRoute'));

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="w-10 h-10 border-4 border-gray-200 border-t-black rounded-full animate-spin" aria-label="Loading" />
    </div>
  );
}

const App: React.FC = () => {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/detailer/signin" element={<DetailerSignIn />} />
        <Route path="/detailer/signup" element={<DetailerSignUp />} />
        <Route path="/detailer/dashboard" element={<DetailerDashboard />} />
        <Route path="/detailer-signup" element={<DetailerSignUp />} />
        <Route path="/admin" element={<AdminRoute />} />
        <Route
          path="*"
          element={
            <AuthGate>
              <CustomerApp />
            </AuthGate>
          }
        />
      </Routes>
    </Suspense>
  );
};

export default App;
