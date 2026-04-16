import { Bookmark, MapPin, Building2, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function JobCard({ job, onSave, isSaved }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex gap-4">
        {job.company_logo ? (
          <img src={job.company_logo} alt="" className="w-12 h-12 rounded object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
        ) : (
          <div className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-gray-400" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <Link to={`/jobs/${encodeURIComponent(job.id)}`} className="text-lg font-semibold text-linkedin hover:underline block truncate">
            {job.title}
          </Link>
          <p className="text-sm text-gray-700">{job.company_name}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{job.location}</span>
            {job.employment_type && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{job.employment_type}</span>}
          </div>
          {job.min_salary && (
            <p className="text-xs text-green-700 mt-1">
              ${job.min_salary.toLocaleString()} - ${job.max_salary?.toLocaleString()}
            </p>
          )}
        </div>
        {onSave && (
          <button onClick={() => onSave(job)} className="self-start p-2 hover:bg-gray-100 rounded-full">
            <Bookmark className={`w-5 h-5 ${isSaved ? 'fill-linkedin text-linkedin' : 'text-gray-400'}`} />
          </button>
        )}
      </div>
    </div>
  );
}
