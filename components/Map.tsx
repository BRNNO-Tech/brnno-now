
import React, { useEffect, useState, useRef } from 'react';
import { Detailer, BookingStatus } from '../types';
import { MOCK_DETAILERS } from '../constants';

interface MapProps {
  status: BookingStatus;
  assignedDetailer?: Detailer | null;
}

// Extend Window interface for Google Maps
declare global {
  interface Window {
    google: typeof google;
    initMap: () => void;
  }
}

const Map: React.FC<MapProps> = ({ status, assignedDetailer }) => {
  const [movingDetailers, setMovingDetailers] = useState<Detailer[]>(MOCK_DETAILERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [eta, setEta] = useState(8);
  const cardRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const labelOverlaysRef = useRef<google.maps.OverlayView[]>([]);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const pulseOverlayRef = useRef<google.maps.OverlayView | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapsApiReady, setMapsApiReady] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const hasInitializedMapRef = useRef(false);
  
  // Route simulation state
  interface DetailerRoute {
    detailerId: string;
    waypoints: { lat: number; lng: number }[];
    currentProgress: number;
    startPosition: { lat: number; lng: number };
    endPosition: { lat: number; lng: number };
    duration: number; // in seconds
    startTime: number;
  }
  // Use globalThis.Map to avoid conflict with component name
  const MapConstructor = globalThis.Map;
  const [detailerRoutes, setDetailerRoutes] = useState<Map<string, DetailerRoute>>(new MapConstructor());
  const routeAnimationsRef = useRef<Map<string, number>>(new MapConstructor()); // Store animation frame IDs
  const detailerStartPositionsRef = useRef<Map<string, { lat: number; lng: number }>>(new MapConstructor()); // Store starting positions
  const detailerRoutesRef = useRef<Map<string, DetailerRoute>>(new MapConstructor()); // Ref to track current routes for animation

  // Get user's actual location
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      // Fallback to default location
      setUserLocation({ lat: 40.7128, lng: -74.0060 });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setUserLocation(location);
        setLocationError(null);
        
        // Update map center if map is already loaded
        if (mapInstanceRef.current) {
          mapInstanceRef.current.setCenter(location);
          if (userMarkerRef.current) {
            userMarkerRef.current.setPosition(location);
          }
          if (pulseOverlayRef.current) {
            pulseOverlayRef.current.draw();
          }
        }
      },
      (error) => {
        // Location is optional; we fall back to default. Only warn in dev to reduce console noise.
        if (import.meta.env.DEV) {
          console.warn('Location unavailable:', error.code === 1 ? 'permission denied' : error.code === 2 ? 'unavailable' : 'timeout');
        }
        let errorMessage = 'Unable to get your location';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location permission denied. Using default location.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information unavailable. Using default location.';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out. Using default location.';
            break;
        }
        setLocationError(errorMessage);
        // Fallback to default location
        setUserLocation({ lat: 40.7128, lng: -74.0060 });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }, []);

  // Load Google Maps API
  useEffect(() => {
    // Try both VITE_ prefixed and non-prefixed for compatibility
    const viteKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    const nonPrefixKey = import.meta.env.GOOGLE_MAPS_API_KEY;
    const apiKey = viteKey || nonPrefixKey || '';
    
    console.log('Google Maps API Key check:', {
      hasVitePrefix: !!viteKey,
      hasNonPrefix: !!nonPrefixKey,
      keyPreview: apiKey ? `${apiKey.substring(0, 15)}...` : 'NOT FOUND'
    });
    
    if (!apiKey || apiKey === 'YOUR_GOOGLE_MAPS_API_KEY_HERE' || apiKey.includes('YOUR_GOOGLE_MAPS')) {
      console.error('Google Maps API key not configured properly.', {
        'Check 1': 'Is VITE_GOOGLE_MAPS_API_KEY in .env.local?',
        'Check 2': 'Did you restart the dev server after adding it?',
        'Check 3': 'Is there a .env file (without .local) that might override it?',
        'Current value': apiKey || 'empty string'
      });
      return;
    }

    // Check if script is already loaded
    if (window.google && window.google.maps) {
      console.log('Google Maps API already loaded');
      setMapsApiReady(true);
      return;
    }

    // Check if script is already in the DOM
    const existingScript = document.querySelector(`script[src*="maps.googleapis.com"]`);
    if (existingScript) {
      console.log('Google Maps script already in DOM, waiting for load...');
      const checkGoogle = setInterval(() => {
        if (window.google && window.google.maps) {
          clearInterval(checkGoogle);
          setMapsApiReady(true);
        }
      }, 100);
      return () => clearInterval(checkGoogle);
    }

    // Load Google Maps script
    console.log('Loading Google Maps script...');
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      console.log('Google Maps script loaded successfully');
      if (window.google && window.google.maps) {
        setMapsApiReady(true);
      } else {
        console.error('Google Maps API loaded but window.google.maps is not available');
      }
    };
    script.onerror = (error) => {
      console.error('Failed to load Google Maps script:', error);
      setMapLoaded(false);
    };
    document.head.appendChild(script);

    return () => {
      // Cleanup handled by React
    };
  }, []);

  const initializeMap = () => {
    if (!mapRef.current) {
      console.error('Map ref is not available');
      return;
    }
    
    if (!window.google || !window.google.maps) {
      console.error('Google Maps API is not available');
      return;
    }

    try {
      // Use user's actual location or fallback to default
      const center = userLocation || { lat: 40.7128, lng: -74.0060 };
      console.log('Initializing Google Map with center:', center);

      // Create map
      const map = new window.google.maps.Map(mapRef.current, {
        center: center,
        zoom: 13,
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        scaleControl: false,
        streetViewControl: false,
        rotateControl: false,
        fullscreenControl: false,
        styles: [
          {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'off' }]
          }
        ]
      });

      mapInstanceRef.current = map;
      setMapLoaded(true);
      console.log('Google Map initialized successfully');

      // Create user location marker
      const userMarker = new window.google.maps.Marker({
        position: center,
        map: map,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: '#3B82F6',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 4,
        },
        title: 'Current Location',
        zIndex: 1000
      });

      // Add pulse animation
      const pulseOverlay = new window.google.maps.OverlayView();
      pulseOverlay.onAdd = function() {
        const div = document.createElement('div');
        div.style.width = '48px';
        div.style.height = '48px';
        div.style.borderRadius = '50%';
        div.style.backgroundColor = '#3B82F6';
        div.style.opacity = '0.3';
        div.style.animation = 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite';
        div.style.position = 'absolute';
        div.style.transform = 'translate(-50%, -50%)';
        
        const panes = this.getPanes();
        if (panes) {
          panes.overlayMouseTarget.appendChild(div);
        }
      };
      pulseOverlay.draw = function() {
        const projection = this.getProjection();
        if (projection) {
          const currentCenter = userLocation || center;
          const position = projection.fromLatLngToDivPixel(currentCenter);
          const div = this.getPanes()?.overlayMouseTarget.firstChild as HTMLElement;
          if (div && position) {
            div.style.left = position.x + 'px';
            div.style.top = position.y + 'px';
          }
        }
      };
      pulseOverlay.onRemove = function() {};
      pulseOverlay.setMap(map);

      userMarkerRef.current = userMarker;
      pulseOverlayRef.current = pulseOverlay;

      // Create detailer markers
      createDetailerMarkers(map);
    } catch (error) {
      console.error('Error initializing Google Map:', error);
      setMapLoaded(false);
    }
  };

  // Calculate route with waypoints for smooth animation
  const calculateRoute = (
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number,
    numWaypoints: number = 30
  ): { lat: number; lng: number }[] => {
    const waypoints: { lat: number; lng: number }[] = [];
    
    for (let i = 0; i <= numWaypoints; i++) {
      const t = i / numWaypoints;
      // Use ease-in-out easing for more realistic movement
      const easedT = t < 0.5 
        ? 2 * t * t 
        : 1 - Math.pow(-2 * t + 2, 2) / 2;
      
      const lat = startLat + (endLat - startLat) * easedT;
      const lng = startLng + (endLng - startLng) * easedT;
      
      waypoints.push({ lat, lng });
    }
    
    return waypoints;
  };

  // Calculate distance between two points (Haversine formula)
  const calculateDistance = (
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  };

  // Calculate bearing (direction) between two points
  const calculateBearing = (
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number => {
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    
    const y = Math.sin(dLng) * Math.cos(lat2Rad);
    const x = 
      Math.cos(lat1Rad) * Math.sin(lat2Rad) -
      Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
    
    const bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360; // Normalize to 0-360
  };

  const createDetailerMarkers = (map: google.maps.Map) => {
    // Clear existing markers and overlays
    markersRef.current.forEach(marker => marker.setMap(null));
    labelOverlaysRef.current.forEach(overlay => overlay.setMap(null));
    markersRef.current = [];
    labelOverlaysRef.current = [];

    movingDetailers.forEach(detailer => {
      const isAssigned = assignedDetailer?.id === detailer.id;
      const isSelected = selectedId === detailer.id;
      const isEnRoute = isAssigned && status === BookingStatus.EN_ROUTE;

      // Calculate rotation based on movement direction
      let rotation = 45; // Default rotation
      if (isEnRoute && detailerRoutes.has(detailer.id)) {
        const route = detailerRoutes.get(detailer.id)!;
        if (route.currentProgress < 100) {
          // Find current and next waypoint
          const waypointIndex = Math.floor((route.currentProgress / 100) * (route.waypoints.length - 1));
          const nextWaypointIndex = Math.min(waypointIndex + 1, route.waypoints.length - 1);
          
          const currentWaypoint = route.waypoints[waypointIndex];
          const nextWaypoint = route.waypoints[nextWaypointIndex];
          
          // Calculate bearing (direction) to next waypoint
          rotation = calculateBearing(
            currentWaypoint.lat,
            currentWaypoint.lng,
            nextWaypoint.lat,
            nextWaypoint.lng
          );
        } else {
          // Use bearing to end position
          rotation = calculateBearing(
            detailer.lat,
            detailer.lng,
            route.endPosition.lat,
            route.endPosition.lng
          );
        }
      }

      // Create custom marker icon
      const markerIcon = {
        path: 'M 0,0 L 18,0 L 18,18 L 0,18 Z',
        fillColor: isAssigned ? '#000000' : isSelected ? '#2563EB' : '#FFFFFF',
        fillOpacity: 1,
        strokeColor: isAssigned ? '#FBBF24' : isSelected ? '#FFFFFF' : '#E5E7EB',
        strokeWeight: 2,
        scale: 1,
        rotation: rotation,
        anchor: new window.google.maps.Point(9, 9),
      };

      const marker = new window.google.maps.Marker({
        position: { lat: detailer.lat, lng: detailer.lng },
        map: map,
        icon: markerIcon,
        title: detailer.name,
        zIndex: isAssigned ? 100 : isSelected ? 50 : 10,
      });

      // Create info window content
      const infoContent = document.createElement('div');
      infoContent.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 4px;">${detailer.name}</div>
        <div style="font-size: 11px; color: #666;">${detailer.car}</div>
      `;

      const infoWindow = new window.google.maps.InfoWindow({
        content: infoContent
      });

      marker.addListener('click', () => {
        setSelectedId(detailer.id);
        infoWindow.open(map, marker);
      });

      markersRef.current.push(marker);

      // Create label overlay if assigned or selected
      if (isAssigned || isSelected) {
        const labelOverlay = new window.google.maps.OverlayView();
        labelOverlay.onAdd = function() {
          const div = document.createElement('div');
          div.className = 'detailer-label';
          div.style.position = 'absolute';
          div.style.pointerEvents = 'none';
          div.style.zIndex = '1000';
          
          let labelHTML = '';
          if (isEnRoute) {
            labelHTML += `<div style="background: #2563EB; color: white; padding: 2px 8px; border-radius: 9999px; font-size: 9px; font-weight: 900; margin-bottom: 4px; white-space: nowrap; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">${eta} MIN</div>`;
          }
          if (isAssigned) {
            labelHTML += `<div style="background: #000000; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 900; white-space: nowrap; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">YOUR PRO</div>`;
          }
          if (isSelected && !isAssigned) {
            labelHTML += `<div style="background: #2563EB; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; white-space: nowrap; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">SELECTED</div>`;
          }
          
          div.innerHTML = labelHTML;
          
          const panes = this.getPanes();
          if (panes) {
            panes.overlayMouseTarget.appendChild(div);
          }
        };
        
        labelOverlay.draw = function() {
          const projection = this.getProjection();
          if (!projection) return;
          
          const position = projection.fromLatLngToDivPixel({ lat: detailer.lat, lng: detailer.lng });
          const div = this.getPanes()?.overlayMouseTarget.lastChild as HTMLElement;
          if (div && position) {
            div.style.left = (position.x - div.offsetWidth / 2) + 'px';
            div.style.top = (position.y - 50) + 'px';
          }
        };
        
        labelOverlay.onRemove = function() {};
        labelOverlay.setMap(map);
        labelOverlaysRef.current.push(labelOverlay);
      }
    });
  };

  // Initialize map only after we have a location (avoids flashing New York)
  useEffect(() => {
    if (!mapsApiReady || userLocation === null || hasInitializedMapRef.current || !mapRef.current || !window.google?.maps) return;
    hasInitializedMapRef.current = true;
    initializeMap();
  }, [mapsApiReady, userLocation]);

  // Update map center when user location is obtained (if map was already created elsewhere)
  useEffect(() => {
    if (mapInstanceRef.current && userLocation && mapLoaded) {
      mapInstanceRef.current.setCenter(userLocation);
      if (userMarkerRef.current) {
        userMarkerRef.current.setPosition(userLocation);
      }
      if (pulseOverlayRef.current) {
        pulseOverlayRef.current.draw();
      }
    }
  }, [userLocation, mapLoaded]);

  // Update markers when detailers move or selection changes
  useEffect(() => {
    if (mapInstanceRef.current && mapLoaded) {
      createDetailerMarkers(mapInstanceRef.current);
    }
  }, [movingDetailers, selectedId, assignedDetailer, status, mapLoaded, detailerRoutes]);

  // Initialize route when detailer is assigned and EN_ROUTE
  useEffect(() => {
    if (
      assignedDetailer &&
      status === BookingStatus.EN_ROUTE &&
      userLocation &&
      mapLoaded
    ) {
      const detailer = assignedDetailer;
      
      // Check if route already exists using functional update
      setDetailerRoutes(prev => {
        if (prev.has(detailer.id)) {
          return prev; // Route already exists
        }

        // Get starting position (use stored lat/lng as starting point)
        // In a real app, you'd geocode the startingAddress here
        const startPosition = {
          lat: detailer.lat,
          lng: detailer.lng
        };
        
        // Store starting position
        detailerStartPositionsRef.current.set(detailer.id, startPosition);
        
        // Calculate route
        const waypoints = calculateRoute(
          startPosition.lat,
          startPosition.lng,
          userLocation.lat,
          userLocation.lng
        );
        
        // Calculate duration based on distance (rough estimate: 30 km/h average speed)
        const distance = calculateDistance(
          startPosition.lat,
          startPosition.lng,
          userLocation.lat,
          userLocation.lng
        );
        const duration = Math.max(30, Math.min(600, distance * 2)); // 30 seconds to 10 minutes
        
        const route: DetailerRoute = {
          detailerId: detailer.id,
          waypoints,
          currentProgress: 0,
          startPosition,
          endPosition: userLocation,
          duration,
          startTime: Date.now()
        };
        
        // Reset detailer position to starting position
        setMovingDetailers(prev => prev.map(d => 
          d.id === detailer.id 
            ? { ...d, lat: startPosition.lat, lng: startPosition.lng }
            : d
        ));
        
        return new MapConstructor(prev).set(detailer.id, route);
      });
    }
  }, [assignedDetailer, status, userLocation, mapLoaded]);

  // Sync routes ref with state
  useEffect(() => {
    detailerRoutesRef.current = detailerRoutes;
  }, [detailerRoutes]);

  // Animate detailer along route
  useEffect(() => {
    if (!mapLoaded || detailerRoutes.size === 0) {
      // Cleanup if no routes
      routeAnimationsRef.current.forEach(id => cancelAnimationFrame(id));
      routeAnimationsRef.current.clear();
      return;
    }

    let animationFrameId: number;
    let isAnimating = true;

    const animate = () => {
      if (!isAnimating) return;

      const currentRoutes = detailerRoutesRef.current;
      if (currentRoutes.size === 0) {
        isAnimating = false;
        return;
      }

      const now = Date.now();
      const updatedRoutes = new MapConstructor(currentRoutes);
      let hasUpdates = false;

      currentRoutes.forEach((route, detailerId) => {
        const elapsed = (now - route.startTime) / 1000; // seconds
        const progress = Math.min(100, (elapsed / route.duration) * 100);
        
        if (progress < 100) {
          // Calculate current position based on progress
          const waypointIndex = Math.floor((progress / 100) * (route.waypoints.length - 1));
          const nextWaypointIndex = Math.min(waypointIndex + 1, route.waypoints.length - 1);
          const waypointProgress = ((progress / 100) * (route.waypoints.length - 1)) % 1;
          
          const currentWaypoint = route.waypoints[waypointIndex];
          const nextWaypoint = route.waypoints[nextWaypointIndex];
          
          const currentLat = currentWaypoint.lat + (nextWaypoint.lat - currentWaypoint.lat) * waypointProgress;
          const currentLng = currentWaypoint.lng + (nextWaypoint.lng - currentWaypoint.lng) * waypointProgress;
          
          // Update detailer position
          setMovingDetailers(prev => prev.map(d => 
            d.id === detailerId 
              ? { ...d, lat: currentLat, lng: currentLng }
              : d
          ));
          
          // Update route progress
          updatedRoutes.set(detailerId, { ...route, currentProgress: progress });
          hasUpdates = true;
        } else {
          // Route complete - detailer has arrived
          setMovingDetailers(prev => prev.map(d => 
            d.id === detailerId 
              ? { ...d, lat: route.endPosition.lat, lng: route.endPosition.lng }
              : d
          ));
        }
      });

      if (hasUpdates) {
        detailerRoutesRef.current = updatedRoutes;
        setDetailerRoutes(updatedRoutes);
      }

      if (isAnimating && detailerRoutesRef.current.size > 0) {
        animationFrameId = requestAnimationFrame(animate);
        detailerRoutesRef.current.forEach((_, detailerId) => {
          routeAnimationsRef.current.set(detailerId, animationFrameId);
        });
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    detailerRoutes.forEach((_, detailerId) => {
      routeAnimationsRef.current.set(detailerId, animationFrameId);
    });

    return () => {
      isAnimating = false;
      routeAnimationsRef.current.forEach(id => cancelAnimationFrame(id));
      routeAnimationsRef.current.clear();
    };
  }, [mapLoaded, detailerRoutes]);

  // Cleanup animations when booking is cancelled or completed
  useEffect(() => {
    if (
      status !== BookingStatus.EN_ROUTE &&
      (status === BookingStatus.IDLE || 
       status === BookingStatus.COMPLETED || 
       status === BookingStatus.ARRIVED ||
       !assignedDetailer)
    ) {
      // Stop all animations
      routeAnimationsRef.current.forEach(id => cancelAnimationFrame(id));
      routeAnimationsRef.current.clear();
      
      // Clear routes
      setDetailerRoutes(new MapConstructor());
      detailerStartPositionsRef.current.clear();
      
      // Reset detailers to their original positions
      setMovingDetailers(MOCK_DETAILERS.map(d => ({
        ...d,
        lat: MOCK_DETAILERS.find(orig => orig.id === d.id)?.lat || d.lat,
        lng: MOCK_DETAILERS.find(orig => orig.id === d.id)?.lng || d.lng
      })));
    }
  }, [status, assignedDetailer]);

  // Simulate ETA decrementing
  useEffect(() => {
    if (status === BookingStatus.EN_ROUTE) {
      const timer = setInterval(() => {
        setEta(prev => Math.max(1, prev - 1));
      }, 45000);
      return () => clearInterval(timer);
    } else {
      setEta(8);
    }
  }, [status]);

  // Handle clicking outside to dismiss the card
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        setSelectedId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedDetailer = movingDetailers.find(d => d.id === selectedId);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Google Maps Container */}
      <div 
        ref={mapRef} 
        className="absolute inset-0 w-full h-full"
        style={{ minHeight: '100vh' }}
      />

      {/* Fallback if map doesn't load */}
      {!mapLoaded && (
        <div className="absolute inset-0 bg-gray-200 flex items-center justify-center z-50">
          <div className="text-center p-6">
            <div className="text-gray-700 mb-2 font-bold">
              {userLocation === null && !locationError ? 'Getting your location...' : 'Loading map...'}
            </div>
            <div className="text-xs text-gray-500 mb-4">
              {!import.meta.env.VITE_GOOGLE_MAPS_API_KEY || import.meta.env.VITE_GOOGLE_MAPS_API_KEY === 'YOUR_GOOGLE_MAPS_API_KEY_HERE' 
                ? 'Please configure VITE_GOOGLE_MAPS_API_KEY in .env.local and restart the dev server'
                : 'Initializing Google Maps...'}
            </div>
            {locationError && (
              <div className="text-[10px] text-orange-600 mb-2 bg-orange-50 px-3 py-2 rounded-lg">
                {locationError}
              </div>
            )}
            <div className="text-[10px] text-gray-400 font-mono">
              API Key: {import.meta.env.VITE_GOOGLE_MAPS_API_KEY 
                ? `${import.meta.env.VITE_GOOGLE_MAPS_API_KEY.substring(0, 15)}...` 
                : 'NOT FOUND'}
            </div>
            <div className="text-[10px] text-gray-400 mt-2">
              Check browser console for errors
            </div>
          </div>
        </div>
      )}

      {/* User Location Label Overlay - positioned over map center */}
      {mapLoaded && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none" style={{ marginTop: '-60px' }}>
          <div className="bg-white px-3 py-1 rounded-full text-xs font-bold shadow-md whitespace-nowrap">
            Current Location
          </div>
        </div>
      )}

      {/* Detailer Info Card Overlay */}
      {selectedDetailer && (
        <div 
          ref={cardRef}
          className="absolute top-20 left-1/2 -translate-x-1/2 w-[90%] max-w-[340px] z-50 animate-in slide-in-from-top-4 fade-in duration-300"
        >
          <div className="glass rounded-[32px] p-4 shadow-2xl border border-white/60">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-inner flex-shrink-0">
                <img src={selectedDetailer.avatar} alt={selectedDetailer.name} className="w-full h-full object-cover" />
              </div>
              <div className="flex-grow">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-black text-lg leading-tight">{selectedDetailer.name}</h4>
                    {assignedDetailer?.id === selectedDetailer.id && status === BookingStatus.EN_ROUTE ? (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse shadow-[0_0_8px_rgba(37,99,235,0.6)]" />
                        <span className="text-[10px] text-blue-600 font-black uppercase tracking-widest">Arriving in {eta} mins</span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">{selectedDetailer.car}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-lg">
                    <span className="text-yellow-500 text-xs">★</span>
                    <span className="font-bold text-xs">{selectedDetailer.rating}</span>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-4">
                    <div className="text-[10px] text-gray-400 font-bold uppercase">
                        <span className="text-black mr-1">{selectedDetailer.trips}</span> Trips
                    </div>
                </div>
              </div>
            </div>
            
            <div className="mt-4 flex gap-2">
              {assignedDetailer?.id === selectedDetailer.id ? (
                <div className="w-full py-3 bg-black text-white rounded-2xl text-center font-bold text-sm">
                  {status === BookingStatus.EN_ROUTE ? 'Detailer En Route' : 'Active Professional'}
                </div>
              ) : (
                <>
                    <button 
                        onClick={() => setSelectedId(null)}
                        className="flex-1 py-3 bg-gray-100 rounded-2xl font-bold text-sm text-gray-700 hover:bg-gray-200 transition-colors"
                    >
                        Dismiss
                    </button>
                    <button className="flex-[2] py-3 bg-black text-white rounded-2xl font-bold text-sm active:scale-95 transition-transform">
                        View Profile
                    </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Map;
