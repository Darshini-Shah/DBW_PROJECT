import React, { useState, useEffect } from 'react';
import { Card, Typography, Tabs, Form, Input, Button, message, Spin, Row, Col, Statistic, List, Tag, Select, Space, Divider, Modal } from 'antd';
import { UserOutlined, PhoneOutlined, EnvironmentOutlined, CheckCircleOutlined, TrophyOutlined, BarChartOutlined, ClockCircleOutlined, SettingOutlined, PlusOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { updateProfile, getUserAnalytics, addIssueComment } from '../api';

const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;

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

const Profile = ({ user }) => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  
  // Field worker comments
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [commenting, setCommenting] = useState(false);

  useEffect(() => {
    // Populate form with current user data
    if (user) {
      form.setFieldsValue({
        phone: user.phone,
        city: user.city,
        area: user.area,
        skills: user.skills || [],
        availability: user.availability || [],
        hasVehicle: user.hasVehicle ? 'yes' : 'no'
      });
    }
    
    fetchAnalytics();
  }, [user, form]);

  const fetchAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const data = await getUserAnalytics();
      setAnalyticsData(data);
    } catch (err) {
      message.error('Failed to load profile analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const handleUpdateProfile = async (values) => {
    setLoading(true);
    try {
      const payload = {
        ...values,
        hasVehicle: values.hasVehicle === 'yes'
      };
      
      const updatedUser = await updateProfile(payload);
      message.success('Profile updated successfully');
      
      // Optionally trigger a top-level state update if the parent component relies on it, 
      // but localStorage is already updated by api.js so reloading will show changes.
      window.location.reload(); 
    } catch (err) {
      message.error('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    
    setCommenting(true);
    try {
      await addIssueComment(selectedIssueId, newComment);
      message.success('Comment added successfully');
      setCommentModalVisible(false);
      setNewComment('');
      fetchAnalytics(); // Refresh the list to show the new comment
    } catch (err) {
      message.error('Failed to add comment');
    } finally {
      setCommenting(false);
    }
  };

  const openCommentModal = (issueId) => {
    setSelectedIssueId(issueId);
    setNewComment('');
    setCommentModalVisible(true);
  };

  const renderVolunteerAnalytics = () => {
    if (!analyticsData) return null;
    
    return (
      <div className="analytics-section">
        <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
          <Col xs={24} sm={8}>
            <Card style={{ borderRadius: '12px', borderLeft: '4px solid #ffd700' }}>
              <Statistic title="Total Points Earned" value={analyticsData.total_points} prefix={<TrophyOutlined style={{ color: '#ffd700' }} />} />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card style={{ borderRadius: '12px', borderLeft: '4px solid #52c41a' }}>
              <Statistic title="Active Working Days" value={analyticsData.total_active_days} prefix={<ClockCircleOutlined style={{ color: '#52c41a' }} />} />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card style={{ borderRadius: '12px', borderLeft: '4px solid #1890ff' }}>
              <Statistic title="Tasks Completed" value={analyticsData.tasks_completed} prefix={<CheckCircleOutlined style={{ color: '#1890ff' }} />} />
            </Card>
          </Col>
        </Row>

        <Title level={4}>Past Contributions & Reports</Title>
        <List
          itemLayout="vertical"
          dataSource={analyticsData.past_contributions || []}
          locale={{ emptyText: 'No past contributions found. Start volunteering today!' }}
          renderItem={item => (
            <Card style={{ marginBottom: '16px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <Text strong style={{ fontSize: '16px' }}>{item.category}</Text>
                  <div style={{ color: '#8c8c8c', fontSize: '12px' }}>
                    <EnvironmentOutlined /> {item.area} | {new Date(item.completed_at).toLocaleDateString()}
                  </div>
                </div>
                <Tag color="gold">+{item.points_earned} pts</Tag>
              </div>
              
              <Space>
                <Tag color="green">{item.days_worked} Days Present</Tag>
                <Text type="secondary" style={{ fontSize: '12px' }}>Task ID: {item.surid}</Text>
              </Space>

              {item.field_findings && (
                <div style={{ marginTop: '16px', background: '#f9f9f9', padding: '12px', borderRadius: '6px' }}>
                  <Text strong>Field Manager Report</Text>
                  {item.field_findings.summary && (
                    <Paragraph style={{ margin: '8px 0 0 0', fontSize: '13px' }}>
                      <Text strong>Summary: </Text>{item.field_findings.summary}
                    </Paragraph>
                  )}
                  {item.field_findings.notes && (
                    <Paragraph style={{ margin: '8px 0 0 0', fontSize: '13px' }}>
                      <Text strong>Findings: </Text>{item.field_findings.notes}
                    </Paragraph>
                  )}
                </div>
              )}
            </Card>
          )}
        />
      </div>
    );
  };

  const renderFieldWorkerAnalytics = () => {
    if (!analyticsData) return null;
    const stats = analyticsData.stats || {};
    
    return (
      <div className="analytics-section">
        <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
          <Col xs={24} sm={8}>
            <Card style={{ borderRadius: '12px', borderLeft: '4px solid #1890ff' }}>
              <Statistic title="Total Reports Submitted" value={stats.total} prefix={<BarChartOutlined style={{ color: '#1890ff' }} />} />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card style={{ borderRadius: '12px', borderLeft: '4px solid #faad14' }}>
              <Statistic title="Open / Ongoing" value={stats.open + (stats.ongoing || 0)} prefix={<ClockCircleOutlined style={{ color: '#faad14' }} />} />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card style={{ borderRadius: '12px', borderLeft: '4px solid #52c41a' }}>
              <Statistic title="Issues Resolved" value={stats.completed} prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />} />
            </Card>
          </Col>
        </Row>

        <Title level={4}>My Submitted Reports</Title>
        <List
          itemLayout="vertical"
          dataSource={analyticsData.reports || []}
          locale={{ emptyText: 'You haven\'t submitted any reports yet.' }}
          renderItem={item => (
            <Card style={{ marginBottom: '16px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <Text strong style={{ fontSize: '16px' }}>{item.category}</Text>
                  <div style={{ color: '#8c8c8c', fontSize: '12px' }}>
                    <ClockCircleOutlined /> Reported on {new Date(item.created_at).toLocaleDateString()}
                  </div>
                </div>
                <Tag color={item.status === 'completed' ? 'green' : item.status === 'ongoing' ? 'blue' : 'orange'}>
                  {item.status.toUpperCase()}
                </Tag>
              </div>
              
              <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: '12px' }}>Task ID: {item.surid}</Text>

              {/* Display existing comments */}
              {item.comments && item.comments.length > 0 && (
                <div style={{ marginTop: '12px', marginBottom: '16px' }}>
                  <Text strong style={{ fontSize: '13px' }}>Additional Info / Comments:</Text>
                  <List
                    size="small"
                    dataSource={item.comments}
                    renderItem={comment => (
                      <List.Item style={{ padding: '8px 0', borderBottom: '1px dashed #f0f0f0' }}>
                        <div style={{ width: '100%' }}>
                          <Text style={{ display: 'block' }}>{comment.text}</Text>
                          <Text type="secondary" style={{ fontSize: '11px' }}>
                            {new Date(comment.added_at).toLocaleString()}
                          </Text>
                        </div>
                      </List.Item>
                    )}
                  />
                </div>
              )}

              {/* Display field findings if completed */}
              {item.status === 'completed' && item.field_findings && (
                <div style={{ marginTop: '16px', background: '#f6ffed', padding: '12px', border: '1px solid #b7eb8f', borderRadius: '6px' }}>
                  <Text strong style={{ color: '#389e0d' }}>Resolution Report from Volunteer Team</Text>
                  {item.field_findings.summary && (
                    <Paragraph style={{ margin: '8px 0 0 0', fontSize: '13px' }}>
                      <Text strong>Summary: </Text>{item.field_findings.summary}
                    </Paragraph>
                  )}
                </div>
              )}

              <Divider style={{ margin: '12px 0' }} />
              <Button 
                type="dashed" 
                size="small" 
                icon={<PlusOutlined />} 
                onClick={() => openCommentModal(item.issue_id)}
              >
                Add Additional Info
              </Button>
            </Card>
          )}
        />
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', paddingBottom: '40px' }}>
      <div style={{ marginBottom: '24px' }}>
        <Button 
          type="text" 
          icon={<ArrowLeftOutlined />} 
          onClick={() => navigate('/')}
          style={{ fontSize: '16px', color: '#595959', padding: 0 }}
        >
          Back to Dashboard
        </Button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px', gap: '16px' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '32px', background: '#1890ff', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white', fontSize: '28px', fontWeight: 'bold' }}>
          {user?.fullName?.charAt(0).toUpperCase()}
        </div>
        <div>
          <Title level={2} style={{ margin: 0 }}>{user?.fullName}</Title>
          <Text type="secondary">{user?.email} • {user?.role === 'volunteer' ? 'Volunteer' : 'Field Worker'}</Text>
        </div>
      </div>

      <Card style={{ borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} styles={{ body: { padding: '0 24px' } }}>
        <Tabs defaultActiveKey="1" size="large">
          <TabPane tab={<span><BarChartOutlined /> Overview & Analytics</span>} key="1">
            <div style={{ padding: '24px 0' }}>
              {analyticsLoading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}><Spin size="large" tip="Loading analytics..." /></div>
              ) : (
                user?.role === 'volunteer' ? renderVolunteerAnalytics() : renderFieldWorkerAnalytics()
              )}
            </div>
          </TabPane>
          
          <TabPane tab={<span><SettingOutlined /> Edit Profile</span>} key="2">
            <div style={{ padding: '24px 0', maxWidth: '600px' }}>
              <Form
                form={form}
                layout="vertical"
                onFinish={handleUpdateProfile}
              >
                <Title level={4} style={{ marginBottom: '24px' }}>Personal Information</Title>
                
                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item label="Phone Number" name="phone">
                      <Input prefix={<PhoneOutlined />} placeholder="Phone Number" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item label="City" name="city">
                      <Input prefix={<EnvironmentOutlined />} placeholder="City" />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item label="Area/District" name="area">
                      <Input prefix={<EnvironmentOutlined />} placeholder="Area" />
                    </Form.Item>
                  </Col>
                </Row>

                {user?.role === 'volunteer' && (
                  <>
                    <Divider />
                    <Title level={4} style={{ marginBottom: '24px' }}>Volunteer Preferences</Title>
                    
                    <Form.Item label="Skills (Select from list)" name="skills">
                      <Select mode="multiple" placeholder="Select your skills" style={{ width: '100%' }}>
                        {skillOptions.map(skill => (
                          <Select.Option key={skill} value={skill}>{skill}</Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                    
                    <Form.Item label="Availability" name="availability">
                      <Select mode="multiple" placeholder="Select availability" style={{ width: '100%' }}>
                        <Select.Option value="Weekdays">Weekdays</Select.Option>
                        <Select.Option value="Weekends">Weekends</Select.Option>
                        <Select.Option value="Evenings">Evenings</Select.Option>
                        <Select.Option value="Emergency">Emergency Only</Select.Option>
                      </Select>
                    </Form.Item>

                    <Form.Item label="Do you have a personal vehicle?" name="hasVehicle">
                      <Select style={{ width: '100%' }}>
                        <Select.Option value="yes">Yes</Select.Option>
                        <Select.Option value="no">No</Select.Option>
                      </Select>
                    </Form.Item>
                  </>
                )}

                <Form.Item style={{ marginTop: '32px' }}>
                  <Button type="primary" htmlType="submit" size="large" loading={loading} block>
                    Save Changes
                  </Button>
                </Form.Item>
              </Form>
            </div>
          </TabPane>
        </Tabs>
      </Card>

      {/* Field Worker Add Comment Modal */}
      <Modal
        title="Add Additional Info to Report"
        open={commentModalVisible}
        onOk={handleAddComment}
        onCancel={() => setCommentModalVisible(false)}
        confirmLoading={commenting}
        okText="Add Info"
      >
        <p>Provide additional context, updates, or notes about this issue for the volunteer team.</p>
        <Input.TextArea
          rows={4}
          placeholder="E.g. The flooded area has expanded. The local community center is now open for shelter."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
        />
      </Modal>
    </div>
  );
};

export default Profile;
