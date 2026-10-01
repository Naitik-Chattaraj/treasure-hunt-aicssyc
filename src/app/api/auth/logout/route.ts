import { NextRequest, NextResponse } from 'next/server';
import { verifyTeamToken } from '@/lib/auth';
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
            try {
              const parsed = JSON.parse(team.device_id);
              const roleKey = payload.operativeRole === 'Field Scout' ? 'scout' : 'decoder';
              if (parsed[roleKey] === payload.deviceId) {
                delete parsed[roleKey];
                await db
                  .from('teams')
                  .update({ device_id: JSON.stringify(parsed) })
                  .eq('id', team.id);
              }
            } catch {}
          }
        }
      }
    }
  } catch {}

  const response = NextResponse.json({ success: true });
  response.cookies.delete('team_session');
  return response;
}

