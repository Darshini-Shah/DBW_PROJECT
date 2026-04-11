import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Select, Typography, message } from 'antd';
import { MailOutlined, LockOutlined, UserOutlined, LoginOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { Option } = Select;

const LoginPage = ({ setUser }) => {
  const navigate = useNavigate();

  const onFinish = (values) => {
    setUser({
      email: values.email,
      role: values.role
    });
    message.success('Login successful!');
    navigate('/');
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh', padding: '24px' }}>
      <Card
        style={{ width: '100%', maxWidth: '400px', borderRadius: '16px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
        bodyStyle={{ padding: '32px' }}
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

        <Form name="login_form" layout="vertical" onFinish={onFinish} initialValues={{ role: 'Field Worker' }}>
          <Form.Item name="email" label="Email Address" rules={[{ required: true, message: 'Please input your email!' }, { type: 'email', message: 'Please enter a valid email!' }]}>
            <Input prefix={<MailOutlined style={{ color: '#bfbfbf' }} />} placeholder="name@example.com" size="large" />
          </Form.Item>

          <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Please input your password!' }]}>
            <Input.Password prefix={<LockOutlined style={{ color: '#bfbfbf' }} />} placeholder="Password" size="large" />
          </Form.Item>

          <Form.Item name="role" label="Role" rules={[{ required: true, message: 'Please select a role!' }]}>
            <Select size="large" suffixIcon={<UserOutlined />}>
              <Option value="Field Worker">Field Worker</Option>
              <Option value="Volunteer">Volunteer</Option>
            </Select>
          </Form.Item>

          <Form.Item style={{ marginTop: '32px', marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" size="large" block icon={<LoginOutlined />}>
              Log In
            </Button>
            <Button type="link" block onClick={() => navigate('/')} style={{ marginTop: '16px' }}>
              Back
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default LoginPage;
