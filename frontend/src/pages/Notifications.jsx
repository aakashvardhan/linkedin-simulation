import React from 'react';
import RightSidebar from '../components/RightSidebar';

const Notifications = () => {
  return (
    <>
      <div className="left-sidebar" style={{ gridColumn: 'span 1' }}>
        <div className="card" style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Manage your Notifications</h3>
          <p style={{ fontSize: '14px', color: '#0A66C2', fontWeight: '600', cursor: 'pointer' }}>View Settings</p>
        </div>
      </div>
      <div className="main-feed" style={{ gridColumn: 'span 1' }}>
        <div className="card">
          <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', borderBottom: '1px solid #e0e0df' }}>
            <button style={{ padding: '6px 12px', borderRadius: '16px', backgroundColor: '#004182', color: '#fff', fontWeight: '600', border: 'none' }}>All</button>
            <button style={{ padding: '6px 12px', borderRadius: '16px', backgroundColor: 'transparent', color: '#666', fontWeight: '600', border: '1px solid #666' }}>My posts</button>
            <button style={{ padding: '6px 12px', borderRadius: '16px', backgroundColor: 'transparent', color: '#666', fontWeight: '600', border: '1px solid #666' }}>Mentions</button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[1, 2, 3, 4, 5].map(idx => (
              <div key={idx} style={{ display: 'flex', gap: '16px', padding: '16px', alignItems: 'flex-start', borderBottom: '1px solid #e0e0df', backgroundColor: idx < 3 ? '#e0f0fa44' : '#fff', cursor: 'pointer' }}>
                <img src={`https://ui-avatars.com/api/?name=User+${idx}&background=random&color=fff&size=48`} alt="User" style={{ borderRadius: '50%' }}/>
                <div style={{ flex: 1, fontSize: '14px' }}>
                  <p><strong style={{ color: '#000' }}>User {idx}</strong> and 5 others viewed your profile.</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#666' }}>{idx}h</span>
                  <span style={{ fontSize: '16px', color: '#666', cursor: 'pointer' }}>&bull;&bull;&bull;</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <RightSidebar />
    </>
  );
};

export default Notifications;
