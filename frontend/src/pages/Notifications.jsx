import React, { useState, useEffect, useMemo } from 'react';
import {
  FaUserPlus, FaHandshake, FaEye, FaFileAlt,
  FaThumbsUp, FaComment, FaBriefcase, FaBell,
  FaCheckCircle, FaTimesCircle, FaHourglassHalf, FaStar,
} from 'react-icons/fa';
import { useMockData } from '../context/MockDataContext';
import RightSidebar from '../components/RightSidebar';

const FILTERS = ['All', 'My posts', 'Jobs', 'Connections'];

const STATUS_COLORS = {
  submitted: '#0A66C2',
  reviewing: '#c37d16',
  interview: '#378fe9',
  offer:     '#057642',
  rejected:  '#cc0000',
  other:     '#666666',
};

const STATUS_ICONS = {
  reviewing: FaHourglassHalf,
  interview: FaCheckCircle,
  offer:     FaStar,
  rejected:  FaTimesCircle,
  other:     FaFileAlt,
};

const STATUS_LABELS = {
  submitted: 'Submitted',
  reviewing: 'Under Review',
  interview: 'Interview',
  offer:     'Offer Extended',
  rejected:  'Not Selected',
};

const STATUS_MESSAGES = {
  reviewing: 'is being reviewed by the hiring team',
  interview: 'has advanced to the interview stage 🎉',
  offer:     'has received an offer — congratulations! 🎊',
  rejected:  'was not selected for this position',
  other:     'has been updated',
};

