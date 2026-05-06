import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  useMockData,
  memberProfilePhotoKey,
  recruiterProfilePhotoKey,
  PROFILE_PHOTO_UPDATED,
} from '../context/MockDataContext';
import { FaSearch, FaHome, FaUserFriends, FaBriefcase, FaBell, FaChartBar, FaClipboardList, FaUserTie } from 'react-icons/fa';
import { BrandMark } from './BrandMark';
import { AiFillMessage } from 'react-icons/ai';
import { CgProfile } from 'react-icons/cg';
import './Navbar.css';

const Navbar = () => {
  const { userRole, userProfile, logout, api } = useMockData();
  const location = useLocation();
  const navigate = useNavigate();
  const [photoTick, setPhotoTick] = useState(0);
  const meLabel = userProfile?.displayName?.split(' ')[0] || 'Me';
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) { setSearchResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    try {
      const [mRaw, rRaw] = await Promise.allSettled([
        api.members.search({ keyword: q.trim(), page: 1, page_size: 6 }),
        api.recruiters.search({ keyword: q.trim(), page: 1, page_size: 4 }),
      ]);
      const mData = mRaw.status === 'fulfilled' ? ((mRaw.value?.status === 'success' ? mRaw.value.data : mRaw.value) ?? {}) : {};
      const rData = rRaw.status === 'fulfilled' ? ((rRaw.value?.status === 'success' ? rRaw.value.data : rRaw.value) ?? {}) : {};
      const members = (Array.isArray(mData?.members) ? mData.members : []).map((m) => ({ ...m, _type: 'member' }));
      const recruiters = (Array.isArray(rData?.recruiters) ? rData.recruiters : []).map((r) => ({ ...r, _type: 'recruiter' }));
      setSearchResults([...members, ...recruiters]);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [api]);

  const handleSearchChange = (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    setSearchOpen(true);
    clearTimeout(debounceRef.current);
    if (!q.trim()) { setSearchResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    debounceRef.current = setTimeout(() => doSearch(q), 350);
  };

  useEffect(() => {
    const onClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    const onUpdate = () => setPhotoTick((t) => t + 1);
    window.addEventListener(PROFILE_PHOTO_UPDATED, onUpdate);
    return () => window.removeEventListener(PROFILE_PHOTO_UPDATED, onUpdate);
  }, []);

  const navAvatarSrc = useMemo(() => {
    if (!userProfile?.email) return null;
    try {
      const key =
        userRole === 'RECRUITER'
          ? recruiterProfilePhotoKey(userProfile.email)
          : memberProfilePhotoKey(userProfile.email);
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }, [userProfile?.email, userRole, location.pathname, photoTick]);

  const handleSignOut = () => {
    logout();
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-left">
          <NavLink to="/home" className="navbar-logo" style={{ textDecoration: 'none' }}>
            <BrandMark />
          </NavLink>
          <div className="navbar-search" ref={searchRef} style={{ position: 'relative' }}>
            <FaSearch className="search-icon" size={14} color="#666666" />
            <input
              type="text"
              placeholder="Search members…"
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => { if (searchQuery.trim()) setSearchOpen(true); }}
              autoComplete="off"
            />
            {searchOpen && (searchLoading || searchResults.length > 0 || searchQuery.trim()) && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px',
                background: '#fff', border: '1px solid #e0e0df', borderRadius: '8px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.13)', zIndex: 9999, overflow: 'hidden',
                minWidth: '280px',
              }}>
                {searchLoading && (
                  <div style={{ padding: '12px 16px', fontSize: '13px', color: '#666' }}>Searching…</div>
                )}
                {!searchLoading && searchResults.length === 0 && searchQuery.trim() && (
                  <div style={{ padding: '12px 16px', fontSize: '13px', color: '#666' }}>No members found for &quot;{searchQuery}&quot;</div>
                )}
                {!searchLoading && searchResults.map((result) => {
                  const isMember = result._type === 'member';
                  const id = isMember ? result.member_id : result.recruiter_id;
                  const name = [result.first_name, result.last_name].filter(Boolean).join(' ') || (isMember ? 'Member' : 'Recruiter');
                  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
                  const subtitle = isMember
                    ? (result.headline || result.location_city || '')
                    : `${result.company_name || ''}${result.company_industry ? ` · ${result.company_industry}` : ''}`;
                  const avatarBg = isMember ? '#0A66C2' : '#057642';
                  const path = isMember ? `/in/${id}` : `/profile/recruiter/${id}`;
                  const badge = isMember ? null : 'Recruiter';
                  return (
                    <div key={`${result._type}-${id}`} style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f6f9'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    onClick={() => {
                      setSearchOpen(false);
                      setSearchQuery('');
                      setSearchResults([]);
                      navigate(path);
                    }}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                        background: avatarBg, color: '#fff', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: '13px', fontWeight: 700,
                      }}>{initials}</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#000000e6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                          {badge && <span style={{ fontSize: '10px', background: '#e6f4ea', color: '#057642', borderRadius: '4px', padding: '1px 5px', fontWeight: 600, flexShrink: 0 }}>{badge}</span>}
                        </div>
                        <div style={{ fontSize: '12px', color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="navbar-right">
          <ul className="navbar-nav">
            {userRole === 'RECRUITER' ? (
              <>
                <li>
                  <NavLink to="/home" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                    <FaHome size={24} />
                    <span>Home</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/recruiter/dashboard" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                    <FaChartBar size={24} />
                    <span>Dashboard</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/recruiter/jobs" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                    <FaClipboardList size={24} />
                    <span>Manage Jobs</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/recruiter/talent" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                    <FaUserTie size={24} />
                    <span>Talent Search</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/network" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                    <FaUserFriends size={24} />
                    <span>Network</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/messaging" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                    <AiFillMessage size={24} />
                    <span>Messaging</span>
                  </NavLink>
                </li>
              </>
            ) : (
              <>
                <li>
                  <NavLink to="/home" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                    <FaHome size={24} />
                    <span>Home</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/network" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                    <FaUserFriends size={24} />
                    <span>My Network</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/jobs" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                    <FaBriefcase size={24} />
                    <span>Jobs</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/messaging" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                    <AiFillMessage size={24} />
                    <span>Messaging</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/notifications" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                    <FaBell size={24} />
                    <span>Notifications</span>
                  </NavLink>
                </li>
              </>
            )}

            <li className="nav-item profile-item" onClick={() => setProfileDropdownOpen(!profileDropdownOpen)} style={{ position: 'relative' }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#eef3f8',
                  flexShrink: 0,
                }}
              >
                {navAvatarSrc ? (
                  <img src={navAvatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <CgProfile size={22} />
                )}
              </div>
              <div className="profile-text">
                <span>{meLabel}</span>
                <span className="dropdown-arrow">▼</span>
              </div>
              
              {/* Profile Dropdown logic specifically showing Sign Out */}
              {profileDropdownOpen && (
                <div style={{ position: 'absolute', top: '56px', right: '-10px', background: '#fff', border: '1px solid #e0e0df', borderRadius: '8px', width: '220px', padding: '8px 0', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', cursor: 'default' }}>
                  <div style={{ padding: '8px 16px', borderBottom: '1px solid #e0e0df', display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', backgroundColor: '#eef3f8', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {navAvatarSrc ? (
                        <img src={navAvatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <CgProfile size={26} color="#666" />
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: '600', fontSize: '14px', color: '#000000e6' }}>
                      {userProfile?.displayName?.trim() || (userRole === 'RECRUITER' ? 'Recruiter' : 'Member')}
                    </p>
                    <p style={{ fontSize: '12px', color: '#666', wordBreak: 'break-all' }}>{userProfile?.email || userRole}</p>
                    </div>
                  </div>
                  {userRole !== 'RECRUITER' ? (
                    <NavLink to="/in/me" style={{ display: 'block', padding: '8px 16px', fontSize: '14px', cursor: 'pointer', color: '#666' }}>View Profile</NavLink>
                  ) : (
                    <NavLink to="/recruiter/profile" style={{ display: 'block', padding: '8px 16px', fontSize: '14px', cursor: 'pointer', color: '#666' }}>View Recruiter Profile</NavLink>
                  )}
                  <div onClick={handleSignOut} style={{ padding: '8px 16px', fontSize: '14px', cursor: 'pointer', color: '#666' }}>
                    Sign Out
                  </div>
                </div>
              )}
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
