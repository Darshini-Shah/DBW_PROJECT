import React, { useState } from 'react';
import { Card, Form, Select, Slider, Button, message, Typography, Typography as AntTypography } from 'antd';
import { EnvironmentOutlined, SendOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { Option } = Select;

const FieldWorker = () => {
  const [form] = Form.useForm();
  const [location, setLocation] = useState(null);
  const [isLocating, setIsLocating] = useState(false);

  const onFinish = (values) => {
    console.log('Success:', { ...values, location });
    message.success('Report submitted successfully!');
    form.resetFields();
    setLocation(null);
  };

  const handleCaptureLocation = () => {
    setIsLocating(true);
    // Simulate a brief delay for location capture
    setTimeout(() => {
      setLocation({ lat: 40.7128, lng: -74.0060 });
      setIsLocating(false);
      message.success('Location captured successfully!');
    }, 1000);
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <Title level={2} style={{ margin: 0 }}>Report an Issue</Title>
        <Text style={{ color: '#8c8c8c' }}>Submit details from the field to request assistance.</Text>
      </div>

      <Card
        style={{ borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
        bodyStyle={{ padding: '24px' }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{ urgency: 3 }}
        >
          <Form.Item
            name="category"
            label="Issue Category"
            rules={[{ required: true, message: 'Please select a category!' }]}
          >
            <Select placeholder="Select the type of issue" size="large">
              <Option value="food">Food Shortage</Option>
              <Option value="medical">Medical Emergency</Option>
              <Option value="shelter">Shelter Reqiured</Option>
              <Option value="infrastructure">Infrastructure Damage</Option>
              <Option value="other">Other</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="urgency"
            label="Urgency Level (1 - Low, 5 - Critical)"
            rules={[{ required: true }]}
          >
            <Slider
              min={1}
              max={5}
              marks={{
                1: '1',
                2: '2',
                3: '3',
                4: '4',
                5: { style: { color: '#f5222d' }, label: <strong>5</strong> },
              }}
            />
          </Form.Item>

          <Form.Item label="Location">
            {location ? (
              <div style={{ padding: '12px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: '8px', color: '#389e0d' }}>
                <EnvironmentOutlined style={{ marginRight: '8px' }} />
                Location captured: {location.lat}, {location.lng}
              </div>
            ) : (
              <Button 
                onClick={handleCaptureLocation} 
                icon={<EnvironmentOutlined />} 
                loading={isLocating}
                block
              >
                Capture Location
              </Button>
            )}
          </Form.Item>

          <Form.Item style={{ marginTop: '32px', marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" size="large" block icon={<SendOutlined />}>
              Submit Report
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default FieldWorker;
