import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { signTeamToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { uid, teamName, teamLead, members, isLoginMode } = await req.json();
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase credentials not configured in environment' },
        { status: 500 }
      );
    }

    let team = null;

    if (isLoginMode) {
      const trimmedUid = uid?.trim();
      const trimmedTeam = teamName?.trim();
      if (!trimmedUid || !trimmedTeam) {
        return NextResponse.json({ error: 'Missing team name or 6-digit access code' }, { status: 400 });
      }

      const { data: existingTeam, error: fetchError } = await supabase
        .from('teams')
        .select('*')
        .eq('uid', trimmedUid)
        .maybeSingle();

      if (fetchError) {
        return NextResponse.json({ error: fetchError.message }, { status: 500 });
      }

      if (!existingTeam) {
        return NextResponse.json({ error: 'INVALID CODE. TEAM NOT FOUND.' }, { status: 404 });
      }

      if (existingTeam.team_name.trim().toLowerCase() !== trimmedTeam.toLowerCase()) {
        return NextResponse.json({ error: 'INCORRECT TEAM NAME FOR THIS ACCESS CODE.' }, { status: 401 });
      }
      team = existingTeam;


    } else {
      // Registration Mode
      const trimmedTeam = teamName?.trim();
      const trimmedLead = teamLead?.trim();

      if (!trimmedTeam || !trimmedLead) {
        return NextResponse.json({ error: 'Missing required credentials' }, { status: 400 });
      }

      // Check if team name already exists to prevent duplicate registrations
      const { data: existingTeamByName } = await supabase
        .from('teams')
        .select('*')
        .eq('team_name', trimmedTeam)
        .maybeSingle();

      if (existingTeamByName) {
        // If they are just polling, return the pending status
        if (existingTeamByName.team_lead === trimmedLead) {
           team = existingTeamByName;
        } else {
           return NextResponse.json({ error: 'Team name already registered.' }, { status: 400 });
        }
      } else {
        // Create a unique 6-digit alphanumeric code
        const generateCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();
        let generatedUid = generateCode();

        const defaultMembers = Array.isArray(members) && members.length >= 4 ? members : [];
        const assignedRoute = Math.random() < 0.5 ? 1 : 2;

        const { data: newTeam, error: insertError } = await supabase
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
      }
    }

    // 3. Check status
    if (team.status === 'pending') {
      return NextResponse.json({
        status: 'pending',
        message: 'Your registration is submitted and awaiting administrative approval.',
        team: {
          id: team.id,
          uid: team.uid, // returning this so the frontend can poll, but we won't show it.
          teamName: team.team_name,
          teamLead: team.team_lead,
          status: 'pending',
          assignedRoute: team.assigned_route || 1,
        },
      });
    }

    if (team.status === 'rejected') {
      return NextResponse.json({
        status: 'rejected',
        error: 'ACCESS REVOKED: Team registration has been rejected by mission control.',
      }, { status: 403 });
    }

    // 4. Team is approved - generate deviceId, update DB, sign JWT
    const deviceId = crypto.randomUUID();
    
    const { error: deviceError } = await supabase
      .from('teams')
      .update({ device_id: deviceId })
      .eq('id', team.id);

    if (deviceError) {
      console.error('Failed to update device ID:', deviceError);
      // Proceed anyway, but device tracking might be inconsistent
    }

    const token = await signTeamToken({
      teamId: team.id,
      uid: team.uid,
      teamName: team.team_name,
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
        assignedRoute: team.assigned_route || 1,
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
