'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { loadLeaflet } from '@/lib/leaflet-loader';
import {
  MapPin,
  Save,
  Navigation,
  RotateCcw,
  Check,
  AlertTriangle,
  Copy,
  Info,
  CheckCircle,
  Zap,
  Undo2,
  Crosshair,
} from 'lucide-react';
import {
  CAMPUS_CENTER,
  CAMPUS_DEFAULT_COORDINATES,
  calculateDistanceMeters,
  formatDistance,
  generateSqlMigrationSnippet,
} from '@/lib/coordinates';

export interface AdminCheckpointCoord {
  id: number;
  route_id?: 1 | 2;
  stage?: number;
  title: string;
  area: string;
  clue: string;
  qr_hash: string;
  latitude?: number | null;
  longitude?: number | null;
}

interface AdminOpenStreetMapProps {
  checkpoints: AdminCheckpointCoord[];
  routeFilter: 'all' | 1 | 2;
  onUpdateCheckpoint: (updated: Partial<AdminCheckpointCoord> & { id: number }) => Promise<boolean>;
  onRefresh: () => void;
  selectedId?: number | null;
  onSelectCheckpoint?: (id: number | null) => void;
}

export default function AdminOpenStreetMap({
  checkpoints,
  routeFilter,
  onUpdateCheckpoint,
  onRefresh,
  selectedId: controlledSelectedId,
  onSelectCheckpoint,
}: AdminOpenStreetMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersMapRef = useRef<Map<number, any>>(new Map());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polyline1Ref = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polyline2Ref = useRef<any>(null);

  // Direct DOM ref for zero-latency dragging HUD banner (prevents 60fps React re-render lag)
  const dragHudRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef<boolean>(false);

  // In-memory persistent map of latest coordinates per checkpoint ID
  const coordsRef = useRef<Map<number, { lat: number; lng: number }>>(new Map());

  // Selection
  const [internalSelectedId, setInternalSelectedId] = useState<number | null>(null);
  const activeSelectedId = controlledSelectedId !== undefined ? controlledSelectedId : internalSelectedId;

  // Track moved nodes pending save (when autoSave is false)
  const [movedNodes, setMovedNodes] = useState<Record<number, { lat: number; lng: number; origLat: number; origLng: number }>>({});
  const [autoSave, setAutoSave] = useState<boolean>(true);

  // Sidebar form inputs
  const [latInput, setLatInput] = useState<string>('');
  const [lngInput, setLngInput] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // GPS & SQL modal
  const [adminGps, setAdminGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gettingGps, setGettingGps] = useState(false);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Filter checkpoints by route
  const filteredCheckpoints = checkpoints.filter((cp) => {
    const route = cp.route_id || (cp.id <= 12 ? 1 : 2);
    if (routeFilter === 'all') return true;
    return route === routeFilter;
  });

  const selectedCp = checkpoints.find((cp) => cp.id === activeSelectedId) || null;

  // Show toast notification
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3500);
  }, []);

  const handleSelectCheckpoint = useCallback(
    (id: number | null) => {
      setInternalSelectedId(id);
      if (onSelectCheckpoint) onSelectCheckpoint(id);
    },
    [onSelectCheckpoint]
  );

  // Helper to resolve coordinates
  const resolveCoord = useCallback((cp: AdminCheckpointCoord): { lat: number; lng: number; isCustom: boolean } => {
    const inMem = coordsRef.current.get(cp.id);
    if (inMem) return { lat: inMem.lat, lng: inMem.lng, isCustom: true };

    if (cp.latitude != null && cp.longitude != null && !isNaN(Number(cp.latitude)) && !isNaN(Number(cp.longitude))) {
      return { lat: Number(cp.latitude), lng: Number(cp.longitude), isCustom: true };
    }

    const def = CAMPUS_DEFAULT_COORDINATES[cp.id];
    return {
      lat: def?.lat ?? CAMPUS_CENTER.lat,
      lng: def?.lng ?? CAMPUS_CENTER.lng,
      isCustom: false,
    };
  }, []);

  // Redraw Polylines directly in Leaflet
  const updatePolylines = useCallback(() => {
    if (!polyline1Ref.current && !polyline2Ref.current) return;

    const r1: [number, number][] = [];
    const r2: [number, number][] = [];

    for (let id = 1; id <= 12; id++) {
      const pos = coordsRef.current.get(id);
      if (pos) r1.push([pos.lat, pos.lng]);
    }
    for (let id = 13; id <= 24; id++) {
      const pos = coordsRef.current.get(id);
      if (pos) r2.push([pos.lat, pos.lng]);
    }

    if (polyline1Ref.current) polyline1Ref.current.setLatLngs(r1);
    if (polyline2Ref.current) polyline2Ref.current.setLatLngs(r2);
  }, []);

  // Construct Leaflet DivIcon
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildIcon = useCallback((L: any, cp: AdminCheckpointCoord, isSelected: boolean, isMoved: boolean) => {
    const route = cp.route_id || (cp.id <= 12 ? 1 : 2);
    const stage = cp.stage || (cp.id <= 12 ? cp.id : cp.id - 12);
    const hasCustom = cp.latitude != null && cp.longitude != null;

    const bgClass = route === 1 ? 'bg-cyan-600' : 'bg-purple-600';
    const borderClass = isSelected
      ? 'border-amber-400 ring-4 ring-amber-400/80 scale-125 z-40'
      : isMoved
        ? 'border-amber-400 ring-2 ring-amber-400 scale-110 z-30'
        : 'border-white hover:scale-110 z-20';

    const tagClass = isMoved
      ? 'bg-amber-950/95 text-amber-300 border-amber-400 font-bold animate-pulse'
      : hasCustom
        ? 'bg-black/90 text-emerald-300 border-emerald-500/60'
        : 'bg-black/90 text-amber-300 border-amber-500/60';

    const tagLabel = isMoved
      ? `R${route}-0${stage} ● Unsaved`
      : `R${route}-0${stage} ${hasCustom ? '✓' : '⚠️'}`;

    return L.divIcon({
      className: `admin-marker-pin marker-id-${cp.id}`,
      html: `
        <div class="group relative flex items-center justify-center cursor-grab active:cursor-grabbing transition-transform select-none" style="pointer-events: auto;">
          <div class="w-8 h-8 rounded-full ${bgClass} text-white flex items-center justify-center font-bold text-xs shadow-xl border-2 transition-all ${borderClass}">
            ${stage}
          </div>
          <span class="absolute -bottom-5 whitespace-nowrap font-mono text-[9px] px-1.5 py-0.5 rounded border shadow-sm ${tagClass}">
            ${tagLabel}
          </span>
          <div class="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black/95 text-[10px] text-white font-mono px-2 py-0.5 rounded pointer-events-none whitespace-nowrap border border-line shadow-lg">
            Drag to Move
          </div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  }, []);

  // Update visual appearance of markers without destroying DOM or canceling drags
  const refreshMarkerStyles = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    if (!L || isDraggingRef.current) return;

    markersMapRef.current.forEach((marker, id) => {
      const cp = checkpoints.find((c) => c.id === id);
      if (!cp) return;
      const isSelected = activeSelectedId === id;
      const isMoved = !!movedNodes[id];
      marker.setIcon(buildIcon(L, cp, isSelected, isMoved));
    });
  }, [checkpoints, activeSelectedId, movedNodes, buildIcon]);

  // Synchronize input fields when selected checkpoint changes
  useEffect(() => {
    if (activeSelectedId != null) {
      const cp = checkpoints.find((c) => c.id === activeSelectedId);
      if (cp) {
        const coord = coordsRef.current.get(cp.id) || resolveCoord(cp);
        setLatInput(coord.lat.toFixed(6));
        setLngInput(coord.lng.toFixed(6));
      }
    }
  }, [activeSelectedId, checkpoints, resolveCoord]);

  // Handle final node drop after user releases mouse
  const handleNodeDropped = useCallback(
    async (id: number, lat: number, lng: number) => {
      const cleanLat = Number(lat.toFixed(6));
      const cleanLng = Number(lng.toFixed(6));

      coordsRef.current.set(id, { lat: cleanLat, lng: cleanLng });
      updatePolylines();

      if (activeSelectedId === id) {
        setLatInput(cleanLat.toFixed(6));
        setLngInput(cleanLng.toFixed(6));
      }

      const cp = checkpoints.find((c) => c.id === id);
      const stage = cp ? cp.stage || (cp.id <= 12 ? cp.id : cp.id - 12) : id;

      if (autoSave) {
        setSaving(true);
        try {
          const success = await onUpdateCheckpoint({
            id,
            latitude: cleanLat,
            longitude: cleanLng,
          });

          if (success) {
            showToast(`✓ Node 0${stage} saved to (${cleanLat}, ${cleanLng})`, 'success');
            setMovedNodes((prev) => {
              const updated = { ...prev };
              delete updated[id];
              return updated;
            });
            onRefresh();
          } else {
            showToast(`Could not auto-save Node 0${stage}. Click 'Save' to retry.`, 'error');
            setMovedNodes((prev) => ({
              ...prev,
              [id]: {
                lat: cleanLat,
                lng: cleanLng,
                origLat: cp?.latitude ? Number(cp.latitude) : CAMPUS_DEFAULT_COORDINATES[id]?.lat ?? CAMPUS_CENTER.lat,
                origLng: cp?.longitude ? Number(cp.longitude) : CAMPUS_DEFAULT_COORDINATES[id]?.lng ?? CAMPUS_CENTER.lng,
              },
            }));
          }
        } catch (err) {
          showToast(`Error: ${err}`, 'error');
        } finally {
          setSaving(false);
        }
      } else {
        setMovedNodes((prev) => ({
          ...prev,
          [id]: {
            lat: cleanLat,
            lng: cleanLng,
            origLat: cp?.latitude ? Number(cp.latitude) : CAMPUS_DEFAULT_COORDINATES[id]?.lat ?? CAMPUS_CENTER.lat,
            origLng: cp?.longitude ? Number(cp.longitude) : CAMPUS_DEFAULT_COORDINATES[id]?.lng ?? CAMPUS_CENTER.lng,
          },
        }));
        showToast(`📍 Node 0${stage} moved to (${cleanLat}, ${cleanLng}). Click Save to persist.`, 'info');
      }
    },
    [autoSave, activeSelectedId, checkpoints, onUpdateCheckpoint, onRefresh, updatePolylines, showToast]
  );

  // Manual save coordinates button in sidebar
  const handleSaveManualCoordinates = useCallback(async () => {
    if (activeSelectedId == null) return;

    const lat = parseFloat(latInput);
    const lng = parseFloat(lngInput);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      alert('Please enter valid latitude (-90 to 90) and longitude (-180 to 180)');
      return;
    }

    const cleanLat = Number(lat.toFixed(6));
    const cleanLng = Number(lng.toFixed(6));

    const marker = markersMapRef.current.get(activeSelectedId);
    if (marker) {
      marker.setLatLng([cleanLat, cleanLng]);
    }
    coordsRef.current.set(activeSelectedId, { lat: cleanLat, lng: cleanLng });
    updatePolylines();

    setSaving(true);
    try {
      const ok = await onUpdateCheckpoint({
        id: activeSelectedId,
        latitude: cleanLat,
        longitude: cleanLng,
      });

      if (ok) {
        showToast(`✓ Node 0${activeSelectedId <= 12 ? activeSelectedId : activeSelectedId - 12} saved!`, 'success');
        setMovedNodes((prev) => {
          const next = { ...prev };
          delete next[activeSelectedId];
          return next;
        });
        onRefresh();
      } else {
        showToast('Failed to save coordinates to database', 'error');
      }
    } catch (err) {
      showToast(`Error saving: ${err}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [activeSelectedId, latInput, lngInput, onUpdateCheckpoint, onRefresh, updatePolylines, showToast]);

  // Revert a moved node
  const handleRevertNode = useCallback(
    (id: number) => {
      const moved = movedNodes[id];
      const cp = checkpoints.find((c) => c.id === id);
      const stage = cp ? cp.stage || (cp.id <= 12 ? cp.id : cp.id - 12) : id;

      const origLat = moved
        ? moved.origLat
        : cp?.latitude
          ? Number(cp.latitude)
          : CAMPUS_DEFAULT_COORDINATES[id]?.lat ?? CAMPUS_CENTER.lat;
      const origLng = moved
        ? moved.origLng
        : cp?.longitude
          ? Number(cp.longitude)
          : CAMPUS_DEFAULT_COORDINATES[id]?.lng ?? CAMPUS_CENTER.lng;

      coordsRef.current.set(id, { lat: origLat, lng: origLng });

      const marker = markersMapRef.current.get(id);
      if (marker) {
        marker.setLatLng([origLat, origLng]);
      }

      updatePolylines();

      setMovedNodes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

      if (activeSelectedId === id) {
        setLatInput(origLat.toFixed(6));
        setLngInput(origLng.toFixed(6));
      }

      showToast(`↺ Reverted Node 0${stage} to original coordinates`, 'info');
    },
    [movedNodes, checkpoints, activeSelectedId, updatePolylines, showToast]
  );

  // 7. Save a specific moved node to Database
  const handleSaveMovedNode = useCallback(
    async (id: number) => {
      const moved = movedNodes[id];
      if (!moved) return;

      const cp = checkpoints.find((c) => c.id === id);
      const stage = cp ? cp.stage || (cp.id <= 12 ? cp.id : cp.id - 12) : id;

      setSavingId(id);
      try {
        const ok = await onUpdateCheckpoint({
          id,
          latitude: moved.lat,
          longitude: moved.lng,
        });

        if (ok) {
          showToast(`✓ Node 0${stage} location successfully saved to database!`, 'success');
          setMovedNodes((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
          onRefresh();
        } else {
          showToast(`Failed to save Node 0${stage} to database`, 'error');
        }
      } catch (err) {
        showToast(`Error saving node: ${err}`, 'error');
      } finally {
        setSavingId(null);
      }
    },
    [movedNodes, checkpoints, onUpdateCheckpoint, onRefresh, showToast]
  );

  // 8. Save All Moved Nodes in one batch
  const handleSaveAllMoved = useCallback(async () => {
    const ids = Object.keys(movedNodes).map(Number);
    if (ids.length === 0) return;

    setSaving(true);
    let successCount = 0;

    for (const id of ids) {
      const moved = movedNodes[id];
      if (moved) {
        const ok = await onUpdateCheckpoint({
          id,
          latitude: moved.lat,
          longitude: moved.lng,
        });
        if (ok) successCount++;
      }
    }

    setSaving(false);
    setMovedNodes({});
    onRefresh();
    showToast(`✓ Saved ${successCount} node(s) to Supabase database!`, 'success');
  }, [movedNodes, onUpdateCheckpoint, onRefresh, showToast]);

  // Reset to SRM building preset
  const handleResetToPreset = useCallback(async () => {
    if (activeSelectedId == null) return;
    const def = CAMPUS_DEFAULT_COORDINATES[activeSelectedId];
    if (!def) return;

    const cleanLat = Number(def.lat.toFixed(6));
    const cleanLng = Number(def.lng.toFixed(6));

    const marker = markersMapRef.current.get(activeSelectedId);
    if (marker) {
      marker.setLatLng([cleanLat, cleanLng]);
    }
    coordsRef.current.set(activeSelectedId, { lat: cleanLat, lng: cleanLng });
    updatePolylines();

    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([cleanLat, cleanLng], 18, { animate: true });
    }

    setLatInput(cleanLat.toFixed(6));
    setLngInput(cleanLng.toFixed(6));

    await handleNodeDropped(activeSelectedId, cleanLat, cleanLng);
  }, [activeSelectedId, handleNodeDropped, updatePolylines]);

  // Admin Device GPS
  const handleGetAdminLocation = useCallback(() => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }
    setGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGettingGps(false);
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setAdminGps({ lat, lng });

        if (mapInstanceRef.current) {
          mapInstanceRef.current.setView([lat, lng], 18, { animate: true });
        }

        if (activeSelectedId != null) {
          setLatInput(lat.toFixed(6));
          setLngInput(lng.toFixed(6));
          const marker = markersMapRef.current.get(activeSelectedId);
          if (marker) marker.setLatLng([lat, lng]);
          coordsRef.current.set(activeSelectedId, { lat, lng });
          updatePolylines();
          handleNodeDropped(activeSelectedId, lat, lng);
        } else {
          showToast(`Admin GPS: ${lat}, ${lng}`, 'info');
        }
      },
      (err) => {
        setGettingGps(false);
        alert(`Could not acquire GPS: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, [activeSelectedId, handleNodeDropped, updatePolylines, showToast]);

  // Fit all route nodes
  const handleFitRoute = useCallback(() => {
    if (!mapInstanceRef.current || filteredCheckpoints.length === 0) return;
    const bounds: [number, number][] = filteredCheckpoints.map((cp) => {
      const coord = coordsRef.current.get(cp.id) || resolveCoord(cp);
      return [coord.lat, coord.lng];
    });
    mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
  }, [filteredCheckpoints, resolveCoord]);

  // 1. Initialize Map Once
  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!mapContainerRef.current || mapInstanceRef.current) return;

      try {
        const L = await loadLeaflet();
        if (cancelled || !mapContainerRef.current) return;

        const map = L.map(mapContainerRef.current, {
          center: [CAMPUS_CENTER.lat, CAMPUS_CENTER.lng],
          zoom: 16,
          zoomControl: false,
          attributionControl: true,
        });

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        L.control.zoom({ position: 'topright' }).addTo(map);

        polyline1Ref.current = L.polyline([], {
          color: '#06b6d4',
          weight: 3.5,
          opacity: 0.85,
          dashArray: '6, 6',
        }).addTo(map);

        polyline2Ref.current = L.polyline([], {
          color: '#a855f7',
          weight: 3.5,
          opacity: 0.85,
          dashArray: '6, 6',
        }).addTo(map);

        // Click map to reposition selected checkpoint
        map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
          setInternalSelectedId((curr) => {
            const targetId = controlledSelectedId !== undefined ? controlledSelectedId : curr;
            if (targetId != null) {
              const cleanLat = Number(e.latlng.lat.toFixed(6));
              const cleanLng = Number(e.latlng.lng.toFixed(6));
              const marker = markersMapRef.current.get(targetId);
              if (marker) marker.setLatLng([cleanLat, cleanLng]);
              coordsRef.current.set(targetId, { lat: cleanLat, lng: cleanLng });
              updatePolylines();
              handleNodeDropped(targetId, cleanLat, cleanLng);
            }
            return curr;
          });
        });

        mapInstanceRef.current = map;
      } catch (err) {
        console.error('Failed to init Leaflet for Admin:', err);
      }
    }

    initMap();

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // 2. Synchronize Markers with Checkpoints data and Route Filter
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    const map = mapInstanceRef.current;
    if (!map || !L || filteredCheckpoints.length === 0) return;

    const visibleIds = new Set(filteredCheckpoints.map((cp) => cp.id));

    // Remove obsolete markers
    markersMapRef.current.forEach((marker, id) => {
      if (!visibleIds.has(id)) {
        marker.remove();
        markersMapRef.current.delete(id);
      }
    });

    const bounds: [number, number][] = [];

    // Create markers for newly visible checkpoints
    filteredCheckpoints.forEach((cp) => {
      // Initialize coordinate in memory if not already present
      if (!coordsRef.current.has(cp.id) || !movedNodes[cp.id]) {
        const res = resolveCoord(cp);
        coordsRef.current.set(cp.id, { lat: res.lat, lng: res.lng });
      }

      const coord = coordsRef.current.get(cp.id)!;
      bounds.push([coord.lat, coord.lng]);

      const isSelected = activeSelectedId === cp.id;
      const isMoved = !!movedNodes[cp.id];
      const icon = buildIcon(L, cp, isSelected, isMoved);

      let marker = markersMapRef.current.get(cp.id);

      if (!marker) {
        // Instantiate Draggable Marker
        marker = L.marker([coord.lat, coord.lng], {
          icon,
          draggable: true,
          autoPan: true,
        }).addTo(map);

        // Marker Click -> Select checkpoint
        marker.on('click', () => {
          handleSelectCheckpoint(cp.id);
        });

        // Marker Drag Start -> Lock state, show HUD directly via DOM (Zero React lag)
        marker.on('dragstart', () => {
          isDraggingRef.current = true;
          handleSelectCheckpoint(cp.id);
          if (dragHudRef.current) {
            dragHudRef.current.style.display = 'flex';
          }
        });

        // Marker Dragging -> Update polyline & HUD directly in 60fps
        marker.on('drag', (e: { target: { getLatLng: () => { lat: number; lng: number } } }) => {
          const pos = e.target.getLatLng();
          coordsRef.current.set(cp.id, { lat: pos.lat, lng: pos.lng });

          // Update Leaflet polylines immediately
          updatePolylines();

          // Update HUD directly
          if (dragHudRef.current) {
            const stage = cp.stage || (cp.id <= 12 ? cp.id : cp.id - 12);
            const route = cp.route_id || (cp.id <= 12 ? 1 : 2);
            dragHudRef.current.innerHTML = `
              <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
              <span><strong>R${route}-0${stage}</strong> &rarr; Lat: ${pos.lat.toFixed(6)}, Lng: ${pos.lng.toFixed(6)}</span>
            `;
          }
        });

        // Marker Drag End -> Commit coordinates and unlock
        marker.on('dragend', (e: { target: { getLatLng: () => { lat: number; lng: number } } }) => {
          isDraggingRef.current = false;
          if (dragHudRef.current) {
            dragHudRef.current.style.display = 'none';
          }
          const finalPos = e.target.getLatLng();
          handleNodeDropped(cp.id, finalPos.lat, finalPos.lng);
        });

        markersMapRef.current.set(cp.id, marker);
      } else {
        // Marker exists: update position only if not currently moved or dragging
        if (!isDraggingRef.current && !movedNodes[cp.id]) {
          marker.setLatLng([coord.lat, coord.lng]);
        }
        marker.setIcon(icon);
      }
    });

    updatePolylines();

    // Initial fit view if no checkpoint selected
    if (bounds.length > 0 && activeSelectedId == null) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
    }
  }, [
    filteredCheckpoints,
    activeSelectedId,
    movedNodes,
    buildIcon,
    resolveCoord,
    handleNodeDropped,
    handleSelectCheckpoint,
    updatePolylines,
  ]);

  // Keep marker styling in sync with selection
  useEffect(() => {
    refreshMarkerStyles();
  }, [refreshMarkerStyles]);

  const movedCount = Object.keys(movedNodes).length;

  return (
    <div className="space-y-4">
      {/* Toast Feedback */}
      {toast && (
        <div
          className={`fixed top-16 right-4 z-50 px-4 py-2.5 rounded-lg shadow-xl text-xs font-bold font-mono flex items-center gap-2 border transition-all animate-in slide-in-from-top-2 ${toast.type === 'success'
              ? 'bg-emerald-950/95 text-emerald-300 border-emerald-500/70'
              : toast.type === 'error'
                ? 'bg-rose-950/95 text-rose-300 border-rose-500/70'
                : 'bg-cyan-950/95 text-cyan-300 border-cyan-500/70'
            }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : toast.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-cyan-400 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Map Action Toolbar */}
      <div className="bg-surface border border-line p-3 sm:p-4 rounded-lg flex flex-wrap justify-between items-center gap-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-cyan-600/20 text-cyan-400 flex items-center justify-center shrink-0 border border-cyan-500/40">
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink uppercase tracking-wider flex items-center gap-2">
              <span>Interactive OpenStreetMap Studio</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-600/20 text-cyan-400 border border-cyan-500/30">
                Drag &amp; Drop Enabled
              </span>
            </h3>
            <p className="text-xs text-muted">
              Drag numbered pins directly on the map to calibrate node coordinates. Route paths bend live as you drag.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Auto-Save Toggle */}
          <button
            onClick={() => setAutoSave(!autoSave)}
            className={`px-3 py-1.5 rounded text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer border transition-colors shadow-sm ${autoSave
                ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/60 hover:bg-emerald-600/30'
                : 'bg-sunken text-muted border-line hover:text-ink'
              }`}
            title="Automatically update database when pin is dropped"
          >
            <Zap className={`w-3.5 h-3.5 ${autoSave ? 'text-emerald-400 fill-emerald-400' : ''}`} />
            <span>Auto-Save on Drop: {autoSave ? 'ON' : 'OFF'}</span>
          </button>

          {/* Admin Current GPS */}
          <button
            onClick={handleGetAdminLocation}
            disabled={gettingGps}
            className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold uppercase rounded flex items-center gap-1.5 cursor-pointer shadow transition-colors"
            title="Acquire device GPS location and snap selected node"
          >
            <Navigation className={`w-3.5 h-3.5 ${gettingGps ? 'animate-spin' : ''}`} />
            <span>{gettingGps ? 'Acquiring...' : 'My Device GPS'}</span>
          </button>

          {/* Fit Route Bounds */}
          <button
            onClick={handleFitRoute}
            className="px-3 py-1.5 bg-sunken hover:bg-surface text-ink border border-line text-xs font-bold uppercase rounded flex items-center gap-1.5 cursor-pointer shadow transition-colors"
            title="Fit map view to all nodes"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Fit Route</span>
          </button>

          {/* SQL Snippet Generator */}
          <button
            onClick={() => setShowSqlModal(true)}
            className="px-3 py-1.5 bg-primary hover:opacity-90 text-on-primary text-xs font-extrabold uppercase rounded flex items-center gap-1.5 cursor-pointer shadow transition-colors"
            title="Generate SQL migration snippet for Supabase"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>SQL Snippet</span>
          </button>
        </div>
      </div>

      {/* Main Map + Inspection Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* OpenStreetMap Canvas */}
        <div className="lg:col-span-2 relative h-[500px] sm:h-[600px] rounded-lg border border-line overflow-hidden shadow-inner bg-zinc-900">
          <div ref={mapContainerRef} className="w-full h-full z-0" />

          {/* Live Dragging HUD Banner */}
          {liveDrag && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-black/90 border-2 border-accent px-4 py-2 rounded-full text-xs font-mono text-white shadow-2xl backdrop-blur-md flex items-center gap-2.5 animate-pulse">
              <span className="w-2.5 h-2.5 rounded-full bg-accent animate-ping" />
              <span>
                Dragging{' '}
                <strong className="text-accent">
                  Route {liveDrag.route} // Node 0{liveDrag.stage}
                </strong>{' '}
                &rarr; Lat: {liveDrag.lat.toFixed(6)}, Lng: {liveDrag.lng.toFixed(6)}
              </span>
            </div>
          )}

          {/* Unsaved Changes Floating Bar (When Auto-Save is OFF and nodes moved) */}
          {!autoSave && movedCount > 0 && (
            <div className="absolute top-3 left-3 right-3 sm:left-auto sm:right-3 z-20 bg-amber-950/95 border-2 border-amber-400 p-3 rounded-lg shadow-2xl backdrop-blur-md flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-2 text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="font-bold">{movedCount} Node(s) Moved (Unsaved)</span>
              </div>
              <button
                onClick={handleSaveAllMoved}
                disabled={saving}
                className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-black font-extrabold uppercase rounded cursor-pointer transition-colors shadow flex items-center gap-1"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Saving...' : 'Save All Changes'}</span>
              </button>
            </div>
          )}

          {/* Quick Help Tip */}
          <div className="absolute bottom-3 left-3 z-10 bg-black/85 border border-line/60 px-3 py-1.5 rounded text-[11px] text-stone-300 backdrop-blur-xs flex items-center gap-2 shadow">
            <Info className="w-3.5 h-3.5 text-accent shrink-0" />
            <span>Drag pins or click anywhere on the map to set exact coordinates</span>
          </div>

          {/* Legend Overlay */}
          <div className="absolute bottom-3 right-3 z-10 bg-black/85 border border-line/60 px-3 py-1.5 rounded text-[10px] text-stone-300 backdrop-blur-xs flex items-center gap-3 shadow font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
              <span>Route 1</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
              <span>Route 2</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-400">✓ Saved</span>
            </div>
          </div>
        </div>

        {/* Checkpoint Coordinate Inspector & Form */}
        <div className="lg:col-span-1 bg-surface border border-line p-4 rounded-lg flex flex-col justify-between space-y-4">
          {selectedCp ? (
            <div className="space-y-4">
              <div className="border-b border-line pb-3">
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xs font-extrabold px-2 py-0.5 rounded text-white ${(selectedCp.route_id || (selectedCp.id <= 12 ? 1 : 2)) === 1
                        ? 'bg-cyan-600'
                        : 'bg-purple-600'
                      }`}
                  >
                    ROUTE 0{selectedCp.route_id || (selectedCp.id <= 12 ? 1 : 2)} {'//'} NODE 0
                    {selectedCp.stage || (selectedCp.id <= 12 ? selectedCp.id : selectedCp.id - 12)}
                  </span>
                  <span className="text-[11px] font-mono text-muted">ID: {selectedCp.id}</span>
                </div>
                <h4 className="font-bold text-base text-ink">{selectedCp.title}</h4>
                <p className="text-xs text-primary font-bold uppercase">{selectedCp.area}</p>
              </div>

              {/* Status Alert */}
              {movedNodes[selectedCp.id] ? (
                <div className="bg-amber-500/15 border border-amber-500/50 p-2.5 rounded text-xs text-amber-300 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                    <span className="font-bold">Moved on Map (Unsaved)</span>
                  </div>
                  <button
                    onClick={() => handleRevertNode(selectedCp.id)}
                    className="text-[10px] text-muted hover:text-white uppercase font-bold flex items-center gap-1 border border-line px-1.5 py-0.5 rounded cursor-pointer"
                  >
                    <Undo2 className="w-3 h-3" />
                    <span>Revert</span>
                  </button>
                </div>
              ) : selectedCp.latitude && selectedCp.longitude ? (
                <div className="bg-emerald-500/10 border border-emerald-500/40 p-2.5 rounded text-xs text-emerald-400 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>Exact GPS coordinates calibrated in database</span>
                </div>
              ) : (
                <div className="bg-amber-500/10 border border-amber-500/40 p-2.5 rounded text-xs text-amber-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Using campus fallback default coordinates</span>
                </div>
              )}

              {/* Coordinate Form */}
              <div className="space-y-3 text-xs">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-bold text-ink uppercase text-[11px]">
                      Latitude (DD.dddddd)
                    </label>
                    <span className="text-[10px] text-muted font-mono">Updates as you drag</span>
                  </div>
                  <input
                    type="number"
                    step="0.000001"
                    value={latInput}
                    onChange={(e) => {
                      setLatInput(e.target.value);
                      const num = parseFloat(e.target.value);
                      if (!isNaN(num) && selectedCp) {
                        const marker = markersMapRef.current.get(selectedCp.id);
                        if (marker) {
                          const curLng = parseFloat(lngInput) || CAMPUS_CENTER.lng;
                          marker.setLatLng([num, curLng]);
                          coordsRef.current.set(selectedCp.id, { lat: num, lng: curLng });
                          updatePolylines();
                        }
                      }
                    }}
                    className="w-full bg-sunken border border-line px-3 py-2 text-ink font-mono font-bold outline-none focus:border-accent rounded"
                    placeholder="e.g. 12.823610"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-bold text-ink uppercase text-[11px]">
                      Longitude (DD.dddddd)
                    </label>
                    <span className="text-[10px] text-muted font-mono">Updates as you drag</span>
                  </div>
                  <input
                    type="number"
                    step="0.000001"
                    value={lngInput}
                    onChange={(e) => {
                      setLngInput(e.target.value);
                      const num = parseFloat(e.target.value);
                      if (!isNaN(num) && selectedCp) {
                        const marker = markersMapRef.current.get(selectedCp.id);
                        if (marker) {
                          const curLat = parseFloat(latInput) || CAMPUS_CENTER.lat;
                          marker.setLatLng([curLat, num]);
                          coordsRef.current.set(selectedCp.id, { lat: curLat, lng: num });
                          updatePolylines();
                        }
                      }
                    }}
                    className="w-full bg-sunken border border-line px-3 py-2 text-ink font-mono font-bold outline-none focus:border-accent rounded"
                    placeholder="e.g. 80.044200"
                  />
                </div>

                {/* Distance Calculations */}
                {adminGps && latInput && lngInput && (
                  <div className="bg-sunken border border-line/60 p-2 rounded text-xs font-mono flex justify-between">
                    <span className="text-muted">Distance from you:</span>
                    <span className="text-cyan-400 font-bold">
                      {formatDistance(
                        calculateDistanceMeters(
                          adminGps.lat,
                          adminGps.lng,
                          parseFloat(latInput),
                          parseFloat(lngInput)
                        )
                      )}
                    </span>
                  </div>
                )}

                {/* Reset to SRM Building Preset Button */}
                {CAMPUS_DEFAULT_COORDINATES[selectedCp.id] && (
                  <button
                    type="button"
                    onClick={handleResetToPreset}
                    className="w-full py-1.5 bg-sunken hover:bg-surface border border-line hover:border-amber-400 text-amber-400 text-xs font-bold uppercase rounded flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    title="Reset node to SRM Kattankulathur preset location"
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>Reset to SRM Building Preset</span>
                  </button>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2 border-t border-line">
                <button
                  onClick={handleSaveManualCoordinates}
                  disabled={saving}
                  className={`w-full py-2.5 text-on-primary font-bold uppercase tracking-wider text-xs rounded transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow ${movedNodes[selectedCp.id]
                      ? 'bg-amber-500 hover:bg-amber-400 text-black font-extrabold ring-2 ring-amber-400 animate-pulse'
                      : 'bg-danger hover:opacity-90'
                    }`}
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {saving
                      ? 'Persisting to Database...'
                      : movedNodes[selectedCp.id]
                        ? 'Save Moved Position to Supabase'
                        : 'Save Coordinates to Supabase'}
                  </span>
                </button>

                {movedNodes[selectedCp.id] && (
                  <button
                    type="button"
                    onClick={() => handleRevertNode(selectedCp.id)}
                    className="w-full py-2 border border-line text-muted hover:text-ink text-xs font-bold uppercase rounded cursor-pointer transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>Discard Changes</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted space-y-3">
              <MapPin className="w-10 h-10 text-line-strong animate-bounce" />
              <h4 className="font-bold text-ink text-sm uppercase">No Node Selected</h4>
              <p className="text-xs">
                Click any numbered checkpoint marker on the map to inspect, drag, or edit its exact OpenStreetMap GPS position.
              </p>
            </div>
          )}

          {/* Quick Node Navigator List */}
          <div className="border-t border-line pt-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[11px] uppercase font-bold text-muted">
                Select Checkpoint ({filteredCheckpoints.length} nodes):
              </span>
              <span className="text-[10px] text-muted font-mono">Click to Focus</span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
              {filteredCheckpoints.map((cp) => {
                const stage = cp.stage || (cp.id <= 12 ? cp.id : cp.id - 12);
                const isSelected = activeSelectedId === cp.id;
                const isMoved = !!movedNodes[cp.id];
                const hasCoords = cp.latitude != null && cp.longitude != null;

                return (
                  <button
                    key={cp.id}
                    onClick={() => {
                      handleSelectCheckpoint(cp.id);
                      const marker = markersMapRef.current.get(cp.id);
                      if (marker && mapInstanceRef.current) {
                        mapInstanceRef.current.setView(marker.getLatLng(), 18, { animate: true });
                      }
                    }}
                    className={`px-2 py-1 text-xs font-mono font-bold rounded border transition-colors cursor-pointer ${isSelected
                        ? 'bg-accent text-on-primary border-accent ring-2 ring-accent/60'
                        : isMoved
                          ? 'bg-amber-950/80 text-amber-300 border-amber-400 ring-1 ring-amber-400 animate-pulse'
                          : hasCoords
                            ? 'bg-sunken text-emerald-400 border-line hover:border-accent'
                            : 'bg-sunken text-muted border-dashed border-line hover:border-amber-400'
                      }`}
                  >
                    0{stage} {isMoved ? '●' : hasCoords ? '✓' : ''}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* SQL Migration Modal */}
      {showSqlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-surface border-2 border-primary p-6 rounded-xl relative shadow-2xl max-h-[90vh] flex flex-col font-mono">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                <Copy className="w-5 h-5" />
                OpenStreetMap Coordinates SQL Migration
              </h3>
              <button
                onClick={() => setShowSqlModal(false)}
                className="text-muted hover:text-ink cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-muted mb-3">
              Copy and execute this SQL snippet in the Supabase SQL Editor for BOTH Route 1 and Route 2 databases to populate exact coordinates in the <code className="text-accent">checkpoints</code> table:
            </p>

            <div className="relative flex-1 overflow-hidden rounded border border-line bg-black/80 p-3 mb-4">
              <pre className="text-xs text-emerald-300 font-mono overflow-auto h-80 leading-relaxed">
                {generateSqlMigrationSnippet()}
              </pre>
            </div>

            <div className="flex justify-between items-center gap-3">
              <button
                onClick={() => {
                  const snippet = generateSqlMigrationSnippet();
                  navigator.clipboard.writeText(snippet);
                  setCopiedSql(true);
                  setTimeout(() => setCopiedSql(false), 2500);
                }}
                className="flex-1 py-2.5 bg-primary hover:opacity-90 text-on-primary font-bold uppercase tracking-wider text-xs rounded transition-colors cursor-pointer flex items-center justify-center gap-2 shadow"
              >
                {copiedSql ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                <span>{copiedSql ? 'Copied to Clipboard!' : 'Copy SQL Script'}</span>
              </button>
              <button
                onClick={() => setShowSqlModal(false)}
                className="px-4 py-2.5 border border-line text-muted hover:text-ink text-xs uppercase cursor-pointer rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
