import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaGoogle,
  FaUser,
  FaBuilding,
  FaCompass,
  FaUserFriends,
  FaLaptopCode,
  FaBriefcase,
  FaGamepad,
} from 'react-icons/fa';
import { BrandMark } from '../components/BrandMark';
import {
  useMockData,
  DEMO_MEMBER_EMAIL,
  DEMO_RECRUITER_EMAIL,
  DEMO_MEMBER_NAME,
  DEMO_RECRUITER_NAME,
} from '../context/MockDataContext';

const fieldLabelStyle = {
  fontSize: '11px',
  letterSpacing: '0.06em',
  color: '#666',
  fontWeight: 700,
  marginBottom: '6px',
};

const inputStyle = {
  width: '100%',
  padding: '12px 12px',
  borderRadius: '12px',
  border: '1px solid #e0e0df',
  outline: 'none',
  fontSize: '14px',
  backgroundColor: '#fff',
};

const navItemStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  color: '#00000099',
  cursor: 'pointer',
  fontSize: '14px',
  gap: '4px',
};

const Login = () => {
  const navigate = useNavigate();
  const { userRole, login } = useMockData();

  const [mode, setMode] = useState('signup'); // signup | signin
  const [authRole, setAuthRole] = useState('MEMBER'); // MEMBER | RECRUITER
  /** Full registration / sign-in card is hidden until user chooses Join or Sign in */
  const [showAuthPanel, setShowAuthPanel] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!userRole) return;
    navigate('/home', { replace: true });
  }, [userRole, navigate]);

  useEffect(() => {
    if (!showAuthPanel) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setShowAuthPanel(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [showAuthPanel]);

  useEffect(() => {
    if (!showAuthPanel) return;
    setEmail(authRole === 'RECRUITER' ? DEMO_RECRUITER_EMAIL : DEMO_MEMBER_EMAIL);
    if (mode === 'signup') {
      setFullName(authRole === 'RECRUITER' ? DEMO_RECRUITER_NAME : DEMO_MEMBER_NAME);
    }
  }, [showAuthPanel, authRole, mode]);

  const title = useMemo(() => (mode === 'signup' ? 'Create your account' : 'Welcome back'), [mode]);
  const subtitle = useMemo(
    () => (mode === 'signup' ? 'Fill in the details to get started' : 'Sign in to continue'),
    [mode],
  );

  const primaryCta = useMemo(() => {
    if (mode === 'signin') return `Sign in as ${authRole === 'RECRUITER' ? 'Recruiter' : 'Member'}`;
    return `Create ${authRole === 'RECRUITER' ? 'Recruiter' : 'Member'} Account`;
  }, [mode, authRole]);

  const startJoin = (role) => {
    setAuthRole(role);
    setMode('signup');
    setShowAuthPanel(true);
  };

  const startSignIn = (role) => {
    setAuthRole(role);
    setMode('signin');
    setShowAuthPanel(true);
  };

  const closeAuthPanel = () => setShowAuthPanel(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (mode === 'signup') {
      if (!fullName.trim()) {
        setFormError('Please enter your full name.');
        return;
      }
      if (password.length < 8) {
        setFormError('Password must be at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setFormError('Passwords do not match.');
        return;
      }
    }

    await login(authRole, {
      email,
      password,
      ...(mode === 'signup' ? { displayName: fullName.trim() } : {}),
    });
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#fff',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      {/* Top nav (matches your screenshot style) */}
      <nav
        style={{
          padding: '12px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          maxWidth: '1128px',
          margin: '0 auto',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <BrandMark large />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <div style={{ display: 'flex', gap: '32px' }}>
            <div style={navItemStyle}>
              <FaCompass size={24} />
              <span>Top Content</span>
            </div>
            <div style={navItemStyle}>
              <FaUserFriends size={24} />
              <span>People</span>
            </div>
            <div style={navItemStyle}>
              <FaLaptopCode size={24} />
              <span>Learning</span>
            </div>
            <div style={navItemStyle}>
              <FaBriefcase size={24} />
              <span>Jobs</span>
            </div>
            <div style={navItemStyle}>
              <FaGamepad size={24} />
              <span>Games</span>
            </div>
          </div>

          <div style={{ borderLeft: '1px solid #e0e0df', height: '40px', margin: '0 8px' }} />

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => {
                startJoin(authRole);
              }}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                fontWeight: '600',
                color: '#000000e6',
                padding: '12px 24px',
                fontSize: '16px',
                borderRadius: '24px',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => (e.target.style.backgroundColor = '#00000014')}
              onMouseLeave={(e) => (e.target.style.backgroundColor = 'transparent')}
            >
              Join now
            </button>
            <button
              type="button"
              onClick={() => startSignIn(authRole)}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid #0A66C2',
                color: '#0A66C2',
                borderRadius: '24px',
                fontWeight: '600',
                padding: '10px 24px',
                fontSize: '16px',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = 'rgba(10, 102, 194, 0.14)';
                e.target.style.borderWidth = '2px';
                e.target.style.padding = '9px 23px';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.borderWidth = '1px';
                e.target.style.padding = '10px 24px';
              }}
            >
              Sign in
            </button>
          </div>
        </div>
      </nav>

      {/* Hero (matches your screenshot layout) */}
      <main
        style={{
          maxWidth: '1128px',
          margin: '0 auto',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '40px 16px',
          flex: 1,
        }}
      >
        <div style={{ flex: 1, maxWidth: '48%', minWidth: '360px' }}>
          <h1
            style={{
              fontSize: '56px',
              fontWeight: '200',
              color: '#8f5849',
              lineHeight: '1.2',
              marginBottom: '18px',
            }}
          >
            Explore jobs and grow your network
          </h1>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '420px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={() => startSignIn('MEMBER')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px 24px',
                borderRadius: '32px',
                border: 'none',
                backgroundColor: '#0A66C2',
                color: '#fff',
                fontSize: '18px',
                fontWeight: '700',
                cursor: 'pointer',
              }}
            >
              Sign in as Member
            </button>
            <button
              type="button"
              onClick={() => startSignIn('RECRUITER')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px 24px',
                borderRadius: '32px',
                border: '1px solid #0A66C2',
                backgroundColor: '#fff',
                color: '#0A66C2',
                fontSize: '18px',
                fontWeight: '700',
                cursor: 'pointer',
              }}
            >
              Sign in as Recruiter
            </button>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', marginLeft: '40px' }}>
          <img
            src="/hero.png"
            alt="Professional illustration"
            style={{ width: '100%', maxWidth: '700px', objectFit: 'contain' }}
            onError={(e) => {
              e.target.src =
                'https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80';
            }}
          />
        </div>
      </main>

      {/* Auth popup — only after Join now / Sign in */}
      {showAuthPanel && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
          }}
          onClick={closeAuthPanel}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '920px',
              maxHeight: 'min(90vh, 880px)',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e0e0df',
                borderRadius: '18px',
                boxShadow: '0 24px 80px rgba(0,0,0,0.22)',
                padding: '28px',
              }}
            >
            <div style={{ marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
              <div>
                <h2 id="auth-modal-title" style={{ fontSize: '28px', fontWeight: 900, color: '#000000e6', margin: 0 }}>{title}</h2>
                <p style={{ margin: '8px 0 0 0', color: '#666', fontSize: '14px' }}>{subtitle}</p>
              </div>
              <button
                type="button"
                onClick={closeAuthPanel}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#666',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                  padding: '6px 10px',
                  flexShrink: 0,
                }}
              >
                Close
              </button>
            </div>

            {/* Role segmented control (synced with Join block) */}
            <div
              style={{
                display: 'flex',
                gap: '10px',
                padding: '6px',
                borderRadius: '14px',
                backgroundColor: '#f3f2ef',
                border: '1px solid #e0e0df',
                marginBottom: '18px',
              }}
            >
              <button
                type="button"
                onClick={() => setAuthRole('MEMBER')}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 12px',
                  borderRadius: '12px',
                  border: authRole === 'MEMBER' ? '1px solid #CCE4F7' : '1px solid transparent',
                  cursor: 'pointer',
                  fontWeight: 900,
                  fontSize: '13px',
                  backgroundColor: authRole === 'MEMBER' ? '#fff' : 'transparent',
                  color: '#000000e6',
                  boxShadow: authRole === 'MEMBER' ? '0 2px 10px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                <FaUser size={14} color={authRole === 'MEMBER' ? '#0A66C2' : '#666'} />
                Member
              </button>
              <button
                type="button"
                onClick={() => setAuthRole('RECRUITER')}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 12px',
                  borderRadius: '12px',
                  border: authRole === 'RECRUITER' ? '1px solid #99CCEE' : '1px solid transparent',
                  cursor: 'pointer',
                  fontWeight: 900,
                  fontSize: '13px',
                  backgroundColor: authRole === 'RECRUITER' ? '#fff' : 'transparent',
                  color: '#000000e6',
                  boxShadow: authRole === 'RECRUITER' ? '0 2px 10px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                <FaBuilding size={14} color={authRole === 'RECRUITER' ? '#004182' : '#666'} />
                Recruiter
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {mode === 'signup' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                  <div>
                    <div style={fieldLabelStyle}>FULL NAME</div>
                    <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={DEMO_MEMBER_NAME} style={inputStyle} required />
                  </div>
                  <div>
                    <div style={fieldLabelStyle}>EMAIL</div>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={authRole === 'RECRUITER' ? DEMO_RECRUITER_EMAIL : DEMO_MEMBER_EMAIL} style={inputStyle} required />
                  </div>
                  <div>
                    <div style={fieldLabelStyle}>PASSWORD</div>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 chars" style={inputStyle} required minLength={8} />
                  </div>
                  <div>
                    <div style={fieldLabelStyle}>CONFIRM PASSWORD</div>
                    <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter" style={inputStyle} required minLength={8} />
                  </div>
                  <div>
                    <div style={fieldLabelStyle}>PHONE (OPTIONAL)</div>
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000-0000" style={inputStyle} />
                  </div>
                  <div>
                    <div style={fieldLabelStyle}>CITY</div>
                    <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="San Francisco" style={inputStyle} />
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px', maxWidth: '520px' }}>
                  <div>
                    <div style={fieldLabelStyle}>EMAIL</div>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={authRole === 'RECRUITER' ? DEMO_RECRUITER_EMAIL : DEMO_MEMBER_EMAIL} style={inputStyle} required />
                  </div>
                  <div>
                    <div style={fieldLabelStyle}>PASSWORD</div>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" style={inputStyle} required minLength={6} />
                  </div>
                </div>
              )}

              {formError && (
                <div style={{ marginTop: '14px', color: '#cc0000', fontSize: '13px', fontWeight: 700 }}>
                  {formError}
                </div>
              )}

              <p style={{ fontSize: '12px', color: '#666', marginTop: '14px', lineHeight: 1.4 }}>
                By continuing, you agree to the linkedlnDS User Agreement, Privacy Policy, and Cookie Policy.
              </p>

              <button
                type="submit"
                style={{
                  marginTop: '14px',
                  width: '100%',
                  border: 'none',
                  borderRadius: '14px',
                  padding: '14px 16px',
                  fontSize: '16px',
                  fontWeight: 900,
                  color: '#fff',
                  cursor: 'pointer',
                  backgroundColor: authRole === 'RECRUITER' ? '#004182' : '#0A66C2',
                }}
              >
                {primaryCta}
              </button>
            </form>

            <div style={{ display: 'flex', alignItems: 'center', margin: '18px 0' }}>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#e0e0df' }} />
              <span style={{ padding: '0 16px', color: '#666', fontSize: '13px' }}>or</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#e0e0df' }} />
            </div>

            <button
              type="button"
              onClick={() =>
                login(authRole, {
                  email,
                  password,
                  ...(mode === 'signup' && fullName.trim() ? { displayName: fullName.trim() } : {}),
                })
              }
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '12px',
                border: '1px solid #cfcfce',
                borderRadius: '14px',
                backgroundColor: '#fff',
                cursor: 'pointer',
                fontSize: '15px',
                fontWeight: 900,
                color: '#000000e6',
              }}
            >
              <FaGoogle color="#DB4437" size={18} />
              Continue with Google
            </button>

            <p style={{ fontSize: '14px', textAlign: 'center', marginTop: '18px', color: '#666' }}>
              {mode === 'signup' ? 'Already have an account? ' : 'New here? '}
              <span
                onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
                style={{ color: '#0A66C2', fontWeight: 900, cursor: 'pointer' }}
              >
                {mode === 'signup' ? 'Log in' : 'Create account'}
              </span>
            </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
