import { Check, X, Edit3 } from 'lucide-react';
import { useState } from 'react';

export default function OutreachCard({ outreach, onApprove, onReject, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(outreach.body);

  const handleSaveEdit = () => {
    onEdit(outreach.id, body);
    setEditing(false);
  };

  if (outreach.status !== 'pending') {
    return (
      <div className={`bg-white rounded-lg border p-4 ${outreach.status === 'approved' ? 'border-green-300' : 'border-red-300'} opacity-70`}>
        <div className="flex items-center gap-3 mb-2">
          <img src={outreach.candidateAvatar} alt="" className="w-10 h-10 rounded-full" />
          <div>
            <p className="font-medium text-gray-800">{outreach.candidateName}</p>
            <p className="text-xs text-gray-500">{outreach.subject}</p>
          </div>
          <span className={`ml-auto text-sm font-medium ${outreach.status === 'approved' ? 'text-green-600' : 'text-red-600'}`}>
            {outreach.status === 'approved' ? 'Approved' : 'Rejected'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-3 mb-3">
        <img src={outreach.candidateAvatar} alt="" className="w-10 h-10 rounded-full" />
        <div>
          <p className="font-medium text-gray-800">{outreach.candidateName}</p>
          <p className="text-sm text-gray-500">{outreach.subject}</p>
        </div>
      </div>
      {editing ? (
        <div className="mb-3">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-linkedin focus:outline-none" />
          <button onClick={handleSaveEdit} className="mt-2 px-4 py-1.5 bg-linkedin text-white rounded-full text-sm hover:bg-linkedin-dark">
            Save Changes
          </button>
        </div>
      ) : (
        <p className="text-sm text-gray-600 whitespace-pre-line mb-3">{body}</p>
      )}
      <div className="flex gap-2">
        <button onClick={() => onApprove(outreach.id)} className="flex items-center gap-1 px-4 py-1.5 bg-green-600 text-white rounded-full text-sm hover:bg-green-700">
          <Check className="w-4 h-4" /> Approve
        </button>
        <button onClick={() => setEditing(!editing)} className="flex items-center gap-1 px-4 py-1.5 border border-gray-300 rounded-full text-sm hover:bg-gray-50">
          <Edit3 className="w-4 h-4" /> Edit
        </button>
        <button onClick={() => onReject(outreach.id)} className="flex items-center gap-1 px-4 py-1.5 bg-red-600 text-white rounded-full text-sm hover:bg-red-700">
          <X className="w-4 h-4" /> Reject
        </button>
      </div>
    </div>
  );
}
