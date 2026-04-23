import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useMockData } from './context/MockDataContext';
import MainLayout from './layout/MainLayout';
import Home from './pages/Home';
import Network from './pages/Network';
import Jobs from './pages/Jobs';
import Messaging from './pages/Messaging';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';
import Login from './pages/Login';
import RecruiterDashboard from './pages/RecruiterDashboard';
import RecruiterJobs from './pages/RecruiterJobs';
import RecruiterProfile from './pages/RecruiterProfile';
import AgentWidget from './components/AgentWidget';

function ProtectedShell() {
  const { userRole } = useMockData();
  if (!userRole) return <Navigate to="/" replace />;
  return <Outlet />;
}

function AuthenticatedRoutes() {
  const { userRole } = useMockData();

  if (userRole === 'RECRUITER') {
    return (
      <Routes>
        <Route path="/home" element={<Home />} />
        <Route path="/recruiter/dashboard" element={<RecruiterDashboard />} />
        <Route path="/recruiter/jobs" element={<RecruiterJobs />} />
        <Route path="/recruiter/profile" element={<RecruiterProfile />} />
        <Route path="/network" element={<Network />} />
        <Route path="/messaging" element={<Messaging />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/home" element={<Home />} />
      <Route path="/network" element={<Network />} />
      <Route path="/jobs" element={<Jobs />} />
      <Route path="/messaging" element={<Messaging />} />
      <Route path="/notifications" element={<Notifications />} />
      <Route path="/in/me" element={<Profile />} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}

function AppShell() {
  return (
    <MainLayout>
      <AuthenticatedRoutes />
    </MainLayout>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public landing + auth */}
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />

        {/* Authenticated app */}
        <Route element={<ProtectedShell />}>
          <Route path="/*" element={<AppShell />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AgentWidget />
    </BrowserRouter>
  );
}

export default App;
