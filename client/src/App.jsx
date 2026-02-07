import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import api from './services/api';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import EngineerUnavailability from './pages/EngineerUnavailability';
import Schedules from './pages/Schedules';
import ScheduleView from './pages/ScheduleView';
import ScheduleEdit from './pages/ScheduleEdit';
import MySchedule from './pages/MySchedule';
import Requests from './pages/Requests';
import MyRequests from './pages/MyRequests';
import Profile from './pages/Profile';
import AdminSettings from './pages/AdminSettings';
import UserDashboard from './pages/UserDashboard';

// Session timeout: 1 hour
const SESSION_TIMEOUT_MS = 60 * 60 * 1000;

// Auth Context
const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [lastActivity, setLastActivity] = useState(Date.now());

  // Load dark mode preference
  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode !== null) {
      setDarkMode(savedDarkMode === 'true');
    }
  }, []);

  // Apply dark mode to document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
  }, [darkMode]);

  // Session timeout check
  useEffect(() => {
    if (!user) return;

    const checkSession = () => {
      if (Date.now() - lastActivity > SESSION_TIMEOUT_MS) {
        api.logout();
        setUser(null);
        alert('Your session has expired due to inactivity. Please log in again.');
      }
    };

    const interval = setInterval(checkSession, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [user, lastActivity]);

  // Track user activity
  useEffect(() => {
    const updateActivity = () => setLastActivity(Date.now());

    window.addEventListener('click', updateActivity);
    window.addEventListener('keypress', updateActivity);
    window.addEventListener('scroll', updateActivity);

    return () => {
      window.removeEventListener('click', updateActivity);
      window.removeEventListener('keypress', updateActivity);
      window.removeEventListener('scroll', updateActivity);
    };
  }, []);

  useEffect(() => {
    const token = api.getToken();
    if (token) {
      api.getCurrentUser()
        .then(userData => {
          setUser(userData);
          if (userData.darkMode !== undefined) {
            setDarkMode(userData.darkMode);
          }
        })
        .catch((error) => {
          if (error.code === 'SESSION_TIMEOUT') {
            alert('Your session has expired. Please log in again.');
          }
          api.logout();
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password, totpCode) => {
    const data = await api.login(email, password, totpCode);
    if (data.requiresTwoFactor) {
      return data; // Return early for 2FA prompt
    }
    setUser(data.user);
    if (data.user.darkMode !== undefined) {
      setDarkMode(data.user.darkMode);
    }
    setLastActivity(Date.now());
    return data;
  };

  const logout = () => {
    api.logout();
    setUser(null);
  };

  const toggleDarkMode = useCallback(async () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    localStorage.setItem('darkMode', String(newDarkMode));

    // Save to server if logged in
    if (user) {
      try {
        await api.request('/auth/preferences', {
          method: 'PUT',
          body: JSON.stringify({ darkMode: newDarkMode })
        });
      } catch (error) {
        console.error('Failed to save dark mode preference:', error);
      }
    }
  }, [darkMode, user]);

  const value = {
    user,
    setUser,
    login,
    logout,
    darkMode,
    toggleDarkMode,
    isManager: user?.isAdmin || user?.isManager,
    isAdmin: user?.isAdmin
  };

  if (loading) {
    return (
      <div className="loading-container" style={{ minHeight: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

function PrivateRoute({ children }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function ManagerRoute({ children }) {
  const { user, isManager } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isManager) {
    return <Navigate to="/user-dashboard" replace />;
  }

  return children;
}

function Header() {
  const { user, logout, isManager, isAdmin, darkMode, toggleDarkMode } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path ? 'active' : '';

  // Determine user role text
  const getRoleText = () => {
    if (user?.isAdmin) return 'Admin';
    if (user?.isManager) return 'Manager';
    if (user?.inTraining) return 'In Training';
    if (user?.isFloater) return 'Floater';
    return 'User';
  };

  return (
    <header className="header">
      <h1 style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <span style={{ marginRight: '8px' }}>Shifter</span>
        <span style={{ fontSize: '0.5em', opacity: 0.8 }}>for ICES</span>
      </h1>
      <nav>
        {isManager ? (
          <>
            <Link to="/" className={isActive('/')}>Dashboard</Link>
            <Link to="/users" className={isActive('/users')}>Users</Link>
            <Link to="/schedules" className={isActive('/schedules')}>Schedules</Link>
            <Link to="/requests" className={isActive('/requests')}>Requests</Link>
          </>
        ) : (
          <Link to="/user-dashboard" className={isActive('/user-dashboard')}>Dashboard</Link>
        )}
        <Link to="/my-schedule" className={isActive('/my-schedule')}>My Schedule</Link>
        <Link to="/my-requests" className={isActive('/my-requests')}>My Requests</Link>
        <Link to="/profile" className={isActive('/profile')}>Profile</Link>
        {isAdmin && (
          <Link to="/admin" className={isActive('/admin')}>Admin</Link>
        )}
      </nav>
      <div className="user-info" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          onClick={toggleDarkMode}
          className="btn btn-sm"
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.3)',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
          title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {darkMode ? '☀️' : '🌙'}
        </button>
        <span>{user?.name} ({getRoleText()})</span>
        <button className="btn btn-outline" onClick={handleLogout} style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}>
          Logout
        </button>
      </div>
    </header>
  );
}

function AdminRoute({ children }) {
  const { user, isAdmin } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function AppRoutes() {
  const { user, isManager } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={isManager ? '/' : '/user-dashboard'} replace /> : <Login />} />

      {/* Manager routes */}
      <Route path="/" element={<ManagerRoute><Dashboard /></ManagerRoute>} />
      <Route path="/users" element={<ManagerRoute><Users /></ManagerRoute>} />
      <Route path="/users/:id/availability" element={<ManagerRoute><EngineerUnavailability /></ManagerRoute>} />
      {/* Legacy engineer routes - redirect to users */}
      <Route path="/engineers" element={<Navigate to="/users" replace />} />
      <Route path="/engineers/:id/availability" element={<ManagerRoute><EngineerUnavailability /></ManagerRoute>} />
      <Route path="/schedules" element={<ManagerRoute><Schedules /></ManagerRoute>} />
      <Route path="/schedules/:id" element={<PrivateRoute><ScheduleView /></PrivateRoute>} />
      <Route path="/schedules/:id/edit" element={<ManagerRoute><ScheduleEdit /></ManagerRoute>} />
      <Route path="/requests" element={<ManagerRoute><Requests /></ManagerRoute>} />

      {/* Admin routes */}
      <Route path="/admin" element={<AdminRoute><AdminSettings /></AdminRoute>} />

      {/* User routes */}
      <Route path="/user-dashboard" element={<PrivateRoute><UserDashboard /></PrivateRoute>} />
      <Route path="/my-schedule" element={<PrivateRoute><MySchedule /></PrivateRoute>} />
      <Route path="/my-requests" element={<PrivateRoute><MyRequests /></PrivateRoute>} />
      <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to={user ? (isManager ? '/' : '/user-dashboard') : '/login'} replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}

function AppContent() {
  const { user } = useAuth();
  const location = useLocation();

  // Don't show header on login page
  const showHeader = user && location.pathname !== '/login';

  return (
    <div className="app-container">
      {showHeader && <Header />}
      <main className={showHeader ? 'main-content' : ''}>
        <AppRoutes />
      </main>
    </div>
  );
}

export default App;
