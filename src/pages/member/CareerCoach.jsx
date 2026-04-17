import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { Bot, Send, Sparkles, FileText, Target, Lightbulb, Trash2 } from 'lucide-react';

// Mock AI responses — when backend is ready, replace with:
// POST /ai/career-coach  { message, context }
// or WebSocket /ws/career-coach/{sessionId}
const MOCK_RESPONSES = {
  resume: [
    "Based on your profile, here are some suggestions to improve your resume:",
    "1. **Lead with impact**: Start each bullet point with a strong action verb and quantify results. Instead of 'Worked on React projects', try 'Built 5 React applications serving 10K+ daily users, reducing page load time by 40%'.",
    "2. **Skills alignment**: Make sure your skills section matches the job descriptions you're targeting. For software engineering roles, highlight: React, Node.js, Python, AWS, and system design.",
    "3. **Summary section**: Add a 2-3 line professional summary at the top. Example: 'Full-stack engineer with 5+ years building scalable web applications. Specialized in React, Node.js, and cloud infrastructure.'",
    "4. **Education**: If you have relevant coursework or projects, list them — especially for distributed systems, databases, or ML courses.",
    "Would you like me to help tailor your resume for a specific job posting?"
  ].join('\n\n'),
  headline: [
    "Your headline is the first thing recruiters see. Here are optimized options based on your profile:",
    "",
    "**Option A** (Role-focused): 'Senior Software Engineer | React & Node.js | Building Scalable Web Applications'",
    "",
    "**Option B** (Impact-focused): 'Full-Stack Developer | Helped 3 Startups Scale to 100K Users | Open to New Opportunities'",
    "",
    "**Option C** (Skills-focused): 'Software Engineer | Python, React, AWS | Passionate About Distributed Systems'",
    "",
    "**Tips:**",
    "- Include your top 2-3 skills",
    "- Mention your specialty or domain",
    "- Add 'Open to Work' if actively searching",
    "- Keep it under 120 characters"
  ].join('\n'),
  job_match: [
    "I've analyzed your profile against current job market trends. Here's your career match analysis:",
    "",
    "**Strong matches for your skills:**",
    "- Senior Frontend Engineer (React expertise) — High demand, $140-180K range",
    "- Full-Stack Developer (Node.js + React) — Very high demand, $130-170K range",
    "- Cloud Engineer (AWS) — Growing demand, $150-190K range",
    "",
    "**Skills gap to address:**",
    "- Consider adding TypeScript — required in 70% of frontend roles",
    "- System design experience is increasingly expected at senior level",
    "- Kubernetes/Docker knowledge opens DevOps-adjacent roles",
    "",
    "**Recommended actions:**",
    "1. Apply to 5-10 jobs per week in your strong match areas",
    "2. Build a side project showcasing TypeScript + system design",
    "3. Connect with 3-5 engineers at target companies each week",
    "",
    "Want me to help you prepare for interviews in any of these areas?"
  ].join('\n'),
  interview: [
    "Here are tailored interview preparation tips:",
    "",
    "**Technical Interview:**",
    "- Practice LeetCode medium problems (focus on arrays, trees, graphs)",
    "- Review system design: load balancers, caching, message queues, database sharding",
    "- Be ready to discuss your most complex project in detail",
    "",
    "**Behavioral Interview (STAR method):**",
    "- **Situation**: Describe the context",
    "- **Task**: What was your responsibility",
    "- **Action**: What specifically did YOU do",
    "- **Result**: Quantifiable outcome",
    "",
    "**Common questions to prepare:**",
    "1. Tell me about a time you disagreed with a teammate",
    "2. Describe your most challenging bug and how you solved it",
    "3. How do you prioritize when you have multiple deadlines?",
    "",
    "**Questions to ask the interviewer:**",
    "- What does the first 90 days look like?",
    "- How is the team structured?",
    "- What's the biggest technical challenge the team faces?",
  ].join('\n'),
  default: "I'm your AI Career Coach! I can help you with:\n\n- **Resume optimization** — tailor your resume for specific roles\n- **Headline suggestions** — make your profile stand out\n- **Job matching** — find roles that fit your skills\n- **Interview prep** — practice questions and strategies\n\nWhat would you like help with?"
};

