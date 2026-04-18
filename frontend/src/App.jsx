import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { Layout, Typography, ConfigProvider, Button, Tag, Space, Badge } from 'antd';
import { LogoutOutlined, UserOutlined, LoginOutlined, EnvironmentOutlined, BellOutlined } from '@ant-design/icons';
import LoginPage from './pages/LoginPage';
import RoleSelection from './pages/RoleSelection';
import RegisterFieldWorker from './pages/RegisterFieldWorker';
import RegisterVolunteer from './pages/RegisterVolunteer';
import FieldWorker from './pages/FieldWorker';
import Volunteer from './pages/Volunteer';
import Leaderboard from './pages/Leaderboard';
import MyTasks from './pages/MyTasks';
import { logout, getMe, getNotifications } from './api';
import './App.css';

const { Header, Content, Footer } = Layout;
const { Title, Text } = Typography;

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notificationCount, setNotificationCount] = useState(0);
  const navigate = useNavigate();

  // Restore session from JWT on app load
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (savedUser && token) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
      }
    }
    setLoading(false);
  }, []);

  // Poll for notifications every 30 seconds when logged in
  useEffect(() => {
    if (!user) return;

    const fetchNotifications = async () => {
      try {
        const data = await getNotifications();
        setNotificationCount(data.count || 0);
      } catch {
        // Silently fail if not authenticated
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const handleLogout = () => {
    logout();
    setUser(null);
    setNotificationCount(0);
    navigate('/');
  };

  const handleAuthSuccess = (userData) => {
    setUser(userData);
    navigate('/');
  };

  if (loading) {
    return null; // Or a spinner
  }

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 8,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        },
      }}
    >
      <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
        <Header 
          style={{ 
            background: '#ffffff', 
            display: 'flex', 
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px', 
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)', 
            position: 'sticky', 
            top: 0, 
            zIndex: 10 
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => navigate('/')}>
            <div style={{ width: '32px', height: '32px', background: '#1890ff', borderRadius: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <span style={{ color: 'white', fontWeight: 'bold', fontSize: '18px' }}>S</span>
            </div>
            <Title level={4} style={{ margin: 0, color: '#262626', fontWeight: 600 }}>
              Smart Allocator
            </Title>
          </div>
          
          {!user && (
            <Button 
              type="primary" 
              icon={<LoginOutlined />}
              onClick={() => navigate('/login')}
              style={{ fontWeight: 500 }}
            >
              Log In
            </Button>
          )}

          {user && (
            <Space size="middle">
              {/* Location tag */}
              <Tag 
                color="green" 
                icon={<EnvironmentOutlined />} 
                style={{ padding: '4px 10px', fontSize: '13px', borderRadius: '4px' }}
              >
                {user.area ? `${user.area}, ${user.city}` : user.city || 'Unknown'}
              </Tag>

              {/* Notification bell */}
              <Badge count={notificationCount} size="small">
                <BellOutlined style={{ fontSize: '18px', color: '#595959', cursor: 'pointer' }} />
              </Badge>

              <Tag color="geekblue" icon={<UserOutlined />} style={{ padding: '4px 8px', fontSize: '14px', borderRadius: '4px' }}>
                {user.role === 'field_worker' ? 'Field Worker' : 'Volunteer'}
              </Tag>
              <Button 
                type="default" 
                icon={<LogoutOutlined />}
                onClick={handleLogout}
                style={{ fontWeight: 500 }}
              >
                Logout
              </Button>
            </Space>
          )}
        </Header>
        
        <Content style={{ padding: '24px 16px', flex: 1 }}>
          <div className="fade-in-content">
            <Routes>
              <Route path="/" element={
                user 
                  ? (user.role === 'Field Worker' || user.role === 'field_worker' 
                      ? <FieldWorker user={user} /> 
                      : <Volunteer user={user} />
                    ) 
                  : <RoleSelection />
              } />
              <Route path="/login" element={
                user ? <Navigate to="/" /> : <LoginPage onSuccess={handleAuthSuccess} />
              } />
              <Route path="/register-worker" element={
                user ? <Navigate to="/" /> : <RegisterFieldWorker onSuccess={handleAuthSuccess} />
              } />
              <Route path="/register-volunteer" element={
                user ? <Navigate to="/" /> : <RegisterVolunteer onSuccess={handleAuthSuccess} />
              } />
              <Route path="/leaderboard" element={
                user ? <Leaderboard /> : <Navigate to="/login" />
              } />
              <Route path="/my-tasks" element={
                user ? <MyTasks user={user} /> : <Navigate to="/login" />
              } />
            </Routes>
          </div>
        </Content>
        
        <Footer style={{ textAlign: 'center', color: '#8c8c8c', padding: '16px' }}>
          Smart Resource Allocation ©{new Date().getFullYear()}
        </Footer>
      </Layout>
    </ConfigProvider>
  );
}

export default App;
