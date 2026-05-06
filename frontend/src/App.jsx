import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useMockData } from './context/MockDataContext';
import MainLayout from './layout/MainLayout';
import Login from './pages/Login';

/** Lazy so `/login` never loads `pdfjs-dist` (Jobs/Profile/CareerCoach pull it in; Vite + pdfjs can TDZ as `controller`). */
const Home = lazy(() => import('./pages/Home'));
const Network = lazy(() => import('./pages/Network'));
const Jobs = lazy(() => import('./pages/Jobs'));
const Messaging = lazy(() => import('./pages/Messaging'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Profile = lazy(() => import('./pages/Profile'));
const RecruiterDashboard = lazy(() => import('./pages/RecruiterDashboard'));
const RecruiterJobs = lazy(() => import('./pages/RecruiterJobs'));
const RecruiterProfile = lazy(() => import('./pages/RecruiterProfile'));
const MemberProfile = lazy(() => import('./pages/MemberProfile'));
const RecruiterPublicProfile = lazy(() => import('./pages/RecruiterPublicProfile'));
const TalentSearch = lazy(() => import('./pages/TalentSearch'));

function RouteFallback() {
  return (
    <div style={{ padding: '24px', textAlign: 'center', color: '#666', fontSize: '14px' }}>
      Loading…
    </div>
  );
}

function ProtectedShell() {
  const { userRole } = useMockData();
  if (!userRole) return <Navigate to="/" replace />;
  return <Outlet />;
}

function AuthenticatedRoutes() {
  const { userRole } = useMockData();

  if (userRole === 'RECRUITER') {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/home" element={<Home />} />
          <Route path="/recruiter/dashboard" element={<RecruiterDashboard />} />
          <Route path="/recruiter/jobs" element={<RecruiterJobs />} />
          <Route path="/recruiter/profile" element={<RecruiterProfile />} />
          <Route path="/recruiter/talent" element={<TalentSearch />} />
          <Route path="/network" element={<Network />} />
          <Route path="/messaging" element={<Messaging />} />
          <Route path="/in/:memberId" element={<MemberProfile />} />
          <Route path="/profile/recruiter/:recruiterId" element={<RecruiterPublicProfile />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/home" element={<Home />} />
        <Route path="/network" element={<Network />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/messaging" element={<Messaging />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/in/me" element={<Profile />} />
        <Route path="/in/:memberId" element={<MemberProfile />} />
        <Route path="/profile/recruiter/:recruiterId" element={<RecruiterPublicProfile />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </Suspense>
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
    </BrowserRouter>
  );
}

export default App;
