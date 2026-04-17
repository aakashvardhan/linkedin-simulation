import { Users, Eye, Edit3, Trash2, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import StatusBadge from '../shared/StatusBadge';

export default function PostedJobCard({ job, onDelete, onClose }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-5 ${job.status === 'closed' ? 'opacity-60' : ''}`}>
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-800">{job.title}</h3>
            <StatusBadge status={job.status || 'open'} />
          </div>
          <p className="text-sm text-gray-500">{job.location} &middot; {job.employment_type} {job.workplace_type ? `&middot; ${job.workplace_type}` : ''}</p>
          <p className="text-xs text-gray-400 mt-1">Posted {job.postedDate}</p>
          {job.skills_required?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {job.skills_required.map((s) => (
                <span key={s} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded-full">{s}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-4 text-sm text-gray-600">
          <span className="flex items-center gap-1"><Users className="w-4 h-4" />{job.applicantCount}</span>
          <span className="flex items-center gap-1"><Eye className="w-4 h-4" />{job.views}</span>
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <Link to={`/recruiter/jobs/${job.id}/applicants`} className="px-4 py-1.5 text-sm bg-linkedin text-white rounded-full hover:bg-linkedin-dark transition-colors">
          View Applicants
        </Link>
        <Link to={`/recruiter/ai-candidates/${job.id}`} className="px-4 py-1.5 text-sm border border-linkedin text-linkedin rounded-full hover:bg-linkedin-light transition-colors">
          AI Find
        </Link>
        <Link to={`/recruiter/post-job?edit=${job.id}`} className="px-3 py-1.5 text-sm border border-gray-300 rounded-full hover:bg-gray-50 flex items-center gap-1">
          <Edit3 className="w-3 h-3" /> Edit
        </Link>
        {job.status !== 'closed' && onClose && (
          <button onClick={() => onClose(job.id)} className="px-3 py-1.5 text-sm border border-orange-300 text-orange-600 rounded-full hover:bg-orange-50 flex items-center gap-1">
            <XCircle className="w-3 h-3" /> Close
          </button>
        )}
        {onDelete && (
          <button onClick={() => onDelete(job.id)} className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-full hover:bg-red-50 flex items-center gap-1">
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        )}
      </div>
    </div>
  );
}
