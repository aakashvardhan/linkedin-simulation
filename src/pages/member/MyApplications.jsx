import { useState } from 'react';
import { mockApplications } from '../../data/mockApplications';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import ApplicationCard from '../../components/member/ApplicationCard';
import EmptyState from '../../components/shared/EmptyState';
import { FileText } from 'lucide-react';

export default function MyApplications() {
  const [storedApps] = useLocalStorage('linkedin_applications', []);
  const allApplications = [...storedApps, ...mockApplications];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">My Applications ({allApplications.length})</h1>
      {allApplications.length === 0 ? (
        <EmptyState title="No applications yet" message="Apply to jobs to track them here" icon={FileText} />
      ) : (
        <div className="space-y-3">
          {allApplications.map((app) => (
            <ApplicationCard key={app.id} application={app} />
          ))}
        </div>
      )}
    </div>
  );
}
