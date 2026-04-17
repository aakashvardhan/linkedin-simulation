import { mockRecruiterDashboard } from '../../data/mockRecruiterDashboard';
import TopJobsBarChart from '../../components/charts/TopJobsBarChart';
import CityDistributionChart from '../../components/charts/CityDistributionChart';
import LowTractionChart from '../../components/charts/LowTractionChart';
import ClicksBarChart from '../../components/charts/ClicksBarChart';
import SavedJobsLineChart from '../../components/charts/SavedJobsLineChart';
import { Briefcase, Users, Calendar, Gift } from 'lucide-react';

export default function RecruiterDashboard() {
  const { stats, topJobsByApplicants, cityDistribution, lowTractionJobs, clicksPerJob, savedJobsWeekly } = mockRecruiterDashboard;

  const statCards = [
    { label: 'Total Jobs', value: stats.totalJobs, icon: Briefcase, color: 'text-linkedin' },
    { label: 'Total Applicants', value: stats.totalApplicants, icon: Users, color: 'text-purple-600' },
    { label: 'Interviews', value: stats.interviewsScheduled, icon: Calendar, color: 'text-green-600' },
    { label: 'Offers Extended', value: stats.offersExtended, icon: Gift, color: 'text-orange-600' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Recruiter Dashboard</h1>

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
        <TopJobsBarChart data={topJobsByApplicants} />
        <CityDistributionChart data={cityDistribution} />
        <ClicksBarChart data={clicksPerJob} />
        <SavedJobsLineChart data={savedJobsWeekly} />
        <div className="md:col-span-2">
          <LowTractionChart data={lowTractionJobs} />
        </div>
      </div>
    </div>
  );
}
