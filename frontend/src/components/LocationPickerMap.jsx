import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Spin, Button } from 'antd';
import { AimOutlined } from '@ant-design/icons';

// Fix for default marker icons in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// A component to capture map clicks and move the marker
const LocationMarker = ({ position, setPosition, onLocationSelected }) => {
  useMapEvents({
    click(e) {
      setPosition(e.latlng);
      onLocationSelected(e.latlng.lat, e.latlng.lng);
    },
  });

  const markerRef = useRef(null);
  const eventHandlers = {
    dragend() {
      const marker = markerRef.current;
      if (marker != null) {
        const latlng = marker.getLatLng();
        setPosition(latlng);
        onLocationSelected(latlng.lat, latlng.lng);
      }
    },
  };

  return position === null ? null : (
    <Marker
      draggable={true}
      eventHandlers={eventHandlers}
      position={position}
      ref={markerRef}
    />
  );
};

const LocationPickerMap = ({ onLocationChange }) => {
  const [position, setPosition] = useState(null);
  const [loading, setLoading] = useState(false);
  const mapRef = useRef();

  const fetchAddress = async (lat, lng) => {
    setLoading(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
        { headers: { 'User-Agent': 'SmartAllocator/1.0' } }
      );
      const data = await response.json();
      const address = data.address || {};
      
      const area = address.suburb || address.neighbourhood || address.quarter || '';
      const city = address.city || address.town || address.village || address.county || '';
      const state = address.state || '';
      const street = address.road || address.pedestrian || '';
      let pincode = address.postcode || '';

      // Validate pincode (India: exactly 6 digits)
      if (pincode && !/^\d{6}$/.test(pincode)) {
        // If it's not a valid 6-digit number, clear it so user can fill manually
        pincode = '';
      }

      onLocationChange({
        latitude: lat,
        longitude: lng,
        area,
        city,
        state,
        street,
        pincode
      });
    } catch (err) {
      console.error("Failed to reverse geocode:", err);
      // Pass coordinates even if address fetch fails
      onLocationChange({
        latitude: lat,
        longitude: lng,
        area: '',
        city: '',
        state: '',
        street: '',
        pincode: ''
      });
    } finally {
      setLoading(false);
    }
  };

  const locateUser = () => {
    setLoading(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setPosition({ lat: latitude, lng: longitude });
          if (mapRef.current) {
            mapRef.current.flyTo([latitude, longitude], 15);
          }
          fetchAddress(latitude, longitude);
        },
        (err) => {
          console.error("Geolocation error:", err);
          setLoading(false);
          // Default to center of India if failed
          const defaultPos = { lat: 20.5937, lng: 78.9629 };
          setPosition(defaultPos);
          if (mapRef.current) mapRef.current.flyTo([defaultPos.lat, defaultPos.lng], 5);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setLoading(false);
    }
  };

  // Run once on mount to get current location
  useEffect(() => {
    locateUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position: 'relative', height: '300px', width: '100%', marginBottom: '16px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #d9d9d9' }}>
      {loading && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255,255,255,0.7)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Spin tip="Locating..." />
        </div>
      )}
      
      <Button 
        icon={<AimOutlined />} 
        style={{ position: 'absolute', bottom: '20px', right: '10px', zIndex: 1000, boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}
        onClick={locateUser}
      >
        My Location
      </Button>

      <MapContainer
        center={[20.5937, 78.9629]} // Default India
        zoom={5}
        style={{ height: '100%', width: '100%', zIndex: 1 }}
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationMarker position={position} setPosition={setPosition} onLocationSelected={fetchAddress} />
      </MapContainer>
    </div>
  );
};

export default LocationPickerMap;
