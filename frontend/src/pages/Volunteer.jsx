import React, { useState, useEffect, useCallback } from 'react';
import { List, Card, Typography, Badge, Button, Space, Empty, Spin, Tag, Slider, Tooltip, App as AntdApp } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, ReloadOutlined, EnvironmentOutlined, ClockCircleOutlined, FilterOutlined, TrophyOutlined, CarryOutOutlined, UserOutlined } from '@ant-design/icons';
import { getIssues, acceptIssue } from '../api';
import { useNavigate } from 'react-router-dom';
// react-toastify removed

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
  const initialLoadDone = React.useRef(false);

  // Keep a ref that always mirrors radiusKm so fetchIssues can read the
  // latest value without needing it as a dependency (which would recreate
  // the callback — and retrigger the useEffect — on every slider tick).
  const radiusRef = React.useRef(15);
  const handleRadiusChange = (val) => {
    radiusRef.current = val;
    setRadiusKm(val); // update display only
  };

  /**
   * Fetch issues from the backend.
   * @param {number|null} forcedRadius - Explicit value from onChangeComplete.
   *   When omitted, reads from radiusRef (always up-to-date).
   * @param {boolean} isManual - Whether this is a manual refresh triggered by user.
   */
  const fetchIssues = useCallback(async (forcedRadius = null, isManual = false) => {
    setLoading(true);
    try {
      const activeRadius = forcedRadius !== null ? forcedRadius : radiusRef.current;
      const params = {
        latitude: user?.latitude,
        longitude: user?.longitude,
        radius_km: activeRadius,
        status_filter: 'open',
      };
      const data = await getIssues(params);
      setIssues(data.issues || []);
      initialLoadDone.current = true;
      if (isManual) {
        message.success('Issues updated!');
      }
    } catch (err) {
      console.error('Failed to fetch issues:', err);
      message.error('Failed to load nearby issues');
    } finally {
      setLoading(false);
    }
  }, [user, message]); // radiusKm intentionally excluded — use radiusRef instead

  useEffect(() => {
    fetchIssues();
    // Auto-refresh every 60 s using the latest radius from radiusRef
    const interval = setInterval(() => fetchIssues(), 60000);
    return () => clearInterval(interval);
  }, [fetchIssues]);

  const handleAccept = async (issueId) => {
    setAccepting(issueId);
    try {
      await acceptIssue(issueId);
      message.success('Task accepted! Thank you for volunteering.');
      fetchIssues();
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to accept task';
      message.error(detail);
    } finally {
      setAccepting(null);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* ToastContainer removed */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'nowrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(-1)}
            shape="circle"
            style={{ border: 'none', background: '#f0f0f0', flexShrink: 0 }}
          />
          <div style={{ minWidth: 0 }}>
            <Title level={2} style={{ margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Nearby Issues</Title>
            <Text style={{ color: '#8c8c8c', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <EnvironmentOutlined /> Showing tasks within {radiusKm}km of {user?.area || user?.city || 'your location'}
            </Text>
          </div>
        </div>
        <Space style={{ flexShrink: 0 }}>
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
          <div style={{ textAlign: 'right' }}>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => fetchIssues(null, true)}
              loading={loading}
              style={{ borderRadius: '8px' }}
            >
              Refresh
            </Button>
          </div>
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
            onChange={handleRadiusChange}
            onChangeComplete={(committedValue) => fetchIssues(committedValue)}
            marks={{ 5: '5km', 15: '15km', 30: '30km', 60: '60km', 100: '100km' }}
            tooltip={{ formatter: (v) => `${v} km` }}
          />
        </Space>

        {initialLoadDone.current && !loading && (
                <span style={{ fontSize: '11px', color: '#bfbfbf', marginLeft: '12px' }}>
                  (Last updated: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})
                </span>
              )}
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
                        <Space size="middle" style={{ fontSize: '12px', color: '#8c8c8c' }} wrap>
                          {item.surid && <span>#{item.surid}</span>}
                          {item.date && <span><ClockCircleOutlined /> {item.date}</span>}
                          {item['number of volunteer need'] !== undefined && (
                            <span style={{ fontWeight: 500, color: item['number of volunteer need'] > 0 ? '#1890ff' : '#52c41a' }}>
                              {item['number of volunteer need'] > 0
                                ? `Needs ${item['number of volunteer need']} more`
                                : 'Fully Staffed'}
                            </span>
                          )}
                        </Space>

                        {/* Enrolled Volunteers */}
                        {item.assigned_volunteers && item.assigned_volunteers.length > 0 && (
                          <div style={{ marginTop: '12px', padding: '8px 12px', background: '#f9f9f9', borderRadius: '8px', border: '1px solid #f0f0f0' }}>
                            <div style={{ fontSize: '12px', color: '#8c8c8c', marginBottom: '4px', fontWeight: 500 }}>
                              Already Enrolled ({item.assigned_volunteers.length}):
                            </div>
                            <Space size={[0, 4]} wrap>
                              {item.assigned_volunteers.map((vol, idx) => (
                                <Tag
                                  key={vol.id || idx}
                                  icon={<UserOutlined />}
                                  style={{ borderRadius: '12px', background: '#fff', border: '1px solid #d9d9d9' }}
                                >
                                  {vol.name || 'Anonymous'}
                                </Tag>
                              ))}
                            </Space>
                          </div>
                        )}
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
