import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMockData } from '../context/MockDataContext';
import { FaMapMarkerAlt, FaGraduationCap, FaBriefcase, FaCode, FaUserPlus, FaEnvelope } from 'react-icons/fa';

function Avatar({ name, size = 80 }) {
  const initials = (name || 'M')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: '#0A66C2', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="card" style={{ padding: '20px 24px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        {Icon && <Icon size={16} color="#0A66C2" />}
        <h2 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

const MemberProfile = () => {
  const { memberId } = useParams();
  const { api, connections, requestConnection, openConversationWith, userProfile } = useMockData();
  const navigate = useNavigate();

  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!memberId) return;
    setLoading(true);
    setError(null);
    api.members.get({ member_id: Number(memberId) })
      .then((data) => {
        const unwrapped = (data?.status === 'success' && data?.data) ? data.data : data;
        setMember(unwrapped?.member || unwrapped);
      })
      .catch(() => setError('Could not load profile.'))
      .finally(() => setLoading(false));
  }, [api, memberId]);

  const isOwnProfile = String(userProfile?.member_id ?? userProfile?.id) === String(memberId);
  const connState = connections.find((c) => String(c.id) === String(memberId));
  const connStatus = connState?.status ?? 'none';

  const handleConnect = () => {
    if (connStatus === 'none') {
      const fullNameLocal = member ? [member.first_name, member.last_name].filter(Boolean).join(' ') : 'Member';
      requestConnection(Number(memberId), { name: fullNameLocal, headline: member?.headline || '' });
    }
  };

  const handleMessage = async () => {
    const fullNameLocal = member ? [member.first_name, member.last_name].filter(Boolean).join(' ') : 'Member';
    const threadId = await openConversationWith(memberId, fullNameLocal, member?.headline || '');
    navigate('/messaging', { state: { threadId } });
  };

  if (loading) {
    return (
      <div style={{ gridColumn: 'span 3', padding: '48px', textAlign: 'center', color: '#666' }}>
        Loading profile…
      </div>
    );
  }

  if (error || !member) {
    return (
      <div style={{ gridColumn: 'span 3', padding: '48px', textAlign: 'center' }}>
        <p style={{ color: '#cc0000', marginBottom: '12px' }}>{error || 'Member not found.'}</p>
        <button type="button" onClick={() => navigate(-1)} style={{ color: '#0A66C2', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}>← Go back</button>
      </div>
    );
  }

  const fullName = [member.first_name, member.last_name].filter(Boolean).join(' ') || 'Member';
  const location = [member.location_city, member.location_state, member.location_country].filter(Boolean).join(', ');

  return (
    <div style={{ gridColumn: 'span 3', maxWidth: '800px', margin: '0 auto', width: '100%', paddingBottom: '32px' }}>
      {/* Header card */}
      <div className="card" style={{ padding: 0, marginBottom: '12px', overflow: 'hidden' }}>
        <div style={{ height: '120px', background: 'linear-gradient(135deg, #004182 0%, #0A66C2 100%)' }} />
        <div style={{ padding: '0 24px 20px', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '-40px', marginBottom: '12px' }}>
            <div style={{ border: '4px solid #fff', borderRadius: '50%' }}>
              <Avatar name={fullName} size={80} />
            </div>
            {!isOwnProfile && (
              <div style={{ display: 'flex', gap: '8px', paddingBottom: '4px' }}>
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={connStatus === 'pending' || connStatus === 'connected'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 20px', borderRadius: '24px', fontWeight: '600', fontSize: '14px', cursor: connStatus === 'none' ? 'pointer' : 'default',
                    background: connStatus === 'connected' ? '#057642' : connStatus === 'pending' ? '#e0e0df' : '#0A66C2',
                    color: connStatus === 'pending' ? '#666' : '#fff', border: 'none',
                  }}
                >
                  <FaUserPlus size={14} />
                  {connStatus === 'connected' ? 'Connected' : connStatus === 'pending' ? 'Pending' : 'Connect'}
                </button>
                <button
                  type="button"
                  onClick={handleMessage}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 20px', borderRadius: '24px', fontWeight: '600', fontSize: '14px',
                    background: 'transparent', color: '#0A66C2', border: '1px solid #0A66C2', cursor: 'pointer',
                  }}
                >
                  <FaEnvelope size={13} />
                  Message
                </button>
              </div>
            )}
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', margin: '0 0 4px' }}>{fullName}</h1>
          {member.headline && <p style={{ fontSize: '15px', color: '#333', margin: '0 0 6px' }}>{member.headline}</p>}
          {location && (
            <p style={{ fontSize: '13px', color: '#666', display: 'flex', alignItems: 'center', gap: '4px', margin: 0 }}>
              <FaMapMarkerAlt size={12} /> {location}
            </p>
          )}
          {typeof member.connections_count === 'number' && (
            <p style={{ fontSize: '13px', color: '#0A66C2', marginTop: '6px', fontWeight: 600 }}>
              {member.connections_count} connection{member.connections_count !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      {/* About */}
      {member.about && (
        <Section title="About">
          <p style={{ fontSize: '14px', color: '#333', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{member.about}</p>
        </Section>
      )}

      {/* Experience */}
      {Array.isArray(member.experience) && member.experience.length > 0 && (
        <Section icon={FaBriefcase} title="Experience">
          {member.experience.map((exp, i) => (
            <div key={i} style={{ display: 'flex', gap: '14px', paddingBottom: i < member.experience.length - 1 ? '16px' : 0, marginBottom: i < member.experience.length - 1 ? '16px' : 0, borderBottom: i < member.experience.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
              <div style={{ width: 40, height: 40, borderRadius: '6px', background: '#eef3f8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FaBriefcase size={18} color="#0A66C2" />
              </div>
              <div>
                <p style={{ fontWeight: '600', fontSize: '14px', margin: '0 0 2px' }}>{exp.title}</p>
                <p style={{ fontSize: '13px', color: '#555', margin: '0 0 2px' }}>{exp.company}</p>
                {(exp.start_date || exp.end_date) && (
                  <p style={{ fontSize: '12px', color: '#888', margin: '0 0 4px' }}>
                    {exp.start_date || ''}{exp.start_date && exp.end_date ? ' – ' : ''}{exp.end_date || (exp.start_date ? 'Present' : '')}
                  </p>
                )}
                {exp.description && <p style={{ fontSize: '13px', color: '#555', margin: 0, lineHeight: 1.5 }}>{exp.description}</p>}
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Education */}
      {Array.isArray(member.education) && member.education.length > 0 && (
        <Section icon={FaGraduationCap} title="Education">
          {member.education.map((edu, i) => (
            <div key={i} style={{ display: 'flex', gap: '14px', paddingBottom: i < member.education.length - 1 ? '16px' : 0, marginBottom: i < member.education.length - 1 ? '16px' : 0, borderBottom: i < member.education.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
              <div style={{ width: 40, height: 40, borderRadius: '6px', background: '#eef3f8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FaGraduationCap size={18} color="#0A66C2" />
              </div>
              <div>
                <p style={{ fontWeight: '600', fontSize: '14px', margin: '0 0 2px' }}>{edu.school}</p>
                {edu.degree && <p style={{ fontSize: '13px', color: '#555', margin: '0 0 2px' }}>{edu.degree}{edu.field ? `, ${edu.field}` : ''}</p>}
                {(edu.start_year || edu.end_year) && (
                  <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>{edu.start_year || ''}{edu.start_year && edu.end_year ? ' – ' : ''}{edu.end_year || ''}</p>
                )}
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Skills */}
      {Array.isArray(member.skills) && member.skills.length > 0 && (
        <Section icon={FaCode} title="Skills">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {member.skills.map((skill) => (
              <span key={skill} style={{ background: '#eef3f8', color: '#0A66C2', fontSize: '13px', fontWeight: '500', padding: '4px 12px', borderRadius: '16px', border: '1px solid #d0e3f5' }}>
                {skill}
              </span>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
};

export default MemberProfile;
