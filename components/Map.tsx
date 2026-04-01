
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Detailer, BookingStatus } from '../types';

interface MapProps {
  status: BookingStatus;
  assignedDetailer?: Detailer | null;
  /** Optional center override (e.g. from "Use my current location" selection). */
  centerOverride?: { lat: number; lng: number } | null;
}

// Extend Window interface for Google Maps
declare global {
  interface Window {
    google: typeof google;
    initMap: () => void;
  }
}

const Map: React.FC<MapProps> = ({ status, assignedDetailer, centerOverride = null }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // When EN_ROUTE with assigned pro, show only that detailer so their live (polled) position is visible.
  // Hide marker when detailer is offline (lat/lng invalid) so customer map doesn't show a stale dot.
  const detailersToShow = useMemo(() => {
    if (status === BookingStatus.EN_ROUTE && assignedDetailer) {
      const hasValidPosition = Number.isFinite(assignedDetailer.lat) && Number.isFinite(assignedDetailer.lng);
      if (hasValidPosition) return [assignedDetailer];
      return [];
    }
    return [];
  }, [status, assignedDetailer]);
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
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(centerOverride);
  const [locationError, setLocationError] = useState<string | null>(null);
  const hasInitializedMapRef = useRef(false);

  const DEFAULT_CENTER = { lat: 40.7128, lng: -74.0060 };

  // If caller provided a center override, use it immediately (helps when geolocation fails).
  useEffect(() => {
    if (!centerOverride) return;
    setUserLocation(centerOverride);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setCenter(centerOverride);
      if (userMarkerRef.current) userMarkerRef.current.setPosition(centerOverride);
      if (pulseOverlayRef.current) pulseOverlayRef.current.draw();
    }
  }, [centerOverride?.lat, centerOverride?.lng]);

  // Get user's actual location
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      setUserLocation(centerOverride ?? DEFAULT_CENTER);
      return;
    }

    let cancelled = false;
    const fallback = () => {
      if (cancelled) return;
      setUserLocation((prev) => (prev === null ? (centerOverride ?? DEFAULT_CENTER) : prev));
      setLocationError((prev) => prev || 'Using default location.');
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return;
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setUserLocation(location);
        setLocationError(null);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.setCenter(location);
          if (userMarkerRef.current) userMarkerRef.current.setPosition(location);
          if (pulseOverlayRef.current) pulseOverlayRef.current.draw();
        }
      },
      (error) => {
        if (cancelled) return;
        if (import.meta.env.DEV) {
          console.warn('Location unavailable:', error.code === 1 ? 'permission denied' : error.code === 2 ? 'unavailable' : 'timeout');
        }
        const errorMessage =
          error.code === error.PERMISSION_DENIED
            ? 'Location permission denied. Using default location.'
            : error.code === error.POSITION_UNAVAILABLE
              ? 'Location information unavailable. Using default location.'
              : error.code === error.TIMEOUT
                ? 'Location request timed out. Using default location.'
                : 'Unable to get your location. Using default location.';
        setLocationError(errorMessage);
        setUserLocation(centerOverride ?? DEFAULT_CENTER);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    const safetyTimeout = setTimeout(fallback, 12000);
    return () => {
      cancelled = true;
      clearTimeout(safetyTimeout);
    };
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

    detailersToShow.forEach(detailer => {
      const isAssigned = assignedDetailer?.id === detailer.id;
      const isSelected = selectedId === detailer.id;
      const isEnRoute = isAssigned && status === BookingStatus.EN_ROUTE;

      // Calculate rotation based on movement direction
      let rotation = 45; // Default rotation
      if (isEnRoute && userLocation) {
        rotation = calculateBearing(detailer.lat, detailer.lng, userLocation.lat, userLocation.lng);
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
        labelOverlay.onAdd = function(this: google.maps.OverlayView & { labelDiv?: HTMLElement }) {
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
          this.labelDiv = div;
          const panes = this.getPanes();
          if (panes) {
            panes.overlayMouseTarget.appendChild(div);
          }
        };
        
        labelOverlay.draw = function() {
          const projection = this.getProjection();
          if (!projection) return;
          
          const position = projection.fromLatLngToDivPixel({ lat: detailer.lat, lng: detailer.lng });
          const div = (this as google.maps.OverlayView & { labelDiv?: HTMLElement }).labelDiv;
          if (div && position) {
            div.style.left = (position.x - div.offsetWidth / 2) + 'px';
            div.style.top = (position.y - 50) + 'px';
          }
        };
        
        labelOverlay.onRemove = function(this: google.maps.OverlayView & { labelDiv?: HTMLElement }) {
          if (this.labelDiv?.parentNode) this.labelDiv.remove();
          this.labelDiv = undefined;
        };
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

  // Update markers when detailers move or selection changes (detailersToShow includes live assigned position when EN_ROUTE)
  // Exclude any animation state; redraw only on meaningful changes.
  useEffect(() => {
    if (mapInstanceRef.current && mapLoaded) {
      createDetailerMarkers(mapInstanceRef.current);
    }
  }, [detailersToShow, selectedId, assignedDetailer, status, mapLoaded]);

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

  const selectedDetailer = detailersToShow.find(d => d.id === selectedId);

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
                : 'Initializing map...'}
            </div>
            {locationError && (
              <div className="text-[10px] text-orange-600 mb-2 bg-orange-50 px-3 py-2 rounded-lg">
                {locationError}
              </div>
            )}
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
                <img src={selectedDetailer.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedDetailer.name || '')}&background=e5e7eb&color=374151`} alt={selectedDetailer.name} className="w-full h-full object-cover" />
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
