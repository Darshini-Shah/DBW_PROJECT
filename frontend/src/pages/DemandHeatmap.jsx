import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import * as L from 'leaflet';
import 'leaflet.heat';
import { Card, Typography, Button, Tag } from 'antd';
import { ArrowLeftOutlined, FireOutlined } from '@ant-design/icons';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';

const { Title, Text } = Typography;

// Component to handle the heatmap layer
const HeatmapLayer = ({ points }) => {
  const map = useMap();

  useEffect(() => {
    console.log("Map received data:", points);
    if (!points || points.length === 0) return;

    // points is an array of [lat, lng, intensity]
    const heat = L.heatLayer(points, {
      radius: 20,       // Tighter radius → more precise per-location coloring
      blur: 15,         // Less blur → hotspots stay closer to real coordinates
      max: 1.0,
      minOpacity: 0.4,
      gradient: {
        0.3: '#39FF14',  // Neon Green  (Low)
        0.65: '#FAFF00', // Neon Yellow (Medium)
        1.0: '#FF5F1F'   // Neon Orange (High)
      }
    }).addTo(map);

    return () => {
      map.removeLayer(heat);
    };
  }, [map, points]);

  return null;
};

const DemandHeatmap = () => {
  const navigate = useNavigate();
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get('http://localhost:8000/api/heatmap-data');
        if (response.data && Array.isArray(response.data)) {
          // Map importance (1-100) to intensity (0.0-1.0), skip null-island coords
          const data = response.data
            .filter(item => item.lat && item.lng && !(item.lat === 0 && item.lng === 0))
            .map(item => [
              item.lat,
              item.lng,
              (item.importance || 50) / 100
            ]);
          setPoints(data);
        }
      } catch (error) {
        console.error('Error fetching heatmap data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div style={{ position: 'relative', height: '600px', width: '100%', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
      {/* Overlay Card */}
      <Card
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          zIndex: 1000,
          width: 300,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          borderRadius: 12,
          border: 'none',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)'
        }}
        styles={{ body: { padding: '20px' } }}
      >
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/')}
          style={{ padding: 0, marginBottom: '12px', color: '#8c8c8c' }}
        >
          Back to Dashboard
        </Button>
        <Title level={4} style={{ margin: 0, marginBottom: 4, color: '#1f1f1f' }}>
          Priority Heatmap
        </Title>
        <Text style={{ display: 'block', marginBottom: 12, color: '#595959', fontSize: '13px' }}>
          Demand hotspots by report importance &amp; density.
        </Text>

        {/* Point count badge */}
        <div style={{ marginBottom: 16 }}>
          <Tag icon={<FireOutlined />} color="orange">
            {loading ? 'Loading...' : `${points.length} active issue${points.length !== 1 ? 's' : ''} mapped`}
          </Tag>
        </div>

        {/* Legend */}
        <div style={{ background: '#f5f5f5', padding: '12px', borderRadius: '8px' }}>
          <Text strong style={{ fontSize: 11, display: 'block', marginBottom: 8, textTransform: 'uppercase', color: '#8c8c8c', letterSpacing: 1 }}>
            Legend
          </Text>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ width: 12, height: 12, backgroundColor: '#FF5F1F', borderRadius: '50%', marginRight: 10, boxShadow: '0 0 6px rgba(255,95,31,0.7)', flexShrink: 0 }} />
            <Text style={{ fontSize: '12px', color: '#262626' }}>High Priority</Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ width: 12, height: 12, backgroundColor: '#FAFF00', borderRadius: '50%', marginRight: 10, boxShadow: '0 0 6px rgba(250,255,0,0.7)', flexShrink: 0 }} />
            <Text style={{ fontSize: '12px', color: '#262626' }}>Medium Priority</Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: 12, height: 12, backgroundColor: '#39FF14', borderRadius: '50%', marginRight: 10, boxShadow: '0 0 6px rgba(57,255,20,0.7)', flexShrink: 0 }} />
            <Text style={{ fontSize: '12px', color: '#262626' }}>Low Priority</Text>
          </div>
        </div>
      </Card>

      <MapContainer
        center={[20.5937, 78.9629]}
        zoom={5}
        style={{ height: '600px', width: '100%', zIndex: 0 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <HeatmapLayer points={points} />
      </MapContainer>
    </div>
  );
};

export default DemandHeatmap;
