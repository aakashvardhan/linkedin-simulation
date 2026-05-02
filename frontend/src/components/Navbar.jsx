import React, { useState, useEffect, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  useMockData,
  memberProfilePhotoKey,
  recruiterProfilePhotoKey,
  PROFILE_PHOTO_UPDATED,
} from '../context/MockDataContext';
import { FaSearch, FaHome, FaUserFriends, FaBriefcase, FaBell, FaChartBar, FaClipboardList } from 'react-icons/fa';
import { BrandMark } from './BrandMark';
import { AiFillMessage } from 'react-icons/ai';
import { CgProfile } from 'react-icons/cg';
import './Navbar.css';

const Navbar = () => {
  const { userRole, userProfile, logout } = useMockData();
  const location = useLocation();
  const [photoTick, setPhotoTick] = useState(0);
  const meLabel = userProfile?.displayName?.split(' ')[0] || 'Me';
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

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
          <div className="navbar-search">
            <FaSearch className="search-icon" size={14} color="#666666" />
            <input type="text" placeholder="Search" />
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
