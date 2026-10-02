'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { HuntProgress, Checkpoint } from '@/types/hunt';
import {
  Map as MapIcon,
  X,
  Navigation,
  Crosshair,
  Compass,
  AlertCircle,
  Flag,
  RotateCcw,
  Layers,
  MapPin,
} from 'lucide-react';
import { loadLeaflet } from '@/lib/leaflet-loader';
import {
  calculateDistanceMeters,
  calculateBearing,
  formatDistance,
  CAMPUS_DEFAULT_COORDINATES,
} from '@/lib/coordinates';

interface TacticalMapModalProps {
  progress: HuntProgress;
  assignedRoute?: 1 | 2;
  onClose: () => void;
}

interface UserLocation {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
}

export default function TacticalMapModal({
  progress,
  assignedRoute,
  onClose,
}: TacticalMapModalProps) {
  const currentRoute: 1 | 2 = assignedRoute || progress.assignedRoute || 1;
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const travelledLineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upcomingLineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userGuideLineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userMarkerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accuracyCircleRef = useRef<any>(null);

  const [, startTransition] = useTransition();
  const [nodes, setNodes] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<Checkpoint | null>(null);
  const [followingUser, setFollowingUser] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // 1. Fetch exact checkpoint coordinates for this route
  useEffect(() => {
    let isMounted = true;

    async function fetchRouteNodes() {
      try {
        const res = await fetch('/api/hunt/map-nodes');
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.nodes && data.nodes.length > 0) {
            setNodes(data.nodes);
            return;
          }
        }
      } catch (err) {
        console.warn('Could not load map nodes from API, using campus defaults:', err);
      }

      // Fallback to campus defaults
      if (isMounted) {
        const fallback = Object.values(CAMPUS_DEFAULT_COORDINATES)
          .filter((n) => n.routeId === currentRoute)
          .sort((a, b) => a.stage - b.stage)
          .map((n) => ({
            id: n.id,
            routeId: n.routeId,
            route_id: n.routeId,
            stage: n.stage,
            title: n.name,
            area: n.area,
            clue: '',
            latitude: n.lat,
            longitude: n.lng,
          }));
        setNodes(fallback);
      }
    }

    fetchRouteNodes();
    return () => {
      isMounted = false;
    };
  }, [currentRoute]);

  // Current stage index & current target node
  const currentStageNumber = Math.min(progress.currentStage, 12);
  const currentTargetNode = nodes.find((n) => n.stage === currentStageNumber) || nodes[currentStageNumber - 1];

  // Calculate distance & bearing from user to current target
  const distanceToTarget =
    userLocation && currentTargetNode && currentTargetNode.latitude && currentTargetNode.longitude
      ? calculateDistanceMeters(
        userLocation.lat,
        userLocation.lng,
        Number(currentTargetNode.latitude),
        Number(currentTargetNode.longitude)
      )
      : null;

  const bearingToTarget =
    userLocation && currentTargetNode && currentTargetNode.latitude && currentTargetNode.longitude
      ? calculateBearing(
        userLocation.lat,
        userLocation.lng,
        Number(currentTargetNode.latitude),
        Number(currentTargetNode.longitude)
      )
      : null;

  // Calculate total distance travelled between completed checkpoints
  const completedStages = nodes
    .filter((n) => progress.completedNodes?.some((cn) => cn.nodeId === n.id) || n.stage < progress.currentStage)
    .sort((a, b) => a.stage - b.stage);

  let totalTravelledMeters = 0;
  for (let i = 0; i < completedStages.length - 1; i++) {
    const a = completedStages[i];
    const b = completedStages[i + 1];
    if (a.latitude && a.longitude && b.latitude && b.longitude) {
      totalTravelledMeters += calculateDistanceMeters(
        Number(a.latitude),
        Number(a.longitude),
        Number(b.latitude),
        Number(b.longitude)
      );
    }
  }

  // 2. Initialize Leaflet Map
  useEffect(() => {
    let isCancelled = false;

    async function initMap() {
      if (!mapContainerRef.current || mapInstanceRef.current) return;

      try {
        const L = await loadLeaflet();
        if (isCancelled || !mapContainerRef.current) return;

        // Default center on SRM Kattankulathur
        const defaultCenter: [number, number] = [12.82361, 80.0442];
        const map = L.map(mapContainerRef.current, {
          center: defaultCenter,
          zoom: 16,
          zoomControl: false,
          attributionControl: true,
        });

        // OpenStreetMap Standard Tiles
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);

        // Add zoom control at top-right
        L.control.zoom({ position: 'topright' }).addTo(map);

        mapInstanceRef.current = map;
        setMapReady(true);
        setLoading(false);
      } catch (err) {
        console.error('Error initializing OpenStreetMap:', err);
        setLoading(false);
      }
    }

    initMap();

    return () => {
      isCancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // 3. User Geolocation Tracker
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        startTransition(() => {
          setUserLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            heading: pos.coords.heading,
            speed: pos.coords.speed,
          });
          setGpsError(null);
        });
      },
      (err) => {
        console.warn('Geolocation watch error:', err);
        if (err.code === 1) {
          setGpsError('Location permission denied. Enable GPS to see live tracking.');
        } else if (err.code === 2) {
          setGpsError('Acquiring GPS position...');
        } else {
          setGpsError('GPS signal timed out');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 5000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // 4. Render Checkpoints, Travelled Trail & Polylines onto the Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady || nodes.length === 0) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    if (!L) return;

    // Clean previous markers & polylines
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (travelledLineRef.current) travelledLineRef.current.remove();
    if (upcomingLineRef.current) upcomingLineRef.current.remove();
    if (userGuideLineRef.current) userGuideLineRef.current.remove();

    const bounds: [number, number][] = [];
    const completedCoords: [number, number][] = [];
    const upcomingCoords: [number, number][] = [];

    // Sort nodes by stage
    const sortedNodes = [...nodes].sort((a, b) => a.stage - b.stage);

    sortedNodes.forEach((node) => {
      const lat = Number(node.latitude);
      const lng = Number(node.longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      const pt: [number, number] = [lat, lng];
      bounds.push(pt);

      const isCompleted =
        progress.completedNodes?.some((n) => n.nodeId === node.id) ||
        node.stage < progress.currentStage;
      const isCurrent = node.stage === progress.currentStage;

      if (isCompleted || isCurrent) {
        completedCoords.push(pt);
      }
      if (isCurrent || node.stage >= progress.currentStage) {
        upcomingCoords.push(pt);
      }

      // Marker Icon Design
      let markerHtml = '';
      if (isCompleted) {
        markerHtml = `
          <div class="relative flex items-center justify-center cursor-pointer transition-transform hover:scale-125">
            <div class="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-lg border-2 border-white ring-2 ring-emerald-400/50">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <span class="absolute -bottom-5 whitespace-nowrap bg-black/85 text-emerald-300 font-mono text-[10px] font-bold px-1.5 py-0.2 rounded border border-emerald-500/40 shadow">
              #0${node.stage} Cleared
            </span>
          </div>
        `;
      } else if (isCurrent) {
        markerHtml = `
          <div class="relative flex items-center justify-center cursor-pointer">
            <div class="absolute -inset-3 rounded-full bg-amber-500/30 animate-ping"></div>
            <div class="absolute -inset-1.5 rounded-full bg-amber-400/40 animate-pulse"></div>
            <div class="relative w-10 h-10 rounded-full bg-amber-500 text-black flex items-center justify-center font-extrabold text-sm shadow-xl border-3 border-white ring-4 ring-amber-400/70">
              0${node.stage}
            </div>
            <span class="absolute -bottom-6 whitespace-nowrap bg-amber-500 text-black font-sans text-[10px] font-black uppercase px-2 py-0.5 rounded shadow-lg border border-white tracking-wider animate-bounce">
              Target
            </span>
          </div>
        `;
      } else {
        markerHtml = `
          <div class="relative flex items-center justify-center cursor-pointer transition-transform hover:scale-110 opacity-85">
            <div class="w-7 h-7 rounded-full bg-stone-800 text-stone-300 flex items-center justify-center font-bold text-xs shadow-md border-2 border-stone-500">
              0${node.stage}
            </div>
            <span class="absolute -bottom-5 whitespace-nowrap bg-black/80 text-stone-400 font-mono text-[9px] px-1 py-0.2 rounded border border-stone-700">
              Node 0${node.stage}
            </span>
          </div>
        `;
      }

      const icon = L.divIcon({
        className: 'custom-checkpoint-pin',
        html: markerHtml,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });

      const marker = L.marker(pt, { icon }).addTo(map);

      marker.on('click', () => {
        setSelectedNode(node);
      });

      markersRef.current.push(marker);
    });

    // 5. Draw the "Travelled Route" Polyline (Solid Glowing Line)
    if (completedCoords.length >= 2) {
      travelledLineRef.current = L.polyline(completedCoords, {
        color: '#10b981', // Emerald green
        weight: 5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: undefined,
      }).addTo(map);
    }

    // 6. Draw the "Upcoming Route" Polyline (Dashed Line)
    if (upcomingCoords.length >= 2) {
      upcomingLineRef.current = L.polyline(upcomingCoords, {
        color: '#f59e0b', // Amber
        weight: 3,
        opacity: 0.7,
        dashArray: '8, 8',
        lineCap: 'round',
      }).addTo(map);
    }

    // Initial fit bounds if valid
    if (bounds.length > 0 && !userLocation) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
    }
  }, [nodes, progress, mapReady, userLocation]);

  // 7. Update User Live Location & Accuracy on Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady || !userLocation) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    if (!L) return;

    const userPt: [number, number] = [userLocation.lat, userLocation.lng];

    // User radar marker
    if (!userMarkerRef.current) {
      const userHtml = `
        <div class="relative flex items-center justify-center">
          <div class="absolute -inset-3 rounded-full bg-cyan-400/35 animate-ping"></div>
          <div class="w-5 h-5 rounded-full bg-cyan-500 border-2 border-white shadow-xl flex items-center justify-center">
            <div class="w-2 h-2 rounded-full bg-white"></div>
          </div>
        </div>
      `;

      const userIcon = L.divIcon({
        className: 'user-live-radar-pin',
        html: userHtml,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      userMarkerRef.current = L.marker(userPt, { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
    } else {
      userMarkerRef.current.setLatLng(userPt);
    }

    // Accuracy Circle
    if (!accuracyCircleRef.current) {
      accuracyCircleRef.current = L.circle(userPt, {
        radius: Math.min(userLocation.accuracy, 100),
        color: '#06b6d4',
        fillColor: '#06b6d4',
        fillOpacity: 0.12,
        weight: 1.5,
        dashArray: '4, 4',
      }).addTo(map);
    } else {
      accuracyCircleRef.current.setLatLng(userPt);
      accuracyCircleRef.current.setRadius(Math.min(userLocation.accuracy, 100));
    }

    // Draw bearing guide line from user to current objective
    if (currentTargetNode && currentTargetNode.latitude && currentTargetNode.longitude) {
      const targetPt: [number, number] = [
        Number(currentTargetNode.latitude),
        Number(currentTargetNode.longitude),
      ];

      if (userGuideLineRef.current) {
        userGuideLineRef.current.setLatLngs([userPt, targetPt]);
      } else {
        userGuideLineRef.current = L.polyline([userPt, targetPt], {
          color: '#38bdf8', // Sky blue
          weight: 2.5,
          opacity: 0.8,
          dashArray: '6, 6',
        }).addTo(map);
      }
    }

    // If "following user", auto-pan
    if (followingUser) {
      map.panTo(userPt, { animate: true });
    }
  }, [userLocation, mapReady, followingUser, currentTargetNode]);

  // Center on User GPS
  const handleCenterOnUser = () => {
    if (!userLocation || !mapInstanceRef.current) {
      if (gpsError) alert(gpsError);
      return;
    }
    setFollowingUser(true);
    mapInstanceRef.current.setView([userLocation.lat, userLocation.lng], 18, { animate: true });
  };

  // Center on Current Objective
  const handleFocusTarget = () => {
    if (!currentTargetNode || !mapInstanceRef.current) return;
    setFollowingUser(false);
    const lat = Number(currentTargetNode.latitude);
    const lng = Number(currentTargetNode.longitude);
    if (!isNaN(lat) && !isNaN(lng)) {
      mapInstanceRef.current.setView([lat, lng], 18, { animate: true });
      setSelectedNode(currentTargetNode);
    }
  };

  // Fit all checkpoints in view
  const handleFitAll = () => {
    if (!mapInstanceRef.current || nodes.length === 0) return;
    setFollowingUser(false);
    const bounds: [number, number][] = nodes
      .map((n) => [Number(n.latitude), Number(n.longitude)] as [number, number])
      .filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));

    if (userLocation) {
      bounds.push([userLocation.lat, userLocation.lng]);
    }

    if (bounds.length > 0) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-xs sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-title"
        className="relative flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl sm:h-[88dvh] sm:max-w-4xl sm:rounded-xl"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 shrink-0">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent border border-accent/40 shadow-inner">
              <MapIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="map-title" className="text-base sm:text-lg font-bold text-ink truncate">
                  Campus Tactical Radar
                </h2>
                <span
                  className={`rounded border px-2 py-0.5 text-xs font-extrabold uppercase tracking-wider ${currentRoute === 1
                      ? 'border-route-1/50 bg-route-1/15 text-route-1'
                      : 'border-route-2/50 bg-route-2/15 text-route-2'
                    }`}
                >
                  Route 0{currentRoute}
                </span>
              </div>
              <p className="truncate text-xs text-muted">
                Target: {currentTargetNode?.title || `Checkpoint ${currentStageNumber}`} ·{' '}
                {completedStages.length}/12 Cleared
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* User GPS Indicator */}
            {userLocation ? (
              <span className="hidden sm:inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-1 text-[11px] font-mono text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                GPS ±{Math.round(userLocation.accuracy)}m
              </span>
            ) : gpsError ? (
              <span className="hidden sm:inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/30 px-2 py-1 text-[11px] font-mono text-amber-400">
                <AlertCircle className="w-3 h-3" />
                No GPS
              </span>
            ) : null}

            <button
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink cursor-pointer border border-line"
              aria-label="Close map"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Map Container Area */}
        <div className="relative flex-1 w-full h-full overflow-hidden bg-zinc-900">
          {/* Leaflet Map Div */}
          <div ref={mapContainerRef} className="w-full h-full z-0" />

          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70 backdrop-blur-xs text-white">
              <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className="text-xs uppercase tracking-widest font-mono text-accent">
                Synthesizing OpenStreetMap Nodes...
              </p>
            </div>
          )}

          {/* Floating Map Action Controls */}
          <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
            <button
              onClick={handleCenterOnUser}
              className={`p-2.5 rounded-lg border shadow-lg backdrop-blur-md transition-all cursor-pointer flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${followingUser && userLocation
                  ? 'bg-cyan-500 text-black border-cyan-300 ring-2 ring-cyan-400/50'
                  : 'bg-surface/90 text-ink border-line hover:border-accent'
                }`}
              title="Locate my position on campus"
            >
              <Navigation className={`w-4 h-4 ${followingUser ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">My Position</span>
            </button>

            <button
              onClick={handleFocusTarget}
              className="p-2.5 bg-surface/90 hover:bg-surface text-amber-400 border border-amber-500/40 rounded-lg shadow-lg backdrop-blur-md transition-all cursor-pointer flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
              title="Focus on current target checkpoint"
            >
              <Crosshair className="w-4 h-4" />
              <span className="hidden sm:inline">Target (0{currentStageNumber})</span>
            </button>

            <button
              onClick={handleFitAll}
              className="p-2.5 bg-surface/90 hover:bg-surface text-ink border border-line rounded-lg shadow-lg backdrop-blur-md transition-all cursor-pointer flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
              title="View all 12 checkpoints"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">Fit Route</span>
            </button>
          </div>

          {/* Map Legend Overlay */}
          <div className="absolute top-4 right-14 z-10 hidden sm:flex flex-col gap-1.5 bg-surface/95 border border-line p-2.5 rounded-lg text-xs shadow-lg backdrop-blur-md">
            <div className="flex items-center gap-2 text-ink text-[11px]">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-emerald-400"></span>
              <span>Cleared Node</span>
            </div>
            <div className="flex items-center gap-2 text-ink text-[11px]">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-white animate-pulse"></span>
              <span className="font-bold text-amber-400">Current Target</span>
            </div>
            <div className="flex items-center gap-2 text-ink text-[11px]">
              <span className="w-2.5 h-2.5 rounded-full bg-stone-700 border border-stone-500"></span>
              <span className="text-muted">Upcoming Ahead</span>
            </div>
            {userLocation && (
              <div className="flex items-center gap-2 text-ink text-[11px]">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 border border-white animate-ping"></span>
                <span className="text-cyan-400 font-bold">Your GPS</span>
              </div>
            )}
          </div>

          {/* Selected Node Details Card (When tapped) */}
          {selectedNode && (
            <div className="absolute top-16 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-20 bg-surface/98 border-2 border-accent p-4 rounded-xl shadow-2xl backdrop-blur-lg animate-in fade-in duration-200">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-extrabold px-2 py-0.5 rounded uppercase ${selectedNode.stage < progress.currentStage
                        ? 'bg-emerald-600 text-white'
                        : selectedNode.stage === progress.currentStage
                          ? 'bg-amber-500 text-black'
                          : 'bg-stone-800 text-stone-300'
                      }`}
                  >
                    Checkpoint 0{selectedNode.stage}
                  </span>
                  <span className="text-[11px] text-muted uppercase font-mono">
                    {selectedNode.stage < progress.currentStage
                      ? '✓ Cleared'
                      : selectedNode.stage === progress.currentStage
                        ? '🎯 Active Target'
                        : '🔒 Locked'}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-muted hover:text-ink cursor-pointer p-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <h4 className="font-bold text-sm text-ink mb-1">{selectedNode.title}</h4>
              <p className="text-xs text-primary font-bold uppercase mb-2 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                {selectedNode.area}
              </p>

              {userLocation && selectedNode.latitude && selectedNode.longitude && (
                <div className="bg-sunken border border-line/60 p-2 rounded text-xs flex justify-between items-center font-mono">
                  <span className="text-muted">Distance From You:</span>
                  <span className="text-accent font-bold">
                    {formatDistance(
                      calculateDistanceMeters(
                        userLocation.lat,
                        userLocation.lng,
                        Number(selectedNode.latitude),
                        Number(selectedNode.longitude)
                      )
                    )}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Bottom Telemetry HUD Bar (Position & Travelled Stats) */}
          <div className="absolute bottom-4 left-3 right-3 sm:left-6 sm:right-6 z-10 bg-surface/95 border border-line-strong p-3 sm:p-4 rounded-xl shadow-2xl backdrop-blur-md">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {/* Stat 1: Next Target */}
              <div className="border-r border-line pr-2">
                <span className="text-[10px] uppercase font-bold text-muted block mb-0.5 flex items-center gap-1">
                  <Flag className="w-3 h-3 text-amber-400" />
                  Target Node 0{currentStageNumber}
                </span>
                <span className="font-bold text-ink truncate block text-xs sm:text-sm">
                  {currentTargetNode?.title || 'Unknown'}
                </span>
                <span className="text-[11px] text-primary truncate block font-sans">
                  {currentTargetNode?.area || 'Campus Area'}
                </span>
              </div>

              {/* Stat 2: Distance to Target */}
              <div className="border-r border-line pr-2">
                <span className="text-[10px] uppercase font-bold text-muted block mb-0.5 flex items-center gap-1">
                  <Crosshair className="w-3 h-3 text-accent" />
                  Distance to Target
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-extrabold text-sm sm:text-base text-accent">
                    {distanceToTarget !== null ? formatDistance(distanceToTarget) : 'Acquiring GPS...'}
                  </span>
                  {bearingToTarget !== null && (
                    <span title={`Bearing: ${Math.round(bearingToTarget)}°`} className="inline-flex shrink-0">
                      <Compass
                        className="w-4 h-4 text-accent transition-transform duration-300"
                        style={{ transform: `rotate(${bearingToTarget}deg)` }}
                      />
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-muted block">
                  {distanceToTarget !== null ? 'Direct line from your GPS' : 'Enable device location'}
                </span>
              </div>

              {/* Stat 3: Total Travelled Path */}
              <div className="border-r border-line pr-2 col-span-1">
                <span className="text-[10px] uppercase font-bold text-muted block mb-0.5 flex items-center gap-1">
                  <Layers className="w-3 h-3 text-emerald-400" />
                  Travelled Trail
                </span>
                <span className="font-mono font-extrabold text-sm sm:text-base text-emerald-400 block">
                  {formatDistance(totalTravelledMeters)}
                </span>
                <span className="text-[10px] text-muted block">
                  {completedStages.length} of 12 checkpoints cleared
                </span>
              </div>

              {/* Stat 4: Stage Completion Progress */}
              <div className="col-span-1 flex flex-col justify-center">
                <div className="flex justify-between text-[11px] font-bold mb-1">
                  <span className="text-ink">Mission Progress</span>
                  <span className="text-accent font-mono">
                    {Math.round((completedStages.length / 12) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-surface-2 h-2 rounded-full overflow-hidden border border-line">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-500"
                    style={{ width: `${(completedStages.length / 12) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted mt-1 truncate">
                  {12 - completedStages.length} nodes remaining
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
