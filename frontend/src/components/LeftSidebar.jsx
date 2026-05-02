import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { FaBookmark } from 'react-icons/fa';
import {
  useMockData,
  memberProfilePhotoKey,
  recruiterProfilePhotoKey,
  PROFILE_PHOTO_UPDATED,
} from '../context/MockDataContext';
import './LeftSidebar.css';

const LeftSidebar = () => {
  const { userProfile, userRole } = useMockData();
  const profilePath = userRole === 'RECRUITER' ? '/recruiter/profile' : '/in/me';
  const location = useLocation();
  const [photoTick, setPhotoTick] = useState(0);

  useEffect(() => {
    const fn = () => setPhotoTick((t) => t + 1);
    window.addEventListener(PROFILE_PHOTO_UPDATED, fn);
    return () => window.removeEventListener(PROFILE_PHOTO_UPDATED, fn);
  }, []);

  const displayName = userProfile?.displayName?.trim() || 'Your profile';
  const headline = userProfile?.headline?.trim() || 'Add a headline in your profile';

  const avatarSrc = useMemo(() => {
    const email = userProfile?.email;
    if (!email) return null;
    try {
      const key =
        userRole === 'RECRUITER' ? recruiterProfilePhotoKey(email) : memberProfilePhotoKey(email);
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }, [userProfile?.email, userRole, location.pathname, photoTick]);

  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0A66C2&color=fff&size=128`;

  return (
    <div className="left-sidebar">
      {/* Profile Card */}
      <div className="card profile-card">
        <div className="profile-cover"></div>
        <div className="profile-info">
          <NavLink to="/in/me" className="profile-avatar" title="View profile — add or change photo there" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
            <img src={avatarSrc || fallbackAvatar} alt="" />
          </NavLink>
          <h2 className="profile-name">{displayName}</h2>
          <p className="profile-headline">{headline}</p>
          <NavLink to={profilePath} style={{ fontSize: '12px', color: '#0A66C2', fontWeight: 600, marginTop: '6px', display: 'inline-block' }}>
            Add profile photo
          </NavLink>
        </div>
        <div className="profile-stats">
          <div className="stat-item">
            <span className="stat-label">Connections</span>
            <span className="stat-value">500+</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Who viewed your profile</span>
            <span className="stat-value">124</span>
          </div>
        </div>
        <div style={{ padding: '12px', borderBottom: '1px solid #e0e0df', textAlign: 'left', cursor: 'pointer' }}>
          <p style={{ fontSize: '12px', color: '#666' }}>Unlock your full potential with Premium</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
            <div style={{ width: '12px', height: '12px', backgroundColor: '#e7a33e', borderRadius: '2px' }}></div>
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#000000e6' }}>Try Premium for $0</span>
          </div>
        </div>
        <div className="profile-saved-items">
          <FaBookmark size={14} color="#666" />
          <span>My items</span>
        </div>
      </div>

      {/* Recent & Groups Card */}
      <div className="card recent-card" style={{ position: 'sticky', top: '76px' }}>
        <p className="recent-title">Recent</p>
        <ul className="recent-list">
          <li># frontenddevelopment</li>
          <li># reactjs</li>
          <li># softwareengineering</li>
          <li># careers</li>
        </ul>
        <br/>
        <p className="recent-title text-blue">Groups</p>
        <p className="recent-title text-blue">Events</p>
      </div>
    </div>
  );
};

export default LeftSidebar;
