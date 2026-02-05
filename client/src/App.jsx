import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import api from './services/api';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Engineers from './pages/Engineers';
import EngineerUnavailability from './pages/EngineerUnavailability';
import Schedules from './pages/Schedules';
import ScheduleView from './pages/ScheduleView';
import ScheduleEdit from './pages/ScheduleEdit';
import MySchedule from './pages/MySchedule';
import Requests from './pages/Requests';
import MyRequests from './pages/MyRequests';
import Profile from './pages/Profile';
import AdminSettings from './pages/AdminSettings';

// Auth Context
const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = api.getToken();
    if (token) {
      api.getCurrentUser()
        .then(setUser)
        .catch(() => api.logout())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const data = await api.login(email, password);
    setUser(data.user);
    return data;
  };

  const logout = () => {
    api.logout();
    setUser(null);
  };

  const value = {
    user,
    login,
    logout,
    isManager: user?.role === 'admin' || user?.role === 'manager',
    isAdmin: user?.role === 'admin'
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
    return <Navigate to="/my-requests" replace />;
  }

  return children;
}

function Header() {
  const { user, logout, isManager } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path ? 'active' : '';

  const { isAdmin } = useAuth();

  return (
    <header className="header">
      <h1>
        <span>📅</span>
        ICES-Shifter
      </h1>
      <nav>
        {isManager && (
          <>
            <Link to="/" className={isActive('/')}>Dashboard</Link>
            <Link to="/engineers" className={isActive('/engineers')}>Engineers</Link>
            <Link to="/schedules" className={isActive('/schedules')}>Schedules</Link>
            <Link to="/requests" className={isActive('/requests')}>Requests</Link>
          </>
        )}
        <Link to="/my-schedule" className={isActive('/my-schedule')}>My Schedule</Link>
        <Link to="/my-requests" className={isActive('/my-requests')}>My Requests</Link>
        <Link to="/profile" className={isActive('/profile')}>Profile</Link>
        {isAdmin && (
          <Link to="/admin" className={isActive('/admin')}>Admin</Link>
        )}
      </nav>
      <div className="user-info">
        <span>{user?.name} ({user?.role})</span>
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
      <Route path="/login" element={user ? <Navigate to={isManager ? '/' : '/my-schedule'} replace /> : <Login />} />

      {/* Manager routes */}
      <Route path="/" element={<ManagerRoute><Dashboard /></ManagerRoute>} />
      <Route path="/engineers" element={<ManagerRoute><Engineers /></ManagerRoute>} />
      <Route path="/engineers/:id/unavailability" element={<ManagerRoute><EngineerUnavailability /></ManagerRoute>} />
      <Route path="/schedules" element={<ManagerRoute><Schedules /></ManagerRoute>} />
      <Route path="/schedules/:id" element={<PrivateRoute><ScheduleView /></PrivateRoute>} />
      <Route path="/schedules/:id/edit" element={<ManagerRoute><ScheduleEdit /></ManagerRoute>} />
      <Route path="/requests" element={<ManagerRoute><Requests /></ManagerRoute>} />

      {/* Admin routes */}
      <Route path="/admin" element={<AdminRoute><AdminSettings /></AdminRoute>} />

      {/* Engineer routes */}
      <Route path="/my-schedule" element={<PrivateRoute><MySchedule /></PrivateRoute>} />
      <Route path="/my-requests" element={<PrivateRoute><MyRequests /></PrivateRoute>} />
      <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to={user ? (isManager ? '/' : '/my-schedule') : '/login'} replace />} />
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
