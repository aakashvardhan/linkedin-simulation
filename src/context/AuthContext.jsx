import { createContext, useState, useEffect } from 'react';
import apiClient from '../api/apiClient';

export const AuthContext = createContext(null);

// ─── helpers ─────────────────────────────────────────────────────────────────
const unwrap = (res) => res.data.data;

async function memberLogin(email, password) {
  return apiClient.post('/members/login', { email, password }).then(unwrap);
}
async function memberRegister(data) {
  // Backend expects first_name / last_name; form sends "name"
  const [first_name, ...rest] = (data.name || '').trim().split(' ');
  const last_name = rest.join(' ') || first_name;
  return apiClient
    .post('/members/create', {
      first_name,
      last_name,
      email: data.email,
      password: data.password,
      phone: data.phone || null,
    })
    .then(unwrap);
}
async function recruiterLogin(email, password) {
  return apiClient.post('/recruiters/login', { email, password }).then(unwrap);
}
async function recruiterRegister(data) {
  const [first_name, ...rest] = (data.name || '').trim().split(' ');
  const last_name = rest.join(' ') || first_name;
  return apiClient
    .post('/recruiters/create', {
      first_name,
      last_name,
      email: data.email,
      password: data.password,
      phone: data.phone || null,
      company_name: data.company_name,
      company_industry: data.company_industry || '',
      company_size: data.company_size || '',
      role: 'recruiter',
    })
    .then(unwrap);
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('linkedin_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem('linkedin_user', JSON.stringify(user));
      // Inject token into every future request
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${user.token}`;
    } else {
      localStorage.removeItem('linkedin_user');
      delete apiClient.defaults.headers.common['Authorization'];
    }
  }, [user]);

  /**
   * login — calls real backend, returns { user } or throws on error.
   * role: 'member' | 'recruiter'
   */
  const login = async (email, password, role = 'member') => {
    const data =
      role === 'recruiter'
        ? await recruiterLogin(email, password)
        : await memberLogin(email, password);

    const newUser = {
      // Normalise to a single shape regardless of member vs recruiter
      id: data.member_id ?? data.recruiter_id,
      member_id: data.member_id ?? null,
      recruiter_id: data.recruiter_id ?? null,
      company_id: data.company_id ?? null,
      company_name: data.company_name ?? null,
      email: data.email,
      first_name: data.first_name,
      last_name: data.last_name,
      name: `${data.first_name} ${data.last_name}`.trim(),
      role: data.role,
      token: data.token,
    };
    setUser(newUser);
    return newUser;
  };

  /**
   * register — creates account then immediately logs in.
   * role: 'member' | 'recruiter'
   */
  const register = async (data, role = 'member') => {
    if (role === 'recruiter') {
      await recruiterRegister(data);
    } else {
      await memberRegister(data);
    }
    // After creation, log in to get a token
    return login(data.email, data.password, role);
  };

  const updateUser = (updates) =>
    setUser((prev) => (prev ? { ...prev, ...updates } : prev));

  const deleteAccount = () => {
    setUser(null);
    ['linkedin_user', 'linkedin_profile', 'linkedin_saved_jobs', 'linkedin_applications']
      .forEach((k) => localStorage.removeItem(k));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('linkedin_user');
  };

  return (
    <AuthContext.Provider
      value={{ user, login, register, logout, updateUser, deleteAccount, isAuthenticated: !!user }}
    >
      {children}
    </AuthContext.Provider>
  );
}
