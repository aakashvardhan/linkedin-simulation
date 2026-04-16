export default function StatusBadge({ status }) {
  const colors = {
    applied: 'bg-blue-100 text-blue-800',
    screening: 'bg-yellow-100 text-yellow-800',
    interview: 'bg-purple-100 text-purple-800',
    offered: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    pending: 'bg-gray-100 text-gray-800',
    approved: 'bg-green-100 text-green-800',
    shortlisted: 'bg-blue-100 text-blue-800',
  };

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${colors[status] || colors.pending}`}>
      {status}
    </span>
  );
}
