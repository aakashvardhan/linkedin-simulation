import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { MapPin, Mail, Phone, Building2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function RecruiterProfile() {
  const navigate = useNavigate();
  const { user, updateUser, deleteAccount } = useAuth();
  const [editing, setEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    company_name: user?.company_name || '',
    company_industry: user?.company_industry || '',
    company_size: user?.company_size || '',
  });

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });
  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-linkedin focus:outline-none text-sm';

  const handleSave = (e) => {
    e.preventDefault();
    updateUser(form);
    setEditing(false);
    toast.success('Profile updated!');
  };

  const handleDelete = () => {
    deleteAccount();
    toast.success('Account deleted');
    navigate('/recruiter/login');
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="h-32 bg-gradient-to-r from-linkedin-dark to-linkedin" />
        <div className="px-6 pb-6">
          <div className="flex items-end gap-4 -mt-12">
            <div className="w-24 h-24 rounded-full border-4 border-white bg-linkedin flex items-center justify-center">
              <Building2 className="w-10 h-10 text-white" />
            </div>
            <div className="pb-1">
              <h1 className="text-xl font-bold text-gray-800">{user?.name}</h1>
              <p className="text-sm text-gray-600">{user?.company_name || 'Company'} &middot; Recruiter</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-500">
            <span className="flex items-center gap-1"><Mail className="w-4 h-4" />{user?.email}</span>
            {user?.phone && <span className="flex items-center gap-1"><Phone className="w-4 h-4" />{user.phone}</span>}
            {user?.company_industry && <span className="flex items-center gap-1">Industry: {user.company_industry}</span>}
            {user?.company_size && <span className="flex items-center gap-1">Size: {user.company_size}</span>}
          </div>
        </div>
      </div>

      {/* Edit Form */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mt-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Edit Profile</h2>
          {!editing && (
            <button onClick={() => setEditing(true)} className="text-sm text-linkedin hover:underline">Edit</button>
          )}
        </div>
        {editing ? (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input type="text" value={form.name} onChange={update('name')} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={form.email} onChange={update('email')} className={inputClass} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" value={form.phone} onChange={update('phone')} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
              <input type="text" value={form.company_name} onChange={update('company_name')} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                <select value={form.company_industry} onChange={update('company_industry')} className={inputClass}>
                  <option value="">Select...</option>
                  <option value="Technology">Technology</option>
                  <option value="Finance">Finance</option>
                  <option value="Healthcare">Healthcare</option>
                  <option value="Education">Education</option>
                  <option value="Retail">Retail</option>
                  <option value="Consulting">Consulting</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Size</label>
                <select value={form.company_size} onChange={update('company_size')} className={inputClass}>
                  <option value="">Select...</option>
                  <option value="1-10">1-10</option>
                  <option value="11-50">11-50</option>
                  <option value="51-200">51-200</option>
                  <option value="201-500">201-500</option>
                  <option value="1000+">1000+</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="px-6 py-2 bg-linkedin text-white rounded-full text-sm font-medium hover:bg-linkedin-dark">Save</button>
              <button type="button" onClick={() => setEditing(false)} className="px-6 py-2 border border-gray-300 rounded-full text-sm hover:bg-gray-50">Cancel</button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-gray-500">Click Edit to update your recruiter profile.</p>
        )}
      </div>

      {/* Danger Zone */}
      <div className="bg-white rounded-lg border border-red-200 p-6 mt-4">
        <h2 className="text-lg font-semibold text-red-700 mb-2">Danger Zone</h2>
        <p className="text-sm text-gray-600 mb-4">Permanently delete your recruiter account.</p>
        {showDeleteConfirm ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-red-600 font-medium">Are you sure?</span>
            <button onClick={handleDelete} className="px-4 py-1.5 bg-red-600 text-white rounded-full text-sm hover:bg-red-700">Yes, Delete</button>
            <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-1.5 border border-gray-300 rounded-full text-sm hover:bg-gray-50">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-2 px-4 py-1.5 border border-red-300 text-red-600 rounded-full text-sm hover:bg-red-50">
            <Trash2 className="w-4 h-4" /> Delete Account
          </button>
        )}
      </div>
    </div>
  );
}
