export interface TeamMember {
  name: string;
  role: string;
  regNo: string;
  phone: string;
}

export interface TeamProfile {
  teamName: string;
  teamLead: string;
  uid: string;
  members: TeamMember[];
}

export type ChallengeType = 'passcode' | 'mcq' | 'riddle';

export interface Challenge {
  id: string;
  nodeId: number;
  type: ChallengeType;
  question: string;
  options?: string[]; // Only for mcq
  answer: string; // The correct answer hash or raw string
}

export interface Checkpoint {
  id: number; // 1 to 12
  title: string;
  area: string;
  clue: string;
  qrHash: string; // the string expected from the QR code
  challenge: Challenge;
}

export interface HuntProgress {
  currentStage: number; // 1 to 13 (13 = victory)
  startTime: number | null;
  completedNodes: {
    nodeId: number;
    timestamp: number;
  }[];
  completionToken: string | null;
}
