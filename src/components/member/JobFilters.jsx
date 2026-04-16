export default function JobFilters({ filters, onChange }) {
  const inputClass = 'px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-linkedin focus:outline-none';

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      <input
        type="text"
        value={filters.location || ''}
        onChange={(e) => onChange({ ...filters, location: e.target.value })}
        placeholder="Location..."
        className={`${inputClass} w-40`}
      />
      <select
        value={filters.employmentType || ''}
        onChange={(e) => onChange({ ...filters, employmentType: e.target.value })}
        className={inputClass}
      >
        <option value="">All Types</option>
        <option value="FULLTIME">Full-time</option>
        <option value="PARTTIME">Part-time</option>
        <option value="CONTRACT">Contract</option>
        <option value="INTERN">Internship</option>
      </select>
      <select
        value={filters.remote || ''}
        onChange={(e) => onChange({ ...filters, remote: e.target.value })}
        className={inputClass}
      >
        <option value="">Remote / On-site</option>
        <option value="remote">Remote</option>
        <option value="onsite">On-site</option>
        <option value="hybrid">Hybrid</option>
      </select>
      <select
        value={filters.industry || ''}
        onChange={(e) => onChange({ ...filters, industry: e.target.value })}
        className={inputClass}
      >
        <option value="">All Industries</option>
        <option value="Technology">Technology</option>
        <option value="Finance">Finance</option>
        <option value="Healthcare">Healthcare</option>
        <option value="Education">Education</option>
        <option value="Retail">Retail</option>
        <option value="Consulting">Consulting</option>
      </select>
      <select
        value={filters.seniority || ''}
        onChange={(e) => onChange({ ...filters, seniority: e.target.value })}
        className={inputClass}
      >
        <option value="">All Levels</option>
        <option value="Entry">Entry Level</option>
        <option value="Mid">Mid Level</option>
        <option value="Senior">Senior</option>
        <option value="Lead">Lead</option>
        <option value="Director">Director</option>
        <option value="Executive">Executive</option>
      </select>
      {Object.values(filters).some(Boolean) && (
        <button
          onClick={() => onChange({})}
          className="px-3 py-1.5 text-sm text-red-600 hover:underline"
        >
          Clear Filters
        </button>
      )}
    </div>
  );
}
