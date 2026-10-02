'use client';

import { useEffect, useRef, useState } from 'react';
import { loadLeaflet } from '@/lib/leaflet-loader';
import { CAMPUS_CENTER, CAMPUS_DEFAULT_COORDINATES } from '@/lib/coordinates';
import { Navigation, RotateCcw, Maximize2, MapPin } from 'lucide-react';

interface MiniDraggableMapProps {
  checkpointId: number;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  routeId: 1 | 2;
  stage: number;
  title: string;
  onChange: (lat: number, lng: number) => void;
  onOpenFullMap?: () => void;
}

export default function MiniDraggableMap({
  checkpointId,
  latitude,
  longitude,
  routeId,
  stage,
  title,
  onChange,
  onOpenFullMap,
}: MiniDraggableMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null);
  const badgeTextRef = useRef<HTMLSpanElement | null>(null);
  const isDraggingRef = useRef<boolean>(false);

  const defaultCoord = CAMPUS_DEFAULT_COORDINATES[checkpointId];
  const initialLat =
    latitude != null && !isNaN(Number(latitude))
      ? Number(latitude)
      : defaultCoord?.lat ?? CAMPUS_CENTER.lat;
  const initialLng =
    longitude != null && !isNaN(Number(longitude))
      ? Number(longitude)
      : defaultCoord?.lng ?? CAMPUS_CENTER.lng;

  const [currentCoord, setCurrentCoord] = useState<{ lat: number; lng: number }>({
    lat: initialLat,
    lng: initialLng,
  });
  const [acquiringGps, setAcquiringGps] = useState(false);

  // Sync state if props change externally when not dragging
  useEffect(() => {
    if (isDraggingRef.current) return;
    if (latitude != null && longitude != null && !isNaN(Number(latitude)) && !isNaN(Number(longitude))) {
      const latNum = Number(latitude);
      const lngNum = Number(longitude);
      setCurrentCoord({ lat: latNum, lng: lngNum });
      if (markerRef.current) {
        markerRef.current.setLatLng([latNum, lngNum]);
      }
      if (badgeTextRef.current) {
        badgeTextRef.current.textContent = `${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`;
      }
    }
  }, [latitude, longitude]);

  useEffect(() => {
    let cancelled = false;

    async function initMiniMap() {
      if (!containerRef.current || mapRef.current) return;

      try {
        const L = await loadLeaflet();
        if (cancelled || !containerRef.current) return;

        const map = L.map(containerRef.current, {
          center: [currentCoord.lat, currentCoord.lng],
          zoom: 17,
          zoomControl: false,
          attributionControl: false,
        });

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
        }).addTo(map);

        L.control.zoom({ position: 'bottomright' }).addTo(map);

        const routeColor = routeId === 1 ? 'bg-cyan-600' : 'bg-purple-600';
        const markerHtml = `
          <div class="relative flex items-center justify-center cursor-grab active:cursor-grabbing hover:scale-110 transition-transform">
            <div class="w-8 h-8 rounded-full ${routeColor} text-white flex items-center justify-center font-bold text-xs shadow-xl border-2 border-white ring-2 ring-accent">
              ${stage}
            </div>
            <span class="absolute -bottom-4 whitespace-nowrap bg-black/90 text-white font-mono text-[9px] px-1.5 py-0.5 rounded border border-line">
              0${stage} • Drag Me
            </span>
          </div>
        `;

        const icon = L.divIcon({
          className: 'mini-marker-pin',
          html: markerHtml,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const marker = L.marker([currentCoord.lat, currentCoord.lng], {
          icon,
          draggable: true,
          autoPan: true,
        }).addTo(map);

        marker.on('dragstart', () => {
          isDraggingRef.current = true;
        });

        // Update live coordinate badge directly via DOM (Zero React lag during drag)
        marker.on('drag', (e: { target: { getLatLng: () => { lat: number; lng: number } } }) => {
          const pos = e.target.getLatLng();
          if (badgeTextRef.current) {
            badgeTextRef.current.textContent = `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)} (Dragging)`;
          }
        });

        marker.on('dragend', (e: { target: { getLatLng: () => { lat: number; lng: number } } }) => {
          isDraggingRef.current = false;
          const pos = e.target.getLatLng();
          const cleanLat = Number(pos.lat.toFixed(6));
          const cleanLng = Number(pos.lng.toFixed(6));
          setCurrentCoord({ lat: cleanLat, lng: cleanLng });
          if (badgeTextRef.current) {
            badgeTextRef.current.textContent = `${cleanLat.toFixed(6)}, ${cleanLng.toFixed(6)}`;
          }
          onChange(cleanLat, cleanLng);
        });

        // Click anywhere on mini map to teleport pin
        map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
          const cleanLat = Number(e.latlng.lat.toFixed(6));
          const cleanLng = Number(e.latlng.lng.toFixed(6));
          marker.setLatLng([cleanLat, cleanLng]);
          setCurrentCoord({ lat: cleanLat, lng: cleanLng });
          if (badgeTextRef.current) {
            badgeTextRef.current.textContent = `${cleanLat.toFixed(6)}, ${cleanLng.toFixed(6)}`;
          }
          onChange(cleanLat, cleanLng);
        });

        mapRef.current = map;
        markerRef.current = marker;

        setTimeout(() => {
          if (mapRef.current) mapRef.current.invalidateSize();
        }, 150);
      } catch (err) {
        console.error('Failed to init MiniDraggableMap:', err);
      }
    }

    initMiniMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const handleSnapGps = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }
    setAcquiringGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setAcquiringGps(false);
        const cleanLat = Number(pos.coords.latitude.toFixed(6));
        const cleanLng = Number(pos.coords.longitude.toFixed(6));
        setCurrentCoord({ lat: cleanLat, lng: cleanLng });
        if (markerRef.current) {
          markerRef.current.setLatLng([cleanLat, cleanLng]);
        }
        if (mapRef.current) {
          mapRef.current.setView([cleanLat, cleanLng], 18, { animate: true });
        }
        if (badgeTextRef.current) {
          badgeTextRef.current.textContent = `${cleanLat.toFixed(6)}, ${cleanLng.toFixed(6)}`;
        }
        onChange(cleanLat, cleanLng);
      },
      (err) => {
        setAcquiringGps(false);
        alert(`Could not acquire GPS: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handleResetPreset = () => {
    if (!defaultCoord) return;
    setCurrentCoord({ lat: defaultCoord.lat, lng: defaultCoord.lng });
    if (markerRef.current) {
      markerRef.current.setLatLng([defaultCoord.lat, defaultCoord.lng]);
    }
    if (mapRef.current) {
      mapRef.current.setView([defaultCoord.lat, defaultCoord.lng], 17, { animate: true });
    }
    if (badgeTextRef.current) {
      badgeTextRef.current.textContent = `${defaultCoord.lat.toFixed(6)}, ${defaultCoord.lng.toFixed(6)}`;
    }
    onChange(defaultCoord.lat, defaultCoord.lng);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <label className="text-[11px] uppercase text-muted font-bold flex items-center gap-1">
          <MapPin className="w-3 h-3 text-accent" />
          Interactive Position Picker
        </label>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleSnapGps}
            disabled={acquiringGps}
            className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold uppercase flex items-center gap-1 bg-cyan-950/60 border border-cyan-500/40 px-1.5 py-0.5 rounded cursor-pointer"
            title="Snap pin to my device GPS"
          >
            <Navigation className={`w-2.5 h-2.5 ${acquiringGps ? 'animate-spin' : ''}`} />
            <span>{acquiringGps ? 'Locating...' : 'My GPS'}</span>
          </button>

          {defaultCoord && (
            <button
              type="button"
              onClick={handleResetPreset}
              className="text-[10px] text-amber-400 hover:text-amber-300 font-bold uppercase flex items-center gap-1 bg-amber-950/60 border border-amber-500/40 px-1.5 py-0.5 rounded cursor-pointer"
              title="Reset to SRM default preset"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>Preset</span>
            </button>
          )}

          {onOpenFullMap && (
            <button
              type="button"
              onClick={onOpenFullMap}
              className="text-[10px] text-accent hover:text-ink font-bold uppercase flex items-center gap-1 bg-surface border border-line px-1.5 py-0.5 rounded cursor-pointer"
              title="Open full interactive map studio"
            >
              <Maximize2 className="w-2.5 h-2.5" />
              <span>Full Studio</span>
            </button>
          )}
        </div>
      </div>

      <div className="relative h-48 sm:h-52 w-full rounded border border-line overflow-hidden shadow-inner bg-zinc-900">
        <div ref={containerRef} className="w-full h-full z-0" />

        {/* Live Coordinate Badge Overlay */}
        <div className="absolute top-2 left-2 z-10 bg-black/85 border border-line/80 px-2 py-1 rounded text-[10px] font-mono text-ink backdrop-blur-xs flex items-center gap-1.5 shadow">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span ref={badgeTextRef}>
            {currentCoord.lat.toFixed(6)}, {currentCoord.lng.toFixed(6)}
          </span>
        </div>

        {/* Helper Footer overlay */}
        <div className="absolute bottom-1.5 left-2 right-2 z-10 pointer-events-none flex justify-center">
          <div className="bg-black/80 border border-line/50 px-2 py-0.5 rounded text-[10px] text-muted backdrop-blur-xs">
            Drag the pin or click on the map to set location
          </div>
        </div>
      </div>
    </div>
  );
}
