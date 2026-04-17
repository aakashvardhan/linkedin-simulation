import { mockDashboard } from '../../data/mockDashboard';
import ProfileViewsChart from '../../components/charts/ProfileViewsChart';
import ApplicationStatusChart from '../../components/charts/ApplicationStatusChart';
import { Eye, Search, TrendingUp, FileText } from 'lucide-react';

export default function MemberDashboard() {
  const { stats, profileViewsData, applicationStatusData } = mockDashboard;

  const statCards = [
    { label: 'Profile Views', value: stats.profileViews, icon: Eye, color: 'text-linkedin' },
    { label: 'Search Appearances', value: stats.searchAppearances, icon: Search, color: 'text-purple-600' },
    { label: 'Post Impressions', value: stats.postImpressions, icon: TrendingUp, color: 'text-green-600' },
    { label: 'Applications', value: stats.applicationsSubmitted, icon: FileText, color: 'text-orange-600' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <card.icon className={`w-5 h-5 ${card.color}`} />
              <span className="text-sm text-gray-500">{card.label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-800">{card.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ProfileViewsChart data={profileViewsData} />
        <ApplicationStatusChart data={applicationStatusData} />
      </div>
    </div>
  );
}
