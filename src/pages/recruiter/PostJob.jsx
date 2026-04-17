import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/realApi';
import { useAuth } from '../../hooks/useAuth';
import LoadingSpinner from '../../components/shared/LoadingSpinner';

const EMPTY_FORM = {
  title: '',
  location: '',
  employment_type: 'Full-time',
  work_mode: 'onsite',
  seniority_level: '',
  description: '',
  salary_min: '',
  salary_max: '',
  skills_required: [],
};

export default function PostJob() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit'); // job_id to edit
  const { user } = useAuth();

  const [form, setForm] = useState(EMPTY_FORM);
  const [skillInput, setSkillInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(!!editId);

  // If editing, load existing job from backend
  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        const job = await api.jobs.get(Number(editId));
        setForm({
          title: job.title || '',
          location: job.location || '',
          employment_type: job.employment_type || 'Full-time',
          work_mode: job.work_mode || 'onsite',
          seniority_level: job.seniority_level || '',
          description: job.description || '',
          salary_min: job.salary_min ?? '',
          salary_max: job.salary_max ?? '',
          skills_required: job.skills_required || [],
        });
      } catch {
        toast.error('Could not load job for editing');
        navigate('/recruiter/my-jobs');
      } finally {
        setLoadingExisting(false);
      }
    })();
  }, [editId]);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !form.skills_required.includes(s)) {
      setForm({ ...form, skills_required: [...form.skills_required, s] });
      setSkillInput('');
    }
  };
  const removeSkill = (skill) =>
    setForm({ ...form, skills_required: form.skills_required.filter((s) => s !== skill) });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title || !form.location || !form.description) {
      return toast.error('Please fill required fields (title, location, description)');
    }
    if (!user?.recruiter_id || !user?.company_id) {
      return toast.error('You must be logged in as a recruiter');
    }
    setLoading(true);
    try {
      if (editId) {
        await api.jobs.update(Number(editId), user.recruiter_id, {
          title: form.title,
          location: form.location,
          employment_type: form.employment_type,
          work_mode: form.work_mode,
          seniority_level: form.seniority_level || null,
          description: form.description,
          salary_min: form.salary_min ? Number(form.salary_min) : null,
          salary_max: form.salary_max ? Number(form.salary_max) : null,
          skills_required: form.skills_required,
        });
        toast.success('Job updated!');
      } else {
        await api.jobs.create({
          recruiter_id: user.recruiter_id,
          company_id: user.company_id,
          title: form.title,
          description: form.description,
          seniority_level: form.seniority_level || null,
          employment_type: form.employment_type,
          location: form.location,
          work_mode: form.work_mode,
          skills_required: form.skills_required,
          salary_min: form.salary_min ? Number(form.salary_min) : null,
          salary_max: form.salary_max ? Number(form.salary_max) : null,
        });
        toast.success('Job posted successfully!');
      }
      navigate('/recruiter/my-jobs');
    } catch (err) {
      toast.error(err.message || 'Failed to save job');
    } finally {
      setLoading(false);
    }
  };

  if (loadingExisting) return <LoadingSpinner message="Loading job..." />;

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-linkedin focus:outline-none';

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">
        {editId ? 'Edit Job Posting' : 'Post a Job'}
      </h1>
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={update('title')}
              className={inputClass}
              placeholder="e.g. Senior Software Engineer"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
              <input
                type="text"
                value={form.location}
                onChange={update('location')}
                className={inputClass}
                placeholder="e.g. San Francisco, CA"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Workplace Type</label>
              <select value={form.work_mode} onChange={update('work_mode')} className={inputClass}>
                <option value="onsite">On-site</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
              <select
                value={form.employment_type}
                onChange={update('employment_type')}
                className={inputClass}
              >
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="Contract">Contract</option>
                <option value="Internship">Internship</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Seniority Level</label>
              <select
                value={form.seniority_level}
                onChange={update('seniority_level')}
                className={inputClass}
              >
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
              <input
                type="number"
                value={form.salary_min}
                onChange={update('salary_min')}
                className={inputClass}
                placeholder="80000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Salary</label>
              <input
                type="number"
                value={form.salary_max}
                onChange={update('salary_max')}
                className={inputClass}
                placeholder="150000"
              />
            </div>
          </div>

          {/* Skills */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Skills Required</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.skills_required.map((s) => (
                <span
                  key={s}
                  className="px-3 py-1 bg-linkedin-light text-linkedin text-xs rounded-full flex items-center gap-1"
                >
                  {s}
                  <button type="button" onClick={() => removeSkill(s)} className="hover:text-red-600">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                className={inputClass}
                placeholder="Type a skill and press Enter"
              />
              <button
                type="button"
                onClick={addSkill}
                className="px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm shrink-0 flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Description *</label>
            <textarea
              value={form.description}
              onChange={update('description')}
              rows={8}
              className={inputClass}
              placeholder="Describe the role, responsibilities, and requirements..."
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-linkedin text-white rounded-full font-medium hover:bg-linkedin-dark transition-colors disabled:opacity-60"
          >
            {loading ? 'Saving...' : editId ? 'Save Changes' : 'Post Job'}
          </button>
        </form>
      </div>
    </div>
  );
}
