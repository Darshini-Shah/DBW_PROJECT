import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, List, Typography, Button, Space, Tag, Modal, Input, message, Divider, Empty, Spin, Alert, Avatar } from 'antd';
import { CheckCircleOutlined, UserOutlined, ClockCircleOutlined, SettingOutlined, TrophyOutlined, PlayCircleOutlined, ArrowLeftOutlined, FileTextOutlined } from '@ant-design/icons';
import { getMyTasks, updateVolunteerDays, completeTask, startTask } from '../api';

const { Title, Text } = Typography;
const { TextArea } = Input;

const MyTasks = ({ user }) => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [managerModalVisible, setManagerModalVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [updating, setUpdating] = useState(false);

  // Completion flow state
  const [completionStep, setCompletionStep] = useState('manage'); // 'manage' | 'confirm'
  const [findings, setFindings] = useState('');
  const [summary, setSummary] = useState('');

  // Findings viewer for completed tasks
  const [findingsModalVisible, setFindingsModalVisible] = useState(false);
  const [viewingFindings, setViewingFindings] = useState(null);

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
      const res = await updateVolunteerDays(selectedTask._id, volunteerId, 1);
      // Show remaining budget if server returned it
      const maxDays = res?.max_allowed_days;
      const newTotal = res?.days_worked ?? (currentDays + 1);
      const remaining = maxDays != null ? maxDays - newTotal : null;
      const suffix = remaining != null ? ` (${remaining} day(s) remaining this task)` : '';
      message.success(`+1 day recorded for volunteer${suffix}`);
      // Reflect change locally without waiting for full refetch
      const updatedVols = selectedTask.assigned_volunteers.map(v =>
        v.id === volunteerId ? { ...v, days_worked: newTotal } : v
      );
      setSelectedTask({ ...selectedTask, assigned_volunteers: updatedVols });
      fetchTasks(); // Also refresh main list
    } catch (err) {
      // Surface the server's descriptive error (e.g. cap exceeded) when available
      const detail = err?.response?.data?.detail || 'Failed to update days';
      message.error(detail);
    }
  };

  const handleCompleteTask = async () => {
    setUpdating(true);
    try {
      await completeTask(selectedTask._id, findings, summary);
      message.success('Task marked as complete! Points distributed.');
      setManagerModalVisible(false);
      setCompletionStep('manage');
      setFindings('');
      setSummary('');
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

  const openManagerModal = (task) => {
    setSelectedTask(task);
    setCompletionStep('manage');
    setFindings('');
    setSummary('');
    setManagerModalVisible(true);
  };

  const openFindingsModal = (task) => {
    setViewingFindings(task);
    setFindingsModalVisible(true);
  };

  const getUrgency = (task) => {
    return parseInt(task?.['scale of urgency'] || task?.urgency || 1);
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
                    onClick={() => openManagerModal(task)}
                  >
                    Manager Control
                  </Button>
                ),
                task.status === 'completed' && task.field_findings && (
                  <Button 
                    icon={<FileTextOutlined />} 
                    onClick={() => openFindingsModal(task)}
                  >
                    View Findings
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
        onCancel={() => { setManagerModalVisible(false); setCompletionStep('manage'); }}
        footer={
          completionStep === 'manage' ? [
            <Button key="close" onClick={() => setManagerModalVisible(false)}>Close</Button>,
            selectedTask?.status !== 'completed' && (
              <Button 
                key="next" 
                type="primary" 
                danger 
                icon={<CheckCircleOutlined />} 
                onClick={() => setCompletionStep('confirm')}
              >
                Finish Task →
              </Button>
            )
          ] : [
            <Button key="back" onClick={() => setCompletionStep('manage')}>← Back to Attendance</Button>,
            <Button 
              key="done" 
              type="primary" 
              danger 
              icon={<CheckCircleOutlined />} 
              onClick={handleCompleteTask}
              loading={updating}
            >
              Confirm & Award Points
            </Button>
          ]
        }
        width={650}
      >
        {completionStep === 'manage' ? (
          <>
            <Alert 
              message="Manager Mode" 
              description={
                selectedTask?.status === 'completed' 
                  ? "This task is already completed. You can view the attendance records below."
                  : "As the volunteer with the most points on this task, you are the manager. Track daily attendance here. When the work is done, click 'Finish Task' to record findings and award points."
              }
              type="info" 
              showIcon 
              style={{ marginBottom: '20px' }}
            />

            <List
              header={<Text strong>Volunteer Attendance</Text>}
              dataSource={selectedTask?.assigned_volunteers || []}
              renderItem={v => {
                const urgency = getUrgency(selectedTask);
                const estimatedPoints = (v.days_worked || 0) * urgency;
                return (
                  <List.Item
                    actions={
                      selectedTask?.status !== 'completed' ? [
                        <Button 
                          size="small" 
                          type="primary" 
                          onClick={() => handleUpdateDays(v.id, v.days_worked)}
                        >
                          +1 Day Present
                        </Button>
                      ] : []
                    }
                  >
                    <List.Item.Meta
                      avatar={<Avatar icon={<UserOutlined />} />}
                      title={v.name}
                      description={
                        <span>
                          Days Present: <Text strong>{v.days_worked || 0}</Text> | 
                          Points: <Text type="success" strong>{estimatedPoints}</Text>
                          <Text type="secondary" style={{ fontSize: '11px', marginLeft: '4px' }}>
                            ({v.days_worked || 0} days × {urgency} urgency)
                          </Text>
                        </span>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          </>
        ) : (
          /* Completion confirmation step */
          <>
            <Alert 
              message="Complete Task & Record Findings" 
              description="Record what was done, key observations, and any learnings for future reference. This information will be stored for the knowledge base."
              type="warning" 
              showIcon 
              style={{ marginBottom: '20px' }}
            />

            {/* Points Preview */}
            <Card size="small" title="Points Preview" style={{ marginBottom: '16px', borderRadius: '8px', background: '#f6ffed', border: '1px solid #b7eb8f' }}>
              {(selectedTask?.assigned_volunteers || []).map(v => {
                const urgency = getUrgency(selectedTask);
                const pts = (v.days_worked || 0) * urgency;
                return (
                  <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <Text>{v.name}</Text>
                    <Text strong type="success">{pts} pts ({v.days_worked || 0} days × {urgency} urgency)</Text>
                  </div>
                );
              })}
            </Card>

            <div style={{ marginBottom: '16px' }}>
              <Text strong style={{ display: 'block', marginBottom: '6px' }}>Summary (brief overview)</Text>
              <TextArea
                rows={2}
                placeholder="E.g. Food packets distributed to 120 families in Velachery within 3 days."
                value={summary}
                onChange={e => setSummary(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <Text strong style={{ display: 'block', marginBottom: '6px' }}>Field Findings & Learnings</Text>
              <TextArea
                rows={5}
                placeholder="What was done? How was it done? Any challenges? Key learnings for future teams? Resources that helped?"
                value={findings}
                onChange={e => setFindings(e.target.value)}
              />
            </div>
          </>
        )}
      </Modal>

      {/* Findings Viewer Modal (for completed tasks) */}
      <Modal
        title={
          <Space>
            <FileTextOutlined />
            <span>Field Findings: {viewingFindings?.surid}</span>
          </Space>
        }
        open={findingsModalVisible}
        onCancel={() => setFindingsModalVisible(false)}
        footer={<Button onClick={() => setFindingsModalVisible(false)}>Close</Button>}
        width={600}
      >
        {viewingFindings?.field_findings ? (
          <>
            {viewingFindings.field_findings.summary && (
              <div style={{ marginBottom: '16px' }}>
                <Text strong style={{ display: 'block', marginBottom: '4px' }}>Summary</Text>
                <Card size="small" style={{ borderRadius: '8px', background: '#f0f5ff', border: '1px solid #adc6ff' }}>
                  {viewingFindings.field_findings.summary}
                </Card>
              </div>
            )}
            {viewingFindings.field_findings.notes && (
              <div style={{ marginBottom: '16px' }}>
                <Text strong style={{ display: 'block', marginBottom: '4px' }}>Detailed Findings & Learnings</Text>
                <Card size="small" style={{ borderRadius: '8px', background: '#fff7e6', border: '1px solid #ffd591' }}>
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{viewingFindings.field_findings.notes}</pre>
                </Card>
              </div>
            )}
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Recorded by {viewingFindings.field_findings.recorded_by} on {new Date(viewingFindings.field_findings.recorded_at).toLocaleString()}
            </Text>
          </>
        ) : (
          <Empty description="No findings were recorded for this task." />
        )}
      </Modal>
    </div>
  );
};

export default MyTasks;
