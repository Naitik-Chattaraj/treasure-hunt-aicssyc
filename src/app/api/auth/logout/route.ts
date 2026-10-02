import { NextRequest, NextResponse } from 'next/server';
import { verifyTeamToken, updateDeviceMap } from '@/lib/auth';
import { getSupabaseAdmin, isRoute2Configured } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('team_session')?.value;
    if (token) {
      const payload = await verifyTeamToken(token);
      if (payload?.teamId && payload?.deviceId) {
        const primaryRoute = payload.assignedRoute === 2 ? 2 : 1;
        let db = getSupabaseAdmin(primaryRoute);

        if (db) {
          let { data: team } = await db
            .from('teams')
            .select('id, device_id')
            .eq('id', payload.teamId)
            .maybeSingle();

          if (!team && isRoute2Configured()) {
            const altDb = getSupabaseAdmin(primaryRoute === 1 ? 2 : 1);
            if (altDb) {
              const { data: altTeam } = await altDb
                .from('teams')
                .select('id, device_id')
                .eq('id', payload.teamId)
                .maybeSingle();
              if (altTeam) {
                team = altTeam;
                db = altDb;
              }
            }
          }

          if (team?.device_id && team.device_id.startsWith('{')) {
            const roleKey = payload.operativeRole === 'Field Scout' ? 'scout' : 'decoder';
            let rpcSuccess = false;

            // Try Supabase RPC first
            try {
              const { error: rpcErr } = await db.rpc('remove_operative_session', {
                p_team_id: team.id,
                p_role: payload.operativeRole,
                p_device_id: payload.deviceId,
              });
              if (!rpcErr) rpcSuccess = true;
            } catch {
              rpcSuccess = false;
            }

            // Fallback to updateDeviceMap
            if (!rpcSuccess) {
              await updateDeviceMap(db, team.id, team.device_id, (map) => {
                const existing = map[roleKey];
                if (Array.isArray(existing)) {
                  if (!existing.includes(payload.deviceId)) return false;
                  map[roleKey] = existing.filter((id) => id !== payload.deviceId);
                  return true;
                }
                if (existing === payload.deviceId) {
                  delete map[roleKey];
                  return true;
                }
                return false;
              });
            }
          }
        }
      }
    }
  } catch {}

  const response = NextResponse.json({ success: true });
  response.cookies.delete('team_session');
  return response;
}

