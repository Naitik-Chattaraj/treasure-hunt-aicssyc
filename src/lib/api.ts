import { TeamProfile, HuntProgress, Checkpoint, LeaderboardEntry, Challenge, TeamMember } from '@/types/hunt';



export interface ScanResult {
  success: boolean;
  error?: 'invalid_qr' | 'already_completed' | 'sequence_violation' | 'cooldown_active' | 'route_mismatch';
  nodeId?: number;
  currentStage?: number;
  message?: string;
  waitSeconds?: number;
  challenge?: Challenge | null;
}

export interface SolveResult {
  success: boolean;
  error?: string;
  nextStage?: number;
  completed?: boolean;
  completionToken?: string | null;
  cooldownSeconds?: number;
  waitSeconds?: number;
  message?: string;
}

export interface LoginResult {
  status: 'approved' | 'pending' | 'rejected';
  team?: TeamProfile;
  message?: string;
  error?: string;
}

export const api = {
  async login(
    uid: string, 
    teamName: string, 
    teamLead: string, 
    members?: TeamMember[], 
    isLoginMode?: boolean,
    operativeName?: string,
    operativeRole?: 'Field Scout' | 'Base Decoder'
  ): Promise<LoginResult> {
    const trimmedUid = uid.trim();
    const trimmedTeam = teamName.trim();
    const trimmedLead = teamLead.trim();

    if (isLoginMode) {
       if (!trimmedUid || !trimmedTeam) return { status: 'rejected', error: 'Missing team name or 6-digit access code' };
    } else {
       if (!trimmedTeam || !trimmedLead) return { status: 'rejected', error: 'Missing required credentials' };
    }

    const currentRole: 'Field Scout' | 'Base Decoder' = operativeRole === 'Field Scout' ? 'Field Scout' : 'Base Decoder';
    const currentName = operativeName?.trim() || (currentRole === 'Base Decoder' ? trimmedLead : 'Field Scout Operative');


    // Call Next.js API backed by Supabase
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        uid: trimmedUid, 
        teamName: trimmedTeam, 
        teamLead: trimmedLead, 
        members, 
        isLoginMode,
        operativeName: currentName,
        operativeRole: currentRole,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { status: data.status || 'rejected', error: data.error || 'Authentication failed' };
    }

    return {
      status: data.status,
      team: data.team,
      message: data.message,
    };
  },

  async logout(): Promise<void> {
    await fetch('/api/auth/logout', { method: 'POST' });
  },

  
  async getMe(): Promise<{ team: TeamProfile | null; progress: HuntProgress | null }> {
    try {
      const res = await fetch(`/api/team/me?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store' },
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401 && data.error === 'Session expired: logged in from another device') {
          if (typeof window !== 'undefined') {
            alert('Your session has expired because your team logged in from another device. Only one device per role can be active at a time.');
            window.location.href = '/login';
          }
        }
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          return { team: null, progress: null };
        }
        throw new Error('Server error');
      }
      return { team: data.team || null, progress: data.progress || null };
    } catch (e: unknown) {
      if (e instanceof Error && e.message !== 'Server error') {
        throw new Error('network_error');
      }
      throw e;
    }
  },

  async getProfile(): Promise<TeamProfile | null> {

    try {
      const res = await fetch(`/api/team/me?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store' },
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401 && data.error === 'Session expired: logged in from another device') {
          if (typeof window !== 'undefined') {
            alert('Your session has expired because your team logged in from another device. Only one device per role can be active at a time.');
          }
          return null; // Expired, trigger logout
        }
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          return null; // Unauthorized or missing, trigger logout
        }
        throw new Error('Server error'); // 500 or other errors, don't logout
      }
      return data.team || null;
    } catch (e: unknown) {
      if (e instanceof Error && e.message !== 'Server error') {
        throw new Error('network_error');
      }
      throw e;
    }
  },

  async getProgress(): Promise<HuntProgress | null> {

    try {
      const res = await fetch(`/api/team/me?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store' },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.progress || null;
    } catch {
      return null;
    }
  },

  async getCheckpoint(_stage?: number, _routeId?: 1 | 2): Promise<Checkpoint | null> {

    try {
      const res = await fetch(`/api/hunt/checkpoint?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store' },
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401 && data.error === 'Session expired: logged in from another device') {
          if (typeof window !== 'undefined') {
            alert('Your session has expired because another device logged in with your role. Only one device per role is allowed.');
            window.location.href = '/login';
          }
        }
        return null;
      }
      return data.checkpoint || null;
    } catch {
      return null;
    }
  },

  async getMapNodes(routeId?: 1 | 2): Promise<Checkpoint[]> {
    try {
      const url = routeId
        ? `/api/hunt/map-nodes?route=${routeId}&_t=${Date.now()}`
        : `/api/hunt/map-nodes?_t=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return [];
      const data = await res.json();
      return data.nodes || [];
    } catch {
      return [];
    }
  },

  async scanQr(qrHash: string): Promise<ScanResult> {
    const cleanHash = qrHash.trim();

    const res = await fetch('/api/hunt/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrHash: cleanHash }),
    });

    const data = await res.json();
    if (res.status === 401 && data.error === 'Session expired: logged in from another device') {
      if (typeof window !== 'undefined') {
        alert('Your session has expired because another device logged in with your role. Only one device per role is allowed.');
        window.location.href = '/login';
      }
    }
    return data;
  },

  async solveChallenge(nodeId: number, answer: string): Promise<SolveResult> {

    const res = await fetch('/api/hunt/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId, answer }),
    });

    const data = await res.json();
    if (res.status === 401 && data.error === 'Session expired: logged in from another device') {
      if (typeof window !== 'undefined') {
        alert('Your session has expired because another device logged in with your role. Only one device per role is allowed.');
        window.location.href = '/login';
      }
    }
    return data;
  },

  async getLeaderboard(): Promise<LeaderboardEntry[]> {

    try {
      const res = await fetch('/api/leaderboard');
      if (!res.ok) return [];
      const data = await res.json();
      return data.leaderboard || [];
    } catch {
      return [];
    }
  },
};
