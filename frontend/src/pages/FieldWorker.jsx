import React, { useState } from 'react';
import { Card, Button, Typography, Alert, Upload, Progress, List, Tag, Space, Divider } from 'antd';
import { InboxOutlined, FileTextOutlined, CheckCircleFilled, EnvironmentOutlined, ExclamationCircleFilled } from '@ant-design/icons';
import { uploadSurveyPDF } from '../api';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;
const { Dragger } = Upload;

const urgencyColors = {
  1: '#52c41a', 2: '#52c41a', 3: '#73d13d',
  4: '#fadb14', 5: '#faad14', 6: '#fa8c16',
  7: '#f5222d', 8: '#f5222d', 9: '#a8071a', 10: '#a8071a',
};

const FieldWorker = ({ user }) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleUpload = async (file) => {
    setUploading(true);
    setResult(null);
    setError(null);
    setProgress(0);

    // Simulate progress stages since processing takes time
    const progressStages = [
      { pct: 15, msg: 'Uploading PDF...' },
      { pct: 35, msg: 'Running OCR on pages...' },
      { pct: 60, msg: 'AI analyzing survey content...' },
      { pct: 80, msg: 'Structuring data & detecting issues...' },
      { pct: 90, msg: 'Uploading to database & notifying volunteers...' },
    ];

    let stageIdx = 0;
    const progressInterval = setInterval(() => {
      if (stageIdx < progressStages.length) {
        setProgress(progressStages[stageIdx].pct);
        setProgressStatus(progressStages[stageIdx].msg);
        stageIdx++;
      }
    }, 3000);

    try {
      const data = await uploadSurveyPDF(file);
      clearInterval(progressInterval);
      setProgress(100);
      setProgressStatus('Complete!');
      setResult(data);
    } catch (err) {
      clearInterval(progressInterval);
      setProgress(0);
      setProgressStatus('');
      const detail = err.response?.data?.detail || 'Failed to process survey. Please try again.';
      setError(detail);
    } finally {
      setUploading(false);
    }

    // Prevent antd Upload from doing its own upload
    return false;
  };

  const resetUpload = () => {
    setResult(null);
    setError(null);
    setProgress(0);
    setProgressStatus('');
  };

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>Submit Survey</Title>
          <Text style={{ color: '#8c8c8c' }}>
            Upload a PDF survey form from the field. Our AI will extract issues and notify nearby volunteers automatically.
            {user?.area && <span> • <EnvironmentOutlined /> Reporting from {user.area}, {user.city}</span>}
          </Text>
        </div>
        <Space>
          <button 
            className="bg-red-600 text-white p-3 rounded-lg shadow-hover flex items-center gap-2 font-medium border-none cursor-pointer"
            onClick={() => navigate('/heatmap')}
          >
            <EnvironmentOutlined /> Live Demand Map
          </button>
        </Space>
      </div>

      {error && (
        <Alert
          message="Processing Failed"
          description={error}
          type="error"
          showIcon
          closable
          onClose={() => setError(null)}
          style={{ marginBottom: '16px', borderRadius: '12px' }}
        />
      )}

      {/* Upload Section */}
      {!result && (
        <Card style={{ borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} styles={{ body: { padding: '32px' } }}>
          <Dragger
            name="file"
            accept=".pdf"
            maxCount={1}
            showUploadList={false}
            beforeUpload={handleUpload}
            disabled={uploading}
            style={{
              padding: '40px 20px',
              borderRadius: '12px',
              border: '2px dashed #d9d9d9',
              background: uploading ? '#fafafa' : '#fff',
            }}
          >
            {uploading ? (
              <div>
                <Progress
                  type="circle"
                  percent={progress}
                  size={80}
                  strokeColor={{ '0%': '#1890ff', '100%': '#52c41a' }}
                />
                <p style={{ marginTop: '16px', fontSize: '16px', fontWeight: 500, color: '#262626' }}>
                  Processing Survey...
                </p>
                <p style={{ color: '#8c8c8c', fontSize: '14px' }}>
                  {progressStatus}
                </p>
              </div>
            ) : (
              <div>
                <p className="ant-upload-drag-icon">
                  <InboxOutlined style={{ fontSize: '48px', color: '#1890ff' }} />
                </p>
                <p style={{ fontSize: '16px', fontWeight: 500, color: '#262626' }}>
                  Click or drag PDF survey to upload
                </p>
                <p style={{ color: '#8c8c8c', fontSize: '14px' }}>
                  Supports handwritten and printed survey forms (max 20MB)
                </p>
              </div>
            )}
          </Dragger>

          <div style={{ marginTop: '20px', padding: '16px', background: '#f6f6f6', borderRadius: '10px' }}>
            <Text strong style={{ fontSize: '13px', color: '#595959' }}>How it works:</Text>
            <div style={{ marginTop: '8px', fontSize: '13px', color: '#8c8c8c', lineHeight: '2' }}>
              <div>1️⃣ <strong>OCR</strong> — Extracts text from each page of the PDF</div>
              <div>2️⃣ <strong>AI Analysis</strong> — Gemini AI identifies issues, urgency, and volunteer needs</div>
              <div>3️⃣ <strong>Database</strong> — Issues are saved and geo-tagged to your location</div>
              <div>4️⃣ <strong>Notify</strong> — Nearby volunteers get notified based on urgency radius</div>
            </div>
          </div>
        </Card>
      )}

      {/* Results Section */}
      {result && (
        <div>
          <Alert
            message={result.message}
            type="success"
            showIcon
            icon={<CheckCircleFilled />}
            style={{ marginBottom: '16px', borderRadius: '12px' }}
          />

          <Card
            title={
              <Space>
                <FileTextOutlined />
                <span>Extracted Issues ({result.issues_found})</span>
              </Space>
            }
            style={{ borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
          >
            <List
              dataSource={result.surveys || []}
              renderItem={(survey, index) => {
                const urgency = survey['scale of urgency'] || 5;
                const urgencyColor = urgencyColors[urgency] || '#faad14';

                return (
                  <List.Item style={{ padding: '16px 0' }}>
                    <List.Item.Meta
                      title={
                        <Space size="middle" wrap>
                          <Tag color="blue">{result.survey_ids?.[index] || `Issue ${index + 1}`}</Tag>
                          <span style={{ fontWeight: 600 }}>{survey['type of issue'] || 'Unknown'}</span>
                          <Tag color={urgencyColor === '#52c41a' ? 'green' : urgencyColor === '#faad14' ? 'gold' : 'red'}>
                            Urgency: {urgency}/10
                          </Tag>
                        </Space>
                      }
                      description={
                        <div style={{ marginTop: '8px' }}>
                          <div style={{ color: '#595959', marginBottom: '6px' }}>
                            {survey['what is the issue'] || 'No description'}
                          </div>
                          <Space size="middle" style={{ fontSize: '12px', color: '#8c8c8c' }} wrap>
                            {survey['geographical area'] && (
                              <span><EnvironmentOutlined /> {survey['geographical area']}</span>
                            )}
                            {survey['number of volunteer need'] && (
                              <span>👥 {survey['number of volunteer need']} volunteer(s) needed</span>
                            )}
                            {survey['type of volunteer need'] && (
                              <span>🔧 {survey['type of volunteer need']}</span>
                            )}
                            {survey.date && <span>📅 {survey.date}</span>}
                          </Space>
                        </div>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          </Card>

          <Button
            type="primary"
            size="large"
            block
            onClick={resetUpload}
            style={{ marginTop: '16px', borderRadius: '10px', height: '48px' }}
          >
            Upload Another Survey
          </Button>
        </div>
      )}
    </div>
  );
};

export default FieldWorker;
