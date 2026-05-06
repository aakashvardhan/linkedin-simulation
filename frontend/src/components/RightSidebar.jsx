import React, { useEffect, useState } from 'react';
import { FaInfoCircle } from 'react-icons/fa';
import { useMockData } from '../context/MockDataContext';
import { makeApi } from '../api';
import './RightSidebar.css';

const HN_TOP_STORIES = 'https://hacker-news.firebaseio.com/v0/topstories.json';
const HN_ITEM = (id) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;

function timeAgo(unixSecs) {
  const diff = Math.floor(Date.now() / 1000) - unixSecs;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const RightSidebar = () => {
  const { jobs, authToken } = useMockData();
  const [news, setNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [promotedJob, setPromotedJob] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(HN_TOP_STORIES)
      .then((r) => r.json())
      .then(async (ids) => {
        const top = ids.slice(0, 8);
        const items = await Promise.all(
          top.map((id) => fetch(HN_ITEM(id)).then((r) => r.json()))
        );
        if (!cancelled) {
          setNews(items.filter((i) => i && i.title));
          setNewsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setNewsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (jobs && jobs.length > 0) {
      const pick = jobs[Math.floor(Math.random() * jobs.length)];
      setPromotedJob(pick);
      return;
    }
    const api = makeApi({ getAuthToken: () => authToken });
    api.jobs.search({ query: '', page: 1, page_size: 5 })
      .then((res) => {
        const list = res?.jobs ?? res ?? [];
        if (list.length > 0) setPromotedJob(list[Math.floor(Math.random() * list.length)]);
      })
      .catch(() => {});
  }, [jobs, authToken]);

  const visibleNews = showAll ? news : news.slice(0, 4);

  return (
    <div className="right-sidebar">
      <div className="card news-card">
        <div className="news-header">
          <h2>linkedlnDS News</h2>
          <FaInfoCircle size={14} color="#00000099" cursor="pointer" />
        </div>

        {newsLoading ? (
          <p style={{ fontSize: '12px', color: '#888', padding: '8px 0' }}>Loading…</p>
        ) : news.length === 0 ? (
          <p style={{ fontSize: '12px', color: '#888', padding: '8px 0' }}>Could not load news.</p>
        ) : (
          <ul className="news-list">
            {visibleNews.map((item) => (
              <li key={item.id}>
                <div className="news-item">
                  <span className="bullet">&bull;</span>
                  <div className="news-content">
                    <h4>
                      <a href={item.url || `https://news.ycombinator.com/item?id=${item.id}`}
                        target="_blank" rel="noreferrer"
                        style={{ color: 'inherit', textDecoration: 'none' }}>
                        {item.title}
                      </a>
                    </h4>
                    <p>{timeAgo(item.time)} &bull; {(item.score || 0).toLocaleString()} points</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {news.length > 4 && (
          <button className="show-more-btn" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show less ▲' : 'Show more ▼'}
          </button>
        )}
      </div>

      <div className="card ad-card">
        <p className="ad-text">Ad &bull; &bull; &bull;</p>
        {promotedJob ? (
          <>
            <p className="ad-slogan">{promotedJob.title}</p>
            <div className="ad-content">
              <img
                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(promotedJob.company || 'Co')}&background=004182&color=fff&size=50`}
                alt={promotedJob.company}
                className="ad-company"
              />
            </div>
            <p className="ad-description">
              {promotedJob.company}{promotedJob.location ? ` · ${promotedJob.location}` : ''}
              {promotedJob.type ? ` · ${promotedJob.type}` : ''}
            </p>
            <button className="ad-btn">View Job</button>
          </>
        ) : (
          <>
            <p className="ad-slogan">Explore open roles</p>
            <p className="ad-description">Find your next opportunity on linkedlnDS.</p>
            <button className="ad-btn">Browse Jobs</button>
          </>
        )}
      </div>
    </div>
  );
};

export default RightSidebar;
