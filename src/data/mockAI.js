export const mockAISteps = [
  { label: 'Analyzing job requirements...', duration: 1500 },
  { label: 'Scanning candidate database...', duration: 2000 },
  { label: 'Matching skills and experience...', duration: 2500 },
  { label: 'Ranking candidates...', duration: 1500 },
  { label: 'Generating outreach drafts...', duration: 2000 },
];

export const mockAICandidates = [
  { id: 'ai-1', name: 'Sophia Martinez', avatar: 'https://randomuser.me/api/portraits/women/21.jpg', headline: 'Senior Software Engineer at Netflix', matchScore: 95, skills: ['React', 'Node.js', 'AWS', 'Python'], location: 'San Francisco, CA' },
  { id: 'ai-2', name: 'Ryan Thompson', avatar: 'https://randomuser.me/api/portraits/men/22.jpg', headline: 'Staff Engineer at Stripe', matchScore: 91, skills: ['TypeScript', 'Go', 'Kubernetes', 'React'], location: 'New York, NY' },
  { id: 'ai-3', name: 'Priya Patel', avatar: 'https://randomuser.me/api/portraits/women/23.jpg', headline: 'Tech Lead at Spotify', matchScore: 88, skills: ['Java', 'React', 'Microservices', 'AWS'], location: 'Seattle, WA' },
  { id: 'ai-4', name: 'Marcus Johnson', avatar: 'https://randomuser.me/api/portraits/men/24.jpg', headline: 'Full Stack Developer at Shopify', matchScore: 85, skills: ['Ruby', 'React', 'PostgreSQL', 'Docker'], location: 'Remote' },
  { id: 'ai-5', name: 'Lisa Wang', avatar: 'https://randomuser.me/api/portraits/women/25.jpg', headline: 'Software Engineer at Airbnb', matchScore: 82, skills: ['Python', 'React', 'Django', 'GCP'], location: 'Austin, TX' },
];

export const mockOutreachMessages = [
  {
    id: 'outreach-1',
    candidateId: 'ai-1',
    candidateName: 'Sophia Martinez',
    candidateAvatar: 'https://randomuser.me/api/portraits/women/21.jpg',
    subject: 'Exciting Senior Engineer Opportunity',
    body: 'Hi Sophia,\n\nI came across your profile and was impressed by your experience at Netflix. We have a Senior Software Engineer position that aligns perfectly with your skills in React and AWS.\n\nWould you be open to a quick chat this week?\n\nBest regards',
    status: 'pending',
  },
  {
    id: 'outreach-2',
    candidateId: 'ai-2',
    candidateName: 'Ryan Thompson',
    candidateAvatar: 'https://randomuser.me/api/portraits/men/22.jpg',
    subject: 'Staff Engineer Role — Perfect Match',
    body: 'Hi Ryan,\n\nYour background at Stripe caught my attention. We are hiring for a role that leverages your TypeScript and Kubernetes expertise.\n\nI would love to share more details. Are you available for a brief call?\n\nBest regards',
    status: 'pending',
  },
  {
    id: 'outreach-3',
    candidateId: 'ai-3',
    candidateName: 'Priya Patel',
    candidateAvatar: 'https://randomuser.me/api/portraits/women/23.jpg',
    subject: 'Tech Lead Opportunity',
    body: 'Hi Priya,\n\nYour leadership experience at Spotify is exactly what we need. Our team is growing and we are looking for a Tech Lead to drive architecture decisions.\n\nWould you be interested in learning more?\n\nBest regards',
    status: 'pending',
  },
];
