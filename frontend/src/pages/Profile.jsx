import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import RightSidebar from '../components/RightSidebar';
import {
  FaEye,
  FaPencilAlt,
  FaTimes,
  FaEnvelope,
  FaPhone,
  FaMapMarkerAlt,
  FaGraduationCap,
  FaCode,
  FaLink,
  FaCamera,
  FaStar,
  FaCertificate,
  FaProjectDiagram,
  FaHandsHelping,
  FaBook,
  FaAward,
  FaTrash,
} from 'react-icons/fa';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import {
  useMockData,
  memberProfilePhotoKey,
  notifyProfilePhotoUpdated,
} from '../context/MockDataContext';

const EXTRA_SECTIONS_STORAGE = (email) => `linkdln:memberExtraSections:${email || 'me'}`;

const SECTION_CATALOG = [
  {
    type: 'featured',
    label: 'Featured',
    description: 'Showcase links, posts, and media at the top of your profile.',
    Icon: FaStar,
    defaultBody: 'Add links, articles, or media you want visitors to see first.',
  },
  {
    type: 'licenses',
    label: 'Licenses & certifications',
    description: 'Credentials such as AWS, PMP, or security clearances.',
    Icon: FaCertificate,
    defaultBody: 'List certifications with issuer and dates. You can edit details anytime.',
  },
  {
    type: 'projects',
    label: 'Projects',
    description: 'Highlight shipped work, open source, or academic projects.',
    Icon: FaProjectDiagram,
    defaultBody: 'Describe the problem, your role, stack, and outcomes.',
  },
  {
    type: 'volunteer',
    label: 'Volunteer experience',
    description: 'Causes and organizations you support.',
    Icon: FaHandsHelping,
    defaultBody: 'Share your volunteer roles and impact.',
  },
  {
    type: 'publications',
    label: 'Publications',
    description: 'Papers, blogs, or patents.',
    Icon: FaBook,
    defaultBody: 'Add titles, publishers, and publication dates.',
  },
  {
    type: 'honors',
    label: 'Honors & awards',
    description: 'Recognition, scholarships, and competition wins.',
    Icon: FaAward,
    defaultBody: 'Add award name, issuer, and year.',
  },
];

