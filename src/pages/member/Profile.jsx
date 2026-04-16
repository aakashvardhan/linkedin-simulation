import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRandomUsers } from '../../api/randomUser';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useAuth } from '../../hooks/useAuth';
import ProfileForm from '../../components/member/ProfileForm';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { MapPin, Mail, Phone, Briefcase, GraduationCap, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Profile() {
  const navigate = useNavigate();
  const { user, deleteAccount } = useAuth();
  const [randomUser, setRandomUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useLocalStorage('linkedin_profile', null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    (async () => {
      const users = await getRandomUsers(1);
      setRandomUser(users[0]);
      setLoading(false);
    })();
  }, []);

  const handleDelete = () => {
    deleteAccount();
    toast.success('Account deleted');
    navigate('/login');
  };

  if (loading) return <LoadingSpinner message="Loading profile..." />;

  const displayName = profile?.first_name
    ? `${profile.first_name} ${profile.last_name}`
    : randomUser?.name;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Profile Card */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="h-32 bg-gradient-to-r from-linkedin to-linkedin-dark" />
        <div className="px-6 pb-6">
          <div className="flex items-end gap-4 -mt-12">
            <img
              src={profile?.profile_photo_url || randomUser?.avatar || 'https://i.pravatar.cc/150'}
              alt=""
              className="w-24 h-24 rounded-full border-4 border-white object-cover"
            />
            <div className="pb-1">
              <h1 className="text-xl font-bold text-gray-800">{displayName}</h1>
              <p className="text-sm text-gray-600">{profile?.headline || 'Add a headline'}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-500">
            {(profile?.location || randomUser?.location) && (
              <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{profile?.location || randomUser?.location}</span>
            )}
            <span className="flex items-center gap-1"><Mail className="w-4 h-4" />{profile?.email || user?.email || randomUser?.email}</span>
            {profile?.phone && <span className="flex items-center gap-1"><Phone className="w-4 h-4" />{profile.phone}</span>}
          </div>

          {/* About */}
          {profile?.about && (
            <div className="mt-4">
              <h3 className="font-semibold text-gray-800 mb-1">About</h3>
              <p className="text-sm text-gray-600 whitespace-pre-line">{profile.about}</p>
            </div>
          )}

          {/* Skills */}
          {profile?.skills?.length > 0 && (
            <div className="mt-4">
              <h3 className="font-semibold text-gray-800 mb-2">Skills</h3>
              <div className="flex flex-wrap gap-2">
                {profile.skills.map((s, i) => (
                  <span key={i} className="px-3 py-1 bg-linkedin-light text-linkedin text-xs rounded-full">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Experience */}
          {profile?.experience?.length > 0 && (
            <div className="mt-4">
              <h3 className="font-semibold text-gray-800 mb-2">Experience</h3>
              <div className="space-y-3">
                {profile.experience.map((exp, i) => (
                  <div key={i} className="flex gap-3">
                    <Briefcase className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-sm text-gray-800">{exp.title}</p>
                      <p className="text-sm text-gray-600">{exp.company}</p>
                      <p className="text-xs text-gray-400">{exp.start_date} - {exp.end_date || 'Present'}</p>
                      {exp.description && <p className="text-xs text-gray-500 mt-1">{exp.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Education */}
          {profile?.education?.length > 0 && (
            <div className="mt-4">
              <h3 className="font-semibold text-gray-800 mb-2">Education</h3>
              <div className="space-y-3">
                {profile.education.map((edu, i) => (
                  <div key={i} className="flex gap-3">
                    <GraduationCap className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-sm text-gray-800">{edu.school}</p>
                      <p className="text-sm text-gray-600">{edu.degree}{edu.field ? `, ${edu.field}` : ''}</p>
                      <p className="text-xs text-gray-400">{edu.start_year} - {edu.end_year || 'Present'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resume */}
          {profile?.resume_file_name && (
            <div className="mt-4">
              <h3 className="font-semibold text-gray-800 mb-1">Resume</h3>
              <p className="text-sm text-linkedin">{profile.resume_file_name}</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Profile */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mt-4">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Edit Profile</h2>
        <ProfileForm profile={profile} onSave={setProfile} />
      </div>

      {/* Delete Account */}
      <div className="bg-white rounded-lg border border-red-200 p-6 mt-4">
        <h2 className="text-lg font-semibold text-red-700 mb-2">Danger Zone</h2>
        <p className="text-sm text-gray-600 mb-4">Permanently delete your account and all associated data.</p>
        {showDeleteConfirm ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-red-600 font-medium">Are you sure? This cannot be undone.</span>
            <button onClick={handleDelete} className="px-4 py-1.5 bg-red-600 text-white rounded-full text-sm hover:bg-red-700">
              Yes, Delete
            </button>
            <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-1.5 border border-gray-300 rounded-full text-sm hover:bg-gray-50">
              Cancel
            </button>
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
