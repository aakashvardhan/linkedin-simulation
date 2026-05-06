import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMockData } from '../context/MockDataContext';
import { FaBriefcase, FaBuilding, FaEnvelope, FaIndustry, FaUserPlus, FaCheck, FaClock } from 'react-icons/fa';

function Avatar({ name, size = 80 }) {
  const initials = (name || 'R')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: '#057642', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

const RecruiterPublicProfile = () => {
  const { recruiterId } = useParams();
  const { api, openConversationWith, connections, requestConnection, userProfile } = useMockData();
  const navigate = useNavigate();

  const [recruiter, setRecruiter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!recruiterId) return;
    setLoading(true);
    setError(null);
    api.recruiters.get({ recruiter_id: Number(recruiterId) })
      .then((data) => {
        const unwrapped = (data?.status === 'success' && data?.data) ? data.data : data;
        setRecruiter(unwrapped);
      })
      .catch(() => setError('Could not load recruiter profile.'))
      .finally(() => setLoading(false));
  }, [api, recruiterId]);

  const handleMessage = async () => {
    const fullName = recruiter ? [recruiter.first_name, recruiter.last_name].filter(Boolean).join(' ') : 'Recruiter';
    const subtitle = recruiter?.company_name ? `Recruiter at ${recruiter.company_name}` : 'Recruiter';
    const threadId = await openConversationWith(recruiterId, fullName, subtitle);
    navigate('/messaging', { state: { threadId } });
  };

  const rid = Number(recruiterId);
  const isSelf = userProfile && (Number(userProfile.recruiter_id) === rid || Number(userProfile.member_id) === rid);
  // Use namespaced key 'r-{id}' to avoid collisions with same-numbered member IDs
  const connStateKey = `r-${rid}`;
  const connEntry = connections.find((c) => String(c.id) === connStateKey || (c.userType === 'recruiter' && String(c.rawId) === String(rid)));
  const connStatus = connEntry?.status ?? 'none';

  const handleConnect = () => {
    if (connStatus !== 'none') return;
    const fullName = recruiter ? [recruiter.first_name, recruiter.last_name].filter(Boolean).join(' ') : 'Recruiter';
    requestConnection(rid, { name: fullName, headline: '' }, 'recruiter');
  };

  if (loading) {
    return (
      <div style={{ gridColumn: 'span 3', padding: '48px', textAlign: 'center', color: '#666' }}>
        Loading profile…
      </div>
    );
  }

  if (error || !recruiter) {
    return (
      <div style={{ gridColumn: 'span 3', padding: '48px', textAlign: 'center' }}>
        <p style={{ color: '#cc0000', marginBottom: '12px' }}>{error || 'Recruiter not found.'}</p>
        <button type="button" onClick={() => navigate(-1)} style={{ color: '#0A66C2', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}>← Go back</button>
      </div>
    );
  }

  const fullName = [recruiter.first_name, recruiter.last_name].filter(Boolean).join(' ') || 'Recruiter';

  return (
    <div style={{ gridColumn: 'span 3', maxWidth: '800px', margin: '0 auto', width: '100%', paddingBottom: '32px' }}>
      {/* Header card */}
      <div className="card" style={{ padding: 0, marginBottom: '12px', overflow: 'hidden' }}>
        <div style={{ height: '120px', background: 'linear-gradient(135deg, #033a16 0%, #057642 100%)' }} />
        <div style={{ padding: '0 24px 20px', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '-40px', marginBottom: '12px' }}>
            <div style={{ border: '4px solid #fff', borderRadius: '50%' }}>
              <Avatar name={fullName} size={80} />
            </div>
            <div style={{ paddingBottom: '4px', display: 'flex', gap: '8px' }}>
              {!isSelf && connStatus !== 'connected' && (
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={connStatus === 'pending'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 20px', borderRadius: '24px', fontWeight: '600', fontSize: '14px',
                    background: connStatus === 'pending' ? '#e8f4fd' : '#0A66C2',
                    color: connStatus === 'pending' ? '#0A66C2' : '#fff',
                    border: connStatus === 'pending' ? '1px solid #0A66C2' : 'none',
                    cursor: connStatus === 'pending' ? 'default' : 'pointer',
                  }}
                >
                  {connStatus === 'pending' ? <FaClock size={13} /> : <FaUserPlus size={13} />}
                  {connStatus === 'pending' ? 'Pending' : 'Connect'}
                </button>
              )}
              {!isSelf && connStatus === 'connected' && (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '8px 20px', borderRadius: '24px', fontWeight: '600', fontSize: '14px',
                  background: '#e6f4ea', color: '#057642', border: '1px solid #057642',
                }}>
                  <FaCheck size={13} /> Connected
                </span>
              )}
              <button
                type="button"
                onClick={handleMessage}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '8px 20px', borderRadius: '24px', fontWeight: '600', fontSize: '14px',
                  background: 'transparent', color: '#057642', border: '1px solid #057642', cursor: 'pointer',
                }}
              >
                <FaEnvelope size={13} />
                Message
              </button>
            </div>
          </div>

          <h1 style={{ fontSize: '22px', fontWeight: '700', margin: '0 0 4px' }}>{fullName}</h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: '#333', margin: '4px 0' }}>
            <FaBriefcase size={13} color="#057642" />
            <span>Recruiter</span>
          </div>

          {recruiter.company_name && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: '#555', margin: '4px 0' }}>
              <FaBuilding size={13} color="#666" />
              <span>{recruiter.company_name}</span>
            </div>
          )}

          {recruiter.company_industry && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#666', margin: '4px 0' }}>
              <FaIndustry size={12} color="#888" />
              <span>{recruiter.company_industry}</span>
            </div>
          )}
        </div>
      </div>

      {/* Company card */}
      {(recruiter.company_name || recruiter.company_industry || recruiter.company_size) && (
        <div className="card" style={{ padding: '20px 24px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <FaBuilding size={16} color="#057642" />
            <h2 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>Company</h2>
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '8px', background: '#e6f4ea', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <FaBuilding size={22} color="#057642" />
            </div>
            <div>
              <p style={{ fontWeight: '600', fontSize: '15px', margin: '0 0 2px' }}>{recruiter.company_name}</p>
              {recruiter.company_industry && <p style={{ fontSize: '13px', color: '#555', margin: '0 0 2px' }}>{recruiter.company_industry}</p>}
              {recruiter.company_size && <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>{recruiter.company_size} employees</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecruiterPublicProfile;
