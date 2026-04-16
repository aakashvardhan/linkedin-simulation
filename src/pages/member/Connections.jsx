import { useState } from 'react';
import { mockConnections, mockPendingRequests } from '../../data/mockConnections';
import ConnectionCard from '../../components/member/ConnectionCard';
import EmptyState from '../../components/shared/EmptyState';
import toast from 'react-hot-toast';

export default function Connections() {
  const [tab, setTab] = useState('connections');
  const [connections, setConnections] = useState(mockConnections);
  const [pending, setPending] = useState(mockPendingRequests);

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
      <h1 className="text-2xl font-bold text-gray-800 mb-6">My Network</h1>
      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('connections')} className={tabClass('connections')}>
          Connections ({connections.length})
        </button>
        <button onClick={() => setTab('pending')} className={tabClass('pending')}>
          Pending Requests ({pending.length})
        </button>
      </div>

      {tab === 'connections' ? (
        connections.length === 0 ? (
          <EmptyState title="No connections yet" message="Start connecting with people" />
        ) : (
          <div className="space-y-3">
            {connections.map((c) => <ConnectionCard key={c.id} connection={c} onRemove={handleRemove} />)}
          </div>
        )
      ) : (
        pending.length === 0 ? (
          <EmptyState title="No pending requests" message="You're all caught up!" />
        ) : (
          <div className="space-y-3">
            {pending.map((r) => (
              <ConnectionCard key={r.id} connection={r} onAccept={handleAccept} onReject={handleReject} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
