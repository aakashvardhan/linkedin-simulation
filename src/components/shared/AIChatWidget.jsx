import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { Bot, Send, Sparkles, FileText, Target, Lightbulb, Trash2, X, MessageCircle } from 'lucide-react';

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
    "Your headline is the first thing recruiters see. Here are optimized options:",
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
    "Here's your career match analysis:",
    "",
    "**Strong matches for your skills:**",
    "- Senior Frontend Engineer — High demand, $140-180K",
    "- Full-Stack Developer — Very high demand, $130-170K",
    "- Cloud Engineer (AWS) — Growing demand, $150-190K",
    "",
    "**Skills gap to address:**",
    "- TypeScript — required in 70% of frontend roles",
    "- System design — expected at senior level",
    "- Kubernetes/Docker — opens DevOps roles",
    "",
    "**Recommended actions:**",
    "1. Apply to 5-10 jobs/week in strong match areas",
    "2. Build a TypeScript + system design side project",
    "3. Connect with engineers at target companies",
    "",
    "Want me to help you prepare for interviews?"
  ].join('\n'),
  interview: [
    "Here are tailored interview preparation tips:",
    "",
    "**Technical Interview:**",
    "- Practice LeetCode medium (arrays, trees, graphs)",
    "- Review system design: caching, queues, sharding",
    "- Discuss your most complex project in detail",
    "",
    "**Behavioral (STAR method):**",
    "- **Situation**: Describe the context",
    "- **Task**: Your responsibility",
    "- **Action**: What YOU did",
    "- **Result**: Quantifiable outcome",
    "",
    "**Questions to ask the interviewer:**",
    "- What does the first 90 days look like?",
    "- How is the team structured?",
    "- Biggest technical challenge the team faces?",
  ].join('\n'),
  default: "I'm your AI Career Coach! I can help with:\n\n- **Resume optimization**\n- **Headline suggestions**\n- **Job matching**\n- **Interview prep**\n\nWhat would you like help with?"
};

function getAIResponse(message) {
  const lower = message.toLowerCase();
  if (lower.includes('resume') || lower.includes('cv')) return MOCK_RESPONSES.resume;
  if (lower.includes('headline') || lower.includes('title') || lower.includes('summary')) return MOCK_RESPONSES.headline;
  if (lower.includes('job') || lower.includes('match') || lower.includes('career') || lower.includes('role') || lower.includes('skill')) return MOCK_RESPONSES.job_match;
  if (lower.includes('interview') || lower.includes('prepare') || lower.includes('question')) return MOCK_RESPONSES.interview;
  return MOCK_RESPONSES.default;
}

const quickActions = [
  { label: 'Resume tips', icon: FileText, prompt: 'Help me improve my resume for software engineering roles' },
  { label: 'Headline ideas', icon: Sparkles, prompt: 'Suggest a better LinkedIn headline for my profile' },
  { label: 'Match jobs', icon: Target, prompt: 'What jobs match my skills?' },
  { label: 'Interview prep', icon: Lightbulb, prompt: 'Help me prepare for technical interviews' },
];

export default function AIChatWidget() {
  const { user, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useLocalStorage('linkedin_coach_messages', []);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing, open]);

  if (!isAuthenticated) return null;

  const handleSend = (text) => {
    const msg = text || input.trim();
    if (!msg) return;
    const userMsg = { id: `cm-${Date.now()}`, role: 'user', text: msg, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setTyping(true);

    setTimeout(() => {
      const aiResponse = getAIResponse(userMsg.text);
      const aiMsg = { id: `cm-${Date.now() + 1}`, role: 'assistant', text: aiResponse, timestamp: new Date().toISOString() };
      setMessages((prev) => [...prev, aiMsg]);
      setTyping(false);
    }, 1200);
  };

  return (
    <>
      {/* Floating Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-linkedin text-white rounded-full shadow-lg hover:bg-linkedin-dark transition-all hover:scale-105 flex items-center justify-center z-50"
        >
          <Bot className="w-6 h-6" />
        </button>
      )}

      {/* Chat Window */}
      {open && (
        <div className="fixed bottom-6 right-6 w-96 h-[520px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col z-50 overflow-hidden">
          {/* Header */}
          <div className="bg-linkedin px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-white">
              <Bot className="w-5 h-5" />
              <div>
                <p className="font-semibold text-sm">AI Career Coach</p>
                <p className="text-[10px] text-blue-100">Powered by LinkedIn AI</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button onClick={() => setMessages([])} className="p-1 text-blue-100 hover:text-white" title="Clear chat">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 text-blue-100 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-4">
                <Bot className="w-10 h-10 text-linkedin mx-auto mb-2" />
                <p className="text-sm text-gray-600 font-medium">Hi {user?.name?.split(' ')[0] || 'there'}!</p>
                <p className="text-xs text-gray-400 mt-1">How can I help your career today?</p>
                <div className="grid grid-cols-2 gap-1.5 mt-4">
                  {quickActions.map((action) => (
                    <button
                      key={action.label}
                      onClick={() => handleSend(action.prompt)}
                      className="flex items-center gap-1.5 px-2.5 py-2 border border-gray-200 rounded-lg text-xs text-gray-700 hover:bg-linkedin-light hover:border-linkedin transition-colors text-left"
                    >
                      <action.icon className="w-3.5 h-3.5 text-linkedin shrink-0" />
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-linkedin flex items-center justify-center shrink-0 mr-2 mt-1">
                    <Bot className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
                <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-linkedin text-white rounded-br-sm'
                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}>
                  {msg.role === 'assistant' ? (
                    <div>
                      {msg.text.split('\n').map((line, i) => {
                        if (!line.trim()) return <br key={i} />;
                        const parts = line.split(/(\*\*[^*]+\*\*)/g);
                        return (
                          <p key={i} className="mb-0.5 last:mb-0">
                            {parts.map((part, j) =>
                              part.startsWith('**') && part.endsWith('**')
                                ? <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>
                                : part
                            )}
                          </p>
                        );
                      })}
                    </div>
                  ) : (
                    <p>{msg.text}</p>
                  )}
                </div>
              </div>
            ))}

            {typing && (
              <div className="flex justify-start">
                <div className="w-6 h-6 rounded-full bg-linkedin flex items-center justify-center shrink-0 mr-2">
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="bg-gray-100 px-3 py-2 rounded-2xl rounded-bl-sm">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-2.5 border-t border-gray-200 flex gap-2 shrink-0">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !typing && handleSend()}
              placeholder="Ask me anything..."
              disabled={typing}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-full text-xs focus:ring-2 focus:ring-linkedin focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={() => handleSend()}
              disabled={typing || !input.trim()}
              className="p-2 bg-linkedin text-white rounded-full hover:bg-linkedin-dark disabled:opacity-50 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
