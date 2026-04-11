import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Row, Col, Typography, Button } from 'antd';
import { UserOutlined, TeamOutlined, LoginOutlined } from '@ant-design/icons';

const { Title, Paragraph, Text, Link } = Typography;

const RoleSelection = () => {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto', textAlign: 'center', marginTop: '40px' }}>
      
      {/* Login Section */}
      <Card
        style={{ borderRadius: '16px', border: '2px solid transparent', boxShadow: '0 8px 24px rgba(24, 144, 255, 0.08)', marginBottom: '40px' }}
        bodyStyle={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}
      >
        <Text style={{ fontSize: '18px', color: '#595959', fontWeight: 500 }}>Returning to Smart Allocator?</Text>
        <Button 
          type="primary"
          size="large"
          icon={<LoginOutlined />}
          onClick={() => navigate('/login')}
          style={{ fontSize: '16px', fontWeight: 600, padding: '0 48px', height: '48px', borderRadius: '8px' }}
        >
          Log In
        </Button>
      </Card>
      
      {/* New User Label */}
      <Title level={3} style={{ marginTop: 0, marginBottom: '32px', color: '#262626' }}>
        New User? Select your role to get started
      </Title>

      <Row gutter={[24, 24]} justify="center">
        <Col xs={24} sm={12}>
          <Card
            hoverable
            onClick={() => navigate('/register-worker')}
            style={{ borderRadius: '16px', border: '2px solid transparent', boxShadow: '0 8px 24px rgba(24, 144, 255, 0.15)', transition: 'all 0.3s' }}
            bodyStyle={{ padding: '32px 24px' }}
          >
            <UserOutlined style={{ fontSize: '64px', color: '#1890ff', marginBottom: '16px' }} />
            <Card.Meta 
              title={<span style={{ fontSize: '20px' }}>Field Worker</span>} 
              description="Report community needs and emergencies" 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card
            hoverable
            onClick={() => navigate('/register-volunteer')}
            style={{ borderRadius: '16px', border: '2px solid transparent', boxShadow: '0 8px 24px rgba(82, 196, 26, 0.15)', transition: 'all 0.3s' }}
            bodyStyle={{ padding: '32px 24px' }}
          >
            <TeamOutlined style={{ fontSize: '64px', color: '#52c41a', marginBottom: '16px' }} />
            <Card.Meta 
              title={<span style={{ fontSize: '20px' }}>Volunteer</span>} 
              description="View and accept tasks to provide help" 
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default RoleSelection;
