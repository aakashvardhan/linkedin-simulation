import { createContext, useState, useEffect } from 'react';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('linkedin_user');
    return stored ? JSON.parse(stored) : null;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem('linkedin_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('linkedin_user');
    }
  }, [user]);

  const login = (email, password, role = 'member') => {
    const newUser = {
      id: crypto.randomUUID(),
      email,
      name: email.split('@')[0].replace(/[._]/g, ' '),
      role,
      token: 'mock-jwt-' + Date.now(),
    };
    setUser(newUser);
    return newUser;
  };

  const register = (data, role = 'member') => {
    // data can be { first_name, last_name, email, password, phone, ... }
    const newUser = {
      id: crypto.randomUUID(),
      email: data.email,
      first_name: data.first_name || data.name?.split(' ')[0] || '',
      last_name: data.last_name || data.name?.split(' ').slice(1).join(' ') || '',
      name: data.name || `${data.first_name || ''} ${data.last_name || ''}`.trim(),
      role,
      token: 'mock-jwt-' + Date.now(),
      // Recruiter-specific fields
      ...(role === 'recruiter' && {
        company_name: data.company_name || '',
        company_industry: data.company_industry || '',
        company_size: data.company_size || '',
        phone: data.phone || '',
      }),
    };
    setUser(newUser);
    return newUser;
  };

  const updateUser = (updates) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  const deleteAccount = () => {
    setUser(null);
    localStorage.removeItem('linkedin_user');
    localStorage.removeItem('linkedin_profile');
    localStorage.removeItem('linkedin_saved_jobs');
    localStorage.removeItem('linkedin_applications');
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('linkedin_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, updateUser, deleteAccount, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}
