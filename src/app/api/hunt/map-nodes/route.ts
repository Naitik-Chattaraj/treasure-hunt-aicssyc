import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, isRoute2Configured } from '@/lib/supabase';
import { verifyTeamToken } from '@/lib/auth';
import { CAMPUS_DEFAULT_COORDINATES } from '@/lib/coordinates';

interface MapNodeItem {
  id: number;
  route_id: 1 | 2;
  stage: number;
  title: string;
  area: string;
  latitude: number;
  longitude: number;
}

// In-memory cache for map nodes per route to prevent unnecessary DB egress
const cache = new Map<1 | 2, { nodes: MapNodeItem[]; cachedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('team_session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await verifyTeamToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const assignedRoute: 1 | 2 = payload.assignedRoute === 2 ? 2 : 1;

    // Check memory cache first
    const cached = cache.get(assignedRoute);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return NextResponse.json({ nodes: cached.nodes, assignedRoute });
    }

    let supabase = getSupabaseAdmin(assignedRoute);
    if (!supabase && isRoute2Configured()) {
      supabase = getSupabaseAdmin(1);
    }

    if (!supabase) {
      // Fallback to default campus coordinates if DB is unreachable
      const fallbackNodes = Object.values(CAMPUS_DEFAULT_COORDINATES)
        .filter((node) => node.routeId === assignedRoute)
        .sort((a, b) => a.stage - b.stage)
        .map((node) => ({
          id: node.id,
          route_id: node.routeId,
          stage: node.stage,
          title: node.name,
          area: node.area,
          latitude: node.lat,
          longitude: node.lng,
        }));

      return NextResponse.json({ nodes: fallbackNodes, assignedRoute });
    }

    const { data: dbCheckpoints, error } = await supabase
      .from('checkpoints')
      .select('id, route_id, stage, title, area, latitude, longitude')
      .eq('route_id', assignedRoute)
      .order('stage', { ascending: true });

    if (error || !dbCheckpoints || dbCheckpoints.length === 0) {
      // Secondary check by stage (nodes 1..12 or 13..24)
      const minId = assignedRoute === 1 ? 1 : 13;
      const maxId = assignedRoute === 1 ? 12 : 24;
      const { data: fallbackRange } = await supabase
        .from('checkpoints')
        .select('id, route_id, stage, title, area, latitude, longitude')
        .gte('id', minId)
        .lte('id', maxId)
        .order('stage', { ascending: true });

      const rawList = fallbackRange || [];
      const resolved = resolveWithDefaults(rawList, assignedRoute);
      cache.set(assignedRoute, { nodes: resolved, cachedAt: Date.now() });
      return NextResponse.json({ nodes: resolved, assignedRoute });
    }

    const resolved = resolveWithDefaults(dbCheckpoints, assignedRoute);
    cache.set(assignedRoute, { nodes: resolved, cachedAt: Date.now() });
    return NextResponse.json({ nodes: resolved, assignedRoute });
  } catch (err) {
    console.error('API /hunt/map-nodes error:', err);
    // Graceful fallback to default campus coordinates
    const fallbackRoute = 1;
    const fallbackNodes = Object.values(CAMPUS_DEFAULT_COORDINATES)
      .filter((node) => node.routeId === fallbackRoute)
      .sort((a, b) => a.stage - b.stage)
      .map((node) => ({
        id: node.id,
        route_id: node.routeId,
        stage: node.stage,
        title: node.name,
        area: node.area,
        latitude: node.lat,
        longitude: node.lng,
      }));

    return NextResponse.json({ nodes: fallbackNodes, assignedRoute: fallbackRoute });
  }
}

function resolveWithDefaults(
  rawList: Array<{
    id: number;
    route_id?: number;
    stage?: number;
    title: string;
    area: string;
    latitude?: number | null;
    longitude?: number | null;
  }>,
  route: 1 | 2
): MapNodeItem[] {
  // If DB returned records, merge them with defaults for any missing coordinates
  const byStage = new Map<number, (typeof rawList)[0]>();
  for (const item of rawList) {
    const stage = item.stage || (item.id <= 12 ? item.id : item.id - 12);
    byStage.set(stage, item);
  }

  const result: MapNodeItem[] = [];
  for (let stage = 1; stage <= 12; stage++) {
    const expectedId = route === 1 ? stage : stage + 12;
    const defaultMeta = CAMPUS_DEFAULT_COORDINATES[expectedId];
    const dbItem = byStage.get(stage);

    const lat =
      dbItem?.latitude != null && !isNaN(Number(dbItem.latitude))
        ? Number(dbItem.latitude)
        : defaultMeta?.lat ?? 12.82361;

    const lng =
      dbItem?.longitude != null && !isNaN(Number(dbItem.longitude))
        ? Number(dbItem.longitude)
        : defaultMeta?.lng ?? 80.0442;

    result.push({
      id: dbItem?.id ?? expectedId,
      route_id: route,
      stage,
      title: dbItem?.title || defaultMeta?.name || `Checkpoint 0${stage}`,
      area: dbItem?.area || defaultMeta?.area || 'Campus Sector',
      latitude: lat,
      longitude: lng,
    });
  }

  return result;
}
