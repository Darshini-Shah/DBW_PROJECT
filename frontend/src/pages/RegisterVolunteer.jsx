import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Select, Button, Typography, message, Row, Col, Checkbox, Space, Alert, Spin } from 'antd';
import { HeartOutlined, ArrowRightOutlined, CompassOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { registerUser } from '../api';

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
              neighborhood: area ? `${area}, ${city} - ${pincode}` : `${city} - ${pincode}`
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

  const onFinish = async (values) => {
    if (!locationData) {
      message.error('Please detect your location first!');
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
            <Alert message={error} type="error" showIcon style={{ marginBottom: '16px', borderRadius: '8px' }} />
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

            <Form.Item name="email" label="Email Address" rules={[{ required: true, message: 'Please input your email!' }, { type: 'email', message: 'Please enter a valid email!' }]}>
              <Input size="large" placeholder="name@example.com" />
            </Form.Item>

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
              <Row gutter={8}>
                <Col flex="auto">
                  <Form.Item name="neighborhood" noStyle rules={[{ required: true, message: 'Please detect your location!' }]}>
                    <Input size="large" placeholder="Click auto-detect →" readOnly />
                  </Form.Item>
                </Col>
                <Col>
                  <Button 
                    size="large" 
                    icon={<CompassOutlined />} 
                    onClick={handleAutoDetectLocation}
                    loading={isLocating}
                    type={locationData ? 'default' : 'primary'}
                    ghost={!locationData}
                  >
                    {locationData ? '✓ Detected' : 'Auto-detect'}
                  </Button>
                </Col>
              </Row>
              {locationData && (
                <div style={{ marginTop: '8px', padding: '8px 12px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: '8px', fontSize: '12px', color: '#389e0d' }}>
                  <EnvironmentOutlined /> GPS: {locationData.latitude.toFixed(4)}, {locationData.longitude.toFixed(4)}
                  {locationData.pincode && ` • Pincode: ${locationData.pincode}`}
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
