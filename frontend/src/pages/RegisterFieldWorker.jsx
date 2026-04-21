import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, Row, Col, Alert, App as AntApp } from 'antd';
import { UserAddOutlined, ArrowRightOutlined, CompassOutlined, EnvironmentOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { registerUser, sendOTP, verifyOTP } from '../api';
import LocationPickerMap from '../components/LocationPickerMap';

const { Title, Text } = Typography;

const RegisterFieldWorker = ({ onSuccess }) => {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState(null);
  const [locationData, setLocationData] = useState(null);

  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otp, setOtp] = useState('');

  const handleSendOtp = async () => {
    const email = form.getFieldValue('email');
    if (!email) {
      message.error('Please enter your email first!');
      return;
    }
    setOtpLoading(true);
    try {
      const res = await sendOTP(email);
      message.success('OTP sent to your email!');
      if (res.dev_otp) message.info(`[DEV MODE] OTP: ${res.dev_otp}`, 10);
      setOtpSent(true);
    } catch (err) {
      message.error(err.response?.data?.detail || 'Failed to send OTP');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const email = form.getFieldValue('email');
    if (!otp) {
      message.error('Please enter the OTP!');
      return;
    }
    setVerifyingOtp(true);
    try {
      await verifyOTP(email, otp);
      message.success('Email verified successfully!');
      setOtpVerified(true);
    } catch (err) {
      message.error('Invalid OTP. Please try again.');
    } finally {
      setVerifyingOtp(false);
    }
  };


  const handleLocationChange = (locData) => {
    setLocationData(locData);
    form.setFieldsValue({
      street: locData.street || '',
      area: locData.area || '',
      city: locData.city || '',
      state: locData.state || '',
      pincode: locData.pincode || '',
    });
  };

  const onFinish = async (values) => {
    if (!otpVerified) {
      message.error('Please verify your email with OTP first!');
      return;
    }

    if (!locationData) {
      message.error('GPS Location is mandatory! Please click the auto-detect button.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { user } = await registerUser({
        email: values.email,
        password: values.password,
        role: 'field_worker',
        fullName: values.fullName,
        phone: values.phone,
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        street: values.street,
        area: values.area,
        city: values.city,
        state: values.state,
        pincode: values.pincode,
      });

      message.success('Field Worker registered successfully!');
      if (onSuccess) {
        onSuccess(user);
      }
    } catch (err) {
      const detail = err.response?.data?.detail || 'Registration failed. Please try again.';
      setError(detail);
      message.error(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Row justify="center" style={{ padding: '24px 16px' }}>
      <Col xs={24} sm={20} md={16} lg={12} xl={10}>
        <div style={{ marginBottom: '24px' }}>
          <Button 
            type="text" 
            icon={<ArrowLeftOutlined />} 
            onClick={() => navigate('/')}
            style={{ fontSize: '16px', color: '#595959' }}
          >
            Back to Role Selection
          </Button>
        </div>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '48px', height: '48px', background: '#1890ff',
            borderRadius: '12px', display: 'flex', justifyContent: 'center',
            alignItems: 'center', margin: '0 auto 16px auto'
          }}>
            <UserAddOutlined style={{ color: 'white', fontSize: '24px' }} />
          </div>
          <Title level={2} style={{ margin: 0 }}>Join as Field Worker</Title>
          <Text style={{ color: '#8c8c8c' }}>Register to report community needs from the ground.</Text>
        </div>

        <Card
          style={{ borderRadius: '16px', boxShadow: '0 8px 24px rgba(0,0,0,0.05)' }}
          styles={{ body: { padding: '32px' } }}
        >
          {error && (
            <Alert title={error} type="error" showIcon style={{ marginBottom: '16px', borderRadius: '8px' }} />
          )}

          <Form form={form} layout="vertical" name="register_field_worker" onFinish={onFinish}>
            <Form.Item name="fullName" label="Full Name" rules={[{ required: true, message: 'Please input your full name!' }]}>
              <Input size="large" placeholder="E.g. Jane Doe" />
            </Form.Item>

            <Form.Item label="Email ID" required>
              <Row gutter={8}>
                <Col flex="auto">
                  <Form.Item name="email" noStyle rules={[{ required: true, message: 'Please input your email!' }, { type: 'email', message: 'Please enter a valid email!' }]}>
                    <Input size="large" placeholder="name@example.com" disabled={otpVerified} />
                  </Form.Item>
                </Col>
                <Col>
                  <Button 
                    size="large" 
                    onClick={handleSendOtp} 
                    loading={otpLoading} 
                    disabled={otpVerified || otpSent}
                  >
                    {otpSent ? 'Resend' : 'Send OTP'}
                  </Button>
                </Col>
              </Row>
            </Form.Item>

            {otpSent && !otpVerified && (
              <Form.Item label="Verify OTP" required>
                <Row gutter={8}>
                  <Col flex="auto">
                    <Input 
                      size="large" 
                      placeholder="Enter 6-digit OTP" 
                      value={otp} 
                      onChange={(e) => setOtp(e.target.value)} 
                    />
                  </Col>
                  <Col>
                    <Button 
                      size="large" 
                      type="primary" 
                      onClick={handleVerifyOtp} 
                      loading={verifyingOtp}
                    >
                      Verify
                    </Button>
                  </Col>
                </Row>
              </Form.Item>
            )}

            {otpVerified && (
              <Alert 
                title="Email Verified" 
                type="success" 
                showIcon 
                style={{ marginBottom: '16px', borderRadius: '8px' }} 
              />
            )}

            <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Please input a password!' }, { min: 6, message: 'Password must be at least 6 characters!' }]}>
              <Input.Password size="large" placeholder="At least 6 characters" />
            </Form.Item>

            <Form.Item name="phone" label="Phone Number" rules={[{ required: true, message: 'Please input your phone number!' }]}>
              <Input size="large" placeholder="+91 98765 43210" />
            </Form.Item>

            <Form.Item label="Your Location" required>
              <Alert 
                message="Pick Location on Map" 
                description="Move the pin to your precise location. This will auto-fill your address, which you can edit below if needed."
                type="info" 
                showIcon 
                style={{ marginBottom: '16px', borderRadius: '8px' }}
              />
              <LocationPickerMap onLocationChange={handleLocationChange} />

              <div style={{ marginTop: '16px' }}>
                <Row gutter={16}>
                  <Col xs={24}>
                    <Form.Item name="street" label="Street / Landmark">
                      <Input placeholder="Street name or nearby landmark" />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item name="area" label="Area / District" rules={[{ required: true, message: 'Area is required' }]}>
                      <Input placeholder="E.g. Andheri West" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="city" label="City" rules={[{ required: true, message: 'City is required' }]}>
                      <Input placeholder="E.g. Mumbai" />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item name="state" label="State" rules={[{ required: true, message: 'State is required' }]}>
                      <Input placeholder="E.g. Maharashtra" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="pincode" label="Pincode" rules={[{ required: true, message: 'Valid 6-digit Pincode required', pattern: /^\d{6}$/ }]}>
                      <Input placeholder="E.g. 400053" maxLength={6} />
                    </Form.Item>
                  </Col>
                </Row>
              </div>
            </Form.Item>

            <Form.Item style={{ marginTop: '32px', marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" size="large" block icon={<ArrowRightOutlined />} loading={loading}>
                Register as Field Worker
              </Button>
              <div style={{ textAlign: 'center', marginTop: '16px' }}>
                <Text type="secondary">Already have an account? </Text>
                <Button type="link" onClick={() => navigate('/login')} style={{ padding: 0 }}>
                  Login
                </Button>
              </div>
            </Form.Item>
          </Form>
        </Card>
      </Col>
    </Row>
  );
};

export default RegisterFieldWorker;
