import React, { useMemo, useState } from 'react';
import { useMockData } from '../context/MockDataContext';

const Network = () => {
  const {
    connections,
    requestConnection,
    withdrawConnectionRequest,
    incomingInvites,
    acceptIncomingInvite,
    declineIncomingInvite,
  } = useMockData();
  const [tab, setTab] = useState('grow');

  const connected = useMemo(() => connections.filter((c) => c.status === 'connected'), [connections]);
  const pendingOutbound = useMemo(() => connections.filter((c) => c.status === 'pending'), [connections]);
  const suggestions = useMemo(() => connections.filter((c) => c.status === 'none'), [connections]);

  const cardBtn = {
    Connect: {
      border: '1px solid #0A66C2',
      color: '#0A66C2',
      backgroundColor: 'transparent',
      cursor: 'pointer',
    },
    Pending: {
      border: '1px solid #666',
      color: '#666',
      backgroundColor: '#e0e0df',
      cursor: 'not-allowed',
    },
    Withdraw: {
      border: '1px solid #c37d16',
      color: '#c37d16',
      backgroundColor: 'transparent',
      cursor: 'pointer',
    },
  };

  return (
    <div style={{ gridColumn: 'span 3', display: 'flex', gap: '24px' }}>
      <div style={{ width: '225px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="card" style={{ padding: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Manage my network</h2>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px', color: '#666', listStyle: 'none', padding: 0, margin: 0 }}>
            <li style={{ display: 'flex', justifyContent: 'space-between' }}>
              Connections <span style={{ fontWeight: 600 }}>{connected.length}</span>
            </li>
            <li style={{ display: 'flex', justifyContent: 'space-between' }}>
              Pending sent <span style={{ fontWeight: 600 }}>{pendingOutbound.length}</span>
            </li>
            <li style={{ display: 'flex', justifyContent: 'space-between' }}>
              Invitations <span style={{ fontWeight: 600 }}>{incomingInvites.length}</span>
            </li>
          </ul>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['grow', 'pending', 'connections', 'invites'].map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              style={{
                padding: '8px 14px',
                borderRadius: '20px',
                border: tab === key ? '2px solid #0A66C2' : '1px solid #e0e0df',
                background: tab === key ? '#E8F3FF' : '#fff',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                color: '#000000e6',
              }}
            >
              {key === 'grow' && 'People you may know'}
              {key === 'pending' && `Pending (${pendingOutbound.length})`}
              {key === 'connections' && `My connections (${connected.length})`}
              {key === 'invites' && `Invitations (${incomingInvites.length})`}
            </button>
          ))}
        </div>

        {tab === 'invites' && (
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: incomingInvites.length > 0 ? '16px' : '0' }}>
              <h2 style={{ fontSize: '16px', color: '#000000e6', fontWeight: incomingInvites.length > 0 ? '600' : '400', margin: 0 }}>
                {incomingInvites.length > 0 ? `Invitations (${incomingInvites.length})` : 'No pending invitations'}
              </h2>
            </div>

            {incomingInvites.map((invite) => (
              <div
                key={invite.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 0',
                  borderTop: '1px solid #e0e0df',
                }}
              >
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <img
                    src={`https://ui-avatars.com/api/?name=${encodeURIComponent(invite.name)}&background=random&color=fff&size=56`}
                    alt=""
                    style={{ borderRadius: '50%' }}
                  />
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>{invite.name}</h3>
                    <p style={{ fontSize: '14px', color: '#666', margin: '4px 0 0' }}>{invite.headline}</p>
                    <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>{invite.mutual ?? 0} mutual connections</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => declineIncomingInvite(invite.id)}
                    style={{
                      backgroundColor: 'transparent',
                      color: '#666',
                      border: 'none',
                      fontWeight: '600',
                      fontSize: '16px',
                      padding: '8px 16px',
                      cursor: 'pointer',
                    }}
                  >
                    Ignore
                  </button>
                  <button
                    type="button"
                    onClick={() => acceptIncomingInvite(invite.id)}
                    style={{
                      backgroundColor: 'transparent',
                      color: '#0A66C2',
                      border: '1px solid #0A66C2',
                      borderRadius: '24px',
                      fontWeight: '600',
                      fontSize: '16px',
                      padding: '6px 24px',
                      cursor: 'pointer',
                    }}
                  >
                    Accept
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'pending' && (
          <div className="card" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Sent invitations</h2>
            {pendingOutbound.length === 0 ? (
              <p style={{ color: '#666', fontSize: '14px' }}>No pending invitations. Connect with people in &quot;People you may know&quot;.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                {pendingOutbound.map((person) => (
                  <div key={person.id} className="card" style={{ margin: 0, padding: '16px', textAlign: 'center' }}>
                    <img
                      src={`https://ui-avatars.com/api/?name=${encodeURIComponent(person.name)}&background=random&color=fff&size=72`}
                      alt=""
                      style={{ borderRadius: '50%', marginBottom: '8px' }}
                    />
                    <h3 style={{ fontSize: '14px', fontWeight: '600' }}>{person.name}</h3>
                    <p style={{ fontSize: '12px', color: '#666', minHeight: '36px' }}>{person.headline}</p>
                    <button
                      type="button"
                      onClick={() => withdrawConnectionRequest(person.id)}
                      style={{
                        ...cardBtn.Withdraw,
                        padding: '6px 16px',
                        borderRadius: '24px',
                        fontWeight: '600',
                        width: '100%',
                        marginTop: '8px',
                      }}
                    >
                      Withdraw
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'connections' && (
          <div className="card" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Your connections</h2>
            {connected.length === 0 ? (
              <p style={{ color: '#666', fontSize: '14px' }}>Accept invitations or connect with suggestions to grow your network.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
                {connected.map((person) => (
                  <div key={person.id} className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', margin: 0 }}>
                    <div style={{ height: '48px', width: '100%', backgroundColor: '#a0b4b7', borderRadius: '8px 8px 0 0' }} />
                    <img
                      src={`https://ui-avatars.com/api/?name=${encodeURIComponent(person.name)}&background=random&color=fff&size=72`}
                      alt=""
                      style={{ borderRadius: '50%', border: '2px solid #fff', marginTop: '-36px', marginBottom: '8px' }}
                    />
                    <div style={{ padding: '0 12px 16px', width: '100%' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: '600' }}>{person.name}</h3>
                      <p style={{ fontSize: '12px', color: '#666' }}>{person.headline}</p>
                      <p style={{ fontSize: '12px', color: '#0A66C2', marginTop: '8px', fontWeight: 600 }}>Connected</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'grow' && (
          <div className="card" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>People you may know</h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
              {suggestions.map((person) => (
                <div key={person.id} className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', margin: 0 }}>
                  <div style={{ height: '60px', width: '100%', backgroundColor: '#a0b4b7' }} />
                  <img
                    src={`https://ui-avatars.com/api/?name=${encodeURIComponent(person.name)}&background=random&color=fff&size=72`}
                    alt=""
                    style={{ borderRadius: '50%', border: '2px solid #fff', marginTop: '-36px', marginBottom: '8px' }}
                  />

                  <div style={{ padding: '0 12px 16px 12px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%' }}>
                    <div>
                      <h3 style={{ fontSize: '14px', fontWeight: '600' }}>{person.name}</h3>
                      <p style={{ fontSize: '12px', color: '#666', height: '36px', overflow: 'hidden' }}>{person.headline}</p>
                      <p style={{ fontSize: '12px', color: '#666', marginTop: '4px', marginBottom: '12px' }}>{person.mutual} mutual connections</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => requestConnection(person.id)}
                      style={{
                        ...(person.status === 'pending' ? cardBtn.Pending : cardBtn.Connect),
                        display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      padding: '6px 16px',
                      borderRadius: '24px',
                      fontWeight: '600',
                      width: '100%',
                      }}
                      disabled={person.status === 'pending'}
                    >
                      {person.status === 'pending' ? 'Pending' : 'Connect'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Network;
