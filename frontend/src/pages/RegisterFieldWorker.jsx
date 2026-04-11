import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Select, Button, Typography, message, Row, Col } from 'antd';
import { UserAddOutlined, ArrowRightOutlined, SafetyCertificateOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { Option } = Select;

const RegisterFieldWorker = ({ onSuccess }) => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [step, setStep] = useState('details');
  const [registrationData, setRegistrationData] = useState(null);

  const onDetailsSubmit = (values) => {
    setRegistrationData(values);
    setStep('otp');
    message.success(`OTP sent to ${values.email}`);
  };

  const onOtpSubmit = (values) => {
    if (values.otp && values.otp.length >= 4) {
      console.log('Registration Data (Field Worker):', JSON.stringify(registrationData, null, 2));
      message.success('Field Worker registered successfully!');
      if (onSuccess) {
        onSuccess('Field Worker', registrationData);
      }
      navigate('/');
    } else {
      message.error('Invalid OTP. Please enter a 4-digit code.');
    }
  };

  return (
    <Row justify="center" style={{ padding: '24px 16px' }}>
      <Col xs={24} sm={20} md={16} lg={12} xl={10}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ 
            width: '48px', height: '48px', background: '#1890ff', 
            borderRadius: '12px', display: 'flex', justifyContent: 'center', 
            alignItems: 'center', margin: '0 auto 16px auto' 
          }}>
            {step === 'details' ? (
              <UserAddOutlined style={{ color: 'white', fontSize: '24px' }} />
            ) : (
              <SafetyCertificateOutlined style={{ color: 'white', fontSize: '24px' }} />
            )}
          </div>
          <Title level={2} style={{ margin: 0 }}>
            {step === 'details' ? 'Join as Field Worker' : 'Verify Email'}
          </Title>
          <Text style={{ color: '#8c8c8c' }}>
            {step === 'details' ? 'Register your flow to assist locally.' : 'Enter the verification code sent to your email.'}
          </Text>
        </div>

        <Card 
          style={{ borderRadius: '16px', boxShadow: '0 8px 24px rgba(0,0,0,0.05)' }}
          bodyStyle={{ padding: '32px' }}
        >
          {step === 'details' ? (
            <Form form={form} layout="vertical" name="register_field_worker" onFinish={onDetailsSubmit}>
              <Form.Item name="fullName" label="Full Name" rules={[{ required: true, message: 'Please input your full name!' }]}>
                <Input size="large" placeholder="E.g. Jane Doe" />
              </Form.Item>

              <Form.Item name="email" label="Email ID" rules={[{ required: true, message: 'Please input your email!' }, { type: 'email', message: 'Please enter a valid email!' }]}>
                <Input size="large" placeholder="name@example.com" />
              </Form.Item>

              <Form.Item name="phone" label="Phone Number" rules={[{ required: true, message: 'Please input your phone number!' }]}>
                <Input size="large" placeholder="(555) 123-4567" />
              </Form.Item>

              <Form.Item style={{ marginTop: '32px', marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" size="large" block icon={<ArrowRightOutlined />}>
                  Continue
                </Button>
                <div style={{ textAlign: 'center', marginTop: '16px' }}>
                  <Text type="secondary">Already have an account? </Text>
                  <Button type="link" onClick={() => navigate('/login')} style={{ padding: 0 }}>
                    Login
                  </Button>
                </div>
              </Form.Item>
            </Form>
          ) : (
            <Form name="otp_form" layout="vertical" onFinish={onOtpSubmit}>
              <Form.Item name="otp" label="Verification Code" rules={[{ required: true, message: 'Please input the OTP!' }]} style={{ textAlign: 'center' }}>
                <Input.OTP length={4} size="large" />
              </Form.Item>

              <Form.Item style={{ marginTop: '32px', marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" size="large" block icon={<SafetyCertificateOutlined />}>
                  Verify & Complete
                </Button>
                <Button type="link" block onClick={() => setStep('details')} style={{ marginTop: '16px' }}>
                  Back to Form
                </Button>
              </Form.Item>
            </Form>
          )}
        </Card>
      </Col>
    </Row>
  );
};

export default RegisterFieldWorker;
