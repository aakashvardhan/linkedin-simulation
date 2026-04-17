import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import api from '../../api/realApi';
import ConnectionCard from '../../components/member/ConnectionCard';
import EmptyState from '../../components/shared/EmptyState';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import toast from 'react-hot-toast';

export default function Connections() {
  const { user } = useAuth();
  const [tab, setTab] = useState('connections');
  const [connections, setConnections] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user?.member_id) return;
    setLoading(true);
    try {
      const [connResult, pendingResult] = await Promise.all([
        api.connections.list(user.member_id),
        api.connections.pending(user.member_id),
      ]);

      // Normalise connections → ConnectionCard shape
      setConnections(
        (connResult.connections || []).map((c) => ({
          id: c.connection_id,
          connection_id: c.connection_id,
          name: `${c.first_name} ${c.last_name}`.trim(),
          first_name: c.first_name,
          last_name: c.last_name,
          headline: c.headline,
          member_id: c.member_id,
          connected_at: c.connected_at,
        }))
      );

      // Normalise pending requests
      setPending(
        (pendingResult.requests || []).map((r) => ({
          id: r.request_id,
          request_id: r.request_id,
          name: `${r.first_name} ${r.last_name}`.trim(),
          first_name: r.first_name,
          last_name: r.last_name,
          headline: r.headline,
          requester_id: r.requester_id,
          created_at: r.created_at,
        }))
      );
    } catch (err) {
      toast.error('Failed to load connections');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user]);

  const handleAccept = async (requestId) => {
    try {
      await api.connections.accept(requestId, user.member_id);
      const req = pending.find((r) => r.request_id === requestId);
      if (req) {
        setConnections((prev) => [
          ...prev,
          {
            id: requestId,
            connection_id: requestId,
            name: req.name,
            first_name: req.first_name,
            last_name: req.last_name,
            headline: req.headline,
            member_id: req.requester_id,
            connected_at: new Date().toISOString(),
          },
        ]);
        setPending((prev) => prev.filter((r) => r.request_id !== requestId));
        toast.success(`Connected with ${req.name}!`);
      }
    } catch (err) {
      toast.error(err.message || 'Could not accept request');
    }
  };

  const handleReject = async (requestId) => {
    try {
      await api.connections.reject(requestId, user.member_id);
      setPending((prev) => prev.filter((r) => r.request_id !== requestId));
      toast.success('Request declined');
    } catch (err) {
      toast.error(err.message || 'Could not decline request');
    }
  };

  const handleRemove = (id) => {
    // Backend has no DELETE /connections endpoint in the API contract
    // Soft-remove from UI only and inform user
    const conn = connections.find((c) => c.id === id);
    if (!window.confirm(`Remove ${conn?.name} from your connections?`)) return;
    setConnections((prev) => prev.filter((c) => c.id !== id));
    toast('Removed locally. Full removal requires server support.', { icon: 'ℹ️' });
  };

  const tabClass = (t) =>
    `px-4 py-2 rounded-full text-sm font-medium transition-colors ${
      t === tab
        ? 'bg-linkedin text-white'
        : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
    }`;

  if (loading) return <LoadingSpinner message="Loading connections..." />;

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
            {connections.map((c) => (
              <ConnectionCard key={c.id} connection={c} onRemove={handleRemove} />
            ))}
          </div>
        )
      ) : pending.length === 0 ? (
        <EmptyState title="No pending requests" message="You're all caught up!" />
      ) : (
        <div className="space-y-3">
          {pending.map((req) => (
            <ConnectionCard
              key={req.id}
              connection={req}
              isPending
              onAccept={() => handleAccept(req.request_id)}
              onReject={() => handleReject(req.request_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
