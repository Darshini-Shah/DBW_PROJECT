import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, message, Alert, Select } from 'antd';
import { MailOutlined, LockOutlined, LoginOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { loginUser } from '../api';

const { Title, Text } = Typography;

const LoginPage = ({ onSuccess }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const onFinish = async (values) => {
    setLoading(true);
    setError(null);
    try {
      const { user } = await loginUser(values.email, values.password, values.role);
      message.success(`Welcome back, ${user.fullName}!`);
      if (onSuccess) {
        onSuccess(user);
      }
    } catch (err) {
      const detail = err.response?.data?.detail || 'Login failed. Please check your credentials.';
      setError(detail);
      message.error(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh', padding: '24px' }}>
      <Card
        style={{ width: '100%', maxWidth: '400px', borderRadius: '16px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
        styles={{ body: { padding: '32px' } }}
      >
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ 
            width: '48px', height: '48px', background: '#1890ff', 
            borderRadius: '12px', display: 'flex', justifyContent: 'center', 
            alignItems: 'center', margin: '0 auto 16px auto' 
          }}>
            <span style={{ color: 'white', fontWeight: 'bold', fontSize: '24px' }}>S</span>
          </div>
          <Title level={3} style={{ margin: 0 }}>Welcome Back</Title>
          <Text style={{ color: '#8c8c8c' }}>Please enter your details to sign in.</Text>
        </div>

        {error && (
          <Alert title={error} type="error" showIcon style={{ marginBottom: '16px', borderRadius: '8px' }} />
        )}

        <Form name="login_form" layout="vertical" onFinish={onFinish}>
          <Form.Item name="role" label="Role" rules={[{ required: true, message: 'Please select your role!' }]}>
            <Select size="large" placeholder="Select your role">
              <Select.Option value="volunteer">Volunteer</Select.Option>
              <Select.Option value="field_worker">Field Worker</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="email" label="Email Address" rules={[{ required: true, message: 'Please input your email!' }, { type: 'email', message: 'Please enter a valid email!' }]}>
            <Input prefix={<MailOutlined style={{ color: '#bfbfbf' }} />} placeholder="name@example.com" size="large" />
          </Form.Item>

          <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Please input your password!' }]}>
            <Input.Password prefix={<LockOutlined style={{ color: '#bfbfbf' }} />} placeholder="Password" size="large" />
          </Form.Item>

          <Form.Item style={{ marginTop: '32px', marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" size="large" block icon={<LoginOutlined />} loading={loading}>
              Log In
            </Button>
            <Button 
              type="text" 
              block 
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/')} 
              style={{ marginTop: '16px', color: '#8c8c8c' }}
            >
              Back
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default LoginPage;
