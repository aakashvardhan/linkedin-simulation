import React, { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaSearch, FaMapMarkerAlt, FaCode, FaUserPlus, FaCheck,
  FaClock, FaSpinner, FaUsers,
} from 'react-icons/fa';
import { useMockData } from '../context/MockDataContext';

const SKILL_SUGGESTIONS = [
  'Python', 'JavaScript', 'React', 'SQL', 'Machine Learning', 'Data Science',
  'Java', 'AWS', 'Docker', 'Kubernetes', 'TypeScript', 'Node.js', 'Spark',
  'Tableau', 'TensorFlow', 'Pandas', 'Kafka', 'MongoDB', 'PostgreSQL', 'Go',
];

function ConnectBtn({ member, connections, requestConnection }) {
  const stateId = member.member_id;
  const conn = connections.find((c) => String(c.id) === String(stateId));
  const status = conn?.status ?? 'none';

  if (status === 'connected') {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#057642', fontWeight: 600 }}>
        <FaCheck size={12} /> Connected
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#c37d16', fontWeight: 600 }}>
        <FaClock size={12} /> Pending
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => requestConnection(stateId, { name: `${member.first_name} ${member.last_name}` })}
      style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '6px 14px', borderRadius: '16px',
        border: '1px solid #0A66C2', background: 'transparent',
        color: '#0A66C2', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
      }}
    >
      <FaUserPlus size={12} /> Connect
    </button>
  );
}

