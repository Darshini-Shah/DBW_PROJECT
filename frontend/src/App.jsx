import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { LogoutOutlined, UserOutlined, LoginOutlined, EnvironmentOutlined, BellOutlined, CheckOutlined } from '@ant-design/icons';
import { Layout, Typography, ConfigProvider, Button, Tag, Space, Badge, Dropdown, List, Empty, Card } from 'antd';
import LoginPage from './pages/LoginPage';
import RoleSelection from './pages/RoleSelection';
import RegisterFieldWorker from './pages/RegisterFieldWorker';
import RegisterVolunteer from './pages/RegisterVolunteer';
import FieldWorker from './pages/FieldWorker';
import Volunteer from './pages/Volunteer';
import Leaderboard from './pages/Leaderboard';
import MyTasks from './pages/MyTasks';
import DemandHeatmap from './pages/DemandHeatmap';
import { logout, getMe, getNotifications } from './api';
import './App.css';

const { Header, Content, Footer } = Layout;
const { Title, Text } = Typography;

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notificationCount, setNotificationCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
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
        setNotifications(data.notifications || []);
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
    setNotifications([]);
    setNotificationCount(0);
    navigate('/');
  };

  const handleMarkRead = async () => {
    try {
      await import('./api').then(m => m.markNotificationsRead());
      setNotificationCount(0);
      setNotifications([]);
    } catch (err) {
      console.error("Failed to mark read", err);
    }
  };

  const notificationMenu = (
    <Card 
      title="Notifications" 
      extra={<Button type="link" size="small" onClick={handleMarkRead} icon={<CheckOutlined />}>Mark all read</Button>}
      styles={{ body: { padding: 0 } }}
      style={{ width: 300, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', borderRadius: '12px' }}
    >
      <List
        dataSource={notifications}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No new alerts" /> }}
        renderItem={item => (
          <List.Item 
            style={{ padding: '12px 16px', cursor: 'pointer' }} 
            onClick={() => {
              if (item.issue_id) navigate('/volunteer'); // or relevant page
            }}
          >
            <List.Item.Meta
              title={<Text strong style={{ fontSize: '13px' }}>{item.title}</Text>}
              description={
                <div style={{ fontSize: '12px' }}>
                  {item.message}
                  <div style={{ marginTop: '4px', color: '#bfbfbf', fontSize: '11px' }}>
                    {item.area}, {item.city}
                  </div>
                </div>
              }
            />
          </List.Item>
        )}
        style={{ maxHeight: '400px', overflowY: 'auto' }}
      />
    </Card>
  );

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
              <Dropdown dropdownRender={() => notificationMenu} trigger={['click']} placement="bottomRight">
                <Badge count={notificationCount} size="small">
                  <BellOutlined style={{ fontSize: '18px', color: '#595959', cursor: 'pointer' }} />
                </Badge>
              </Dropdown>

              <button 
                className="premium-heatmap-btn"
                onClick={() => navigate('/heatmap')}
              >
                <EnvironmentOutlined /> Demand Map
              </button>

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
              <Route path="/heatmap" element={
                user ? <DemandHeatmap /> : <Navigate to="/login" />
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
