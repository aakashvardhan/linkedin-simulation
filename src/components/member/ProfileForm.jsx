import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

const emptyExperience = { title: '', company: '', start_date: '', end_date: '', description: '' };
const emptyEducation = { school: '', degree: '', field: '', start_year: '', end_year: '' };

export default function ProfileForm({ profile, onSave }) {
  const { user } = useAuth();
  const nameParts = (profile?.first_name && profile?.last_name)
    ? { first: profile.first_name, last: profile.last_name }
    : { first: user?.name?.split(' ')[0] || '', last: user?.name?.split(' ').slice(1).join(' ') || '' };

  const [form, setForm] = useState({
    first_name: profile?.first_name || nameParts.first,
    last_name: profile?.last_name || nameParts.last,
    email: profile?.email || user?.email || '',
    phone: profile?.phone || '',
    headline: profile?.headline || '',
    location: profile?.location || '',
    about: profile?.about || '',
    skills: profile?.skills || [],
    experience: profile?.experience || [],
    education: profile?.education || [],
    profile_photo_url: profile?.profile_photo_url || '',
    resume_file_name: profile?.resume_file_name || '',
  });

  const [skillInput, setSkillInput] = useState('');

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !form.skills.includes(s)) {
      setForm({ ...form, skills: [...form.skills, s] });
      setSkillInput('');
    }
  };

  const removeSkill = (skill) => setForm({ ...form, skills: form.skills.filter((s) => s !== skill) });

  const addExperience = () => setForm({ ...form, experience: [...form.experience, { ...emptyExperience }] });
  const updateExperience = (idx, field, value) => {
    const updated = form.experience.map((exp, i) => i === idx ? { ...exp, [field]: value } : exp);
    setForm({ ...form, experience: updated });
  };
  const removeExperience = (idx) => setForm({ ...form, experience: form.experience.filter((_, i) => i !== idx) });

  const addEducation = () => setForm({ ...form, education: [...form.education, { ...emptyEducation }] });
  const updateEducation = (idx, field, value) => {
    const updated = form.education.map((edu, i) => i === idx ? { ...edu, [field]: value } : edu);
    setForm({ ...form, education: updated });
  };
  const removeEducation = (idx) => setForm({ ...form, education: form.education.filter((_, i) => i !== idx) });

  const handleResumeChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setForm({ ...form, resume_file_name: file.name });
      // In production, upload to backend. For mock, store file name.
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.first_name || !form.last_name || !form.email) {
      return toast.error('First name, last name, and email are required');
    }
    onSave(form);
    toast.success('Profile updated!');
  };

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-linkedin focus:outline-none text-sm';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
          <input type="text" value={form.first_name} onChange={update('first_name')} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
          <input type="text" value={form.last_name} onChange={update('last_name')} className={inputClass} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
          <input type="email" value={form.email} onChange={update('email')} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input type="tel" value={form.phone} onChange={update('phone')} className={inputClass} placeholder="555-123-4567" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Headline</label>
        <input type="text" value={form.headline} onChange={update('headline')} className={inputClass} placeholder="e.g. Senior Software Engineer at Google" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
        <input type="text" value={form.location} onChange={update('location')} className={inputClass} placeholder="City, State, Country" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Profile Photo URL</label>
        <input type="url" value={form.profile_photo_url} onChange={update('profile_photo_url')} className={inputClass} placeholder="https://..." />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">About / Summary</label>
        <textarea value={form.about} onChange={update('about')} rows={3} className={inputClass} />
      </div>

      {/* Skills */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Skills</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {form.skills.map((s) => (
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
          <button type="button" onClick={addSkill} className="px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm">Add</button>
        </div>
      </div>

      {/* Experience */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">Experience</label>
          <button type="button" onClick={addExperience} className="flex items-center gap-1 text-sm text-linkedin hover:underline">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
        {form.experience.map((exp, idx) => (
          <div key={idx} className="border border-gray-200 rounded-lg p-4 mb-3 relative">
            <button type="button" onClick={() => removeExperience(idx)} className="absolute top-2 right-2 text-gray-400 hover:text-red-600">
              <Trash2 className="w-4 h-4" />
            </button>
            <div className="grid grid-cols-2 gap-3">
              <input type="text" value={exp.title} onChange={(e) => updateExperience(idx, 'title', e.target.value)} placeholder="Job Title" className={inputClass} />
              <input type="text" value={exp.company} onChange={(e) => updateExperience(idx, 'company', e.target.value)} placeholder="Company" className={inputClass} />
              <input type="text" value={exp.start_date} onChange={(e) => updateExperience(idx, 'start_date', e.target.value)} placeholder="Start (e.g. Jan 2020)" className={inputClass} />
              <input type="text" value={exp.end_date} onChange={(e) => updateExperience(idx, 'end_date', e.target.value)} placeholder="End (or Present)" className={inputClass} />
            </div>
            <textarea value={exp.description} onChange={(e) => updateExperience(idx, 'description', e.target.value)} placeholder="Description" rows={2} className={`${inputClass} mt-3`} />
          </div>
        ))}
      </div>

      {/* Education */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">Education</label>
          <button type="button" onClick={addEducation} className="flex items-center gap-1 text-sm text-linkedin hover:underline">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
        {form.education.map((edu, idx) => (
          <div key={idx} className="border border-gray-200 rounded-lg p-4 mb-3 relative">
            <button type="button" onClick={() => removeEducation(idx)} className="absolute top-2 right-2 text-gray-400 hover:text-red-600">
              <Trash2 className="w-4 h-4" />
            </button>
            <div className="grid grid-cols-2 gap-3">
              <input type="text" value={edu.school} onChange={(e) => updateEducation(idx, 'school', e.target.value)} placeholder="School" className={inputClass} />
              <input type="text" value={edu.degree} onChange={(e) => updateEducation(idx, 'degree', e.target.value)} placeholder="Degree" className={inputClass} />
              <input type="text" value={edu.field} onChange={(e) => updateEducation(idx, 'field', e.target.value)} placeholder="Field of Study" className={inputClass} />
              <div className="flex gap-2">
                <input type="text" value={edu.start_year} onChange={(e) => updateEducation(idx, 'start_year', e.target.value)} placeholder="Start" className={inputClass} />
                <input type="text" value={edu.end_year} onChange={(e) => updateEducation(idx, 'end_year', e.target.value)} placeholder="End" className={inputClass} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Resume */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Resume (PDF)</label>
        <input type="file" accept=".pdf,.doc,.docx" onChange={handleResumeChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-medium file:bg-linkedin-light file:text-linkedin hover:file:bg-blue-100" />
        {form.resume_file_name && <p className="text-xs text-gray-500 mt-1">Current: {form.resume_file_name}</p>}
      </div>

      <button type="submit" className="px-6 py-2 bg-linkedin text-white rounded-full font-medium hover:bg-linkedin-dark transition-colors">
        Save Profile
      </button>
    </form>
  );
}