const TalentSearch = () => {
  const navigate = useNavigate();
  const { api, connections, requestConnection, userProfile } = useMockData();

  const [keyword, setKeyword] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [locationState, setLocationState] = useState('');
  const [skillInput, setSkillInput] = useState('');
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const skillRef = useRef(null);

  const [results, setResults] = useState([]);
  const [totalCount, setTotalCount] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const PAGE_SIZE = 12;

  const filteredSuggestions = SKILL_SUGGESTIONS.filter(
    (s) =>
      !selectedSkills.includes(s) &&
      s.toLowerCase().includes(skillInput.toLowerCase()) &&
      skillInput.trim() !== '',
  );

  const addSkill = (skill) => {
    if (!selectedSkills.includes(skill)) {
      setSelectedSkills((prev) => [...prev, skill]);
    }
    setSkillInput('');
    setShowSuggestions(false);
  };

  const removeSkill = (skill) => setSelectedSkills((prev) => prev.filter((s) => s !== skill));

  const handleSkillKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && skillInput.trim()) {
      e.preventDefault();
      addSkill(skillInput.trim());
    }
  };

  const doSearch = useCallback(async (pg = 1) => {
    setLoading(true);
    setSearched(true);
    try {
      const payload = {
        page: pg,
        page_size: PAGE_SIZE,
      };
      if (keyword.trim()) payload.keyword = keyword.trim();
      if (selectedSkills.length > 0) payload.skills = selectedSkills;
      if (locationCity.trim()) payload.location_city = locationCity.trim();
      if (locationState.trim()) payload.location_state = locationState.trim();

      const data = await api.members.search(payload);
      setResults(Array.isArray(data?.members) ? data.members : []);
      setTotalCount(data?.total_count ?? 0);
      setTotalPages(data?.total_pages ?? 1);
      setPage(pg);
    } catch {
      setResults([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [api, keyword, selectedSkills, locationCity, locationState]);

  const handleSubmit = (e) => {
    e.preventDefault();
    doSearch(1);
  };

  const myId = userProfile?.member_id ?? userProfile?.recruiter_id;

  return (
    <div style={{ gridColumn: 'span 3', display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '40px' }}>

      {/* Header */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(145deg,#cfe8ff,#e8f4ff)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FaUsers size={20} color="#0A66C2" />
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', margin: 0, color: '#191919' }}>Talent Search</h1>
            <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>Find candidates by skill, location, or keyword</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Row 1: keyword + location */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: '200px', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#eef3f8', padding: '0 12px', borderRadius: '6px' }}>
              <FaSearch color="#666" size={14} />
              <input
                type="text"
                placeholder="Name, headline, or keyword…"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                style={{ border: 'none', background: 'transparent', padding: '11px 0', width: '100%', outline: 'none', fontSize: '14px' }}
              />
            </div>
            <div style={{ flex: 1, minWidth: '140px', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#eef3f8', padding: '0 12px', borderRadius: '6px' }}>
              <FaMapMarkerAlt color="#666" size={14} />
              <input
                type="text"
                placeholder="City"
                value={locationCity}
                onChange={(e) => setLocationCity(e.target.value)}
                style={{ border: 'none', background: 'transparent', padding: '11px 0', width: '100%', outline: 'none', fontSize: '14px' }}
              />
            </div>
            <div style={{ flex: 1, minWidth: '120px', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#eef3f8', padding: '0 12px', borderRadius: '6px' }}>
              <input
                type="text"
                placeholder="State (e.g. CA)"
                value={locationState}
                onChange={(e) => setLocationState(e.target.value)}
                style={{ border: 'none', background: 'transparent', padding: '11px 0', width: '100%', outline: 'none', fontSize: '14px' }}
              />
            </div>
          </div>

          {/* Row 2: skills */}
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', backgroundColor: '#eef3f8', padding: '8px 12px', borderRadius: '6px', minHeight: '44px' }}>
              <FaCode color="#666" size={14} style={{ flexShrink: 0 }} />
              {selectedSkills.map((s) => (
                <span key={s} style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#0A66C2', color: '#fff', borderRadius: '12px', padding: '3px 10px', fontSize: '13px', fontWeight: 600 }}>
                  {s}
                  <button type="button" onClick={() => removeSkill(s)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '0 0 0 2px', fontSize: '14px', lineHeight: 1 }}>×</button>
                </span>
              ))}
              <input
                ref={skillRef}
                type="text"
                placeholder={selectedSkills.length === 0 ? 'Add skills (press Enter or comma)…' : ''}
                value={skillInput}
                onChange={(e) => { setSkillInput(e.target.value); setShowSuggestions(true); }}
                onKeyDown={handleSkillKeyDown}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', minWidth: '160px', flex: 1 }}
              />
            </div>
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: '#fff', border: '1px solid #e0e0df', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: '4px', maxHeight: '160px', overflowY: 'auto' }}>
                {filteredSuggestions.map((s) => (
                  <button key={s} type="button" onMouseDown={() => addSkill(s)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: '#191919' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f3f2ef'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                  >{s}</button>
                ))}
              </div>
            )}
          </div>

          {/* Popular skill chips */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#666' }}>Quick add:</span>
            {['Python', 'SQL', 'Machine Learning', 'React', 'AWS', 'Java', 'Data Science'].map((s) => (
              <button key={s} type="button" onClick={() => addSkill(s)} disabled={selectedSkills.includes(s)}
                style={{ padding: '3px 10px', borderRadius: '12px', border: `1px solid ${selectedSkills.includes(s) ? '#ccc' : '#0A66C2'}`, background: 'none', color: selectedSkills.includes(s) ? '#ccc' : '#0A66C2', fontSize: '12px', cursor: selectedSkills.includes(s) ? 'default' : 'pointer', fontWeight: 600 }}
              >{s}</button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="submit" disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#0A66C2', color: '#fff', border: 'none', borderRadius: '24px', padding: '10px 28px', fontWeight: 700, fontSize: '15px', cursor: loading ? 'wait' : 'pointer' }}>
              {loading ? <FaSpinner style={{ animation: 'spin 1s linear infinite' }} /> : <FaSearch />}
              {loading ? 'Searching…' : 'Search Talent'}
            </button>
            {searched && (
              <button type="button" onClick={() => { setKeyword(''); setLocationCity(''); setLocationState(''); setSelectedSkills([]); setResults([]); setSearched(false); setTotalCount(null); }}
                style={{ backgroundColor: 'transparent', color: '#666', border: '1px solid #ccc', borderRadius: '24px', padding: '10px 20px', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}>
                Clear
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Results */}
      {searched && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>
              {loading ? 'Searching…' : totalCount != null ? <><strong style={{ color: '#191919' }}>{totalCount}</strong> candidate{totalCount !== 1 ? 's' : ''} found</> : ''}
            </p>
            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button onClick={() => doSearch(page - 1)} disabled={page <= 1 || loading}
                  style={{ padding: '6px 14px', border: '1px solid #ccc', borderRadius: '16px', background: 'none', cursor: page <= 1 ? 'not-allowed' : 'pointer', color: page <= 1 ? '#ccc' : '#0A66C2', fontWeight: 600 }}>← Prev</button>
                <span style={{ fontSize: '13px', color: '#666' }}>Page {page} of {totalPages}</span>
                <button onClick={() => doSearch(page + 1)} disabled={page >= totalPages || loading}
                  style={{ padding: '6px 14px', border: '1px solid #ccc', borderRadius: '16px', background: 'none', cursor: page >= totalPages ? 'not-allowed' : 'pointer', color: page >= totalPages ? '#ccc' : '#0A66C2', fontWeight: 600 }}>Next →</button>
              </div>
            )}
          </div>

          {!loading && results.length === 0 && (
            <div className="card" style={{ padding: '48px', textAlign: 'center', color: '#888' }}>
              <FaUsers size={40} color="#ccc" style={{ marginBottom: '12px' }} />
              <p style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 6px' }}>No candidates found</p>
              <p style={{ fontSize: '14px', margin: 0 }}>Try different keywords, skills, or a broader location.</p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {results.map((member) => {
              const name = `${member.first_name || ''} ${member.last_name || ''}`.trim() || 'Member';
              const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0A66C2&color=fff&size=56`;
              const isSelf = String(member.member_id) === String(myId);

              return (
                <div key={member.member_id} className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Top row */}
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <img
                      src={avatarUrl} alt={name}
                      style={{ width: '52px', height: '52px', borderRadius: '50%', flexShrink: 0, cursor: 'pointer' }}
                      onClick={() => navigate(`/in/${member.member_id}`)}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <button type="button" onClick={() => navigate(`/in/${member.member_id}`)}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                        <p style={{ fontSize: '15px', fontWeight: '700', color: '#0A66C2', margin: 0, lineHeight: 1.2 }}>{name}</p>
                      </button>
                      {member.headline && (
                        <p style={{ fontSize: '13px', color: '#555', margin: '3px 0 0', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {member.headline}
                        </p>
                      )}
                      {member.location_city && (
                        <p style={{ fontSize: '12px', color: '#888', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <FaMapMarkerAlt size={10} /> {member.location_city}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Skills */}
                  {member.skills?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                      {member.skills.slice(0, 6).map((sk) => (
                        <span key={sk} style={{
                          padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
                          backgroundColor: selectedSkills.includes(sk) ? '#0A66C2' : '#eef3f8',
                          color: selectedSkills.includes(sk) ? '#fff' : '#444',
                          border: selectedSkills.includes(sk) ? 'none' : '1px solid #e0e0df',
                        }}>{sk}</span>
                      ))}
                      {member.skills.length > 6 && (
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', color: '#888' }}>+{member.skills.length - 6} more</span>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: 'auto', paddingTop: '4px', borderTop: '1px solid #f0f0f0' }}>
                    <button type="button" onClick={() => navigate(`/in/${member.member_id}`)}
                      style={{ flex: 1, padding: '7px', borderRadius: '16px', border: '1px solid #ccc', background: 'none', color: '#555', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                      View Profile
                    </button>
                    {!isSelf && (
                      <ConnectBtn member={member} connections={connections} requestConnection={requestConnection} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!searched && (
        <div className="card" style={{ padding: '48px', textAlign: 'center', color: '#888' }}>
          <FaUsers size={48} color="#ccc" style={{ marginBottom: '16px' }} />
          <p style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 8px', color: '#555' }}>Search your talent pool</p>
          <p style={{ fontSize: '14px', margin: 0 }}>Filter by skills, location, or keyword to find the right candidates.</p>
        </div>
      )}

      <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default TalentSearch;
