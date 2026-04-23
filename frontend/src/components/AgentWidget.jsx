import React, { useMemo, useState } from 'react';
import { FaRobot, FaPaperPlane, FaStar } from 'react-icons/fa';

const SYMBOL_DARK = '#3d2654';

const AgentWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { id: 'm1', role: 'agent', text: 'Hi! I’m your copilot. Ask me to draft outreach, summarize applicants, or suggest edits.' },
  ]);

  const canSend = input.trim().length > 0;

  const placeholderReply = useMemo(() => {
    return 'Got it. I can help with that—once the backend agent service is connected, I’ll stream progress and results here.';
  }, []);

  const send = () => {
    if (!canSend) return;
    const userMsg = { id: `u-${Date.now()}`, role: 'user', text: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    // Placeholder behavior until FastAPI WS + Kafka orchestration is connected.
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'agent', text: placeholderReply },
      ]);
    }, 600);
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '0',
        right: '24px',
        width: '288px',
        backgroundColor: '#fff',
        borderTopLeftRadius: '8px',
        borderTopRightRadius: '8px',
        border: '1px solid #e0e0df',
        borderBottom: 'none',
        boxShadow: isOpen ? '0 8px 32px rgba(0,0,0,0.15)' : '0 4px 12px rgba(0,0,0,0.08)',
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        transition: 'height 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.1), box-shadow 0.3s ease',
        height: isOpen ? '420px' : '48px',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Collapse Copilot' : 'Expand Copilot'}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen((v) => !v);
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: '0 12px',
          height: '48px',
          borderBottom: isOpen ? '1px solid #e0e0df' : 'none',
          cursor: 'pointer',
          backgroundColor: '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ position: 'relative', width: '32px', height: '32px', flex: '0 0 auto' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#0A66C2',
                color: SYMBOL_DARK,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FaRobot size={16} />
            </div>
            <div
              style={{
                position: 'absolute',
                right: '-2px',
                bottom: '-2px',
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                backgroundColor: SYMBOL_DARK,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid #fff',
                color: '#fff',
              }}
            >
              <FaStar size={8} />
            </div>
          </div>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#111' }}>Copilot</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', opacity: isOpen ? 1 : 0, transition: 'opacity 0.3s ease' }}>
        <div style={{ flex: 1, padding: '12px', overflowY: 'auto', backgroundColor: '#f3f2ef' }}>
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                marginBottom: '10px',
              }}
            >
              <div
                style={{
                  maxWidth: '85%',
                  padding: '10px 12px',
                  borderRadius: '12px',
                  backgroundColor: m.role === 'user' ? '#0A66C2' : '#fff',
                  color: m.role === 'user' ? '#fff' : '#111',
                  border: m.role === 'user' ? 'none' : '1px solid #e0e0df',
                  fontSize: '13px',
                  lineHeight: 1.35,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '10px', borderTop: '1px solid #e0e0df', backgroundColor: '#fff' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') send();
              }}
              placeholder="Ask the agent…"
              style={{
                flex: 1,
                height: '36px',
                borderRadius: '8px',
                border: '1px solid #cfcfce',
                padding: '0 10px',
                outline: 'none',
                fontSize: '13px',
                backgroundColor: '#fff',
              }}
            />
            <button
              onClick={send}
              disabled={!canSend}
              aria-label="Send"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: canSend ? '#004182' : '#e0e0df',
                color: canSend ? '#fff' : '#666',
                cursor: canSend ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FaPaperPlane size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentWidget;

