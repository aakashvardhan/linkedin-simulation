import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Toaster } from 'react-hot-toast';
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import ProtectedRoute from './components/shared/ProtectedRoute';

// Auth pages
import MemberLogin from './pages/auth/MemberLogin';
import MemberRegister from './pages/auth/MemberRegister';
import RecruiterLogin from './pages/auth/RecruiterLogin';
import RecruiterRegister from './pages/auth/RecruiterRegister';

// Member pages
import JobSearch from './pages/member/JobSearch';
import JobDetail from './pages/member/JobDetail';
import SavedJobs from './pages/member/SavedJobs';
import MyApplications from './pages/member/MyApplications';
import Profile from './pages/member/Profile';
import Connections from './pages/member/Connections';
import Messaging from './pages/member/Messaging';
import MemberDashboard from './pages/member/MemberDashboard';
import AIChatWidget from './components/shared/AIChatWidget';

// Recruiter pages
import PostJob from './pages/recruiter/PostJob';
import MyJobs from './pages/recruiter/MyJobs';
import ApplicantList from './pages/recruiter/ApplicantList';
import ApplicantDetail from './pages/recruiter/ApplicantDetail';
import AIFindCandidates from './pages/recruiter/AIFindCandidates';
import OutreachApproval from './pages/recruiter/OutreachApproval';
import RecruiterMessaging from './pages/recruiter/RecruiterMessaging';
import RecruiterDashboard from './pages/recruiter/RecruiterDashboard';
import RecruiterConnections from './pages/recruiter/RecruiterConnections';
import RecruiterProfile from './pages/recruiter/RecruiterProfile';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" />
        <Routes>
          {/* Auth routes */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<MemberLogin />} />
            <Route path="/register" element={<MemberRegister />} />
            <Route path="/recruiter/login" element={<RecruiterLogin />} />
            <Route path="/recruiter/register" element={<RecruiterRegister />} />
          </Route>

          {/* Member routes */}
          <Route element={<ProtectedRoute role="member"><MainLayout /></ProtectedRoute>}>
            <Route path="/jobs" element={<JobSearch />} />
            <Route path="/jobs/:jobId" element={<JobDetail />} />
            <Route path="/saved-jobs" element={<SavedJobs />} />
            <Route path="/applications" element={<MyApplications />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/connections" element={<Connections />} />
            <Route path="/messaging" element={<Messaging />} />
            <Route path="/dashboard" element={<MemberDashboard />} />
          </Route>

          {/* Recruiter routes */}
          <Route element={<ProtectedRoute role="recruiter"><MainLayout /></ProtectedRoute>}>
            <Route path="/recruiter/post-job" element={<PostJob />} />
            <Route path="/recruiter/my-jobs" element={<MyJobs />} />
            <Route path="/recruiter/jobs/:jobId/applicants" element={<ApplicantList />} />
            <Route path="/recruiter/applications/:appId" element={<ApplicantDetail />} />
            <Route path="/recruiter/ai-candidates/:jobId" element={<AIFindCandidates />} />
            <Route path="/recruiter/outreach/:taskId" element={<OutreachApproval />} />
            <Route path="/recruiter/messaging" element={<RecruiterMessaging />} />
            <Route path="/recruiter/dashboard" element={<RecruiterDashboard />} />
            <Route path="/recruiter/connections" element={<RecruiterConnections />} />
            <Route path="/recruiter/profile" element={<RecruiterProfile />} />
          </Route>

          {/* Default redirect */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        <AIChatWidget />
      </BrowserRouter>
    </AuthProvider>
  );
}
