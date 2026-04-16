import { useState } from 'react';
import ConnectionCard from '../../components/member/ConnectionCard';
import EmptyState from '../../components/shared/EmptyState';
import toast from 'react-hot-toast';

const recruiterConnections = [
  { id: 'rc-1', name: 'James Wilson', headline: 'Full Stack Developer', avatar: 'https://randomuser.me/api/portraits/men/11.jpg', connected: true },
  { id: 'rc-2', name: 'Sarah Davis', headline: 'Senior Frontend Engineer', avatar: 'https://randomuser.me/api/portraits/women/12.jpg', connected: true },
  { id: 'rc-3', name: 'Michael Kim', headline: 'Software Engineer', avatar: 'https://randomuser.me/api/portraits/men/13.jpg', connected: true },
];

const recruiterPending = [
  { id: 'rp-1', name: 'Emily Turner', headline: 'Backend Developer', avatar: 'https://randomuser.me/api/portraits/women/14.jpg', connected: false },
];

export default function RecruiterConnections() {
  const [tab, setTab] = useState('connections');
  const [connections, setConnections] = useState(recruiterConnections);
  const [pending, setPending] = useState(recruiterPending);

  const handleAccept = (id) => {
    const req = pending.find((r) => r.id === id);
    if (req) {
      setConnections([...connections, { ...req, connected: true }]);
      setPending(pending.filter((r) => r.id !== id));
      toast.success(`Connected with ${req.name}!`);
    }
  };

  const handleReject = (id) => {
    setPending(pending.filter((r) => r.id !== id));
    toast.success('Request ignored');
  };

  const handleRemove = (id) => {
    const conn = connections.find((c) => c.id === id);
    if (!window.confirm(`Remove ${conn?.name} from your connections?`)) return;
    setConnections(connections.filter((c) => c.id !== id));
    toast.success('Connection removed');
  };

  const tabClass = (t) =>
    `px-4 py-2 rounded-full text-sm font-medium transition-colors ${t === tab ? 'bg-linkedin text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Recruiter Network</h1>
      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('connections')} className={tabClass('connections')}>Connections ({connections.length})</button>
        <button onClick={() => setTab('pending')} className={tabClass('pending')}>Pending ({pending.length})</button>
      </div>

      {tab === 'connections' ? (
        connections.length === 0 ? <EmptyState title="No connections yet" /> : (
          <div className="space-y-3">
            {connections.map((c) => <ConnectionCard key={c.id} connection={c} onRemove={handleRemove} />)}
          </div>
        )
      ) : (
        pending.length === 0 ? <EmptyState title="No pending requests" /> : (
          <div className="space-y-3">
            {pending.map((r) => <ConnectionCard key={r.id} connection={r} onAccept={handleAccept} onReject={handleReject} />)}
          </div>
        )
      )}
    </div>
  );
}
