import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Card, Typography, Input, Space, Badge, Avatar, Button } from 'antd';
import { TrophyOutlined, SearchOutlined, UserOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { getLeaderboard } from '../api';

const { Title, Text } = Typography;

const Leaderboard = () => {
  const navigate = useNavigate();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const res = await getLeaderboard();
        setData(res.leaderboard || []);
      } catch (err) {
        console.error('Failed to fetch leaderboard:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
  }, []);

  const filteredData = data.filter(item => 
    item.fullName.toLowerCase().includes(searchText.toLowerCase())
  );

  const columns = [
    {
      title: 'Rank',
      key: 'rank',
      render: (text, record, index) => {
        const rank = index + 1;
        if (rank === 1) return <Badge count="1" style={{ backgroundColor: '#ffd700' }} />;
        if (rank === 2) return <Badge count="2" style={{ backgroundColor: '#c0c0c0' }} />;
        if (rank === 3) return <Badge count="3" style={{ backgroundColor: '#cd7f32' }} />;
        return <Text type="secondary">{rank}</Text>;
      },
      width: 80,
    },
    {
      title: 'Volunteer',
      dataIndex: 'fullName',
      key: 'fullName',
      render: (text, record) => (
        <Space>
          <Avatar icon={<UserOutlined />} />
          <Text strong>{text}</Text>
        </Space>
      ),
    },
    {
      title: 'Area',
      dataIndex: 'area',
      key: 'area',
      render: (text, record) => <Text type="secondary">{text || record.city || 'N/A'}</Text>,
    },
    {
      title: 'Points',
      dataIndex: 'points',
      key: 'points',
      sorter: (a, b) => a.points - b.points,
      render: (points) => (
        <Badge 
          count={points} 
          overflowCount={99999} 
          style={{ backgroundColor: '#52c41a' }} 
          showZero
        />
      ),
    },
  ];

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ marginBottom: '24px' }}>
        <Button 
          type="text" 
          icon={<ArrowLeftOutlined />} 
          onClick={() => navigate('/')}
          style={{ fontSize: '16px', color: '#595959' }}
        >
          Back to Dashboard
        </Button>
      </div>
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <TrophyOutlined style={{ fontSize: '48px', color: '#ffd700', marginBottom: '16px' }} />
        <Title level={2}>Volunteer Leaderboard</Title>
      <Text type="secondary">Top contributors making an impact in their communities. Points = Days Present × Issue Urgency.</Text>
      </div>

      <Card style={{ borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        <div style={{ marginBottom: '24px' }}>
          <Input
            placeholder="Search for your name..."
            prefix={<SearchOutlined />}
            size="large"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{ borderRadius: '8px' }}
          />
        </div>

        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="_id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          style={{ borderRadius: '8px' }}
        />
      </Card>
    </div>
  );
};

export default Leaderboard;
