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

// In-memory cache for map nodes per route and stage
const cache = new Map<string, { nodes: MapNodeItem[]; cachedAt: number }>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function invalidateMapNodesCache(route?: 1 | 2) {
  if (route) {
    for (const key of cache.keys()) {
      if (key.startsWith(`${route}:`)) cache.delete(key);
    }
  } else {
    cache.clear();
  }
}

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

    // Determine route and current stage for the requesting team:
    let teamCurrentStage: number = 1;
    let liveRoute: 1 | 2 | null = null;
    try {
      const primaryDb = getSupabaseAdmin(payload.assignedRoute === 2 ? 2 : 1);
      if (primaryDb) {
        const { data: teamPrimary } = await primaryDb
          .from('teams')
          .select('assigned_route, current_stage')
          .eq('id', payload.teamId)
          .maybeSingle();
        if (teamPrimary) {
          if (teamPrimary.assigned_route) liveRoute = teamPrimary.assigned_route === 2 ? 2 : 1;
          if (teamPrimary.current_stage) teamCurrentStage = teamPrimary.current_stage;
        }
      }

      if (!liveRoute && isRoute2Configured()) {
        const altDb = getSupabaseAdmin(payload.assignedRoute === 2 ? 1 : 2);
        if (altDb) {
          const { data: teamAlt } = await altDb
            .from('teams')
            .select('assigned_route, current_stage')
            .eq('id', payload.teamId)
            .maybeSingle();
          if (teamAlt) {
            if (teamAlt.assigned_route) liveRoute = teamAlt.assigned_route === 2 ? 2 : 1;
            if (teamAlt.current_stage) teamCurrentStage = teamAlt.current_stage;
          }
        }
      }
    } catch (err) {
      console.warn('Could not query live team assigned_route/stage for map-nodes:', err);
    }

    const reqRoute = req.nextUrl.searchParams.get('route');
    let assignedRoute: 1 | 2;
    if (reqRoute === '1' || reqRoute === '2') {
      assignedRoute = reqRoute === '2' ? 2 : 1;
    } else {
      assignedRoute = liveRoute || (payload.assignedRoute === 2 ? 2 : 1);
    }

    // Helper: Only return current node and next two nodes
    const filterVisibleNodes = (allNodes: MapNodeItem[]) => {
      const current = teamCurrentStage;
      if (current > 12) {
        return allNodes.filter((n) => n.stage === 12);
      }
      const allowedStages = [current, current + 1, current + 2].filter((s) => s <= 12);
      return allNodes.filter((n) => allowedStages.includes(n.stage));
    };

    // Check memory cache first
    const cacheKey = `${assignedRoute}:${teamCurrentStage}`;
    const hasCacheBuster = req.nextUrl.searchParams.has('_t');
    const cached = cache.get(cacheKey);
    if (!hasCacheBuster && cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return NextResponse.json(
        { nodes: cached.nodes, assignedRoute, currentStage: teamCurrentStage },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
        }
      );
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

      const visible = filterVisibleNodes(fallbackNodes);
      return NextResponse.json(
        { nodes: visible, assignedRoute, currentStage: teamCurrentStage },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
        }
      );
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
      const visible = filterVisibleNodes(resolved);
      cache.set(cacheKey, { nodes: visible, cachedAt: Date.now() });
      return NextResponse.json(
        { nodes: visible, assignedRoute, currentStage: teamCurrentStage },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
        }
      );
    }

    const resolved = resolveWithDefaults(dbCheckpoints, assignedRoute);
    const visible = filterVisibleNodes(resolved);
    cache.set(cacheKey, { nodes: visible, cachedAt: Date.now() });
    return NextResponse.json(
      { nodes: visible, assignedRoute, currentStage: teamCurrentStage },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
  } catch (err) {
    console.error('API /hunt/map-nodes error:', err);
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

    return NextResponse.json(
      { nodes: fallbackNodes.slice(0, 3), assignedRoute: fallbackRoute, currentStage: 1 },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
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
