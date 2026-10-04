'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { loadLeaflet } from '@/lib/leaflet-loader';
import {
  MapPin,
  Save,
  Navigation,
  RotateCcw,
  Check,
  AlertTriangle,
  Info,
  CheckCircle,
  Zap,
  Undo2,
  Crosshair,
  Users,
  Trophy,
  Search,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  CAMPUS_CENTER,
  CAMPUS_DEFAULT_COORDINATES,
  calculateDistanceMeters,
  formatDistance,
} from '@/lib/coordinates';

export interface AdminMapTeam {
  id: string;
  uid: string;
  team_name: string;
  team_lead: string;
  status: 'pending' | 'approved' | 'rejected';
  current_stage: number;
  assigned_route?: 1 | 2;
  start_time: string | null;
  completed_at: string | null;
  completion_token: string | null;
  created_at: string;
  members?: Array<{ name: string; role: string; regNo: string; phone: string }>;
}

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
  teams?: AdminMapTeam[];
  selectedTeamId?: string | null;
  onSelectTeam?: (teamId: string | null) => void;
  onInspectTeamSquad?: (team: AdminMapTeam) => void;
  showTeamsDefault?: boolean;
}

export default function AdminOpenStreetMap({
  checkpoints,
  routeFilter,
  onUpdateCheckpoint,
  onRefresh,
  selectedId: controlledSelectedId,
  onSelectCheckpoint,
  teams = [],
  selectedTeamId: controlledSelectedTeamId,
  onSelectTeam,
  onInspectTeamSquad,
  showTeamsDefault = true,
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

  // Team tracking markers and trail lines
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teamMarkersRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teamTrailLineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teamUpcomingLineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teamBeaconCircleRef = useRef<any>(null);

  // Direct DOM ref for zero-latency dragging HUD banner (prevents 60fps React re-render lag)
  const dragHudRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const justDraggedRef = useRef<boolean>(false);

  // In-memory persistent map of latest coordinates per checkpoint ID
  const coordsRef = useRef<Map<number, { lat: number; lng: number }>>(new Map());

  // Checkpoint selection
  const [internalSelectedId, setInternalSelectedId] = useState<number | null>(null);
  const activeSelectedId = controlledSelectedId !== undefined ? controlledSelectedId : internalSelectedId;

  // Team tracking state
  const [showTeams, setShowTeams] = useState<boolean>(showTeamsDefault);
  const [internalSelectedTeamId, setInternalSelectedTeamId] = useState<string | null>(null);
  const activeSelectedTeamId = controlledSelectedTeamId !== undefined ? controlledSelectedTeamId : internalSelectedTeamId;
  const [teamSearchQuery, setTeamSearchQuery] = useState<string>('');

  // Track moved nodes pending save (when autoSave is false)
  const [movedNodes, setMovedNodes] = useState<Record<number, { lat: number; lng: number; origLat: number; origLng: number }>>({});
  const [autoSave, setAutoSave] = useState<boolean>(false);

  // Sidebar form inputs
  const [latInput, setLatInput] = useState<string>('');
  const [lngInput, setLngInput] = useState<string>('');
  const latInputRef = useRef<HTMLInputElement | null>(null);
  const lngInputRef = useRef<HTMLInputElement | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // GPS
  const [adminGps, setAdminGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gettingGps, setGettingGps] = useState(false);

  // Filter checkpoints by route
  const filteredCheckpoints = checkpoints.filter((cp) => {
    const route = cp.route_id || (cp.id <= 12 ? 1 : 2);
    if (routeFilter === 'all') return true;
    return route === routeFilter;
  });

  const selectedCp = checkpoints.find((cp) => cp.id === activeSelectedId) || null;

  // Team mapping helpers
  const getNodeForTeam = useCallback((team: AdminMapTeam): number => {
    const route = team.assigned_route || 1;
    const stage = Math.min(Math.max(team.current_stage || 1, 1), 12);
    return route === 2 ? stage + 12 : stage;
  }, []);

  // Map of checkpoint ID -> teams currently at that node
  const teamsByNodeId = useMemo(() => {
    const map = new Map<number, AdminMapTeam[]>();
    if (!teams || teams.length === 0) return map;

    teams.forEach((t) => {
      if (t.status === 'rejected') return;
      const nid = getNodeForTeam(t);
      const list = map.get(nid) || [];
      list.push(t);
      map.set(nid, list);
    });
    return map;
  }, [teams, getNodeForTeam]);

  // Selected team object
  const focusedTeam = useMemo(() => {
    if (!activeSelectedTeamId || !teams) return null;
    return teams.find((t) => t.id === activeSelectedTeamId) || null;
  }, [activeSelectedTeamId, teams]);

  // Teams at currently selected checkpoint
  const selectedCpTeams = useMemo(() => {
    if (!selectedCp) return [];
    return teamsByNodeId.get(selectedCp.id) || [];
  }, [selectedCp, teamsByNodeId]);

  // Total active teams count within current route filter
  const totalTrackedTeamsCount = useMemo(() => {
    if (!teams) return 0;
    return teams.filter((t) => {
      if (t.status === 'rejected') return false;
      const r = t.assigned_route || 1;
      return routeFilter === 'all' || r === routeFilter;
    }).length;
  }, [teams, routeFilter]);

  // Active nodes that have at least one team
  const activeNodesWithTeams = useMemo(() => {
    const list: { nodeId: number; stage: number; route: 1 | 2; count: number; teams: AdminMapTeam[] }[] = [];
    filteredCheckpoints.forEach((cp) => {
      const tList = teamsByNodeId.get(cp.id) || [];
      if (tList.length > 0) {
        const route = (cp.route_id || (cp.id <= 12 ? 1 : 2)) as 1 | 2;
        const stage = cp.stage || (cp.id <= 12 ? cp.id : cp.id - 12);
        list.push({ nodeId: cp.id, stage, route, count: tList.length, teams: tList });
      }
    });
    return list;
  }, [filteredCheckpoints, teamsByNodeId]);

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

  const handleSelectTeam = useCallback(
    (teamId: string | null) => {
      setInternalSelectedTeamId(teamId);
      if (onSelectTeam) onSelectTeam(teamId);
      if (teamId && teams) {
        const team = teams.find((t) => t.id === teamId);
        if (team) {
          const route = team.assigned_route || 1;
          const stage = Math.min(Math.max(team.current_stage || 1, 1), 12);
          const nodeId = route === 2 ? stage + 12 : stage;
          handleSelectCheckpoint(nodeId);
          const pos = coordsRef.current.get(nodeId);
          if (pos && mapInstanceRef.current) {
            mapInstanceRef.current.setView([pos.lat, pos.lng], 18, { animate: true });
          }
        }
      }
    },
    [onSelectTeam, teams, handleSelectCheckpoint]
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

  // Construct Leaflet DivIcon with team count badge
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildIcon = useCallback((L: any, cp: AdminCheckpointCoord, isSelected: boolean, isMoved: boolean) => {
    const route = cp.route_id || (cp.id <= 12 ? 1 : 2);
    const stage = cp.stage || (cp.id <= 12 ? cp.id : cp.id - 12);
    const hasCustom = cp.latitude != null && cp.longitude != null;

    const nodeTeams = teamsByNodeId.get(cp.id) || [];
    const teamCount = nodeTeams.length;

    const bgClass = route === 1 ? 'bg-cyan-600' : 'bg-purple-600';
    const borderClass = isSelected
      ? 'border-amber-400 ring-4 ring-amber-400/80 scale-125 z-40'
      : isMoved
        ? 'border-amber-400 ring-2 ring-amber-400 scale-110 z-30'
        : 'border-white z-20';

    const tagClass = isMoved
      ? 'bg-amber-950/95 text-amber-300 border-amber-400 font-bold animate-pulse'
      : hasCustom
        ? 'bg-black/90 text-emerald-300 border-emerald-500/60'
        : 'bg-black/90 text-amber-300 border-amber-500/60';

    const tagLabel = isMoved
      ? `R${route}-0${stage} ● Unsaved`
      : `R${route}-0${stage} ${hasCustom ? '✓' : '⚠️'}`;

    const teamBadgeHtml = showTeams && teamCount > 0
      ? `
        <div class="absolute -top-3.5 -right-3.5 bg-amber-500 text-black font-extrabold text-[10px] px-1.5 py-0.5 rounded-full shadow-lg border-2 border-white flex items-center gap-0.5 animate-pulse z-30 pointer-events-none" title="${teamCount} team(s) at this node: ${nodeTeams.map(t => t.team_name).join(', ')}">
          👥 ${teamCount}
        </div>
      `
      : '';

    return L.divIcon({
      className: `admin-marker-pin marker-id-${cp.id}`,
      html: `
        <div class="group relative flex items-center justify-center cursor-grab active:cursor-grabbing select-none" style="pointer-events: auto; transition: none;">
          ${teamBadgeHtml}
          <div class="w-8 h-8 rounded-full ${bgClass} text-white flex items-center justify-center font-bold text-xs shadow-xl border-2 ${borderClass}" style="transition: none;">
            ${stage}
          </div>
          <span class="absolute -bottom-5 whitespace-nowrap font-mono text-[9px] px-1.5 py-0.5 rounded border shadow-sm ${tagClass}">
            ${tagLabel}
          </span>
          <div class="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black/95 text-[10px] text-white font-mono px-2 py-0.5 rounded pointer-events-none whitespace-nowrap border border-line shadow-lg">
            ${teamCount > 0 ? `${teamCount} team(s) here · Drag to Move` : 'Drag to Move'}
          </div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  }, [teamsByNodeId, showTeams]);

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

  // Trigger marker style refresh when teams, selection, or moved nodes change
  useEffect(() => {
    refreshMarkerStyles();
  }, [refreshMarkerStyles, showTeams, teamsByNodeId]);

  // Synchronize input fields when selected checkpoint changes
  useEffect(() => {
    if (activeSelectedId != null) {
      const cp = checkpoints.find((c) => c.id === activeSelectedId);
      if (cp) {
        const coord = coordsRef.current.get(cp.id) || resolveCoord(cp);
        const lStr = coord.lat.toFixed(6);
        const gStr = coord.lng.toFixed(6);
        setLatInput(lStr);
        setLngInput(gStr);
        if (latInputRef.current) latInputRef.current.value = lStr;
        if (lngInputRef.current) lngInputRef.current.value = gStr;
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

      handleSelectCheckpoint(id);

      const latStr = cleanLat.toFixed(6);
      const lngStr = cleanLng.toFixed(6);
      setLatInput(latStr);
      setLngInput(lngStr);
      if (latInputRef.current) latInputRef.current.value = latStr;
      if (lngInputRef.current) lngInputRef.current.value = lngStr;

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
        showToast(`📍 Node 0${stage} moved to (${cleanLat}, ${cleanLng}). Press Save below to put in Supabase.`, 'info');
      }
    },
    [autoSave, checkpoints, onUpdateCheckpoint, onRefresh, updatePolylines, showToast, handleSelectCheckpoint]
  );

  // Manual save coordinates button in sidebar
  const handleSaveManualCoordinates = useCallback(async () => {
    if (activeSelectedId == null) return;

    const latStr = latInputRef.current?.value || latInput;
    const lngStr = lngInputRef.current?.value || lngInput;
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

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

  // Save all moved nodes in batch
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
    if (successCount === ids.length) {
      showToast(`✓ All ${successCount} moved checkpoints saved to database!`, 'success');
      setMovedNodes({});
      onRefresh();
    } else {
      showToast(`Saved ${successCount} of ${ids.length} checkpoints. Please retry unsaved nodes.`, 'error');
      onRefresh();
    }
  }, [movedNodes, onUpdateCheckpoint, onRefresh, showToast]);

  // Reset to SRM preset coordinates
  const handleResetToPreset = useCallback(async () => {
    if (activeSelectedId == null) return;
    const def = CAMPUS_DEFAULT_COORDINATES[activeSelectedId];
    if (!def) return;

    const marker = markersMapRef.current.get(activeSelectedId);
    if (marker) {
      marker.setLatLng([def.lat, def.lng]);
    }
    coordsRef.current.set(activeSelectedId, { lat: def.lat, lng: def.lng });
    updatePolylines();

    const stage = activeSelectedId <= 12 ? activeSelectedId : activeSelectedId - 12;
    setLatInput(def.lat.toFixed(6));
    setLngInput(def.lng.toFixed(6));

    if (autoSave) {
      setSaving(true);
      try {
        const ok = await onUpdateCheckpoint({
          id: activeSelectedId,
          latitude: def.lat,
          longitude: def.lng,
        });
        if (ok) {
          showToast(`✓ Reset Node 0${stage} to ${def.name} preset coordinates!`, 'success');
          setMovedNodes((prev) => {
            const next = { ...prev };
            delete next[activeSelectedId];
            return next;
          });
          onRefresh();
        }
      } finally {
        setSaving(false);
      }
    } else {
      setMovedNodes((prev) => ({
        ...prev,
        [activeSelectedId]: {
          lat: def.lat,
          lng: def.lng,
          origLat: def.lat,
          origLng: def.lng,
        },
      }));
      showToast(`Reset Node 0${stage} to ${def.name} preset. Click 'Save' to persist.`, 'info');
    }
  }, [activeSelectedId, autoSave, onUpdateCheckpoint, onRefresh, updatePolylines, showToast]);

  // Acquire admin device GPS
  const handleGetAdminLocation = useCallback(() => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
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
          showToast(`Admin GPS acquired: ${lat}, ${lng}`, 'info');
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
          if (isDraggingRef.current || justDraggedRef.current) return;
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

  // 2. Synchronize Checkpoint Markers with Checkpoints data and Route Filter
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
        marker = L.marker([coord.lat, coord.lng], {
          icon,
          draggable: true,
          autoPan: false,
        }).addTo(map);

        marker.on('click', () => {
          handleSelectCheckpoint(cp.id);
        });

        marker.on('dragstart', () => {
          isDraggingRef.current = true;
          justDraggedRef.current = true;
          if (dragHudRef.current) {
            dragHudRef.current.style.display = 'flex';
          }
        });

        marker.on('drag', (e: { target: { getLatLng: () => { lat: number; lng: number } } }) => {
          const pos = e.target.getLatLng();
          const cleanLat = Number(pos.lat.toFixed(6));
          const cleanLng = Number(pos.lng.toFixed(6));

          coordsRef.current.set(cp.id, { lat: cleanLat, lng: cleanLng });
          updatePolylines();

          if (dragHudRef.current) {
            const stage = cp.stage || (cp.id <= 12 ? cp.id : cp.id - 12);
            dragHudRef.current.innerHTML = `
              <span class="inline-block w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping"></span>
              <span class="font-bold">Dragging Node 0${stage}:</span>
              <span>(${cleanLat.toFixed(6)}, ${cleanLng.toFixed(6)})</span>
            `;
          }
        });

        marker.on('dragend', (e: { target: { getLatLng: () => { lat: number; lng: number } } }) => {
          isDraggingRef.current = false;
          if (dragHudRef.current) {
            dragHudRef.current.style.display = 'none';
          }

          const pos = e.target.getLatLng();
          handleNodeDropped(cp.id, pos.lat, pos.lng);

          setTimeout(() => {
            justDraggedRef.current = false;
          }, 350);
        });

        markersMapRef.current.set(cp.id, marker);
      } else {
        marker.setIcon(icon);
      }
    });

    updatePolylines();
  }, [filteredCheckpoints, activeSelectedId, movedNodes, resolveCoord, buildIcon, handleSelectCheckpoint, handleNodeDropped, updatePolylines]);

  // 3. Render Team Markers and Selected Team Trail onto Map
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    const map = mapInstanceRef.current;
    if (!map || !L) return;

    // Clear previous team markers
    teamMarkersRef.current.forEach((m) => m.remove());
    teamMarkersRef.current = [];

    // Clear previous team trail lines
    if (teamTrailLineRef.current) {
      teamTrailLineRef.current.remove();
      teamTrailLineRef.current = null;
    }
    if (teamUpcomingLineRef.current) {
      teamUpcomingLineRef.current.remove();
      teamUpcomingLineRef.current = null;
    }
    if (teamBeaconCircleRef.current) {
      teamBeaconCircleRef.current.remove();
      teamBeaconCircleRef.current = null;
    }

    if (!showTeams || !teams || teams.length === 0) return;

    // Filter teams based on status, routeFilter and search query
    const validTeams = teams.filter((t) => {
      if (t.status === 'rejected') return false;
      const tRoute = t.assigned_route || 1;
      if (routeFilter !== 'all' && tRoute !== routeFilter) return false;
      if (teamSearchQuery.trim()) {
        const q = teamSearchQuery.toLowerCase();
        return t.team_name.toLowerCase().includes(q) || t.team_lead.toLowerCase().includes(q);
      }
      return true;
    });

    // Group valid teams by target checkpoint ID
    const grouped = new Map<number, AdminMapTeam[]>();
    validTeams.forEach((t) => {
      const nid = getNodeForTeam(t);
      const list = grouped.get(nid) || [];
      list.push(t);
      grouped.set(nid, list);
    });

    // Draw trail for selected team if any
    const focusedTeam = activeSelectedTeamId ? teams.find((t) => t.id === activeSelectedTeamId) : null;
    if (focusedTeam) {
      const fRoute = focusedTeam.assigned_route || 1;
      const fStage = Math.min(Math.max(focusedTeam.current_stage || 1, 1), 12);

      const completedCoords: [number, number][] = [];
      for (let s = 1; s <= fStage; s++) {
        const cid = fRoute === 1 ? s : s + 12;
        const cpos = coordsRef.current.get(cid);
        if (cpos) completedCoords.push([cpos.lat, cpos.lng]);
      }

      const upcomingCoords: [number, number][] = [];
      for (let s = fStage; s <= 12; s++) {
        const cid = fRoute === 1 ? s : s + 12;
        const cpos = coordsRef.current.get(cid);
        if (cpos) upcomingCoords.push([cpos.lat, cpos.lng]);
      }

      if (completedCoords.length >= 2) {
        teamTrailLineRef.current = L.polyline(completedCoords, {
          color: '#10b981',
          weight: 4.5,
          opacity: 0.9,
          lineCap: 'round',
        }).addTo(map);
      }

      if (upcomingCoords.length >= 2) {
        teamUpcomingLineRef.current = L.polyline(upcomingCoords, {
          color: '#f59e0b',
          weight: 3,
          opacity: 0.8,
          dashArray: '6, 6',
          lineCap: 'round',
        }).addTo(map);
      }

      const currentCid = fRoute === 1 ? fStage : fStage + 12;
      const currentPos = coordsRef.current.get(currentCid);
      if (currentPos) {
        teamBeaconCircleRef.current = L.circle([currentPos.lat, currentPos.lng], {
          radius: 22,
          color: '#f59e0b',
          fillColor: '#f59e0b',
          fillOpacity: 0.25,
          weight: 2,
        }).addTo(map);
      }
    }

    // Render team markers on the map
    grouped.forEach((nodeTeams, nodeId) => {
      const basePos = coordsRef.current.get(nodeId);
      if (!basePos) return;

      nodeTeams.forEach((team, idx) => {
        const isTeamSelected = team.id === activeSelectedTeamId;
        const total = nodeTeams.length;
        // Radial offset around the checkpoint node so multiple team pins don't overlap
        const radius = total > 1 ? 0.00022 : 0.00015;
        const angle = total > 1 ? (idx / total) * 2 * Math.PI - Math.PI / 2 : -Math.PI / 3;
        const tLat = basePos.lat + Math.sin(angle) * radius;
        const tLng = basePos.lng + Math.cos(angle) * (radius * 1.25);

        const routeColor = (team.assigned_route || 1) === 1 ? 'bg-cyan-600' : 'bg-purple-600';
        const isCleared = team.current_stage > 12;
        const stageLabel = isCleared ? 'Finished' : `0${team.current_stage}`;

        const teamHtml = `
          <div class="team-pin-wrapper select-none cursor-pointer flex items-center gap-1.5 rounded-full px-2 py-0.5 shadow-xl transition-all hover:scale-110 ${
            isTeamSelected
              ? 'bg-amber-500 text-black font-extrabold ring-4 ring-amber-400 scale-110 z-40'
              : 'bg-black/90 text-white border border-line-strong hover:border-amber-400 z-20'
          }" style="pointer-events: auto;">
            <span class="w-2.5 h-2.5 rounded-full ${routeColor} border border-white shrink-0"></span>
            <span class="text-[11px] font-bold truncate max-w-[85px]">${team.team_name}</span>
            <span class="text-[9px] font-mono opacity-80 ${isCleared ? 'text-emerald-400 font-bold' : ''}">[${stageLabel}]</span>
          </div>
        `;

        const teamIcon = L.divIcon({
          className: `team-map-pin team-id-${team.id}`,
          html: teamHtml,
          iconSize: [110, 26],
          iconAnchor: [55, 13],
        });

        const tMarker = L.marker([tLat, tLng], { icon: teamIcon, zIndexOffset: isTeamSelected ? 1000 : 500 }).addTo(map);

        tMarker.on('click', () => {
          handleSelectTeam(team.id);
          handleSelectCheckpoint(nodeId);
        });

        teamMarkersRef.current.push(tMarker);
      });
    });
  }, [
    showTeams,
    teams,
    activeSelectedTeamId,
    routeFilter,
    teamSearchQuery,
    getNodeForTeam,
    handleSelectTeam,
    handleSelectCheckpoint,
  ]);

  // Format elapsed time helper
  const formatTeamElapsed = (startTime: string | null, completedAt: string | null) => {
    if (!startTime) return 'Not started';
    const start = new Date(startTime).getTime();
    const end = completedAt ? new Date(completedAt).getTime() : Date.now();
    if (isNaN(start) || isNaN(end)) return '--:--:--';
    const diff = Math.max(0, Math.floor((end - start) / 1000));
    const h = Math.floor(diff / 3600).toString().padStart(2, '0');
    const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    const s = (diff % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const movedCount = Object.keys(movedNodes).length;

  return (
    <div className="space-y-4">
      {/* Toast Banner */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg shadow-xl text-xs font-mono font-bold flex items-center gap-2 border transition-all animate-in fade-in slide-in-from-top-2 ${
            toast.type === 'success'
              ? 'bg-emerald-950 text-emerald-300 border-emerald-500'
              : toast.type === 'error'
                ? 'bg-rose-950 text-rose-300 border-rose-500'
                : 'bg-zinc-900 text-cyan-300 border-cyan-500'
          }`}
        >
          {toast.type === 'success' && <Check className="w-4 h-4 text-emerald-400" />}
          {toast.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-400" />}
          {toast.type === 'info' && <Info className="w-4 h-4 text-cyan-400" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Map Toolbar: Teams Tracking & Auto-Save & Fit Route */}
      <div className="bg-surface border border-line p-3 sm:p-4 rounded-lg flex flex-wrap items-center justify-between gap-3 shadow-sm">
        {/* Left: Team Tracking Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={() => setShowTeams(!showTeams)}
            className={`px-3 py-1.5 text-xs font-bold uppercase rounded border transition-colors cursor-pointer flex items-center gap-1.5 ${
              showTeams
                ? 'bg-amber-500 text-black border-amber-400 font-extrabold shadow-sm'
                : 'bg-sunken text-muted border-line hover:text-ink'
            }`}
            title="Toggle team tracking pins on map"
          >
            {showTeams ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>Teams on Map ({totalTrackedTeamsCount})</span>
          </button>

          {showTeams && (
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 pointer-events-none" />
              <input
                type="text"
                value={teamSearchQuery}
                onChange={(e) => setTeamSearchQuery(e.target.value)}
                placeholder="Search team or lead..."
                className="pl-8 pr-7 py-1 text-xs bg-sunken border border-line rounded w-36 sm:w-48 outline-none text-ink placeholder:text-muted focus:border-amber-400"
              />
              {teamSearchQuery && (
                <button
                  onClick={() => setTeamSearchQuery('')}
                  className="absolute right-2 text-muted hover:text-ink cursor-pointer p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {activeSelectedTeamId && (
            <button
              onClick={() => handleSelectTeam(null)}
              className="px-2 py-1 text-xs text-amber-400 hover:text-white border border-amber-500/40 hover:bg-amber-500/20 rounded flex items-center gap-1 cursor-pointer font-bold uppercase transition-colors"
            >
              <X className="w-3 h-3" />
              <span>Clear Trail</span>
            </button>
          )}
        </div>

        {/* Right: GPS, Auto-Save & Fit Route */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Auto-Save Toggle */}
          <button
            onClick={() => {
              const next = !autoSave;
              setAutoSave(next);
              showToast(`Auto-save on drop is now ${next ? 'ENABLED' : 'DISABLED'}`, 'info');
            }}
            className={`px-3 py-1.5 text-xs font-bold uppercase rounded border transition-colors cursor-pointer flex items-center gap-1.5 ${
              autoSave
                ? 'bg-emerald-950 text-emerald-300 border-emerald-500 font-extrabold shadow-sm'
                : 'bg-sunken text-muted border-line hover:text-ink'
            }`}
            title="Automatically update database when pin is dropped"
          >
            <Zap className={`w-3.5 h-3.5 ${autoSave ? 'text-emerald-400 fill-emerald-400' : ''}`} />
            <span>Auto-Save: {autoSave ? 'ON' : 'OFF'}</span>
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
        </div>
      </div>

      {/* Team Distribution Summary Strip (Quick-jump to nodes with active teams) */}
      {showTeams && activeNodesWithTeams.length > 0 && (
        <div className="bg-sunken border border-line p-2.5 rounded-lg flex items-center gap-2 overflow-x-auto text-xs">
          <span className="text-[11px] font-bold uppercase text-muted tracking-wider flex items-center gap-1 shrink-0">
            <Users className="w-3.5 h-3.5 text-amber-500" />
            Active Team Nodes:
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {activeNodesWithTeams.map((item) => (
              <button
                key={item.nodeId}
                onClick={() => {
                  handleSelectCheckpoint(item.nodeId);
                  const pos = coordsRef.current.get(item.nodeId);
                  if (pos && mapInstanceRef.current) {
                    mapInstanceRef.current.setView([pos.lat, pos.lng], 18, { animate: true });
                  }
                }}
                className={`px-2 py-0.5 rounded border text-xs font-mono font-bold cursor-pointer transition-colors flex items-center gap-1 ${
                  activeSelectedId === item.nodeId
                    ? 'bg-amber-500 text-black border-amber-400 font-extrabold'
                    : 'bg-surface text-ink border-line hover:border-amber-400'
                }`}
                title={`Jump to Node 0${item.stage} (${item.count} team(s): ${item.teams.map(t => t.team_name).join(', ')})`}
              >
                <span>N0{item.stage}</span>
                <span className="bg-amber-500/20 text-amber-400 px-1 rounded text-[10px]">{item.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Map + Inspection Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* OpenStreetMap Canvas */}
        <div className="lg:col-span-2 relative h-[500px] sm:h-[620px] rounded-lg border border-line overflow-hidden shadow-inner bg-zinc-900">
          <div ref={mapContainerRef} className="w-full h-full z-0" />

          {/* Live Dragging HUD Banner (Direct DOM ref for zero-latency 60fps tracking) */}
          <div
            ref={dragHudRef}
            style={{ display: 'none' }}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-black/90 border-2 border-accent px-4 py-2 rounded-full text-xs font-mono text-white shadow-2xl backdrop-blur-md items-center gap-2.5 pointer-events-none"
          />

          {/* Unsaved Changes Floating Bar */}
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

          {/* Floating Selected Team Tracking HUD */}
          {focusedTeam && (
            <div className="absolute top-3 left-3 z-20 w-72 sm:w-80 bg-surface/98 border-2 border-amber-500 p-3.5 rounded-xl shadow-2xl backdrop-blur-md animate-in fade-in">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] uppercase font-extrabold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-500 border border-amber-500/40">
                      Tracking Team
                    </span>
                    <span className={`text-[10px] uppercase font-bold px-1.5 py-0.2 rounded border ${
                      (focusedTeam.assigned_route || 1) === 1
                        ? 'bg-route-1/20 border-route-1/40 text-route-1'
                        : 'bg-route-2/20 border-route-2/40 text-route-2'
                    }`}>
                      Route 0{focusedTeam.assigned_route || 1}
                    </span>
                  </div>
                  <h4 className="font-extrabold text-sm sm:text-base text-ink truncate">{focusedTeam.team_name}</h4>
                  <div className="text-xs text-muted truncate">Lead: <span className="text-ink font-semibold">{focusedTeam.team_lead}</span></div>
                </div>
                <button
                  onClick={() => handleSelectTeam(null)}
                  className="p-1 text-muted hover:text-ink cursor-pointer"
                  title="Close team tracking card"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 my-2.5 text-xs bg-sunken p-2 rounded border border-line">
                <div>
                  <span className="text-[10px] text-muted uppercase font-bold block">Current Node</span>
                  <span className="font-bold text-primary">
                    {focusedTeam.current_stage > 12 ? (
                      <span className="text-success flex items-center gap-1">
                        <Trophy className="w-3 h-3" /> Cleared
                      </span>
                    ) : (
                      `Node 0${focusedTeam.current_stage} / 12`
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted uppercase font-bold block">Time Elapsed</span>
                  <span className="font-mono font-bold text-ink">
                    {formatTeamElapsed(focusedTeam.start_time, focusedTeam.completed_at)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 pt-1">
                <button
                  onClick={() => {
                    const nid = getNodeForTeam(focusedTeam);
                    const pos = coordsRef.current.get(nid);
                    if (pos && mapInstanceRef.current) {
                      mapInstanceRef.current.setView([pos.lat, pos.lng], 18, { animate: true });
                    }
                  }}
                  className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-extrabold uppercase rounded cursor-pointer transition-colors flex items-center justify-center gap-1 shadow"
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>Focus Node</span>
                </button>
                {onInspectTeamSquad && (
                  <button
                    onClick={() => onInspectTeamSquad(focusedTeam)}
                    className="flex-1 py-1.5 bg-surface hover:bg-surface-2 text-ink border border-line text-xs font-bold uppercase rounded cursor-pointer transition-colors flex items-center justify-center gap-1"
                  >
                    <Users className="w-3.5 h-3.5 text-accent" />
                    <span>Squad</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Quick Help Tip */}
          <div className="absolute bottom-3 left-3 z-10 bg-black/85 border border-line/60 px-3 py-1.5 rounded text-[11px] text-stone-300 backdrop-blur-xs flex items-center gap-2 shadow">
            <Info className="w-3.5 h-3.5 text-accent shrink-0" />
            <span>Click team pins or nodes to inspect progress & track teams on campus</span>
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
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
              <span>Team Pin</span>
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

              {/* Teams Currently at this Checkpoint Section */}
              <div className="pt-2 border-t border-line">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase font-bold text-amber-500 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    Teams at this Node ({selectedCpTeams.length})
                  </span>
                </div>

                {selectedCpTeams.length === 0 ? (
                  <div className="p-2.5 bg-sunken border border-line rounded text-xs text-muted text-center">
                    No active teams currently hunting at this node
                  </div>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {selectedCpTeams.map((team) => {
                      const isTracking = team.id === activeSelectedTeamId;
                      return (
                        <div
                          key={team.id}
                          className={`p-2.5 rounded border transition-all text-xs ${
                            isTracking
                              ? 'bg-amber-500/10 border-amber-400 shadow-sm'
                              : 'bg-sunken border-line hover:border-amber-400/50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="font-bold text-ink truncate">{team.team_name}</span>
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase border ${
                              (team.assigned_route || 1) === 1
                                ? 'bg-route-1/10 border-route-1/40 text-route-1'
                                : 'bg-route-2/10 border-route-2/40 text-route-2'
                            }`}>
                              R0{team.assigned_route || 1}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-muted mb-2 font-mono">
                            <span>Lead: {team.team_lead}</span>
                            <span>{formatTeamElapsed(team.start_time, team.completed_at)}</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleSelectTeam(isTracking ? null : team.id)}
                              className={`flex-1 py-1 text-[11px] font-bold uppercase rounded cursor-pointer transition-colors flex items-center justify-center gap-1 ${
                                isTracking
                                  ? 'bg-amber-500 text-black font-extrabold'
                                  : 'bg-surface border border-line hover:border-amber-400 text-ink'
                              }`}
                            >
                              <Crosshair className="w-3 h-3" />
                              <span>{isTracking ? 'Active Trail' : 'Track Trail'}</span>
                            </button>
                            {onInspectTeamSquad && (
                              <button
                                onClick={() => onInspectTeamSquad(team)}
                                className="px-2 py-1 bg-surface border border-line hover:border-accent text-accent text-[11px] font-bold uppercase rounded cursor-pointer transition-colors"
                                title="Inspect Team Squad"
                              >
                                <Users className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Coordinate Form */}
              <div className="space-y-3 text-xs pt-2 border-t border-line">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-bold text-ink uppercase text-[11px]">
                      Latitude (DD.dddddd)
                    </label>
                    <span className="text-[10px] text-muted font-mono">Updates as you drag</span>
                  </div>
                  <input
                    ref={latInputRef}
                    type="number"
                    step="0.000001"
                    value={latInput}
                    onChange={(e) => {
                      setLatInput(e.target.value);
                      const num = parseFloat(e.target.value);
                      if (!isNaN(num) && selectedCp) {
                        const marker = markersMapRef.current.get(selectedCp.id);
                        if (marker) {
                          const curLng = parseFloat(lngInputRef.current?.value || lngInput) || CAMPUS_CENTER.lng;
                          marker.setLatLng([num, curLng]);
                          coordsRef.current.set(selectedCp.id, { lat: num, lng: curLng });
                          updatePolylines();
                        }
                      }
                    }}
                    className="w-full bg-sunken border border-line px-3 py-2 text-ink font-mono font-bold outline-none focus:border-accent rounded text-xs"
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
                    ref={lngInputRef}
                    type="number"
                    step="0.000001"
                    value={lngInput}
                    onChange={(e) => {
                      setLngInput(e.target.value);
                      const num = parseFloat(e.target.value);
                      if (!isNaN(num) && selectedCp) {
                        const marker = markersMapRef.current.get(selectedCp.id);
                        if (marker) {
                          const curLat = parseFloat(latInputRef.current?.value || latInput) || CAMPUS_CENTER.lat;
                          marker.setLatLng([curLat, num]);
                          coordsRef.current.set(selectedCp.id, { lat: curLat, lng: num });
                          updatePolylines();
                        }
                      }
                    }}
                    className="w-full bg-sunken border border-line px-3 py-2 text-ink font-mono font-bold outline-none focus:border-accent rounded text-xs"
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
                      ? 'bg-amber-500 hover:bg-amber-400 text-black font-extrabold ring-2 ring-amber-400 shadow-lg'
                      : 'bg-danger hover:opacity-90'
                    }`}
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {saving
                      ? 'Persisting to Database...'
                      : movedNodes[selectedCp.id]
                        ? `Save Node 0${selectedCp.stage || (selectedCp.id <= 12 ? selectedCp.id : selectedCp.id - 12)} to Supabase`
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
                Click any numbered checkpoint marker or team pin on the map to inspect teams, drag, or edit coordinates.
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
                const tCount = (teamsByNodeId.get(cp.id) || []).length;

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
                    className={`px-2 py-1 text-xs font-mono font-bold rounded border transition-colors cursor-pointer flex items-center gap-1 ${isSelected
                        ? 'bg-accent text-on-primary border-accent ring-2 ring-accent/60'
                        : isMoved
                          ? 'bg-amber-950/80 text-amber-300 border-amber-400 ring-1 ring-amber-400 animate-pulse'
                          : hasCoords
                            ? 'bg-sunken text-emerald-400 border-line hover:border-accent'
                            : 'bg-sunken text-muted border-dashed border-line hover:border-amber-400'
                      }`}
                  >
                    <span>0{stage}</span>
                    {tCount > 0 && <span className="bg-amber-500 text-black px-1 rounded-full text-[9px] font-extrabold">{tCount}</span>}
                    {isMoved ? '●' : hasCoords ? '✓' : ''}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
