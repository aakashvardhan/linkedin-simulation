import React from 'react';
import { FaInfoCircle } from 'react-icons/fa';
import './RightSidebar.css';

const RightSidebar = () => {
  return (
    <div className="right-sidebar">
      <div className="card news-card">
        <div className="news-header">
          <h2>linkedlnDS News</h2>
          <FaInfoCircle size={14} color="#00000099" cursor="pointer" />
        </div>
        
        <ul className="news-list">
          <li>
            <div className="news-item">
              <span className="bullet">&bull;</span>
              <div className="news-content">
                <h4>Tech hiring on the rise</h4>
                <p>Top news &bull; 10,432 readers</p>
              </div>
            </div>
          </li>
          <li>
            <div className="news-item">
              <span className="bullet">&bull;</span>
              <div className="news-content">
                <h4>AI tools transforming workflows</h4>
                <p>1d ago &bull; 8,211 readers</p>
              </div>
            </div>
          </li>
          <li>
            <div className="news-item">
              <span className="bullet">&bull;</span>
              <div className="news-content">
                <h4>The return to office debate</h4>
                <p>2d ago &bull; 5,600 readers</p>
              </div>
            </div>
          </li>
          <li>
            <div className="news-item">
              <span className="bullet">&bull;</span>
              <div className="news-content">
                <h4>Funding for startups rebounds</h4>
                <p>3d ago &bull; 3,240 readers</p>
              </div>
            </div>
          </li>
        </ul>

        <button className="show-more-btn">
          Show more <span className="arrow-down">▼</span>
        </button>
      </div>

      <div className="card ad-card">
        <p className="ad-text">Ad &bull; &bull; &bull;</p>
        <p className="ad-slogan">Master Agentic AI Today!</p>
        <div className="ad-content">
          <img src="https://ui-avatars.com/api/?name=User&background=0A66C2&color=fff&size=50" alt="User" className="ad-user" />
          <img src="https://ui-avatars.com/api/?name=linkedln+DS&background=004182&color=fff&size=50" alt="linkedlnDS" className="ad-company" />
        </div>
        <p className="ad-description">John, unlock your full potential with new skills.</p>
        <button className="ad-btn">Follow</button>
      </div>

      {/* Footer links removed to keep UI clean */}
    </div>
  );
};

export default RightSidebar;