function timeAgoLabel(iso) {
  if (!iso) return 'Recently';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 2)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const Notifications = () => {
  const {
    userRole, userProfile,
    incomingInvites, connections,
    posts, jobs, applicantsByJobId,
    getMemberAnalytics, api,
  } = useMockData();

  const [activeFilter, setActiveFilter] = useState('All');
  const [analyticsData, setAnalyticsData] = useState(null);
  const [myApplications, setMyApplications] = useState([]);

  const isMember = userRole === 'MEMBER';

  useEffect(() => {
    if (isMember && userProfile?.member_id) {
      getMemberAnalytics({ member_id: userProfile.member_id })
        .then(setAnalyticsData)
        .catch(() => {});

      // Fetch all applications for this member to generate per-job status notifications
      api.applications.byMember({ member_id: userProfile.member_id, page: 1, page_size: 100 })
        .then((data) => {
          setMyApplications(Array.isArray(data?.applications) ? data.applications : []);
        })
        .catch(() => {});
    }
  }, [isMember, userProfile?.member_id, getMemberAnalytics, api]);

  const notifications = useMemo(() => {
    const items = [];

    // ── 1. Incoming connection requests ──────────────────────────────────────
    incomingInvites.forEach((inv) => {
      items.push({
        id:        `inv-${inv.id}`,
        icon:      FaUserPlus,
        iconColor: '#0A66C2',
        message:   (
          <>
            <strong>{inv.name}</strong>
            {inv.headline ? ` · ${inv.headline}` : ''}
            {' '}sent you a connection request.
          </>
        ),
        timeAgo: 'Just now',
        unread:  true,
        filter:  'Connections',
      });
    });

    // ── 2. Recently accepted connections ─────────────────────────────────────
    connections
      .filter((c) => c.status === 'connected')
      .slice(0, 5)
      .forEach((conn) => {
        items.push({
          id:        `conn-${conn.id}`,
          icon:      FaHandshake,
          iconColor: '#057642',
          message:   (
            <>
              You are now connected with <strong>{conn.name}</strong>
              {conn.headline ? ` · ${conn.headline}` : ''}.
            </>
          ),
          timeAgo: 'Recently',
          unread:  false,
          filter:  'Connections',
        });
      });

    // ── 3. Profile views (member only) ────────────────────────────────────────
    if (isMember && analyticsData?.profileViewsLast30Days?.length > 0) {
      const totalViews = analyticsData.profileViewsLast30Days
        .reduce((sum, d) => sum + (d.views || 0), 0);
      if (totalViews > 0) {
        items.push({
          id:        'profile-views',
          icon:      FaEye,
          iconColor: '#004182',
          message:   (
            <>
              Your profile was viewed <strong>{totalViews} times</strong> in the last 30 days.
            </>
          ),
          timeAgo: 'Last 30 days',
          unread:  false,
          filter:  'All',
        });
      }
    }

    // ── 4. Per-application status change notifications (member only) ──────────
    if (isMember && myApplications.length > 0) {
      // Show a notification for every application whose status was changed by the recruiter
      const updatedApps = myApplications.filter(
        (app) => app.status && app.status !== 'submitted',
      );

      updatedApps.forEach((app) => {
        const statusKey = (app.status || 'other').toLowerCase();
        const color = STATUS_COLORS[statusKey] || STATUS_COLORS.other;
        const IconComp = STATUS_ICONS[statusKey] || FaFileAlt;
        const labelText = STATUS_LABELS[statusKey] || app.status;
        const actionText = STATUS_MESSAGES[statusKey] || 'has been updated';

        // Try to find the matching job in context (jobs array loaded for members)
        const job = jobs.find(
          (j) => String(j.id) === String(app.job_id) || String(j.job_id) === String(app.job_id),
        );
        const jobTitle = job?.title || `Job #${app.job_id}`;
        const company = job?.company || '';

        // Consider "unread" if updated within last 3 days (or offer/interview always unread)
        const updatedAt = app.updated_at ? new Date(app.updated_at) : null;
        const daysSince = updatedAt ? (Date.now() - updatedAt.getTime()) / 86400000 : 999;
        const isUnread = daysSince < 3 || statusKey === 'offer' || statusKey === 'interview';

        items.push({
          id:        `app-update-${app.application_id}`,
          icon:      IconComp,
          iconColor: color,
          message:   (
            <span>
              Your application for{' '}
              <strong>{jobTitle}</strong>
              {company ? ` at ${company}` : ''}{' '}
              {actionText}.{' '}
              <strong style={{ color, padding: '1px 8px', borderRadius: '10px', background: `${color}18`, fontSize: '12px' }}>
                {labelText}
              </strong>
            </span>
          ),
          timeAgo: updatedAt ? timeAgoLabel(app.updated_at) : 'Recently',
          unread:  isUnread,
          filter:  'Jobs',
        });
      });
    }

    // ── 5. New applicants (recruiter only) ────────────────────────────────────
    if (userRole === 'RECRUITER') {
      Object.entries(applicantsByJobId || {})
        .flatMap(([jobId, applicants]) =>
          (applicants || []).slice(0, 3).map((a) => ({ ...a, jobId }))
        )
        .slice(0, 10)
        .forEach((app) => {
          const job = jobs.find(
            (j) => String(j.id) === String(app.jobId) || String(j.job_id) === String(app.jobId)
          );
          items.push({
            id:        `applicant-${app.id}`,
            icon:      FaBriefcase,
            iconColor: '#0A66C2',
            message:   (
              <>
                <strong>{app.name || `${app.first_name || ''} ${app.last_name || ''}`.trim() || 'A candidate'}</strong>
                {' '}applied for{' '}
                <strong>{job?.title || `Job #${app.jobId}`}</strong>.
              </>
            ),
            timeAgo: app.appliedAgo || 'Recently',
            unread:  app.appliedAgo === 'Just now',
            filter:  'Jobs',
          });
        });
    }

    // ── 6. Post activity (likes & comments on my posts) ───────────────────────
    const myEmail = userProfile?.email;
    if (myEmail) {
      posts
        .filter((p) => p.ownerEmail === myEmail)
        .forEach((post) => {
          const snippet = post.content
            ? `"${post.content.slice(0, 60)}${post.content.length > 60 ? '…' : ''}"`
            : 'your post';

          if ((post.likes || 0) > 0) {
            items.push({
              id:        `post-like-${post.id}`,
              icon:      FaThumbsUp,
              iconColor: '#004182',
              message:   (
                <>
                  <strong>
                    {post.likes} {post.likes === 1 ? 'person' : 'people'}
                  </strong>
                  {' '}liked {snippet}.
                </>
              ),
              timeAgo: 'Recently',
              unread:  false,
              filter:  'My posts',
            });
          }

          if ((post.comments || 0) > 0) {
            items.push({
              id:        `post-comment-${post.id}`,
              icon:      FaComment,
              iconColor: '#057642',
              message:   (
                <>
                  <strong>
                    {post.comments} {post.comments === 1 ? 'person' : 'people'}
                  </strong>
                  {' '}commented on {snippet}.
                </>
              ),
              timeAgo: 'Recently',
              unread:  false,
              filter:  'My posts',
            });
          }
        });
    }

    // Sort: unread first, then preserve insertion order
    return items.sort((a, b) => (b.unread ? 1 : 0) - (a.unread ? 1 : 0));
  }, [
    incomingInvites, connections, isMember, analyticsData,
    posts, userProfile?.email, userRole, applicantsByJobId, jobs,
    myApplications,
  ]);

  const filtered = activeFilter === 'All'
    ? notifications
    : notifications.filter((n) => n.filter === activeFilter);

  const unreadCount = notifications.filter((n) => n.unread).length;

  return (
    <>
      {/* Left sidebar */}
      <div className="left-sidebar" style={{ gridColumn: 'span 1' }}>
        <div className="card" style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
            Manage your Notifications
          </h3>
          <p style={{ fontSize: '14px', color: '#0A66C2', fontWeight: '600', cursor: 'pointer' }}>
            View Settings
          </p>
        </div>
      </div>

      {/* Main content */}
      <div className="main-feed" style={{ gridColumn: 'span 1' }}>
        <div className="card">
          {/* Header */}
          <div style={{ padding: '16px', borderBottom: '1px solid #e0e0df' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>
              Notifications
              {unreadCount > 0 && (
                <span style={{
                  marginLeft: '8px',
                  fontSize: '13px',
                  backgroundColor: '#cc0000',
                  color: '#fff',
                  borderRadius: '10px',
                  padding: '2px 8px',
                  verticalAlign: 'middle',
                }}>
                  {unreadCount} new
                </span>
              )}
            </h2>
          </div>

          {/* Filter tabs */}
          <div style={{
            display: 'flex', gap: '8px',
            padding: '12px 16px', borderBottom: '1px solid #e0e0df', flexWrap: 'wrap',
          }}>
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                style={{
                  padding:         '6px 14px',
                  borderRadius:    '16px',
                  backgroundColor: activeFilter === f ? '#004182' : 'transparent',
                  color:           activeFilter === f ? '#fff' : '#555',
                  fontWeight:      '600',
                  fontSize:        '14px',
                  border:          activeFilter === f ? 'none' : '1px solid #aaa',
                  cursor:          'pointer',
                  transition:      'all 0.15s',
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Notification list */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: '#888', fontSize: '14px' }}>
                <FaBell size={36} color="#ccc" style={{ marginBottom: '12px', display: 'block', margin: '0 auto 12px' }} />
                No notifications here yet.
              </div>
            ) : (
              filtered.map((notif) => {
                const Icon = notif.icon;
                return (
                  <div
                    key={notif.id}
                    style={{
                      display:         'flex',
                      gap:             '16px',
                      padding:         '16px',
                      alignItems:      'flex-start',
                      borderBottom:    '1px solid #e0e0df',
                      backgroundColor: notif.unread ? '#e8f2fb' : '#fff',
                      cursor:          'pointer',
                      transition:      'background-color 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!notif.unread) e.currentTarget.style.backgroundColor = '#f8f8f8';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = notif.unread ? '#e8f2fb' : '#fff';
                    }}
                  >
                    {/* Icon circle */}
                    <div style={{
                      width:           '48px',
                      height:          '48px',
                      borderRadius:    '50%',
                      backgroundColor: '#f0f4f8',
                      display:         'flex',
                      alignItems:      'center',
                      justifyContent:  'center',
                      flexShrink:      0,
                    }}>
                      <Icon size={22} color={notif.iconColor} />
                    </div>

                    {/* Message */}
                    <div style={{ flex: 1, fontSize: '14px', lineHeight: '1.5' }}>
                      <p style={{ margin: 0 }}>{notif.message}</p>
                    </div>

                    {/* Time + unread dot */}
                    <div style={{
                      display:        'flex',
                      flexDirection:  'column',
                      alignItems:     'flex-end',
                      gap:            '6px',
                      flexShrink:     0,
                    }}>
                      <span style={{ fontSize: '12px', color: '#666', whiteSpace: 'nowrap' }}>
                        {notif.timeAgo}
                      </span>
                      {notif.unread && (
                        <span style={{
                          width:           '10px',
                          height:          '10px',
                          borderRadius:    '50%',
                          backgroundColor: '#0A66C2',
                          display:         'block',
                        }} />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <RightSidebar />
    </>
  );
};

export default Notifications;
