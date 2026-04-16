import StatusBadge from '../shared/StatusBadge';
import { Building2, Calendar } from 'lucide-react';

export default function ApplicationCard({ application }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-4">
      {application.logo ? (
        <img src={application.logo} alt="" className="w-10 h-10 rounded object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
      ) : (
        <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center">
          <Building2 className="w-5 h-5 text-gray-400" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-800 truncate">{application.jobTitle}</p>
        <p className="text-sm text-gray-500">{application.company}</p>
        <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
          <Calendar className="w-3 h-3" />
          Applied {application.appliedDate}
        </p>
      </div>
      <StatusBadge status={application.status} />
    </div>
  );
}
