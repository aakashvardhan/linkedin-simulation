import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useMockData } from '../context/MockDataContext';

const THREAD_POLL_MS  = 5000;
const MESSAGE_POLL_MS = 3000;

function formatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    if (diffMs < 60000) return 'Just now';
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

const Messaging = () => {
  const { api, memberKey, userProfile, peerNames } = useMockData();
  const location = useLocation();

  const [threads, setThreads]               = useState([]);
  const [selectedThreadId, setSelectedThreadId] = useState(location.state?.threadId ?? null);
  const [messages, setMessages]             = useState([]);
  const [inputText, setInputText]           = useState('');
  const [listQuery, setListQuery]           = useState('');
  const [sending, setSending]               = useState(false);
  const messagesEndRef = useRef(null);
  const myId = String(memberKey || '');

  // ── Load thread list + poll ─────────────────────────────────────────────────
  useEffect(() => {
    if (!myId) return;
    let alive = true;
    const load = async () => {
      try {
        const raw = await api.messaging.threadsByUser({ user_id: myId, page: 1, page_size: 50 });
        const data = (raw?.status === 'success' ? raw.data : raw) ?? {};
        if (alive) setThreads(Array.isArray(data?.threads) ? data.threads : []);
      } catch { /* keep existing */ }
    };
    load();
    const tid = setInterval(load, THREAD_POLL_MS);
    return () => { alive = false; clearInterval(tid); };
  }, [api, myId]);

  // ── Auto-select first thread or route-state thread ──────────────────────────
  useEffect(() => {
    const stateId = location.state?.threadId;
    if (stateId) { setSelectedThreadId(stateId); return; }
    setSelectedThreadId((prev) => prev ?? threads[0]?.thread_id ?? null);
  }, [location.state?.threadId, threads]);

  // ── Load messages for selected thread + poll ────────────────────────────────
  useEffect(() => {
    if (!selectedThreadId) return;
    let alive = true;
    const load = async () => {
      try {
        const raw = await api.messaging.listMessages({ thread_id: selectedThreadId, page: 1, page_size: 100 });
        const data = (raw?.status === 'success' ? raw.data : raw) ?? {};
        if (alive) setMessages(Array.isArray(data?.messages) ? data.messages : []);
      } catch { /* keep existing */ }
    };
    load();
    const tid = setInterval(load, MESSAGE_POLL_MS);
    return () => { alive = false; clearInterval(tid); };
  }, [api, selectedThreadId]);

  // ── Auto-scroll to bottom on new messages ──────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send ────────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const t = inputText.trim();
    if (!t || !selectedThreadId || sending) return;
    setSending(true);
    setInputText('');
    try {
      await api.messaging.sendMessage({ thread_id: selectedThreadId, sender_id: myId, message_text: t });
      // Immediately refresh messages after send
      const raw = await api.messaging.listMessages({ thread_id: selectedThreadId, page: 1, page_size: 100 });
      const data = (raw?.status === 'success' ? raw.data : raw) ?? {};
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
    } catch {
      // Optimistically add to UI even if backend failed
      setMessages((prev) => [
        ...prev,
        { message_id: `local-${Date.now()}`, sender_id: myId, message_text: t, sent_at: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const getPeerName = (thread) => {
    if (!thread) return 'Unknown';
    const otherId = String(
      thread.other_participant?.id ??
      (Array.isArray(thread.participants) ? thread.participants.find((p) => String(p) !== myId) : null) ??
      ''
    );
    return peerNames[otherId] || thread.subject || `User ${otherId}`;
  };

  const filteredThreads = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => getPeerName(t).toLowerCase().includes(q) || (t.last_message || '').toLowerCase().includes(q));
  }, [threads, listQuery, peerNames, myId]);

  const selectedThread = threads.find((t) => t.thread_id === selectedThreadId) ?? null;
  const meShort = userProfile?.displayName?.split(' ')[0] || 'You';

  return (
    <div style={{ gridColumn: 'span 3', display: 'flex', gap: '24px', height: 'calc(100vh - 100px)' }}>
      {/* Thread list */}
      <div className="card" style={{ width: '300px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #e0e0df', fontWeight: '600' }}>Messaging</div>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #e0e0df' }}>
          <input
            type="text"
            placeholder="Search conversations"
            value={listQuery}
            onChange={(e) => setListQuery(e.target.value)}
            style={{ width: '100%', padding: '6px 8px', backgroundColor: '#E8F3FF', border: 'none', borderRadius: '4px', outline: 'none' }}
          />
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filteredThreads.length === 0 && (
            <div style={{ padding: '16px', fontSize: '13px', color: '#888', textAlign: 'center' }}>
              No conversations yet.<br />Go to a member profile and click Message.
            </div>
          )}
          {filteredThreads.map((th) => {
            const active = selectedThreadId === th.thread_id;
            const peerName = getPeerName(th);
            const initials = peerName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
            return (
              <button
                key={th.thread_id}
                type="button"
                onClick={() => setSelectedThreadId(th.thread_id)}
                style={{
                  display: 'flex', gap: '8px', padding: '12px',
                  borderLeft: active ? '4px solid #004182' : '4px solid transparent',
                  cursor: 'pointer', backgroundColor: active ? '#E8F3FF' : 'transparent',
                  borderRight: 'none', borderTop: 'none', borderBottom: '1px solid #f0f0f0',
                  width: '100%', textAlign: 'left', fontFamily: 'inherit',
                }}
              >
                <div style={{ width: 48, height: 48, borderRadius: '50%', flexShrink: 0, background: '#0A66C2', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '15px' }}>
                  {initials}
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#000000e6' }}>{peerName}</span>
                    <span style={{ fontSize: '11px', color: '#888' }}>{formatTime(th.last_message_at)}</span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#666', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', margin: '4px 0 0' }}>
                    {th.last_message || 'No messages yet'}
                  </p>
                  {th.unread_count > 0 && (
                    <span style={{ display: 'inline-block', marginTop: '4px', background: '#0A66C2', color: '#fff', borderRadius: '10px', padding: '1px 7px', fontSize: '11px', fontWeight: 700 }}>
                      {th.unread_count}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Conversation pane */}
      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {selectedThread ? (
          <>
            <div style={{ padding: '16px', borderBottom: '1px solid #e0e0df', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>{getPeerName(selectedThread)}</h3>
            </div>

            <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', color: '#888', fontSize: '13px', marginTop: '24px' }}>No messages yet. Say hello!</div>
              )}
              {messages.map((msg) => {
                const isMine = String(msg.sender_id) === myId;
                const senderLabel = isMine ? meShort : getPeerName(selectedThread);
                return (
                  <div key={msg.message_id} style={{ display: 'flex', gap: '8px', flexDirection: isMine ? 'row-reverse' : 'row' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, background: isMine ? '#0A66C2' : '#888', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px' }}>
                      {senderLabel.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ textAlign: isMine ? 'right' : 'left', maxWidth: '70%' }}>
                      <p style={{ fontSize: '14px', fontWeight: '600', margin: 0 }}>
                        {isMine ? (
                          <><span style={{ fontSize: '11px', fontWeight: 400, color: '#888' }}>{formatTime(msg.sent_at)} · </span>You</>
                        ) : (
                          <>{senderLabel} <span style={{ fontSize: '11px', fontWeight: 400, color: '#888' }}>· {formatTime(msg.sent_at)}</span></>
                        )}
                      </p>
                      <p style={{ fontSize: '14px', marginTop: '4px', backgroundColor: isMine ? '#0A66C2' : '#f3f2ef', color: isMine ? '#fff' : '#000', padding: '8px 12px', borderRadius: '8px', display: 'inline-block', textAlign: 'left', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                        {msg.message_text}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div style={{ padding: '16px', borderTop: '1px solid #e0e0df' }}>
              <div style={{ backgroundColor: '#f3f2ef', padding: '12px', borderRadius: '8px' }}>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Write a message…"
                  style={{ width: '100%', border: 'none', backgroundColor: 'transparent', outline: 'none', resize: 'none', height: '60px', fontFamily: 'inherit' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!inputText.trim() || sending}
                    style={{ backgroundColor: inputText.trim() && !sending ? '#0A66C2' : '#e0e0df', color: inputText.trim() && !sending ? '#fff' : '#666', border: 'none', borderRadius: '16px', padding: '6px 16px', fontWeight: '600', cursor: inputText.trim() && !sending ? 'pointer' : 'default' }}
                  >
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
            Select a conversation or go to a member profile and click Message.
          </div>
        )}
      </div>
    </div>
  );
};

export default Messaging;
