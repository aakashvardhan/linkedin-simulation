import { useState } from 'react';
import ThreadItem from '../../components/member/ThreadItem';
import MessageBubble from '../../components/member/MessageBubble';
import EmptyState from '../../components/shared/EmptyState';
import { Send } from 'lucide-react';

const recruiterThreads = [
  {
    id: 'rt-1',
    participantName: 'James Wilson',
    participantAvatar: 'https://randomuser.me/api/portraits/men/11.jpg',
    lastMessage: 'Thank you for considering my application!',
    timestamp: '2026-04-12T09:00:00Z',
    messages: [
      { id: 'rm1', sender: 'me', text: 'Hi James, thanks for applying to the Senior Software Engineer role.', timestamp: '2026-04-11T10:00:00Z' },
      { id: 'rm2', sender: 'them', text: 'Thank you for considering my application!', timestamp: '2026-04-12T09:00:00Z' },
    ],
  },
  {
    id: 'rt-2',
    participantName: 'Sarah Davis',
    participantAvatar: 'https://randomuser.me/api/portraits/women/12.jpg',
    lastMessage: 'I am available for an interview next week.',
    timestamp: '2026-04-11T15:30:00Z',
    messages: [
      { id: 'rm3', sender: 'me', text: 'Would you be available for a technical interview this week?', timestamp: '2026-04-10T14:00:00Z' },
      { id: 'rm4', sender: 'them', text: 'I am available for an interview next week.', timestamp: '2026-04-11T15:30:00Z' },
    ],
  },
];

export default function RecruiterMessaging() {
  const [threads, setThreads] = useState(recruiterThreads);
  const [activeId, setActiveId] = useState(threads[0]?.id || null);
  const [newMsg, setNewMsg] = useState('');

  const activeThread = threads.find((t) => t.id === activeId);

  const handleSend = () => {
    if (!newMsg.trim() || !activeId) return;
    const msg = { id: `rm-${Date.now()}`, sender: 'me', text: newMsg.trim(), timestamp: new Date().toISOString() };
    setThreads(threads.map((t) =>
      t.id === activeId ? { ...t, messages: [...t.messages, msg], lastMessage: msg.text } : t
    ));
    setNewMsg('');
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Recruiter Messages</h1>
      <div className="bg-white rounded-lg border border-gray-200 flex h-[500px]">
        <div className="w-1/3 border-r border-gray-200 overflow-y-auto">
          {threads.map((t) => (
            <ThreadItem key={t.id} thread={t} isActive={t.id === activeId} onClick={() => setActiveId(t.id)} />
          ))}
        </div>
        <div className="flex-1 flex flex-col">
          {activeThread ? (
            <>
              <div className="p-4 border-b border-gray-200 font-medium text-gray-800">
                {activeThread.participantName}
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {activeThread.messages.map((m) => <MessageBubble key={m.id} message={m} />)}
              </div>
              <div className="p-3 border-t border-gray-200 flex gap-2">
                <input
                  type="text"
                  value={newMsg}
                  onChange={(e) => setNewMsg(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Write a message..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-full text-sm focus:ring-2 focus:ring-linkedin focus:outline-none"
                />
                <button onClick={handleSend} className="p-2 bg-linkedin text-white rounded-full hover:bg-linkedin-dark">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <EmptyState title="Select a conversation" />
          )}
        </div>
      </div>
    </div>
  );
}
