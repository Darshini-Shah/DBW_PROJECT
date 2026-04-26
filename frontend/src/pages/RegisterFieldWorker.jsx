import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, Row, Col, Space, Alert, Upload, App as AntApp } from 'antd';
import { UserAddOutlined, ArrowRightOutlined, CompassOutlined, EnvironmentOutlined, ArrowLeftOutlined, CheckCircleOutlined, ClockCircleOutlined, IdcardOutlined } from '@ant-design/icons';
import { registerUser, sendOTP, verifyOTP, sendSMSOTP, verifySMSOTP } from '../api';
import LocationPickerMap from '../components/LocationPickerMap';

const { Title, Text } = Typography;

const getBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });

const normFile = (e) => {
  if (Array.isArray(e)) return e;
  return e?.fileList;
};

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

  // Phone OTP state
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtpVerified, setPhoneOtpVerified] = useState(false);
  const [phoneOtpLoading, setPhoneOtpLoading] = useState(false);
  const [phoneVerifyingOtp, setPhoneVerifyingOtp] = useState(false);
  const [phoneOtp, setPhoneOtp] = useState('');

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

  const handleSendPhoneOtp = async () => {
    const phone = form.getFieldValue('phone');
    if (!phone) {
      message.error('Please enter your phone number first!');
      return;
    }
    setPhoneOtpLoading(true);
    try {
      const res = await sendSMSOTP(phone);
      message.success('SMS OTP sent to your phone!');
      if (res.dev_otp) message.info(`[DEV MODE] SMS OTP: ${res.dev_otp}`, 10);
      setPhoneOtpSent(true);
    } catch (err) {
      message.error(err.response?.data?.detail || 'Failed to send SMS OTP');
    } finally {
      setPhoneOtpLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async () => {
    const phone = form.getFieldValue('phone');
    if (!phoneOtp) {
      message.error('Please enter the SMS OTP!');
      return;
    }
    setPhoneVerifyingOtp(true);
    try {
      await verifySMSOTP(phone, phoneOtp);
      message.success('Phone verified successfully!');
      setPhoneOtpVerified(true);
    } catch (err) {
      message.error('Invalid SMS OTP. Please try again.');
    } finally {
      setPhoneVerifyingOtp(false);
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
    if (!otpVerified || !phoneOtpVerified) {
      message.error('Please verify both Email and Phone with OTP first!');
      return;
    }

    if (!locationData) {
      message.error('GPS Location is mandatory! Please click the auto-detect button.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let idCardBase64 = null;
      // Robustly get the file object from Ant Design Upload state
      const fileList = values.id_card;
      if (fileList && fileList.length > 0) {
        idCardBase64 = await getBase64(fileList[0].originFileObj);
      }

      const { user } = await registerUser({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
        phone: values.phone,
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        street: values.street,
        area: values.area,
        city: values.city,
        state: values.state,
        pincode: values.pincode,
        id_card: idCardBase64,
        role: 'field_worker',
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
            <Row gutter={16}>
              <Col xs={24}>
                <Form.Item name="fullName" label="Full Name" rules={[{ required: true, message: 'Please input your full name!' }]}>
                  <Input size="large" placeholder="E.g. Jane Doe" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24}>
                <Form.Item label="Phone Number" required>
                  <Form.Item 
                    name="phone" 
                    noStyle 
                    rules={[
                      { required: true, message: 'Please input your phone number!' },
                      { pattern: /^(?:\+91)?[6-9]\d{9}$/, message: 'Please enter a valid 10-digit mobile number' }
                    ]}
                  >
                    <Input 
                      size="large" 
                      placeholder="E.g. 7358480256" 
                      disabled={phoneOtpVerified} 
                      prefix={<span style={{ color: '#bfbfbf' }}>+91</span>}
                      variant="filled"
                      style={{ borderRadius: '12px' }}
                      suffix={
                        !phoneOtpVerified && (
                          <Button 
                            type="link" 
                            size="small"
                            onClick={handleSendPhoneOtp} 
                            loading={phoneOtpLoading} 
                            style={{ padding: 0 }}
                          >
                            {phoneOtpSent ? 'Resend' : 'Send OTP'}
                          </Button>
                        )
                      }
                    />
                  </Form.Item>
                </Form.Item>

                {phoneOtpSent && !phoneOtpVerified && (
                  <div style={{ marginTop: '12px', marginBottom: '20px' }}>
                    <div style={{ marginBottom: '8px' }}>
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        <ClockCircleOutlined /> Enter 6-digit SMS code
                      </Text>
                    </div>
                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                      <Input.OTP 
                        length={6} 
                        value={phoneOtp} 
                        onChange={(val) => setPhoneOtp(val)} 
                        size="large"
                        variant="filled"
                        style={{ borderRadius: '12px' }}
                      />
                      <Button 
                        type="primary" 
                        onClick={handleVerifyPhoneOtp} 
                        loading={phoneVerifyingOtp}
                        block
                        style={{ borderRadius: '10px', height: '40px', fontWeight: 600 }}
                      >
                        Verify & Continue
                      </Button>
                    </Space>
                  </div>
                )}
                {phoneOtpVerified && (
                  <div style={{ 
                    background: '#f6ffed', 
                    padding: '12px 16px', 
                    borderRadius: '12px', 
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    border: '1px solid #b7eb8f'
                  }}>
                    <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '18px' }} />
                    <Text strong style={{ color: '#389e0d' }}>Verified Mobile Number</Text>
                  </div>
                )}
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24}>
                <Form.Item label="Email Address" required>
                  <Form.Item name="email" noStyle rules={[{ required: true, message: 'Please input your email!' }, { type: 'email', message: 'Please enter a valid email!' }]}>
                    <Input 
                      size="large" 
                      placeholder="name@example.com" 
                      disabled={otpVerified} 
                      variant="filled"
                      style={{ borderRadius: '12px' }}
                      suffix={
                        !otpVerified && (
                          <Button
                            type="link"
                            size="small"
                            onClick={handleSendOtp}
                            loading={otpLoading}
                            style={{ padding: 0 }}
                          >
                            {otpSent ? 'Resend' : 'Send OTP'}
                          </Button>
                        )
                      }
                    />
                  </Form.Item>
                </Form.Item>

                {otpSent && !otpVerified && (
                  <div style={{ marginTop: '12px', marginBottom: '20px' }}>
                    <div style={{ marginBottom: '8px' }}>
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        <ClockCircleOutlined /> Enter 6-digit email code
                      </Text>
                    </div>
                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                      <Input.OTP
                        length={6}
                        value={otp}
                        onChange={(val) => setOtp(val)}
                        size="large"
                        variant="filled"
                        style={{ borderRadius: '12px' }}
                      />
                      <Button
                        type="primary"
                        onClick={handleVerifyOtp}
                        loading={verifyingOtp}
                        block
                        style={{ borderRadius: '10px', height: '40px', fontWeight: 600 }}
                      >
                        Verify Email Address
                      </Button>
                    </Space>
                  </div>
                )}
                {otpVerified && (
                  <div style={{
                    background: '#f6ffed',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    border: '1px solid #b7eb8f'
                  }}>
                    <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '18px' }} />
                    <Text strong style={{ color: '#389e0d' }}>Verified Email Address</Text>
                  </div>
                )}
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24}>
                <Form.Item 
                  name="password" 
                  label="Password" 
                  rules={[
                    { required: true, message: 'Please input a password!' },
                    { min: 8, message: 'Password must be at least 8 characters!' },
                    { 
                      pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, 
                      message: 'Password must include uppercase, lowercase, number and special character!' 
                    }
                  ]}
                >
                  <Input.Password size="large" placeholder="At least 8 characters with mix of types" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item 
              name="id_card" 
              label="Verification ID / Certification Card" 
              valuePropName="fileList"
              getValueFromEvent={normFile}
              rules={[{ required: true, message: 'Please upload a valid ID for verification' }]}
              extra="Upload a photo of your ID"
            >
              <Upload 
                listType="picture-card"
                maxCount={1}
                beforeUpload={() => false} // Prevent auto upload
                accept="image/*"
              >
                <div>
                  <IdcardOutlined style={{ fontSize: '24px', color: '#8c8c8c' }} />
                  <div style={{ marginTop: 8, color: '#595959' }}>Upload ID</div>
                </div>
              </Upload>
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
                    <Form.Item name="area" label="Area / District">
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