function getAIResponse(message) {
  const lower = message.toLowerCase();
  if (lower.includes('resume') || lower.includes('cv')) return MOCK_RESPONSES.resume;
  if (lower.includes('headline') || lower.includes('title') || lower.includes('summary')) return MOCK_RESPONSES.headline;
  if (lower.includes('job') || lower.includes('match') || lower.includes('career') || lower.includes('role') || lower.includes('skill')) return MOCK_RESPONSES.job_match;
  if (lower.includes('interview') || lower.includes('prepare') || lower.includes('question')) return MOCK_RESPONSES.interview;
  return MOCK_RESPONSES.default;
}

export default function CareerCoach() {
  const { user } = useAuth();
  const [messages, setMessages] = useLocalStorage('linkedin_coach_messages', []);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg = { id: `cm-${Date.now()}`, role: 'user', text: input.trim(), timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setTyping(true);

    // Simulate AI thinking delay — replace with real API call
    setTimeout(() => {
      const aiResponse = getAIResponse(userMsg.text);
      const aiMsg = { id: `cm-${Date.now() + 1}`, role: 'assistant', text: aiResponse, timestamp: new Date().toISOString() };
      setMessages((prev) => [...prev, aiMsg]);
      setTyping(false);
    }, 1200);
  };

  const handleClear = () => {
    setMessages([]);
  };

  const quickActions = [
    { label: 'Improve my resume', icon: FileText, prompt: 'Help me improve my resume for software engineering roles' },
    { label: 'Suggest a headline', icon: Sparkles, prompt: 'Suggest a better LinkedIn headline for my profile' },
    { label: 'Match me to jobs', icon: Target, prompt: 'What jobs match my skills?' },
    { label: 'Interview prep', icon: Lightbulb, prompt: 'Help me prepare for technical interviews' },
  ];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Bot className="w-7 h-7 text-linkedin" /> AI Career Coach
          </h1>
          <p className="text-sm text-gray-500 mt-1">Get personalized career advice, resume tips, and interview prep</p>
        </div>
        {messages.length > 0 && (
          <button onClick={handleClear} className="flex items-center gap-1 text-sm text-gray-400 hover:text-red-500">
            <Trash2 className="w-4 h-4" /> Clear
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 flex flex-col h-[550px]">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <Bot className="w-12 h-12 text-linkedin mx-auto mb-3" />
              <p className="text-gray-600 font-medium">Hi {user?.name?.split(' ')[0] || 'there'}! I'm your AI Career Coach.</p>
              <p className="text-sm text-gray-400 mt-1">Ask me anything or pick a quick action below.</p>
              <div className="grid grid-cols-2 gap-2 mt-6 max-w-md mx-auto">
                {quickActions.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => { setInput(action.prompt); }}
                    className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-linkedin-light hover:border-linkedin transition-colors text-left"
                  >
                    <action.icon className="w-4 h-4 text-linkedin shrink-0" />
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm ${
                msg.role === 'user'
                  ? 'bg-linkedin text-white rounded-br-md'
                  : 'bg-gray-50 border border-gray-200 text-gray-800 rounded-bl-md'
              }`}>
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm max-w-none">
                    {msg.text.split('\n').map((line, i) => {
                      if (!line.trim()) return <br key={i} />;
                      // Bold markdown
                      const parts = line.split(/(\*\*[^*]+\*\*)/g);
                      return (
                        <p key={i} className="mb-1 last:mb-0">
                          {parts.map((part, j) =>
                            part.startsWith('**') && part.endsWith('**')
                              ? <strong key={j}>{part.slice(2, -2)}</strong>
                              : part
                          )}
                        </p>
                      );
                    })}
                  </div>
                ) : (
                  <p>{msg.text}</p>
                )}
                <p className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-blue-100' : 'text-gray-400'}`}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}

          {typing && (
            <div className="flex justify-start">
              <div className="bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl rounded-bl-md">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-gray-200 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !typing && handleSend()}
            placeholder="Ask about your resume, job search, interviews..."
            disabled={typing}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full text-sm focus:ring-2 focus:ring-linkedin focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={typing || !input.trim()}
            className="p-2 bg-linkedin text-white rounded-full hover:bg-linkedin-dark disabled:opacity-50 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
