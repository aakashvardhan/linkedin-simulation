import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mockOutreachMessages } from '../../data/mockAI';
import OutreachCard from '../../components/recruiter/OutreachCard';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

export default function OutreachApproval() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState(mockOutreachMessages);

  const handleApprove = (id) => {
    setMessages(messages.map((m) => m.id === id ? { ...m, status: 'approved' } : m));
    toast.success('Outreach approved and queued for sending!');
  };

  const handleReject = (id) => {
    setMessages(messages.map((m) => m.id === id ? { ...m, status: 'rejected' } : m));
    toast.success('Outreach rejected');
  };

  const handleEdit = (id, newBody) => {
    setMessages(messages.map((m) => m.id === id ? { ...m, body: newBody } : m));
    toast.success('Message updated');
  };

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <h1 className="text-2xl font-bold text-gray-800 mb-2">Outreach Approval</h1>
      <p className="text-sm text-gray-500 mb-6">Task: {taskId} &middot; Review AI-generated outreach messages</p>

      <div className="space-y-4">
        {messages.map((m) => (
          <OutreachCard key={m.id} outreach={m} onApprove={handleApprove} onReject={handleReject} onEdit={handleEdit} />
        ))}
      </div>
    </div>
  );
}
