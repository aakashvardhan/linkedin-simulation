export const mockThreads = [
  {
    id: 'thread-1',
    participantName: 'Alice Johnson',
    participantAvatar: 'https://randomuser.me/api/portraits/women/1.jpg',
    lastMessage: 'Thanks for connecting! Would love to chat about the role.',
    timestamp: '2026-04-12T10:30:00Z',
    messages: [
      { id: 'm1', sender: 'them', text: 'Hi! Thanks for connecting.', timestamp: '2026-04-11T09:00:00Z' },
      { id: 'm2', sender: 'me', text: 'Hey Alice! Great to connect with you.', timestamp: '2026-04-11T09:05:00Z' },
      { id: 'm3', sender: 'them', text: 'Thanks for connecting! Would love to chat about the role.', timestamp: '2026-04-12T10:30:00Z' },
    ],
  },
  {
    id: 'thread-2',
    participantName: 'Bob Smith',
    participantAvatar: 'https://randomuser.me/api/portraits/men/2.jpg',
    lastMessage: 'Let me know if you have questions about the PM position.',
    timestamp: '2026-04-11T14:20:00Z',
    messages: [
      { id: 'm4', sender: 'them', text: 'Hi there! I saw your profile and thought you might be a good fit.', timestamp: '2026-04-10T11:00:00Z' },
      { id: 'm5', sender: 'me', text: 'Thanks Bob! I am definitely interested.', timestamp: '2026-04-10T11:30:00Z' },
      { id: 'm6', sender: 'them', text: 'Let me know if you have questions about the PM position.', timestamp: '2026-04-11T14:20:00Z' },
    ],
  },
  {
    id: 'thread-3',
    participantName: 'Carol Williams',
    participantAvatar: 'https://randomuser.me/api/portraits/women/3.jpg',
    lastMessage: 'See you at the conference next week!',
    timestamp: '2026-04-10T08:15:00Z',
    messages: [
      { id: 'm7', sender: 'me', text: 'Are you going to the data science conference?', timestamp: '2026-04-09T16:00:00Z' },
      { id: 'm8', sender: 'them', text: 'See you at the conference next week!', timestamp: '2026-04-10T08:15:00Z' },
    ],
  },
];
