import { NextRequest, NextResponse } from 'next/server';
import { getBothSupabaseAdmins } from '@/lib/supabase';
import { signTeamToken, updateDeviceMap } from '@/lib/auth';
import { namesMatch, normalizeName, validateMembers, validatePersonName } from '@/lib/validation';
import { TeamMember } from '@/types/hunt';

interface TeamDbRow {
  id: string;
  uid?: string;
  team_name: string;
  team_lead: string;
  members: unknown;
  status: string;
  current_stage: number;
  assigned_route?: number;
  device_id?: string | null;
}

// Log the real error on the server; send only a generic message to the client
function serverError(publicMessage: string, err: unknown) {
  console.error(publicMessage, err);
  return NextResponse.json({ error: publicMessage }, { status: 500 });
}

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

    let team: TeamDbRow | null = null;
    let activeDb = db1;
    let resolvedRoute: 1 | 2 = 1;

    if (isLoginMode) {
      const trimmedUid = uid?.trim();
      const trimmedTeam = teamName?.trim();
      const leadName = typeof teamLead === 'string' ? teamLead : '';
      if (!trimmedUid || !trimmedTeam || !leadName.trim()) {
        return NextResponse.json({ error: 'Missing team name, team lead name or 6-digit access code' }, { status: 400 });
      }

      // Check Route 1 database first
      const { data: teamR1, error: errorR1 } = await db1
        .from('teams')
        .select('*')
        .eq('uid', trimmedUid)
        .maybeSingle();

      if (errorR1) {
        return serverError('Login failed. Please try again.', errorR1);
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
          return serverError('Login failed. Please try again.', errorR2);
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

      if (!namesMatch(team.team_lead, leadName)) {
        return NextResponse.json({ error: 'INCORRECT TEAM LEAD NAME FOR THIS TEAM.' }, { status: 401 });
      }

    } else {
      // Registration Mode
      const trimmedTeam = teamName?.trim();
      const trimmedLead = typeof teamLead === 'string' ? normalizeName(teamLead) : '';

      if (!trimmedTeam || !trimmedLead) {
        return NextResponse.json({ error: 'Missing required credentials' }, { status: 400 });
      }

      const leadError = validatePersonName(trimmedLead, 'Team Lead Name');
      if (leadError) {
        return NextResponse.json({ error: leadError }, { status: 400 });
      }

      const membersError = validateMembers(members);
      if (membersError) {
        return NextResponse.json({ error: membersError }, { status: 400 });
      }

      const roster = (members as TeamMember[]).map(m => ({
        name: normalizeName(m.name),
        role: m.role,
        regNo: m.regNo.trim().toUpperCase(),
        phone: m.phone.trim(),
      }));

      // Check if team name already exists across both databases
      const { data: existingTeamR1 } = await db1
        .from('teams')
        .select('id')
        .eq('team_name', trimmedTeam)
        .maybeSingle();

      let existingTeam = existingTeamR1;

      if (!existingTeam && isMultiDb && db2) {
        const { data: existingTeamR2 } = await db2
          .from('teams')
          .select('id')
          .eq('team_name', trimmedTeam)
          .maybeSingle();
        existingTeam = existingTeamR2;
      }

      // Registration never resumes an existing team: team name and team lead are public
      // on the leaderboard, so matching them must not grant a session or reveal the access code.
      // Existing teams sign in through login mode with their access code.
      if (existingTeam) {
        return NextResponse.json(
          { error: 'Team name already registered. Log in with your 6-digit access code.' },
          { status: 409 }
        );
      } else {
        // Create a unique 6-digit alphanumeric code
        const generateCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();
        const generatedUid = generateCode();

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
            members: roster,
            status: 'pending',
            current_stage: 1,
            assigned_route: assignedRoute,
          })
          .select()
          .single();

        if (insertError) {
          return serverError('Registration failed. Please try again.', insertError);
        }

        team = newTeam;
        activeDb = targetDb;
        resolvedRoute = assignedRoute;
      }
    }

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
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
    const roleKey = currentOperativeRole === 'Field Scout' ? 'scout' : 'decoder';
    const maxDevices = currentOperativeRole === 'Base Decoder' ? 2 : 3;

    let deviceSaved = false;

    // Try Supabase RPC first if available
    try {
      const { data: rpcData, error: rpcError } = await activeDb.rpc('register_operative_session', {
        p_team_id: team.id,
        p_role: currentOperativeRole,
        p_device_id: deviceId,
      });
      if (!rpcError && rpcData) {
        deviceSaved = true;
      }
    } catch {
      deviceSaved = false;
    }

    // Fallback to updateDeviceMap if RPC is not configured or returns error
    if (!deviceSaved) {
      deviceSaved = await updateDeviceMap(
        activeDb,
        team.id,
        typeof team.device_id === 'string' ? team.device_id : null,
        (map) => {
          let list: string[] = [];
          const existing = map[roleKey];
          if (Array.isArray(existing)) {
            list = [...existing];
          } else if (typeof existing === 'string') {
            list = [existing];
          }

          // Filter out deviceId if already present
          list = list.filter((id) => id !== deviceId);
          list.push(deviceId);

          // Enforce role capacity: max 2 Base Decoders, max 3 Field Scouts (FIFO)
          while (list.length > maxDevices) {
            list.shift();
          }

          map[roleKey] = list;
          return true;
        }
      );
    }

    // A token whose deviceId isn't stored would be rejected on the very next request
    if (!deviceSaved) {
      return serverError('Login failed. Please try again.', new Error('Could not save device session'));
    }

    const token = await signTeamToken({
      teamId: team.id,
      uid: team.uid || uid || '',
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
    return serverError('Login failed. Please try again.', error);
  }
}
