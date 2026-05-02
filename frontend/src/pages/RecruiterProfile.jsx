import React, { useEffect, useState, useCallback } from 'react';
import { FaBuilding, FaUsers, FaUserCog, FaEnvelope, FaPhone, FaPencilAlt, FaTimes, FaCamera } from 'react-icons/fa';
import { useMockData, recruiterProfilePhotoKey, notifyProfilePhotoUpdated } from '../context/MockDataContext';

const RecruiterProfile = () => {
  const { userProfile } = useMockData();
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    phone: '',
    companyName: '',
    companyIndustry: '',
    companySize: '',
    roleAccessLevel: '',
    profilePhotoUrl: '',
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(profile);

  const handleRecruiterPhoto = useCallback((fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    const isImage =
      file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(file.name || '');
    if (!isImage) {
      window.alert('Please choose an image file (JPEG, PNG, WebP, etc.).');
      return;
    }
    if (file.size > 2.5 * 1024 * 1024) {
      window.alert('Please choose an image under 2.5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => window.alert('Could not read that file. Try another image.');
    reader.onload = () => {
      const dataUrl = reader.result;
      setProfile((p) => {
        const email = (p.email || userProfile?.email || '').trim() || 'me';
        try {
          localStorage.setItem(recruiterProfilePhotoKey(email), dataUrl);
        } catch {
          window.alert('Could not save photo. Try a smaller image.');
          return p;
        }
        notifyProfilePhotoUpdated();
        return { ...p, profilePhotoUrl: dataUrl };
      });
      setEditForm((p) => ({ ...p, profilePhotoUrl: dataUrl }));
    };
    reader.readAsDataURL(file);
  }, [userProfile?.email]);

  useEffect(() => {
    if (!userProfile || userProfile.role !== 'RECRUITER') return;
    const email = userProfile.email || '';
    let storedPhoto = '';
    try {
      storedPhoto = localStorage.getItem(recruiterProfilePhotoKey(email)) || '';
    } catch {
      /* ignore */
    }
    setProfile((p) => ({
      ...p,
      name: userProfile.displayName,
      email: userProfile.email || p.email,
      companyName: userProfile.company_name ?? p.companyName,
      companyIndustry: userProfile.company_industry ?? p.companyIndustry,
      companySize: userProfile.company_size ?? p.companySize,
      phone: userProfile.phone ?? p.phone,
      profilePhotoUrl: storedPhoto,
    }));
    setEditForm((p) => ({
      ...p,
      name: userProfile.displayName,
      email: userProfile.email || p.email,
      companyName: userProfile.company_name ?? p.companyName,
      companyIndustry: userProfile.company_industry ?? p.companyIndustry,
      companySize: userProfile.company_size ?? p.companySize,
      phone: userProfile.phone ?? p.phone,
      profilePhotoUrl: storedPhoto,
    }));
  }, [userProfile]);

  const recruiterDisplayName = userProfile?.displayName?.trim() || profile.name;

  const handleSave = () => {
    const next = { ...editForm };
    const email = next.email || userProfile?.email;
    if (email) {
      try {
        if (next.profilePhotoUrl) localStorage.setItem(recruiterProfilePhotoKey(email), next.profilePhotoUrl);
        else localStorage.removeItem(recruiterProfilePhotoKey(email));
      } catch {
        /* ignore */
      }
    }
    setProfile(next);
    notifyProfilePhotoUpdated();
    setIsEditing(false);
  };

  return (
    <div style={{ gridColumn: 'span 3', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Hero Header */}
      <div className="card">
        <div style={{ height: '160px', background: 'linear-gradient(165deg, #378fe9 0%, #0A66C2 55%, #0a58ad 100%)', position: 'relative', borderRadius: '8px 8px 0 0' }}>
          <div
            style={{
              position: 'absolute',
              bottom: '-76px',
              left: '24px',
              width: '152px',
              height: '152px',
              borderRadius: '50%',
              border: '4px solid #fff',
              overflow: 'hidden',
              backgroundColor: '#5c3d2e',
            }}
          >
            <label
              title="Change profile photo"
              aria-label="Upload or change profile photo"
              style={{
                display: 'block',
                width: '100%',
                height: '100%',
                cursor: 'pointer',
                position: 'relative',
                margin: 0,
              }}
            >
              <img
                src={
                  profile.profilePhotoUrl ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(recruiterDisplayName)}&background=random&color=fff&size=152`
                }
                alt={`${recruiterDisplayName} profile`}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  pointerEvents: 'none',
                  zIndex: 0,
                }}
              />
              <input
                type="file"
                accept="image/*,.heic,.heif"
                onChange={(e) => {
                  handleRecruiterPhoto(e.target.files);
                  e.target.value = '';
                }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  opacity: 0,
                  cursor: 'pointer',
                  zIndex: 1,
                  fontSize: 0,
                }}
              />
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  right: '6px',
                  bottom: '6px',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  border: '2px solid #fff',
                  backgroundColor: '#000000cc',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                  zIndex: 2,
                }}
              >
                <FaCamera size={16} />
              </span>
            </label>
          </div>
        </div>
        <div style={{ paddingTop: '88px', paddingLeft: '24px', paddingRight: '24px', paddingBottom: '24px', position: 'relative' }}>
          <button onClick={() => setIsEditing(true)} style={{ position: 'absolute', top: '16px', right: '24px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '50%' }}><FaPencilAlt size={20} color="#666" /></button>
          
          <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#000000e6' }}>{recruiterDisplayName} <span style={{ fontSize: '14px', backgroundColor: '#f3f2ef', padding: '2px 8px', borderRadius: '4px', verticalAlign: 'middle', color: '#666', border: '1px solid #e0e0df' }}>Recruiter Admin</span></h1>
          <p style={{ fontSize: '16px', color: '#000000e6', marginTop: '4px' }}>{profile.roleAccessLevel} &bull; {profile.companyName}</p>
          
          <div style={{ display: 'flex', gap: '16px', marginTop: '16px', flexWrap: 'wrap' }}>
             <p style={{ fontSize: '14px', color: '#666', display: 'flex', alignItems: 'center', gap: '8px' }}><FaEnvelope /> {profile.email}</p>
             <p style={{ fontSize: '14px', color: '#666', display: 'flex', alignItems: 'center', gap: '8px' }}><FaPhone /> {profile.phone}</p>
          </div>
        </div>
      </div>

      {/* Company details */}
      <div style={{ display: 'flex', gap: '24px' }}>
        
        {/* Company */}
        <div className="card" style={{ padding: '24px', flex: 1, position: 'relative' }}>
          <button onClick={() => setIsEditing(true)} style={{ position: 'absolute', top: '16px', right: '24px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '50%' }}><FaPencilAlt size={20} color="#666" /></button>
          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}><FaBuilding /> Company</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
             <div>
               <h3 style={{ fontSize: '14px', color: '#666', fontWeight: '400' }}>Company name</h3>
               <p style={{ fontSize: '16px', color: '#000', fontWeight: '600' }}>{profile.companyName}</p>
             </div>
             <div>
               <h3 style={{ fontSize: '14px', color: '#666', fontWeight: '400', display: 'flex', alignItems: 'center', gap: '4px' }}><FaBuilding /> Industry</h3>
               <p style={{ fontSize: '16px', color: '#000', fontWeight: '600' }}>{profile.companyIndustry}</p>
             </div>
             <div>
               <h3 style={{ fontSize: '14px', color: '#666', fontWeight: '400', display: 'flex', alignItems: 'center', gap: '4px' }}><FaUsers /> Company size</h3>
               <p style={{ fontSize: '16px', color: '#000', fontWeight: '600' }}>{profile.companySize}</p>
             </div>
          </div>
        </div>

        {/* Role */}
        <div className="card" style={{ padding: '24px', flex: 1, position: 'relative' }}>
          <button onClick={() => setIsEditing(true)} style={{ position: 'absolute', top: '16px', right: '24px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '50%' }}><FaPencilAlt size={20} color="#666" /></button>
          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}><FaUserCog /> Role</h2>
          
          <div style={{ backgroundColor: '#E8F3FF', padding: '16px', borderRadius: '8px', border: '1px solid #CCE4F7' }}>
             <h3 style={{ fontSize: '16px', color: '#0A66C2', fontWeight: '600' }}>Access level</h3>
             <p style={{ fontSize: '14px', color: '#000', marginTop: '4px', marginBottom: '16px' }}>{profile.roleAccessLevel}</p>
             
             <p style={{ fontSize: '13px', color: '#666' }}>Manage job postings and review candidates for your organization.</p>
          </div>
        </div>
      </div>

      {/* Expand Recruiter Edit Modal */}
      {isEditing && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', width: '600px', borderRadius: '8px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e0e0df', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <h2 style={{ fontSize: '20px', fontWeight: '400' }}>Edit profile</h2>
               <button onClick={() => setIsEditing(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><FaTimes size={24} color="#666" /></button>
            </div>
            
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
               <h3 style={{ fontSize: '16px', color: '#0A66C2', borderBottom: '1px solid #e0e0df', paddingBottom: '4px' }}>Administrative Core</h3>
               <div style={{ display: 'flex', gap: '16px' }}>
                  <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: '#666' }}>
                    Full Name
                    <input type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} style={{ padding: '8px', border: '1px solid #000000e6', borderRadius: '4px', fontSize: '14px' }} />
                  </label>
                  <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: '#666' }}>
                    Role / Security Level
                    <input type="text" value={editForm.roleAccessLevel} onChange={e => setEditForm({...editForm, roleAccessLevel: e.target.value})} style={{ padding: '8px', border: '1px solid #000000e6', borderRadius: '4px', fontSize: '14px' }} />
                  </label>
               </div>
               
               <div style={{ display: 'flex', gap: '16px' }}>
                  <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: '#666' }}>
                    Corporate Email
                    <input type="email" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} style={{ padding: '8px', border: '1px solid #000000e6', borderRadius: '4px', fontSize: '14px' }} />
                  </label>
                  <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: '#666' }}>
                    Contact Extension
                    <input type="text" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} style={{ padding: '8px', border: '1px solid #000000e6', borderRadius: '4px', fontSize: '14px' }} />
                  </label>
               </div>

               <h3 style={{ fontSize: '16px', color: '#0A66C2', borderBottom: '1px solid #e0e0df', paddingBottom: '4px', marginTop: '16px' }}>Organization Metrics</h3>
               
               <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: '#666' }}>
                  Company Registered Name
                  <input type="text" value={editForm.companyName} onChange={e => setEditForm({...editForm, companyName: e.target.value})} style={{ padding: '8px', border: '1px solid #000000e6', borderRadius: '4px', fontSize: '14px' }} />
               </label>
               
               <div style={{ display: 'flex', gap: '16px' }}>
                  <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: '#666' }}>
                    Company Industry Index
                    <input type="text" value={editForm.companyIndustry} onChange={e => setEditForm({...editForm, companyIndustry: e.target.value})} style={{ padding: '8px', border: '1px solid #000000e6', borderRadius: '4px', fontSize: '14px' }} />
                  </label>
                  <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: '#666' }}>
                    Company Scale/Size
                    <select value={editForm.companySize} onChange={e => setEditForm({...editForm, companySize: e.target.value})} style={{ padding: '8px', border: '1px solid #000000e6', borderRadius: '4px', fontSize: '14px' }}>
                       <option value="1-10 employees">1-10 employees</option>
                       <option value="11-50 employees">11-50 employees</option>
                       <option value="51-200 employees">51-200 employees</option>
                       <option value="201-500 employees">201-500 employees</option>
                       <option value="501-1000 employees">501-1000 employees</option>
                       <option value="1000+ employees">1000+ employees</option>
                    </select>
                  </label>
               </div>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: '#666' }}>
                    Profile photo (upload)
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        handleRecruiterPhoto(e.target.files);
                        e.target.value = '';
                      }}
                      style={{ padding: '8px', border: '1px dashed #000000e6', borderRadius: '4px', fontSize: '14px' }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: '#666' }}>
                    Or paste image URL
                    <input
                      type="text"
                      value={editForm.profilePhotoUrl?.startsWith('data:') ? '' : editForm.profilePhotoUrl}
                      onChange={e => setEditForm({...editForm, profilePhotoUrl: e.target.value})}
                      placeholder="https://…"
                      style={{ padding: '8px', border: '1px solid #000000e6', borderRadius: '4px', fontSize: '14px' }}
                    />
                  </label>
               </div>
            </div>
            
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e0e0df', display: 'flex', justifyContent: 'flex-end', backgroundColor: '#f3f2ef', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px' }}>
               <button onClick={handleSave} style={{ backgroundColor: '#0A66C2', color: '#fff', border: 'none', borderRadius: '24px', padding: '8px 24px', fontWeight: '600', cursor: 'pointer', fontSize: '16px' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecruiterProfile;