const Profile = () => {
  const navigate = useNavigate();
  const { getMemberAnalytics, userProfile, updateUserProfile, deleteMemberProfile } = useMockData();
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [viewData, setViewData] = useState([]);
  const [appStatusData, setAppStatusData] = useState([]);

  // Expanded Profile State matching exactly 4.1 Schema attributes
  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '+1 (555) 123-4567',
    headline: 'Software Engineer at Tech Innovations | Building the future of the web',
    location: 'San Francisco, CA, United States',
    about: 'Passionate Software Engineer with 5+ years of experience in building scalable web applications. Proficient in React, Node.js, and cloud architectures.',
    experience: [
      { id: 1, title: 'Senior Software Engineer', company: 'Tech Innovations', duration: 'Jan 2023 - Present' }
    ],
    education: [
      { id: 1, degree: 'B.S. Computer Science', school: 'University of California, Berkeley', year: '2019' }
    ],
    skills: 'React.js, Node.js, System Design, Kafka, Microservices',
    resumeUrl: 'john_doe_resume_2026.pdf',
    profilePhotoUrl: '',
    extraSections: [],
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(profile);
  const [showAddSectionModal, setShowAddSectionModal] = useState(false);

  const persistExtraSections = useCallback((email, sections) => {
    const key = EXTRA_SECTIONS_STORAGE(email);
    try {
      localStorage.setItem(key, JSON.stringify(sections || []));
    } catch {
      /* quota */
    }
  }, []);

  const removeExtraSection = useCallback(
    (sectionId) => {
      const email = (userProfile?.email || profile.email || '').trim() || 'me';
      setProfile((p) => {
        const next = { ...p, extraSections: (p.extraSections || []).filter((s) => s.id !== sectionId) };
        persistExtraSections(email, next.extraSections);
        return next;
      });
      setEditForm((f) => ({ ...f, extraSections: (f.extraSections || []).filter((s) => s.id !== sectionId) }));
    },
    [userProfile?.email, profile.email, persistExtraSections],
  );

  const addExtraSection = useCallback(
    (entry) => {
      const email = (userProfile?.email || profile.email || '').trim() || 'me';
      const id = Date.now();
      const newSec = {
        id,
        type: entry.type,
        title: entry.label,
        body: entry.defaultBody,
      };
      setProfile((p) => {
        const next = { ...p, extraSections: [...(p.extraSections || []), newSec] };
        persistExtraSections(email, next.extraSections);
        return next;
      });
      setEditForm((f) => ({ ...f, extraSections: [...(f.extraSections || []), newSec] }));
      setShowAddSectionModal(false);
    },
    [userProfile?.email, profile.email, persistExtraSections],
  );

  const handleSave = () => {
    const next = { ...editForm };
    const email = next.email || userProfile?.email;
    if (email) {
      try {
        if (next.profilePhotoUrl) localStorage.setItem(memberProfilePhotoKey(email), next.profilePhotoUrl);
        else localStorage.removeItem(memberProfilePhotoKey(email));
        persistExtraSections(email, next.extraSections || []);
      } catch {
        /* ignore quota */
      }
    }
    setProfile(next);
    const fullName = `${next.firstName} ${next.lastName}`.trim();
    updateUserProfile({
      displayName: fullName || next.email || userProfile?.displayName || 'Member',
      headline: next.headline,
    });
    notifyProfilePhotoUpdated();
    setIsEditing(false);
  };

  const handleMemberPhoto = useCallback((fileList) => {
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
          localStorage.setItem(memberProfilePhotoKey(email), dataUrl);
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
    if (!userProfile || userProfile.role === 'RECRUITER') return;
    const parts = (userProfile.displayName || '').trim().split(/\s+/);
    const firstName = parts[0] || 'Member';
    const lastName = parts.slice(1).join(' ') || '';
    const email = userProfile.email || '';
    let storedPhoto = '';
    try {
      storedPhoto = localStorage.getItem(memberProfilePhotoKey(email)) || '';
    } catch {
      /* ignore */
    }
    let extraSections = [];
    try {
      const raw = localStorage.getItem(EXTRA_SECTIONS_STORAGE(email));
      if (raw) extraSections = JSON.parse(raw);
      if (!Array.isArray(extraSections)) extraSections = [];
    } catch {
      extraSections = [];
    }
    setProfile((p) => ({
      ...p,
      firstName,
      lastName,
      email: userProfile.email || p.email,
      profilePhotoUrl: storedPhoto,
      extraSections,
      headline: userProfile.headline || p.headline,
    }));
    setEditForm((p) => ({
      ...p,
      firstName,
      lastName,
      email: userProfile.email || p.email,
      profilePhotoUrl: storedPhoto,
      extraSections,
      headline: userProfile.headline || p.headline,
    }));
  }, [userProfile]);

  const memberDisplayName =
    userProfile?.displayName?.trim() ||
    [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() ||
    'Your profile';

  const avatarSrc =
    profile.profilePhotoUrl ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(memberDisplayName)}&background=0A66C2&color=fff&size=152`;

  useEffect(() => {
    let cancelled = false;
    setAnalyticsLoading(true);
    getMemberAnalytics({ member_id: 'me', window: '30d' })
      .then((res) => {
        if (cancelled) return;
        setViewData(res.profileViewsLast30Days || []);
        setAppStatusData(res.applicationStatusBreakdown || []);
      })
      .finally(() => {
        if (!cancelled) setAnalyticsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getMemberAnalytics]);

  const openProfileEdit = () => {
    setEditForm(profile);
    setIsEditing(true);
  };

  return (
    <>
      <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '40px' }}>
        
        {/* Intro Card */}
        <div className="card">
          <div style={{ height: '200px', backgroundColor: '#a0b4b7', position: 'relative', borderRadius: '8px 8px 0 0' }}>
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
                backgroundColor: '#0A66C2',
              }}
            >
              {/* Full-area transparent file input: Safari often ignores <label> on display:none inputs. */}
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
                  src={avatarSrc}
                  alt={`${memberDisplayName} profile`}
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
                    handleMemberPhoto(e.target.files);
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
            <button onClick={openProfileEdit} style={{ position: 'absolute', top: '16px', right: '24px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '50%' }} onMouseEnter={e => e.target.style.backgroundColor='#f3f2ef'} onMouseLeave={e => e.target.style.backgroundColor='transparent'}><FaPencilAlt size={20} color="#666" /></button>
            <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#000000e6' }}>{memberDisplayName}</h1>
            <p style={{ fontSize: '16px', color: '#000000e6', marginTop: '4px' }}>{profile.headline}</p>
             
            <div style={{ display: 'flex', gap: '16px', marginTop: '8px', flexWrap: 'wrap' }}>
               <p style={{ fontSize: '14px', color: '#666', display: 'flex', alignItems: 'center', gap: '4px' }}><FaMapMarkerAlt /> {profile.location}</p>
               <p style={{ fontSize: '14px', color: '#666', display: 'flex', alignItems: 'center', gap: '4px' }}><FaEnvelope /> {profile.email}</p>
               <p style={{ fontSize: '14px', color: '#666', display: 'flex', alignItems: 'center', gap: '4px' }}><FaPhone /> {profile.phone}</p>
            </div>
            
            <p style={{ fontSize: '14px', color: '#0A66C2', fontWeight: '600', marginTop: '8px', cursor: 'pointer' }}>500+ connections</p>
            
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
              <button type="button" style={{ backgroundColor: '#0A66C2', color: '#fff', borderRadius: '24px', padding: '6px 16px', fontWeight: '600', border: 'none', cursor: 'pointer' }}>Open to</button>
              <button
                type="button"
                onClick={() => setShowAddSectionModal(true)}
                style={{
                  backgroundColor: 'transparent',
                  color: '#0A66C2',
                  borderRadius: '24px',
                  padding: '6px 16px',
                  fontWeight: '600',
                  border: '1px solid #0A66C2',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '14px',
                }}
              >
                Add profile section
              </button>
              {profile.resumeUrl && (
                 <button style={{ backgroundColor: 'transparent', color: '#666', borderRadius: '24px', padding: '6px 16px', fontWeight: '600', border: '1px solid #666', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <FaLink /> Resume PDF
                 </button>
              )}
            </div>
          </div>
        </div>

        {(profile.extraSections || []).map((sec) => {
          const meta = SECTION_CATALOG.find((c) => c.type === sec.type);
          const Icon = meta?.Icon || FaStar;
          return (
            <div key={sec.id} className="card" style={{ padding: '24px', position: 'relative' }}>
              <button
                type="button"
                onClick={() => removeExtraSection(sec.id)}
                aria-label={`Remove ${sec.title}`}
                title="Remove section"
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '24px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px',
                  borderRadius: '8px',
                  color: '#cc1010',
                }}
              >
                <FaTrash size={16} />
              </button>
              <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px', color: '#000000e6' }}>
                <Icon style={{ color: '#0A66C2' }} />
                {sec.title}
              </h2>
              <p style={{ fontSize: '14px', color: '#000000e6', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{sec.body}</p>
              <button
                type="button"
                onClick={openProfileEdit}
                style={{
                  marginTop: '12px',
                  fontSize: '12px',
                  color: '#0A66C2',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  fontFamily: 'inherit',
                }}
              >
                Edit in full profile →
              </button>
            </div>
          );
        })}

        {/* Analytics Dashboard */}
        <div className="card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '4px' }}>Analytics</h2>
          <p style={{ fontSize: '14px', color: '#666', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}><FaEye /> Private to you</p>
          
          <div style={{ display: 'flex', gap: '24px', height: '250px' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
               <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '16px', textAlign: 'center' }}>Profile Views (Last 30 Days)</h3>
               <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={viewData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <RechartsTooltip />
                    <Line type="monotone" dataKey="views" stroke="#0A66C2" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
               </ResponsiveContainer>
               {analyticsLoading && <p style={{ fontSize: '12px', color: '#666', textAlign: 'center', marginTop: '8px' }}>Loading…</p>}
            </div>
            
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #e0e0df', paddingLeft: '24px' }}>
               <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '16px', textAlign: 'center' }}>Applications status breakdown</h3>
               <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={appStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" stroke="none">
                      {appStatusData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                    </Pie>
                    <RechartsTooltip />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }}/>
                  </PieChart>
               </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* About Section */}
        <div className="card" style={{ padding: '24px', position: 'relative' }}>
          <button onClick={openProfileEdit} style={{ position: 'absolute', top: '16px', right: '24px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '50%' }}><FaPencilAlt size={20} color="#666" /></button>
          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>About</h2>
          <p style={{ fontSize: '14px', color: '#000000e6', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
            {profile.about}
          </p>
        </div>
        
        {/* Skills Section */}
        <div className="card" style={{ padding: '24px', position: 'relative' }}>
          <button onClick={openProfileEdit} style={{ position: 'absolute', top: '16px', right: '24px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '50%' }}><FaPencilAlt size={20} color="#666" /></button>
          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}><FaCode /> Skills</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {profile.skills.split(',').map((skill, index) => (
               <span key={index} style={{ padding: '6px 12px', border: '1px solid #e0e0df', borderRadius: '16px', fontSize: '14px', fontWeight: '600', color: '#000000e6' }}>
                  {skill.trim()}
               </span>
            ))}
          </div>
        </div>

        {/* Experience Section */}
        <div className="card" style={{ padding: '24px', position: 'relative' }}>
          <button onClick={openProfileEdit} style={{ position: 'absolute', top: '16px', right: '24px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '50%' }}><FaPencilAlt size={20} color="#666" /></button>
          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px' }}>Experience</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {profile.experience.map(exp => (
              <div key={exp.id} style={{ display: 'flex', gap: '16px' }}>
                <img src={`https://ui-avatars.com/api/?name=${exp.company.replace(' ', '+')}&background=random&color=fff&size=48`} alt="Company" style={{ borderRadius: '4px', width: '48px', height: '48px' }} />
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '600' }}>{exp.title}</h3>
                  <p style={{ fontSize: '14px' }}>{exp.company}</p>
                  <p style={{ fontSize: '14px', color: '#666' }}>{exp.duration}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Education Section */}
        <div className="card" style={{ padding: '24px', position: 'relative' }}>
          <button onClick={openProfileEdit} style={{ position: 'absolute', top: '16px', right: '24px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '50%' }}><FaPencilAlt size={20} color="#666" /></button>
          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px' }}>Education</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {profile.education.map(edu => (
              <div key={edu.id} style={{ display: 'flex', gap: '16px' }}>
                <div style={{ width: '48px', height: '48px', backgroundColor: '#eef3f8', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
                   <FaGraduationCap size={24} color="#0A66C2" />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '600' }}>{edu.school}</h3>
                  <p style={{ fontSize: '14px' }}>{edu.degree}</p>
                  <p style={{ fontSize: '14px', color: '#666' }}>{edu.year}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: '24px', border: '1px solid #f5c6cb', backgroundColor: '#fff8f8' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: '#b71c1c' }}>
            Profile & account (demo)
          </h2>
          <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 8px', color: '#000000e6' }}>
            Delete profile and sign out
          </h3>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '12px', lineHeight: 1.5 }}>
            Deletes locally saved member profile data on this browser (sections, photo, saved jobs, messages,
            invitations) and signs you out. Demo only — no server-side account exists.
          </p>
          <button
            type="button"
            onClick={() => {
              if (
                !window.confirm(
                  'Delete your member profile data on this device and sign out?\n\nThis cannot be undone in this demo.',
                )
              )
                return;
              deleteMemberProfile();
              navigate('/', { replace: true });
            }}
            style={{
              backgroundColor: '#8b0000',
              color: '#fff',
              border: 'none',
              borderRadius: '24px',
              padding: '10px 20px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            <FaTrash style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            Delete member profile
          </button>
        </div>

      </div>
      
      <RightSidebar />

      {showAddSectionModal ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-section-title"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.55)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
          onClick={() => setShowAddSectionModal(false)}
          onKeyDown={(e) => e.key === 'Escape' && setShowAddSectionModal(false)}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '560px',
              maxHeight: '88vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              margin: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #e0e0df', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 id="add-section-title" style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#000000e6' }}>
                Add profile section
              </h2>
              <button type="button" aria-label="Close" onClick={() => setShowAddSectionModal(false)} style={{ border: 'none', background: '#f3f2ef', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer' }}>
                <FaTimes color="#666" />
              </button>
            </div>
            <p style={{ padding: '12px 22px 0', margin: 0, fontSize: '14px', color: '#666', lineHeight: 1.45 }}>
              Choose a section to add to your profile. You can remove sections from the profile card anytime.
            </p>
            <div style={{ padding: '16px 22px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {SECTION_CATALOG.map((entry) => {
                const already = (profile.extraSections || []).some((s) => s.type === entry.type);
                const Icon = entry.Icon;
                return (
                  <button
                    key={entry.type}
                    type="button"
                    disabled={already}
                    onClick={() => !already && addExtraSection(entry)}
                    style={{
                      display: 'flex',
                      gap: '14px',
                      alignItems: 'flex-start',
                      textAlign: 'left',
                      padding: '14px 16px',
                      borderRadius: '12px',
                      border: `1px solid ${already ? '#e8e8e8' : '#CCE4F7'}`,
                      background: already ? '#fafafa' : '#fff',
                      cursor: already ? 'not-allowed' : 'pointer',
                      opacity: already ? 0.65 : 1,
                      fontFamily: 'inherit',
                    }}
                  >
                    <div
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '10px',
                        background: '#F3F2F0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#0A66C2',
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '15px', color: '#000000e6' }}>
                        {entry.label}
                        {already ? <span style={{ fontWeight: 500, color: '#666', marginLeft: '8px' }}>(added)</span> : null}
                      </div>
                      <div style={{ fontSize: '13px', color: '#666', marginTop: '4px', lineHeight: 1.4 }}>{entry.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {/* Expanded Edit Profile Modal (Schema 4.1 Compliant) */}
      {isEditing && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', width: '700px', borderRadius: '8px', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e0e0df', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <h2 style={{ fontSize: '20px', fontWeight: '400' }}>Edit Schema Profile Attributes</h2>
               <button onClick={() => setIsEditing(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><FaTimes size={24} color="#666" /></button>
            </div>
            
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
               
               <div style={{ display: 'flex', gap: '16px' }}>
                  <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: '#666' }}>
                    First Name*
                    <input type="text" value={editForm.firstName} onChange={e => setEditForm({...editForm, firstName: e.target.value})} style={{ padding: '8px', border: '1px solid #000000e6', borderRadius: '4px', fontSize: '14px' }} />
                  </label>
                  <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: '#666' }}>
                    Last Name*
                    <input type="text" value={editForm.lastName} onChange={e => setEditForm({...editForm, lastName: e.target.value})} style={{ padding: '8px', border: '1px solid #000000e6', borderRadius: '4px', fontSize: '14px' }} />
                  </label>
               </div>
               
               <div style={{ display: 'flex', gap: '16px' }}>
                  <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: '#666' }}>
                    Email Address
                    <input type="email" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} style={{ padding: '8px', border: '1px solid #000000e6', borderRadius: '4px', fontSize: '14px' }} />
                  </label>
                  <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: '#666' }}>
                    Phone Number
                    <input type="text" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} style={{ padding: '8px', border: '1px solid #000000e6', borderRadius: '4px', fontSize: '14px' }} />
                  </label>
               </div>

               <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: '#666' }}>
                  Location (City/State/Country)*
                  <input type="text" value={editForm.location} onChange={e => setEditForm({...editForm, location: e.target.value})} style={{ padding: '8px', border: '1px solid #000000e6', borderRadius: '4px', fontSize: '14px' }} />
               </label>
               
               <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: '#666' }}>
                  Headline
                  <textarea value={editForm.headline} onChange={e => setEditForm({...editForm, headline: e.target.value})} style={{ padding: '8px', border: '1px solid #000000e6', borderRadius: '4px', fontSize: '14px', minHeight: '60px', fontFamily: 'inherit' }} />
               </label>
               
               <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: '#666' }}>
                  About / Summary
                  <textarea value={editForm.about} onChange={e => setEditForm({...editForm, about: e.target.value})} style={{ padding: '8px', border: '1px solid #000000e6', borderRadius: '4px', fontSize: '14px', minHeight: '100px', fontFamily: 'inherit' }} />
               </label>

               <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: '#666' }}>
                  Skills List (Comma separated)
                  <input type="text" value={editForm.skills} onChange={e => setEditForm({...editForm, skills: e.target.value})} style={{ padding: '8px', border: '1px solid #000000e6', borderRadius: '4px', fontSize: '14px' }} />
               </label>
               
               <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: '#666' }}>
                    Profile photo (upload)
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        handleMemberPhoto(e.target.files);
                        e.target.value = '';
                      }}
                      style={{ padding: '8px', border: '1px dashed #000000e6', borderRadius: '4px', fontSize: '14px' }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: '#666' }}>
                    Or paste image URL
                    <input type="text" value={editForm.profilePhotoUrl?.startsWith('data:') ? '' : editForm.profilePhotoUrl} onChange={e => setEditForm({...editForm, profilePhotoUrl: e.target.value})} placeholder="https://…" style={{ padding: '8px', border: '1px solid #000000e6', borderRadius: '4px', fontSize: '14px' }} />
                  </label>
                  <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: '#666' }}>
                    Resume Upload (PDF/Text)
                    <input type="file" style={{ padding: '8px', border: '1px dashed #000000e6', borderRadius: '4px', fontSize: '14px' }} />
                  </label>
               </div>
            </div>
            
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e0e0df', display: 'flex', justifyContent: 'flex-end', backgroundColor: '#f3f2ef', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px' }}>
               <button onClick={handleSave} style={{ backgroundColor: '#0A66C2', color: '#fff', border: 'none', borderRadius: '24px', padding: '8px 24px', fontWeight: '600', cursor: 'pointer', fontSize: '16px' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Profile;
