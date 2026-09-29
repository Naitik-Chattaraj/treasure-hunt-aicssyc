import { NextRequest, NextResponse } from 'next/server';
import { getBothSupabaseAdmins, isRoute2Configured } from '@/lib/supabase';
import { signTeamToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { uid, teamName, teamLead, members, isLoginMode, operativeName, operativeRole } = await req.json();
    const { db1, db2, isMultiDb } = getBothSupabaseAdmins();

    if (!db1) {
      return NextResponse.json(
        { error: 'Primary database credentials not configured in environment' },
        { status: 500 }
      );
    }

    let team: any = null;
    let activeDb = db1;
    let resolvedRoute: 1 | 2 = 1;

    if (isLoginMode) {
      const trimmedUid = uid?.trim();
      const trimmedTeam = teamName?.trim();
      if (!trimmedUid || !trimmedTeam) {
        return NextResponse.json({ error: 'Missing team name or 6-digit access code' }, { status: 400 });
      }

      // Check Route 1 database first
      const { data: teamR1, error: errorR1 } = await db1
        .from('teams')
        .select('*')
        .eq('uid', trimmedUid)
        .maybeSingle();

      if (errorR1) {
        return NextResponse.json({ error: errorR1.message }, { status: 500 });
      }

      if (teamR1) {
        team = teamR1;
        activeDb = db1;
        resolvedRoute = (teamR1.assigned_route === 2 ? 2 : 1);
      } else if (isMultiDb && db2) {
        // Check Route 2 database if not found in Route 1
        const { data: teamR2, error: errorR2 } = await db2
          .from('teams')
          .select('*')
          .eq('uid', trimmedUid)
          .maybeSingle();

        if (errorR2) {
          return NextResponse.json({ error: errorR2.message }, { status: 500 });
        }

        if (teamR2) {
          team = teamR2;
          activeDb = db2;
          resolvedRoute = 2;
        }
      }

      if (!team) {
        return NextResponse.json({ error: 'INVALID CODE. TEAM NOT FOUND.' }, { status: 404 });
      }

      if (team.team_name.trim().toLowerCase() !== trimmedTeam.toLowerCase()) {
        return NextResponse.json({ error: 'INCORRECT TEAM NAME FOR THIS ACCESS CODE.' }, { status: 401 });
      }

    } else {
      // Registration Mode
      const trimmedTeam = teamName?.trim();
      const trimmedLead = teamLead?.trim();

      if (!trimmedTeam || !trimmedLead) {
        return NextResponse.json({ error: 'Missing required credentials' }, { status: 400 });
      }

      // Check if team name already exists across both databases
      const { data: existingTeamR1 } = await db1
        .from('teams')
        .select('*')
        .eq('team_name', trimmedTeam)
        .maybeSingle();

      let existingTeam = existingTeamR1;
      let existingDb = db1;

      if (!existingTeam && isMultiDb && db2) {
        const { data: existingTeamR2 } = await db2
          .from('teams')
          .select('*')
          .eq('team_name', trimmedTeam)
          .maybeSingle();
        if (existingTeamR2) {
          existingTeam = existingTeamR2;
          existingDb = db2;
        }
      }

      if (existingTeam) {
        // If they are just polling, return the pending status
        if (existingTeam.team_lead === trimmedLead) {
          team = existingTeam;
          activeDb = existingDb;
          resolvedRoute = existingTeam.assigned_route === 2 ? 2 : 1;
        } else {
          return NextResponse.json({ error: 'Team name already registered.' }, { status: 400 });
        }
      } else {
        // Create a unique 6-digit alphanumeric code
        const generateCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();
        const generatedUid = generateCode();
        const defaultMembers = Array.isArray(members) && members.length >= 4 ? members : [];

        // Horizontally load-balance teams across Route 1 and Route 2 databases
        let assignedRoute: 1 | 2 = 1;
        if (isMultiDb && db2) {
          try {
            const [count1Res, count2Res] = await Promise.all([
              db1.from('teams').select('id', { count: 'exact', head: true }),
              db2.from('teams').select('id', { count: 'exact', head: true }),
            ]);
            const count1 = count1Res.count ?? 0;
            const count2 = count2Res.count ?? 0;
            assignedRoute = count1 <= count2 ? 1 : 2;
          } catch {
            assignedRoute = Math.random() < 0.5 ? 1 : 2;
          }
        } else {
          assignedRoute = Math.random() < 0.5 ? 1 : 2;
        }

        const targetDb = (assignedRoute === 2 && isMultiDb && db2) ? db2 : db1;

        const { data: newTeam, error: insertError } = await targetDb
          .from('teams')
          .insert({
            uid: generatedUid,
            team_name: trimmedTeam,
            team_lead: trimmedLead,
            members: defaultMembers,
            status: 'pending',
            current_stage: 1,
            assigned_route: assignedRoute,
          })
          .select()
          .single();

        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        team = newTeam;
        activeDb = targetDb;
        resolvedRoute = assignedRoute;
      }
    }

    // Determine current operative info
    const currentOperativeRole: 'Field Scout' | 'Base Decoder' = operativeRole === 'Field Scout' ? 'Field Scout' : 'Base Decoder';
    const currentOperativeName = operativeName?.trim() || (currentOperativeRole === 'Base Decoder' ? team.team_lead : 'Field Scout Operative');

    // Check status
    if (team.status === 'pending') {
      return NextResponse.json({
        status: 'pending',
        message: 'Your registration is submitted and awaiting administrative approval.',
        team: {
          id: team.id,
          uid: team.uid,
          teamName: team.team_name,
          teamLead: team.team_lead,
          status: 'pending',
          assignedRoute: resolvedRoute,
          operativeRole: currentOperativeRole,
          operativeName: currentOperativeName,
        },
      });
    }

    if (team.status === 'rejected') {
      return NextResponse.json({
        status: 'rejected',
        error: 'ACCESS REVOKED: Team registration has been rejected by mission control.',
      }, { status: 403 });
    }

    // Team is approved - generate deviceId, update DB with dual session map, sign JWT
    const deviceId = crypto.randomUUID();
    let deviceMap: Record<string, string> = {};
    try {
      if (team.device_id && typeof team.device_id === 'string' && team.device_id.startsWith('{')) {
        deviceMap = JSON.parse(team.device_id);
      } else if (team.device_id) {
        deviceMap = { decoder: team.device_id };
      }
    } catch {}

    const roleKey = currentOperativeRole === 'Field Scout' ? 'scout' : 'decoder';
    deviceMap[roleKey] = deviceId;
    const serializedDeviceMap = JSON.stringify(deviceMap);

    const { error: deviceError } = await activeDb
      .from('teams')
      .update({ device_id: serializedDeviceMap })
      .eq('id', team.id);

    if (deviceError) {
      console.error('Failed to update device ID in database:', deviceError);
    }

    const token = await signTeamToken({
      teamId: team.id,
      uid: team.uid,
      teamName: team.team_name,
      assignedRoute: resolvedRoute,
      operativeName: currentOperativeName,
      operativeRole: currentOperativeRole,
      deviceId,
    });

    const response = NextResponse.json({
      status: 'approved',
      team: {
        id: team.id,
        uid: team.uid,
        teamName: team.team_name,
        teamLead: team.team_lead,
        members: team.members,
        status: team.status,
        assignedRoute: resolvedRoute,
        operativeRole: currentOperativeRole,
        operativeName: currentOperativeName,
      },
    });

    response.cookies.set('team_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
