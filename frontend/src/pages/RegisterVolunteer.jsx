import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Select, Button, Typography, Row, Col, Checkbox, Space, Alert, Spin, App as AntApp } from 'antd';
import { HeartOutlined, ArrowRightOutlined, CompassOutlined, EnvironmentOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { registerUser, sendOTP, verifyOTP } from '../api';

const { Title, Text } = Typography;
const { Option } = Select;

const skillOptions = [
  'Medical Support',
  'Logistics/Delivery',
  'Teaching',
  'Construction/Repairs',
  'Language Translation',
  'Cooking',
  'Counseling',
  'Driving',
  'First Aid',
  'IT Support',
];

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const RegisterVolunteer = ({ onSuccess }) => {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [isLocating, setIsLocating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [locationData, setLocationData] = useState(null);

  const handleAutoDetectLocation = () => {
    setIsLocating(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          
          // Reverse geocode using Nominatim
          try {
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
              { headers: { 'User-Agent': 'SmartAllocator/1.0' } }
            );
            const data = await response.json();
            const address = data.address || {};
            
            const area = address.suburb || address.neighbourhood || address.quarter || '';
            const city = address.city || address.town || address.village || '';
            const pincode = address.postcode || '';

            setLocationData({ latitude, longitude, area, city, pincode });
            form.setFieldsValue({ 
              neighborhood: area || city || '',
              manualPincode: pincode
            });

            message.success(`Location detected: ${area || city} (${pincode})`);
          } catch {
            // Fallback: use coordinates directly
            setLocationData({ latitude, longitude, area: '', city: '', pincode: '' });
            form.setFieldsValue({ neighborhood: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` });
            message.warning('Could not resolve address, but GPS coordinates are saved.');
          }
          
          setIsLocating(false);
        },
        (geoError) => {
          message.error('Failed to get location. Please allow GPS permissions.');
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      message.error('Geolocation is not supported by your browser.');
      setIsLocating(false);
    }
  };

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
        role: 'volunteer',
        fullName: values.fullName,
        phone: values.phoneNumber,
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        skills: values.skills,
        availability: values.availability,
        hasVehicle: values.hasVehicle || false,
      });

      message.success('Volunteer registered successfully!');
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
      <Col xs={24} sm={22} md={18} lg={14} xl={12}>
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
            width: '48px', height: '48px', background: '#52c41a', 
            borderRadius: '12px', display: 'flex', justifyContent: 'center', 
            alignItems: 'center', margin: '0 auto 16px auto' 
          }}>
            <HeartOutlined style={{ color: 'white', fontSize: '24px' }} />
          </div>
          <Title level={2} style={{ margin: 0 }}>Become a Volunteer</Title>
          <Text style={{ color: '#8c8c8c' }}>Join our network and make an impact today.</Text>
        </div>

        <Card 
          style={{ borderRadius: '16px', boxShadow: '0 8px 24px rgba(0,0,0,0.05)' }}
          styles={{ body: { padding: '32px' } }}
        >
          {error && (
            <Alert title={error} type="error" showIcon style={{ marginBottom: '16px', borderRadius: '8px' }} />
          )}

          <Form form={form} layout="vertical" name="register_volunteer" onFinish={onFinish}>
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item name="fullName" label="Full Name" rules={[{ required: true, message: 'Please input your full name!' }]}>
                  <Input size="large" placeholder="E.g. John Smith" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="phoneNumber" label="Phone Number" rules={[{ required: true, message: 'Please input your phone number!' }]}>
                  <Input size="large" placeholder="+91 98765 43210" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item label="Email Address" required>
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
                    {otpSent ? 'Resend OTP' : 'Send OTP'}
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

            <Form.Item name="skills" label="Skillset" rules={[{ required: true, message: 'Please select at least one skill!' }]}>
              <Select mode="multiple" size="large" allowClear placeholder="Select your applicable skills">
                {skillOptions.map(skill => (
                  <Option key={skill} value={skill}>{skill}</Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item label="Your Location" required>
              <Alert 
                message="GPS Location Required" 
                description="We use your precise coordinates to show you nearby tasks. Please click the button below to auto-detect your location."
                type="info" 
                showIcon 
                style={{ marginBottom: '16px', borderRadius: '8px' }}
              />
              <Button 
                size="large" 
                icon={<CompassOutlined />} 
                onClick={handleAutoDetectLocation}
                loading={isLocating}
                type={locationData ? 'primary' : 'default'}
                block
                style={{ height: '50px', fontSize: '16px', fontWeight: 600 }}
              >
                {locationData ? '✓ Location Detected' : 'Click to Auto-detect GPS Location'}
              </Button>
              
              {locationData && (
                <div style={{ marginTop: '12px', padding: '12px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: '8px', fontSize: '13px', color: '#389e0d' }}>
                  <EnvironmentOutlined /> <strong>GPS Active:</strong> {locationData.area ? `${locationData.area}, ` : ''}{locationData.city} ({locationData.pincode})
                </div>
              )}
            </Form.Item>

            <Form.Item name="availability" label="Availability" rules={[{ required: true, message: 'Please select your available days!' }]}>
              <Checkbox.Group options={daysOfWeek} />
            </Form.Item>

            <Form.Item name="hasVehicle" valuePropName="checked">
              <Checkbox style={{ fontWeight: 500 }}>
                I have a vehicle available for use
              </Checkbox>
            </Form.Item>

            <Form.Item style={{ marginTop: '32px', marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" size="large" block icon={<ArrowRightOutlined />} loading={loading}>
                Register as Volunteer
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

export default RegisterVolunteer;
