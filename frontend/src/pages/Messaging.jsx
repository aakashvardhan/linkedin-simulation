import React, { useEffect, useMemo, useState } from 'react';
import { useMockData } from '../context/MockDataContext';

const Messaging = () => {
  const { conversationStore, sendMessage, userProfile } = useMockData();
  const [selectedThreadId, setSelectedThreadId] = useState(() => conversationStore?.threads?.[0]?.id ?? null);
  const [inputText, setInputText] = useState('');
  const [listQuery, setListQuery] = useState('');

  const threads = useMemo(() => conversationStore?.threads ?? [], [conversationStore]);

  const selectedThread = useMemo(() => {
    const t = threads.find((th) => th.id === selectedThreadId);
    return t || threads[0] || null;
  }, [threads, selectedThreadId]);

  useEffect(() => {
    if (!selectedThreadId && threads[0]?.id) setSelectedThreadId(threads[0].id);
  }, [selectedThreadId, threads]);

  const filteredThreads = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((th) => {
      const last = th.messages[th.messages.length - 1]?.text ?? '';
      return (
        (th.peerName || '').toLowerCase().includes(q) || last.toLowerCase().includes(q)
      );
    });
  }, [threads, listQuery]);

  const handleSend = () => {
    if (!inputText.trim() || !selectedThread) return;
    sendMessage(selectedThread.id, inputText);
    setInputText('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const meShort = userProfile?.displayName?.split(' ')[0] || 'You';

  return (
    <div style={{ gridColumn: 'span 3', display: 'flex', gap: '24px', height: 'calc(100vh - 100px)' }}>
      <div className="card" style={{ width: '300px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #e0e0df', fontWeight: '600' }}>Messaging</div>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #e0e0df' }}>
          <input
            type="text"
            placeholder="Search conversations"
            value={listQuery}
            onChange={(e) => setListQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 8px',
              backgroundColor: '#E8F3FF',
              border: 'none',
              borderRadius: '4px',
              outline: 'none',
            }}
          />
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filteredThreads.map((th) => {
            const last = th.messages[th.messages.length - 1];
            const active = selectedThread?.id === th.id;
            return (
              <button
                key={th.id}
                type="button"
                onClick={() => setSelectedThreadId(th.id)}
                style={{
                  display: 'flex',
                  gap: '8px',
                  padding: '12px',
                  borderLeft: active ? '4px solid #004182' : '4px solid transparent',
                  cursor: 'pointer',
                  backgroundColor: active ? '#E8F3FF' : 'transparent',
                  borderRight: 'none',
                  borderTop: 'none',
                  borderBottom: '1px solid #f0f0f0',
                  width: '100%',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                }}
              >
                <img
                  src={`https://ui-avatars.com/api/?name=${encodeURIComponent(th.peerName)}&background=random&color=fff&size=48`}
                  alt=""
                  style={{ borderRadius: '50%', flexShrink: 0 }}
                />
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#000000e6' }}>{th.peerName}</span>
                    <span style={{ fontSize: '12px', color: '#666' }}>{last?.time || ''}</span>
                  </div>
                  <p
                    style={{
                      fontSize: '12px',
                      color: '#666',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                      margin: '4px 0 0',
                    }}
                  >
                    {last?.text || 'No messages yet'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {selectedThread ? (
          <>
            <div style={{ padding: '16px', borderBottom: '1px solid #e0e0df', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>{selectedThread.peerName}</h3>
              <span style={{ fontSize: '16px', color: '#666' }}>…</span>
            </div>

            <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {selectedThread.messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{ display: 'flex', gap: '8px', flexDirection: msg.isMine ? 'row-reverse' : 'row' }}
                >
                  <img
                    src={`https://ui-avatars.com/api/?name=${encodeURIComponent(
                      msg.isMine ? meShort : selectedThread.peerName,
                    )}&background=${msg.isMine ? '0A66C2' : 'random'}&color=fff&size=40`}
                    alt=""
                    style={{ borderRadius: '50%', flexShrink: 0 }}
                  />
                  <div style={{ textAlign: msg.isMine ? 'right' : 'left', maxWidth: '70%' }}>
                    <p style={{ fontSize: '14px', fontWeight: '600', margin: 0 }}>
                      {msg.isMine ? (
                        <>
                          <span style={{ fontSize: '12px', fontWeight: '400', color: '#666' }}>
                            {msg.time} &bull;{' '}
                          </span>
                          You
                        </>
                      ) : (
                        <>
                          {selectedThread.peerName}{' '}
                          <span style={{ fontSize: '12px', fontWeight: '400', color: '#666' }}>
                            &bull; {msg.time}
                          </span>
                        </>
                      )}
                    </p>
                    <p
                      style={{
                        fontSize: '14px',
                        marginTop: '4px',
                        backgroundColor: msg.isMine ? '#0A66C2' : '#f3f2ef',
                        color: msg.isMine ? '#fff' : '#000',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        display: 'inline-block',
                        textAlign: 'left',
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {msg.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: '16px', borderTop: '1px solid #e0e0df' }}>
              <div style={{ backgroundColor: '#f3f2ef', padding: '12px', borderRadius: '8px' }}>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Write a message..."
                  style={{
                    width: '100%',
                    border: 'none',
                    backgroundColor: 'transparent',
                    outline: 'none',
                    resize: 'none',
                    height: '60px',
                    fontFamily: 'inherit',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!inputText.trim()}
                    style={{
                      backgroundColor: inputText.trim() ? '#0A66C2' : '#e0e0df',
                      color: inputText.trim() ? '#fff' : '#666',
                      border: 'none',
                      borderRadius: '16px',
                      padding: '6px 16px',
                      fontWeight: '600',
                      cursor: inputText.trim() ? 'pointer' : 'default',
                    }}
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
            Select a conversation
          </div>
        )}
      </div>
    </div>
  );
};

export default Messaging;
