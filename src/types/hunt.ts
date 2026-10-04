export interface TeamMember {
  name: string;
  role: 'Field Scout' | 'Base Decoder' | string;
  regNo: string;
  phone: string;
}

export type TeamStatus = 'pending' | 'approved' | 'rejected';

export interface TeamProfile {
  id?: string;
  teamName: string;
  teamLead: string;
  uid: string;
  members: TeamMember[];
  status?: TeamStatus;
  cooldownUntil?: string | null;
  assignedRoute?: 1 | 2;
  assigned_route?: 1 | 2;
  operativeRole?: 'Field Scout' | 'Base Decoder';
  operativeName?: string;
}

export type ChallengeType = 'passcode' | 'mcq' | 'riddle' | 'code';

export interface Challenge {
  id: string;
  nodeId: number;
  type: ChallengeType;
  question: string;
  options?: string[]; // Only for mcq
  answer?: string; // Hidden from participant, only present in admin views
}

export interface Checkpoint {
  id: number; // 1 to 24 (or stage 1-12)
  routeId: 1 | 2;
  route_id?: 1 | 2;
  stage: number; // 1 to 12
  title: string;
  area: string;
  clue: string;
  latitude?: number | null;
  longitude?: number | null;
  qrHash?: string; // Only present in admin views or mock
  qr_hash?: string;
  qrScanned?: boolean; // Whether the field team has unlocked the QR for this stage
  challenge?: Challenge | null; // The etched challenge for this team
}

export interface HuntProgress {
  currentStage: number; // 1 to 13 (13 = victory)
  assignedRoute?: 1 | 2;
  startTime: number | null;
  completedNodes: {
    nodeId: number;
    timestamp: number;
  }[];
  completionToken: string | null;
  cooldownUntil?: number | null; // epoch timestamp in ms
  wrongAttempts?: number;
  qrScannedForCurrentStage?: boolean;
}

export interface LeaderboardEntry {
  id: string;
  teamName: string;
  teamLead: string;
  assignedRoute?: 1 | 2;
  currentStage: number;
  startTime: string | null;
  completedAt: string | null;
  completed_at?: string | null;
  status: TeamStatus;
  elapsedSeconds?: number | null;
  completionToken?: string | null;
  completion_token?: string | null;
}

