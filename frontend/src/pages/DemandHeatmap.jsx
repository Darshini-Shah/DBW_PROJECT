import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import { Card, Typography } from 'antd';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';

const { Title, Text } = Typography;

// Component to handle the heatmap layer
const HeatmapLayer = ({ points }) => {
  const map = useMap();

  useEffect(() => {
    console.log("Map received data:", points);
    if (!points || points.length === 0) return;

    // points is expected to be an array of [lat, lng, intensity]
    const heat = L.heatLayer(points, {
      radius: 25,
      blur: 10,
      max: 1.0,
      maxZoom: 10,
      gradient: {
        0.1: 'red',
        1.0: 'red'
      }
    }).addTo(map);

    return () => {
      map.removeLayer(heat);
    };
  }, [map, points]);

  return null;
};

const DemandHeatmap = () => {
  const [points, setPoints] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get('http://localhost:8000/api/heatmap-data');
        if (response.data && Array.isArray(response.data)) {
          // Response is a list of objects {lat, lng, importance}
          // Map importance (1-100) to intensity (0.0-1.0)
          const data = response.data.map(item => [
            item.lat, 
            item.lng, 
            (item.importance || 50) / 100
          ]);
          setPoints(data);
        }
      } catch (error) {
        console.error('Error fetching heatmap data:', error);
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
          width: 320,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          borderRadius: 12,
          border: 'none',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)'
        }}
        styles={{ body: { padding: '20px' } }}
      >
        <Title level={4} style={{ margin: 0, marginBottom: 8, color: '#1f1f1f' }}>Priority Heatmap</Title>
        <Text style={{ display: 'block', marginBottom: 16, color: '#595959', fontSize: '13px' }}>
          Visualizing demand hotspots based on report importance and density across regions.
        </Text>
        
        {/* Legend */}
        <div style={{ background: '#f5f5f5', padding: '12px', borderRadius: '8px' }}>
          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8, textTransform: 'uppercase', color: '#8c8c8c' }}>Legend</Text>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ width: 12, height: 12, backgroundColor: 'red', borderRadius: '50%', marginRight: 12, boxShadow: '0 0 4px rgba(255,0,0,0.5)' }}></div>
            <Text style={{ fontSize: '13px', color: '#262626' }}>High Priority / Density</Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ width: 12, height: 12, backgroundColor: 'yellow', borderRadius: '50%', marginRight: 12 }}></div>
            <Text style={{ fontSize: '13px', color: '#262626' }}>Moderate Priority</Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: 12, height: 12, backgroundColor: 'blue', borderRadius: '50%', marginRight: 12 }}></div>
            <Text style={{ fontSize: '13px', color: '#262626' }}>Low Priority Zone</Text>
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
