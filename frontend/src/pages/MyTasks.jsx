import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, List, Typography, Button, Space, Tag, Modal, InputNumber, message, Divider, Empty, Spin, Alert, Avatar } from 'antd';
import { CheckCircleOutlined, UserOutlined, ClockCircleOutlined, SettingOutlined, TrophyOutlined, PlayCircleOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { getMyTasks, updateVolunteerDays, completeTask, startTask } from '../api';

const { Title, Text } = Typography;

const MyTasks = ({ user }) => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [managerModalVisible, setManagerModalVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await getMyTasks();
      setTasks(res.issues || []);
    } catch (err) {
      message.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateDays = async (volunteerId, currentDays) => {
    try {
      await updateVolunteerDays(selectedTask._id, volunteerId, 1);
      message.success('Point added for volunteer');
      // Refresh selected task data locally
      const updatedVols = selectedTask.assigned_volunteers.map(v => 
        v.id === volunteerId ? { ...v, days_worked: (v.days_worked || 0) + 1 } : v
      );
      setSelectedTask({ ...selectedTask, assigned_volunteers: updatedVols });
      fetchTasks(); // Also refresh main list
    } catch (err) {
      message.error('Failed to update days');
    }
  };

  const handleCompleteTask = async () => {
    setUpdating(true);
    try {
      await completeTask(selectedTask._id);
      message.success('Task marked as complete! Points distributed.');
      setManagerModalVisible(false);
      fetchTasks();
    } catch (err) {
      message.error('Failed to complete task');
    } finally {
      setUpdating(false);
    }
  };

  const handleStartTask = async (taskId) => {
    try {
      await startTask(taskId);
      message.success('Task started! Go get them.');
      fetchTasks();
    } catch (err) {
      message.error('Failed to start task');
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '100px' }}><Spin size="large" /></div>;

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px' }}>
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
      <Title level={2}>My Assigned Tasks</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: '32px' }}>
        Manage your active tasks and coordinate with other volunteers.
      </Text>

      {tasks.length === 0 ? (
        <Empty description="No active tasks assigned to you yet." />
      ) : (
        <List
          grid={{ gutter: 16, xs: 1, sm: 1, md: 1, lg: 1, xl: 1 }}
          dataSource={tasks}
          renderItem={task => (
            <Card 
              style={{ marginBottom: '16px', borderRadius: '12px', border: task.status === 'completed' ? '1px solid #d9d9d9' : '1px solid #1890ff' }}
              actions={[
                task.is_manager && !task.start_date && task.status !== 'completed' && (
                  <Button 
                    type="primary" 
                    icon={<PlayCircleOutlined />} 
                    style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                    onClick={() => handleStartTask(task._id)}
                  >
                    Start Task
                  </Button>
                ),
                task.is_manager && (task.start_date || task.status === 'completed') && (
                  <Button 
                    type="primary" 
                    icon={<SettingOutlined />} 
                    onClick={() => { setSelectedTask(task); setManagerModalVisible(true); }}
                  >
                    Manager Control
                  </Button>
                )
              ]}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <Title level={4} style={{ margin: 0 }}>{task['type of issue'] || task.category}</Title>
                  <Text type="secondary"><ClockCircleOutlined /> Responding to {task.surid}</Text>
                </div>
                <Space>
                  {task.is_manager && <Tag color="gold" icon={<TrophyOutlined />}>Task Manager</Tag>}
                  <Tag color={task.status === 'completed' ? 'green' : task.status === 'in_progress' ? 'orange' : 'blue'}>
                    {task.status.toUpperCase()}
                  </Tag>
                </Space>
              </div>
              <Divider style={{ margin: '12px 0' }} />
              <p>{task['what is the issue'] || task.description}</p>
              
              <Space direction="vertical" style={{ width: '100%', marginBottom: '16px' }}>
                {task.start_date && (
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    <PlayCircleOutlined /> Started: {new Date(task.start_date).toLocaleString()}
                  </Text>
                )}
                {task.end_date && (
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    <CheckCircleOutlined /> Completed: {new Date(task.end_date).toLocaleString()}
                  </Text>
                )}
              </Space>
              
              <div style={{ background: '#f5f5f5', padding: '12px', borderRadius: '8px' }}>
                <Text strong style={{ display: 'block', marginBottom: '8px' }}>Team:</Text>
                <Space size="middle" wrap>
                  {task.assigned_volunteers.map(v => (
                    <Tag key={v.id} icon={<UserOutlined />} style={{ padding: '4px 8px' }}>
                      {v.name} {v.id === user.id && '(You)'}
                    </Tag>
                  ))}
                </Space>
              </div>
            </Card>
          )}
        />
      )}

      {/* Manager Modal */}
      <Modal
        title={
          <Space>
            <SettingOutlined />
            <span>Task Manager Panel: {selectedTask?.surid}</span>
          </Space>
        }
        open={managerModalVisible}
        onCancel={() => setManagerModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setManagerModalVisible(false)}>Close</Button>,
          <Button 
            key="done" 
            type="primary" 
            danger 
            icon={<CheckCircleOutlined />} 
            onClick={handleCompleteTask}
            loading={updating}
          >
            Mark Task as Done (Award Points)
          </Button>
        ]}
        width={600}
      >
        <Alert 
          title="Manager mode" 
          description="As the volunteer with the most points on this task, you are the manager. Track daily participation here. Clicking 'Done' will calculate points (Days * 5) for everyone."
          type="info" 
          showIcon 
          style={{ marginBottom: '20px' }}
        />

        <List
          header={<Text strong>Assign Daily Credits</Text>}
          dataSource={selectedTask?.assigned_volunteers || []}
          renderItem={v => (
            <List.Item
              actions={[
                <Button 
                  size="small" 
                  type="primary" 
                  onClick={() => handleUpdateDays(v.id, v.days_worked)}
                >
                  +1 Day Worked
                </Button>
              ]}
            >
              <List.Item.Meta
                avatar={<Avatar icon={<UserOutlined />} />}
                title={v.name}
                description={<span>Days Worked: <Text strong>{v.days_worked || 0}</Text> | Est. Points: <Text type="success">{(v.days_worked || 0) * 5}</Text></span>}
              />
            </List.Item>
          )}
        />
      </Modal>
    </div>
  );
};

export default MyTasks;
