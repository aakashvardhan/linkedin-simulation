import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function PostJob() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const [recruiterJobs, setRecruiterJobs] = useLocalStorage('linkedin_recruiter_jobs', []);

  const existingJob = editId ? recruiterJobs.find((j) => j.id === editId) : null;

  const [form, setForm] = useState({
    title: existingJob?.title || '',
    location: existingJob?.location || '',
    employment_type: existingJob?.employment_type || 'FULLTIME',
    workplace_type: existingJob?.workplace_type || 'onsite',
    seniority_level: existingJob?.seniority_level || '',
    description: existingJob?.description || '',
    min_salary: existingJob?.min_salary || '',
    max_salary: existingJob?.max_salary || '',
    skills_required: existingJob?.skills_required || [],
    status: existingJob?.status || 'open',
  });

  const [skillInput, setSkillInput] = useState('');
  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !form.skills_required.includes(s)) {
      setForm({ ...form, skills_required: [...form.skills_required, s] });
      setSkillInput('');
    }
  };
  const removeSkill = (skill) => setForm({ ...form, skills_required: form.skills_required.filter((s) => s !== skill) });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title || !form.location || !form.description) {
      return toast.error('Please fill required fields (title, location, description)');
    }

    if (editId && existingJob) {
      setRecruiterJobs(recruiterJobs.map((j) =>
        j.id === editId ? {
          ...j, ...form,
          min_salary: form.min_salary ? Number(form.min_salary) : null,
          max_salary: form.max_salary ? Number(form.max_salary) : null,
        } : j
      ));
      toast.success('Job updated!');
    } else {
      const newJob = {
        ...form,
        id: `rjob-${Date.now()}`,
        postedDate: new Date().toISOString().split('T')[0],
        applicantCount: 0,
        views: 0,
        min_salary: form.min_salary ? Number(form.min_salary) : null,
        max_salary: form.max_salary ? Number(form.max_salary) : null,
      };
      setRecruiterJobs([newJob, ...recruiterJobs]);
      toast.success('Job posted successfully!');
    }
    navigate('/recruiter/my-jobs');
  };

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-linkedin focus:outline-none';

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">{editId ? 'Edit Job Posting' : 'Post a Job'}</h1>
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Title *</label>
            <input type="text" value={form.title} onChange={update('title')} className={inputClass} placeholder="e.g. Senior Software Engineer" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
              <input type="text" value={form.location} onChange={update('location')} className={inputClass} placeholder="e.g. San Francisco, CA" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Workplace Type</label>
              <select value={form.workplace_type} onChange={update('workplace_type')} className={inputClass}>
                <option value="onsite">On-site</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
              <select value={form.employment_type} onChange={update('employment_type')} className={inputClass}>
                <option value="FULLTIME">Full-time</option>
                <option value="PARTTIME">Part-time</option>
                <option value="CONTRACT">Contract</option>
                <option value="INTERN">Internship</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Seniority Level</label>
              <select value={form.seniority_level} onChange={update('seniority_level')} className={inputClass}>
                <option value="">Select...</option>
                <option value="Entry">Entry Level</option>
                <option value="Mid">Mid Level</option>
                <option value="Senior">Senior</option>
                <option value="Lead">Lead</option>
                <option value="Director">Director</option>
                <option value="Executive">Executive</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Salary</label>
              <input type="number" value={form.min_salary} onChange={update('min_salary')} className={inputClass} placeholder="80000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Salary</label>
              <input type="number" value={form.max_salary} onChange={update('max_salary')} className={inputClass} placeholder="150000" />
            </div>
          </div>

          {/* Skills Required */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Skills Required</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.skills_required.map((s) => (
                <span key={s} className="px-3 py-1 bg-linkedin-light text-linkedin text-xs rounded-full flex items-center gap-1">
                  {s}
                  <button type="button" onClick={() => removeSkill(s)} className="hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" value={skillInput} onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                className={inputClass} placeholder="Type a skill and press Enter" />
              <button type="button" onClick={addSkill} className="px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm shrink-0">Add</button>
            </div>
          </div>

          {editId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Job Status</label>
              <select value={form.status} onChange={update('status')} className={inputClass}>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Description *</label>
            <textarea value={form.description} onChange={update('description')} rows={8} className={inputClass}
              placeholder="Describe the role, responsibilities, and requirements..." />
          </div>
          <button type="submit" className="w-full py-2.5 bg-linkedin text-white rounded-full font-medium hover:bg-linkedin-dark transition-colors">
            {editId ? 'Save Changes' : 'Post Job'}
          </button>
        </form>
      </div>
    </div>
  );
}
