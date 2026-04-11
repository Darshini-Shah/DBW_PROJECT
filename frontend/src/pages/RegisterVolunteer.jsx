import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Select, Button, Typography, message, Row, Col, Checkbox, Space } from 'antd';
import { HeartOutlined, ArrowRightOutlined, CompassOutlined, SafetyCertificateOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { Option } = Select;

const skillOptions = [
  'Medical Support',
  'Logistics/Delivery',
  'Teaching',
  'Construction/Repairs',
  'Language Translation',
  'Cooking'
];

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const RegisterVolunteer = ({ onSuccess }) => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [isLocating, setIsLocating] = useState(false);
  const [step, setStep] = useState('details');
  const [registrationData, setRegistrationData] = useState(null);

  const onDetailsSubmit = (values) => {
    setRegistrationData(values);
    setStep('otp');
    message.success(`OTP sent to ${values.email}`);
  };

  const onOtpSubmit = (values) => {
    if (values.otp && values.otp.length >= 4) {
      console.log('Registration Data (Volunteer):', JSON.stringify(registrationData, null, 2));
      message.success('Volunteer registered successfully!');
      if (onSuccess) {
        onSuccess('Volunteer', registrationData);
      }
      navigate('/');
    } else {
      message.error('Invalid OTP. Please enter a 4-digit code.');
    }
  };

  const handleAutoDetectLocation = () => {
    setIsLocating(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Mock reverse-geocoding result since we just have coordinates
          const mockNeighborhood = `Location: ${position.coords.latitude.toFixed(2)}, ${position.coords.longitude.toFixed(2)}`;
          form.setFieldsValue({ neighborhood: mockNeighborhood });
          message.success('Location detected!');
          setIsLocating(false);
        },
        (error) => {
          message.error('Failed to get location. Please allow permissions or type it manually.');
          setIsLocating(false);
        }
      );
    } else {
      message.error('Geolocation is not supported by your browser.');
      setIsLocating(false);
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
            {step === 'details' ? (
              <HeartOutlined style={{ color: 'white', fontSize: '24px' }} />
            ) : (
              <SafetyCertificateOutlined style={{ color: 'white', fontSize: '24px' }} />
            )}
          </div>
          <Title level={2} style={{ margin: 0 }}>
            {step === 'details' ? 'Become a Volunteer' : 'Verify Email'}
          </Title>
          <Text style={{ color: '#8c8c8c' }}>
            {step === 'details' ? 'Join our network and make an impact today.' : 'Enter the verification code sent to your email.'}
          </Text>
        </div>

        <Card 
          style={{ borderRadius: '16px', boxShadow: '0 8px 24px rgba(0,0,0,0.05)' }}
          bodyStyle={{ padding: '32px' }}
        >
          {step === 'details' ? (
            <Form
              form={form}
              layout="vertical"
              name="register_volunteer"
              onFinish={onDetailsSubmit}
            >
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="fullName"
                    label="Full Name"
                    rules={[{ required: true, message: 'Please input your full name!' }]}
                  >
                    <Input size="large" placeholder="E.g. John Smith" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="phoneNumber"
                    label="Phone Number"
                    rules={[{ required: true, message: 'Please input your phone number!' }]}
                  >
                    <Input size="large" placeholder="(555) 123-4567" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                name="email"
                label="Email Address"
                rules={[
                  { required: true, message: 'Please input your email!' },
                  { type: 'email', message: 'Please enter a valid email!' }
                ]}
              >
                <Input size="large" placeholder="name@example.com" />
              </Form.Item>

              <Form.Item
                name="skills"
                label="Skillset"
                rules={[{ required: true, message: 'Please select at least one skill!' }]}
              >
                <Select
                  mode="multiple"
                  size="large"
                  allowClear
                  placeholder="Select your applicable skills"
                >
                  {skillOptions.map(skill => (
                    <Option key={skill} value={skill}>{skill}</Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item label="Home Neighborhood" required>
                <Row gutter={8}>
                  <Col flex="auto">
                    <Form.Item
                      name="neighborhood"
                      noStyle
                      rules={[{ required: true, message: 'Please enter your neighborhood!' }]}
                    >
                      <Input size="large" placeholder="E.g. Downtown Area" />
                    </Form.Item>
                  </Col>
                  <Col>
                    <Button 
                      size="large" 
                      icon={<CompassOutlined />} 
                      onClick={handleAutoDetectLocation}
                      loading={isLocating}
                    >
                      Auto-detect
                    </Button>
                  </Col>
                </Row>
              </Form.Item>

              <Form.Item
                name="availability"
                label="Availability"
                rules={[{ required: true, message: 'Please select your available days!' }]}
              >
                <Checkbox.Group options={daysOfWeek} />
              </Form.Item>

              <Form.Item
                name="hasVehicle"
                valuePropName="checked"
              >
                <Checkbox style={{ fontWeight: 500 }}>
                  I have a vehicle available for use
                </Checkbox>
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

export default RegisterVolunteer;
