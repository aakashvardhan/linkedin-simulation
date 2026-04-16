import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  Briefcase, Users, MessageSquare, User, LayoutDashboard,
  BookmarkCheck, FileText, Send, LogOut
} from 'lucide-react';
import LinkedInLogo from './LinkedInLogo';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;
  const linkClass = (path) =>
    `flex flex-col items-center gap-0.5 px-3 py-1 text-xs transition-colors ${
      isActive(path) ? 'text-black border-b-2 border-black' : 'text-gray-500 hover:text-black'
    }`;

  const memberLinks = [
    { to: '/jobs', icon: Briefcase, label: 'Jobs' },
    { to: '/saved-jobs', icon: BookmarkCheck, label: 'Saved' },
    { to: '/applications', icon: FileText, label: 'Applications' },
    { to: '/connections', icon: Users, label: 'Network' },
    { to: '/messaging', icon: MessageSquare, label: 'Messaging' },
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  ];

  const recruiterLinks = [
    { to: '/recruiter/post-job', icon: Send, label: 'Post Job' },
    { to: '/recruiter/my-jobs', icon: Briefcase, label: 'My Jobs' },
    { to: '/recruiter/connections', icon: Users, label: 'Network' },
    { to: '/recruiter/messaging', icon: MessageSquare, label: 'Messages' },
    { to: '/recruiter/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  ];

  const links = user?.role === 'recruiter' ? recruiterLinks : memberLinks;
  const profilePath = user?.role === 'recruiter' ? '/recruiter/profile' : '/profile';

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        <Link to={user?.role === 'recruiter' ? '/recruiter/dashboard' : '/jobs'} className="flex items-center gap-1">
          <LinkedInLogo />
        </Link>

        <div className="flex items-center gap-1">
          {links.map(({ to, icon: Icon, label }) => (
            <Link key={to} to={to} className={linkClass(to)}>
              <Icon className="w-5 h-5" />
              <span className="hidden sm:block">{label}</span>
            </Link>
          ))}

          <Link to={profilePath} className={linkClass(profilePath)}>
            <User className="w-5 h-5" />
            <span className="hidden sm:block">Me</span>
          </Link>

          <button onClick={handleLogout} className="flex flex-col items-center gap-0.5 px-3 py-1 text-xs text-gray-500 hover:text-red-600">
            <LogOut className="w-5 h-5" />
            <span className="hidden sm:block">Logout</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
