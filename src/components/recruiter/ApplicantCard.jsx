import StatusBadge from '../shared/StatusBadge';
import { Link } from 'react-router-dom';

export default function ApplicantCard({ applicant, jobId }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-4">
      <img src={applicant.avatar} alt="" className="w-12 h-12 rounded-full object-cover" />
      <div className="flex-1 min-w-0">
        <Link to={`/recruiter/applications/${applicant.id}`} className="font-medium text-linkedin hover:underline truncate block">
          {applicant.name}
        </Link>
        <p className="text-sm text-gray-500 truncate">{applicant.headline}</p>
        <p className="text-xs text-gray-400">{applicant.location} &middot; {applicant.experience}</p>
      </div>
      <StatusBadge status={applicant.status} />
    </div>
  );
}
