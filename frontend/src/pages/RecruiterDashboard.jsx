import React, { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import { useMockData } from '../context/MockDataContext';

const RecruiterDashboard = () => {
  const { getRecruiterAnalytics } = useMockData();
  const [window, setWindow] = useState('month');
  const [selectedJobId, setSelectedJobId] = useState('all');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getRecruiterAnalytics({ window, job_id: selectedJobId === 'all' ? undefined : selectedJobId })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getRecruiterAnalytics, window, selectedJobId]);

  const topJobsData = data?.topJobsByApplicationsMonth || [];
  const cityData = data?.cityWiseApplicationsMonth || [];
  const lowTraction = data?.lowTractionJobs || [];
  const clicksPerJob = data?.clicksPerJob || [];
  const savedSeries = data?.savedJobsSeries || [];

  const jobOptions = useMemo(() => {
    const fromTop = topJobsData.map((j) => ({ id: j.job_id || j.id || j.title, label: j.title }));
    const unique = new Map();
    for (const opt of fromTop) unique.set(String(opt.id), opt);
    return [{ id: 'all', label: 'All jobs' }, ...Array.from(unique.values())];
  }, [topJobsData]);

  return (
    <div style={{ gridColumn: 'span 3', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="card" style={{ padding: '24px' }}>
         <h1 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>Recruiter Dashboard</h1>
         <p style={{ color: '#666', fontSize: '14px' }}>Insights for your job postings and applicants.</p>

         <div style={{ display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
           <select value={window} onChange={(e) => setWindow(e.target.value)} style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #e0e0df' }}>
             <option value="month">This month</option>
             <option value="week">This week</option>
           </select>
           <select value={selectedJobId} onChange={(e) => setSelectedJobId(e.target.value)} style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #e0e0df', minWidth: '220px' }}>
             {jobOptions.map((o) => (
               <option key={String(o.id)} value={String(o.id)}>{o.label}</option>
             ))}
           </select>
           {loading && <span style={{ color: '#666', fontSize: '13px', alignSelf: 'center' }}>Loading…</span>}
         </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        
        {/* Top Jobs Bar Chart */}
        <div className="card" style={{ padding: '24px', height: '350px', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', textAlign: 'center' }}>Top 10 job postings by applications</h2>
          <div style={{ flex: 1, width: '100%', minHeight: 0 }}>
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={topJobsData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                 <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                 <XAxis type="number" />
                 <YAxis dataKey="title" type="category" width={100} tick={{ fontSize: 12 }} />
                 <RechartsTooltip cursor={{fill: '#f3f2ef'}} />
                 <Bar dataKey="count" fill="#0A66C2" radius={[0, 4, 4, 0]} />
               </BarChart>
             </ResponsiveContainer>
          </div>
        </div>

        {/* City Wise Pie Chart */}
        <div className="card" style={{ padding: '24px', height: '350px', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', textAlign: 'center' }}>City-wise applications (selected job)</h2>
          <div style={{ flex: 1, width: '100%', minHeight: 0 }}>
             <ResponsiveContainer width="100%" height="100%">
               <PieChart>
                 <Pie data={cityData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" stroke="none">
                   {cityData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                 </Pie>
                 <RechartsTooltip />
                 <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
               </PieChart>
             </ResponsiveContainer>
          </div>
        </div>

        {/* Low Traction */}
        <div className="card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Top 5 jobs with the fewest applications</h2>
          <ul style={{ listStyle: 'none' }}>
            {lowTraction.map((j, idx) => (
              <li key={`${j.title}-${idx}`} style={{ padding: '12px 0', borderBottom: idx < lowTraction.length - 1 ? '1px solid #e0e0df' : 'none', fontSize: '14px', display: 'flex', justifyContent: 'space-between' }}>
                <span>{j.title}</span> <span style={{ color: '#d11124', fontWeight: '600' }}>{j.applicants} applicants</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Engagement Analytics */}
        <div className="card" style={{ padding: '24px', height: '350px', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', textAlign: 'center' }}>Clicks per job posting</h2>
          <div style={{ flex: 1, width: '100%', minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={clicksPerJob} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="title" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={48} />
                <YAxis tick={{ fontSize: 12 }} />
                <RechartsTooltip cursor={{ fill: '#f3f2ef' }} />
                <Bar dataKey="clicks" fill="#0A66C2" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card" style={{ padding: '24px', height: '350px', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', textAlign: 'center' }}>Saved jobs (day/week)</h2>
          <div style={{ flex: 1, width: '100%', minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={savedSeries} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <RechartsTooltip />
                <Line type="monotone" dataKey="saves" stroke="#004182" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecruiterDashboard;
