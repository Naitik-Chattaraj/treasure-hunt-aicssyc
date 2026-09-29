import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { signTeamToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { uid, teamName, teamLead, members } = await req.json();

    const trimmedUid = uid?.trim();
    const trimmedTeam = teamName?.trim();
    const trimmedLead = teamLead?.trim();

    if (!trimmedUid || !trimmedTeam || !trimmedLead) {
      return NextResponse.json({ error: 'Missing required credentials' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase credentials not configured in environment' },
        { status: 500 }
      );
    }

    // 1. Check if team already exists by UID
    const { data: existingTeam, error: fetchError } = await supabase
      .from('teams')
      .select('*')
      .eq('uid', trimmedUid)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    let team = existingTeam;

    // 2. If team does not exist, create new team in 'pending' status
    if (!team) {
      const defaultMembers = Array.isArray(members) && members.length > 0 ? members : [
        { name: trimmedLead, role: 'Team Lead', regNo: trimmedUid, phone: '555-0100' },
        { name: 'Member 2', role: 'Cryptanalyst', regNo: 'REG-002', phone: '555-0102' },
        { name: 'Member 3', role: 'Field Navigator', regNo: 'REG-003', phone: '555-0103' },
      ];

      const { data: newTeam, error: insertError } = await supabase
        .from('teams')
        .insert({
          uid: trimmedUid,
          team_name: trimmedTeam,
          team_lead: trimmedLead,
          members: defaultMembers,
          status: 'pending',
          current_stage: 1,
        })
        .select()
        .single();

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      team = newTeam;
    }

    // 3. Check status
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
        },
      });
    }

    if (team.status === 'rejected') {
      return NextResponse.json({
        status: 'rejected',
        error: 'ACCESS REVOKED: Team registration has been rejected by mission control.',
      }, { status: 403 });
    }

    // 4. Team is approved - sign JWT and set HTTP-only cookie
    const token = await signTeamToken({
      teamId: team.id,
      uid: team.uid,
      teamName: team.team_name,
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
