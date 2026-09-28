import { Checkpoint, TeamProfile } from '@/types/hunt';

export const mockTeam: TeamProfile = {
  teamName: 'CYBER_PUNKS_01',
  teamLead: 'Alex Mercer',
  uid: 'AICSSYC-2026-9041',
  members: [
    { name: 'Alex Mercer', role: 'Captain', regNo: 'REG-101', phone: '555-0101' },
    { name: 'Sarah Connor', role: 'Hacker', regNo: 'REG-102', phone: '555-0102' },
    { name: 'John Doe', role: 'Scout', regNo: 'REG-103', phone: '555-0103' },
  ],
};

export const generateMockCheckpoints = (): Checkpoint[] => {
  const checkpoints: Checkpoint[] = [];
  
  for (let i = 1; i <= 12; i++) {
    checkpoints.push({
      id: i,
      title: `Node 0${i}`,
      area: `Sector ${String.fromCharCode(64 + i)}`,
      clue: `Find the terminal marked 0${i} near the Sector ${String.fromCharCode(64 + i)} gateway.`,
      qrHash: `QR_HASH_NODE_${i}`,
      challenge: {
        id: `chal_${i}`,
        nodeId: i,
        type: i % 2 === 0 ? 'mcq' : 'passcode',
        question: i % 2 === 0 
          ? `What is the security override code for Sector ${String.fromCharCode(64 + i)}?` 
          : `Decrypt the passcode for Node 0${i}`,
        options: i % 2 === 0 ? ['Alpha', 'Beta', 'Gamma', 'Delta'] : undefined,
        answer: i % 2 === 0 ? 'Alpha' : `pass${i}`,
      },
    });
  }
  return checkpoints;
};

export const MOCK_CHECKPOINTS = generateMockCheckpoints();
