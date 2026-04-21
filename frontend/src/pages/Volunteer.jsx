import React, { useState, useEffect, useCallback } from 'react';
import { List, Card, Typography, Badge, Button, Space, Empty, Spin, Tag, Slider, Tooltip, App as AntdApp } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, ReloadOutlined, EnvironmentOutlined, ClockCircleOutlined, FilterOutlined, TrophyOutlined, CarryOutOutlined } from '@ant-design/icons';
import { getIssues, acceptIssue } from '../api';
import { useNavigate } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const { Title, Text } = Typography;

const urgencyColors = {
  1: '#52c41a', 2: '#52c41a', 3: '#faad14',
  4: '#faad14', 5: '#fa8c16', 6: '#fa8c16',
  7: '#f5222d', 8: '#f5222d', 9: '#a8071a', 10: '#a8071a',
};

const urgencyLabels = {
  1: 'Low', 2: 'Low', 3: 'Moderate',
  4: 'Moderate', 5: 'Elevated', 6: 'Elevated',
  7: 'High', 8: 'High', 9: 'Critical', 10: 'Critical',
};

const Volunteer = ({ user }) => {
  const { message } = AntdApp.useApp();
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(null);
  const [radiusKm, setRadiusKm] = useState(15);
  const navigate = useNavigate();
  const [knownIssueIds, setKnownIssueIds] = useState(new Set());
  const initialLoadDone = React.useRef(false);

  const fetchIssues = useCallback(async (overridingRadius = null) => {
    setLoading(true);
    try {
      const activeRadius = overridingRadius !== null ? overridingRadius : radiusKm;
      const params = {
        latitude: user?.latitude,
        longitude: user?.longitude,
        radius_km: activeRadius,
        status_filter: 'open',
      };
      const data = await getIssues(params);
      const fetchedIssues = data.issues || [];
      
      setIssues(fetchedIssues);

      // Check for new issues to trigger toast
      if (initialLoadDone.current) {
        fetchedIssues.forEach(issue => {
          if (!knownIssueIds.has(issue._id)) {
            const locationName = issue['geographical area'] || issue.city || 'your area';
            toast.info(`New task available in ${locationName}!`, {
              position: "top-right",
              autoClose: 5000,
            });
          }
        });
      } else {
        initialLoadDone.current = true;
      }
      
      // Update known IDs
      setKnownIssueIds(new Set(fetchedIssues.map(i => i._id)));
      
    } catch (err) {
      console.error('Failed to fetch issues:', err);
      message.error('Failed to load nearby issues');
    } finally {
      setLoading(false);
    }
  }, [user, radiusKm]);

  useEffect(() => {
    fetchIssues();
    // Auto-refresh every 60s
    const interval = setInterval(() => fetchIssues(), 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]); // Only re-fetch if user changes, slider uses onChangeComplete

  const handleAccept = async (issueId) => {
    setAccepting(issueId);
    try {
      await acceptIssue(issueId);
      message.success('Task accepted! Thank you for volunteering.');
      fetchIssues(); // Refresh the list
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to accept task';
      message.error(detail);
    } finally {
      setAccepting(null);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <ToastContainer />
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={() => navigate(-1)} 
            shape="circle" 
            style={{ border: 'none', background: '#f0f0f0' }}
          />
          <div>
            <Title level={2} style={{ margin: 0 }}>Nearby Issues</Title>
            <Text style={{ color: '#8c8c8c' }}>
              <EnvironmentOutlined /> Showing tasks within {radiusKm}km of {user?.area || user?.city || 'your location'}
            </Text>
          </div>
        </div>
        <Space>
          <button 
            className="premium-heatmap-btn"
            onClick={() => navigate('/heatmap')}
          >
            <EnvironmentOutlined /> Priority Heatmap
          </button>
          <Button 
            icon={<TrophyOutlined />} 
            onClick={() => navigate('/leaderboard')}
            style={{ borderColor: '#ffd700', color: '#b8860b' }}
          >
            Leaderboard
          </Button>
          <Button 
            icon={<CarryOutOutlined />} 
            onClick={() => navigate('/my-tasks')}
            type="primary"
          >
            My Tasks
          </Button>
          <Button icon={<ReloadOutlined />} onClick={fetchIssues} loading={loading}>
            Refresh
          </Button>
        </Space>
      </div>

      {/* Radius filter */}
      <Card size="small" style={{ borderRadius: '12px', marginBottom: '16px' }} styles={{ body: { padding: '12px 24px' } }}>
        <Space style={{ width: '100%' }} direction="vertical" size={0}>
          <Text strong style={{ fontSize: '13px' }}>
            <FilterOutlined /> Search Radius: {radiusKm} km
          </Text>
          <Slider
            min={5}
            max={100}
            value={radiusKm}
            onChange={setRadiusKm}
            onChangeComplete={fetchIssues}
            marks={{ 5: '5km', 15: '15km', 30: '30km', 60: '60km', 100: '100km' }}
            tooltip={{ formatter: (v) => `${v} km` }}
          />
        </Space>
      </Card>

      <Card style={{ borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} styles={{ body: { padding: 0 } }}>
        {loading ? (
          <div style={{ padding: '64px', textAlign: 'center' }}>
            <Spin size="large" />
            <div style={{ marginTop: '16px', color: '#8c8c8c' }}>Loading nearby issues...</div>
          </div>
        ) : issues.length === 0 ? (
          <Empty
            style={{ padding: '64px' }}
            description={
              <span>
                No open issues within {radiusKm}km.
                <br />
                <Text type="secondary">Try increasing the search radius.</Text>
              </span>
            }
          />
        ) : (
          <List
            itemLayout="horizontal"
            dataSource={issues}
            renderItem={(item) => {
              const urgency = item['scale of urgency'] || item.urgency || 1;
              const urgencyColor = urgencyColors[urgency] || '#1890ff';
              const urgencyLabel = urgencyLabels[urgency] || 'Unknown';

              return (
                <List.Item
                  style={{ padding: '20px 24px', borderBottom: '1px solid #f0f0f0' }}
                  actions={[
                    <Button
                      type="primary"
                      ghost
                      icon={<CheckCircleOutlined />}
                      loading={accepting === item._id}
                      onClick={() => handleAccept(item._id)}
                    >
                      Accept
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space size="middle" wrap>
                        <span style={{ fontSize: '15px', fontWeight: 600 }}>
                          {item['type of issue'] || item.category || 'Issue'}
                        </span>
                        <Badge
                          count={`Urgency ${urgency}`}
                          style={{ backgroundColor: urgencyColor }}
                        />
                        {item['geographical area'] && (
                          <Tag icon={<EnvironmentOutlined />} color="blue">
                            {item['geographical area']}
                          </Tag>
                        )}
                      </Space>
                    }
                    description={
                      <div style={{ marginTop: '8px' }}>
                        <div style={{ color: '#595959', marginBottom: '6px' }}>
                          {item['what is the issue'] || item.description || 'No description available'}
                        </div>
                        <Space size="middle" style={{ fontSize: '12px', color: '#8c8c8c' }}>
                          {item.surid && <span>#{item.surid}</span>}
                          {item.date && <span><ClockCircleOutlined /> {item.date}</span>}
                          {item['number of volunteer need'] && (
                            <span>Needs {item['number of volunteer need']} volunteer(s)</span>
                          )}
                        </Space>
                      </div>
                    }
                  />
                </List.Item>
              );
            }}
          />
        )}
      </Card>
    </div>
  );
};

export default Volunteer;
