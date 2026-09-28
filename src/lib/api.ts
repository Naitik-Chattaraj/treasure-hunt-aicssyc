import { TeamProfile, HuntProgress, Checkpoint } from '@/types/hunt';
import { mockTeam, MOCK_CHECKPOINTS } from './mock-data';

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== 'false';
const LOCAL_STORAGE_KEY_TEAM = 'aicssyc_team';
const LOCAL_STORAGE_KEY_PROGRESS = 'aicssyc_progress';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const api = {
  async login(uid: string, teamName: string, teamLead: string): Promise<TeamProfile | null> {
    if (USE_MOCK) {
      await delay(500); // Simulate network
      const trimmedUid = uid.trim();
      const trimmedTeam = teamName.trim();
      const trimmedLead = teamLead.trim();

      if (!trimmedUid || !trimmedTeam || !trimmedLead) {
        return null;
      }

      const activeTeam: TeamProfile = {
        teamName: trimmedTeam,
        teamLead: trimmedLead,
        uid: trimmedUid,
        members: (trimmedUid === mockTeam.uid && trimmedTeam === mockTeam.teamName)
          ? mockTeam.members
          : [
              { name: trimmedLead, role: 'Team Lead', regNo: trimmedUid, phone: '555-0100' },
              { name: 'Member 2', role: 'Cryptanalyst', regNo: 'REG-002', phone: '555-0102' },
              { name: 'Member 3', role: 'Field Navigator', regNo: 'REG-003', phone: '555-0103' },
            ],
      };

      if (typeof window !== 'undefined') {
        localStorage.setItem(LOCAL_STORAGE_KEY_TEAM, JSON.stringify(activeTeam));
        if (!localStorage.getItem(LOCAL_STORAGE_KEY_PROGRESS)) {
          const initialProgress: HuntProgress = {
            currentStage: 1,
            startTime: Date.now(),
            completedNodes: [],
            completionToken: null,
          };
          localStorage.setItem(LOCAL_STORAGE_KEY_PROGRESS, JSON.stringify(initialProgress));
        }
      }
      return activeTeam;
    }
    // Real API implementation goes here
    throw new Error('Not implemented');
  },

  async logout(): Promise<void> {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LOCAL_STORAGE_KEY_TEAM);
    }
  },

  async getProfile(): Promise<TeamProfile | null> {
    if (typeof window !== 'undefined') {
      const data = localStorage.getItem(LOCAL_STORAGE_KEY_TEAM);
      return data ? JSON.parse(data) : null;
    }
    return null;
  },

  async getProgress(): Promise<HuntProgress | null> {
    if (typeof window !== 'undefined') {
      const data = localStorage.getItem(LOCAL_STORAGE_KEY_PROGRESS);
      return data ? JSON.parse(data) : null;
    }
    return null;
  },

  async getCheckpoint(id: number): Promise<Checkpoint | null> {
    if (USE_MOCK) {
      return MOCK_CHECKPOINTS.find((c) => c.id === id) || null;
    }
    throw new Error('Not implemented');
  },

  async getAllCheckpoints(): Promise<Checkpoint[]> {
    if (USE_MOCK) return MOCK_CHECKPOINTS;
    throw new Error('Not implemented');
  },

  async solveChallenge(nodeId: number, answer: string): Promise<boolean> {
    if (USE_MOCK) {
      await delay(800);
      const cp = MOCK_CHECKPOINTS.find((c) => c.id === nodeId);
      if (cp && cp.challenge.answer.toLowerCase() === answer.toLowerCase()) {
        if (typeof window !== 'undefined') {
          const progressData = localStorage.getItem(LOCAL_STORAGE_KEY_PROGRESS);
          if (progressData) {
            const progress: HuntProgress = JSON.parse(progressData);
            if (progress.currentStage === nodeId) {
              progress.currentStage += 1;
              progress.completedNodes.push({ nodeId, timestamp: Date.now() });
              if (progress.currentStage > 12) {
                progress.completionToken = `WIN-${Date.now().toString(16).toUpperCase()}`;
              }
              localStorage.setItem(LOCAL_STORAGE_KEY_PROGRESS, JSON.stringify(progress));
            }
          }
        }
        return true;
      }
      return false;
    }
    throw new Error('Not implemented');
  }
};
