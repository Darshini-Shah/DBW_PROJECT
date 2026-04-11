import React from 'react';
import { List, Card, Typography, Badge, Button, Space } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const mockTasks = [
  { id: 1, title: 'Food delivery needed in Sector 4', urgency: 'High', description: 'Require 50 food packets delivered immediately.', type: 'critical' },
  { id: 2, title: 'Medical supplies distribution in Sector 2', urgency: 'Low', description: 'Routine distribution of first aid kits.', type: 'normal' },
  { id: 3, title: 'Evacuation assistance in North Zone', urgency: 'High', description: 'Help elderly residents evacuate to the shelter.', type: 'critical' },
  { id: 4, title: 'Water bottle supply to Central Park', urgency: 'Low', description: 'Distribute drinking water to volunteers and residents.', type: 'normal' },
  { id: 5, title: 'Setup temporary shelter in East Wing', urgency: 'High', description: 'Urgent setup of tents before nightfall.', type: 'critical' },
];

const Volunteer = () => {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>Available Tasks</Title>
          <Text style={{ color: '#8c8c8c' }}>Review and accept tasks in your area.</Text>
        </div>
      </div>

      <Card style={{ borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} bodyStyle={{ padding: 0 }}>
        <List
          itemLayout="horizontal"
          dataSource={mockTasks}
          renderItem={(item) => (
            <List.Item
              style={{ padding: '24px', borderBottom: '1px solid #f0f0f0' }}
              actions={[
                <Button type="primary" ghost icon={<CheckCircleOutlined />}>Accept</Button>
              ]}
            >
              <List.Item.Meta
                title={
                  <Space size="large">
                    <span style={{ fontSize: '16px', fontWeight: 600 }}>{item.title}</span>
                    <Badge 
                      count={item.urgency} 
                      style={{ backgroundColor: item.type === 'critical' ? '#f5222d' : '#1890ff' }} 
                    />
                  </Space>
                }
                description={<span style={{ color: '#595959', marginTop: '8px', display: 'block' }}>{item.description}</span>}
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
};

export default Volunteer;
