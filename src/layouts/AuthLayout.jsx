import { Outlet } from 'react-router-dom';
import LinkedInLogo from '../components/shared/LinkedInLogo';

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-linkedin-bg flex flex-col items-center justify-center px-4">
      <div className="mb-6 flex items-center gap-2">
        <LinkedInLogo className="w-10 h-10" />
        <span className="text-2xl font-semibold text-gray-800">LinkedIn</span>
      </div>
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <Outlet />
      </div>
    </div>
  );
}
