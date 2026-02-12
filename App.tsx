import React from 'react';
import { Routes, Route } from 'react-router-dom';
import AuthGate from './components/AuthGate';
import CustomerApp from './components/CustomerApp';
import DetailerSignIn from './components/detailer/DetailerSignIn';
import DetailerDashboard from './components/detailer/DetailerDashboard';
import { DetailerSignUp } from './components/DetailerSignUp';

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/detailer/signin" element={<DetailerSignIn />} />
      <Route path="/detailer/dashboard" element={<DetailerDashboard />} />
      <Route path="/detailer-signup" element={<DetailerSignUp />} />
      <Route
        path="/*"
        element={
          <AuthGate>
            <CustomerApp />
          </AuthGate>
        }
      />
    </Routes>
  );
};

export default App;
