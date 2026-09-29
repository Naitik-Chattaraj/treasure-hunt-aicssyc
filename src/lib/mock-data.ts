import { Checkpoint, TeamProfile } from '@/types/hunt';

export const mockTeam: TeamProfile = {
  teamName: 'CYBER_PUNKS_01',
  teamLead: 'Alex Mercer',
  uid: 'AICSSYC-2026-9041',
  status: 'approved',
  members: [
    { name: 'Alex Mercer', role: 'Base Decoder', regNo: 'REG-101', phone: '555-0101' },
    { name: 'Sarah Connor', role: 'Base Decoder', regNo: 'REG-102', phone: '555-0102' },
    { name: 'John Doe', role: 'Field Scout', regNo: 'REG-103', phone: '555-0103' },
    { name: 'Marcus Wright', role: 'Field Scout', regNo: 'REG-104', phone: '555-0104' },
  ],
};

const SHA256_HASHES = [
  '4a5b6c7d8e9f0123456789abcdef0123456789abcdef0123456789abcdef01',
  'b2c3d4e5f6a7018293a4b5c6d7e8f90112233445566778899aabbccddeeff00',
  'c3d4e5f6a7b8129384a5b6c7d8e9f012233445566778899aabbccddeeff0011',
  'd4e5f6a7b8c9239485a6b7c8d9e0f1233445566778899aabbccddeeff001122',
  'e5f6a7b8c9d0349586a7b8c9d0e1f23445566778899aabbccddeeff00112233',
  'f6a7b8c9d0e1459687a8b9c0d1e2f345566778899aabbccddeeff0011223344',
  'a7b8c9d0e1f2569788a9b0c1d2e3f4566778899aabbccddeeff001122334455',
  'b8c9d0e1f2a3679889a0b1c2d3e4f56778899aabbccddeeff00112233445566',
  'c9d0e1f2a3b4789990a1b2c3d4e5f678899aabbccddeeff0011223344556677',
  'd0e1f2a3b4c5890001a2b3c4d5e6f7899aabbccddeeff001122334455667788',
  'e1f2a3b4c5d6901112a3b4c5d6e7f890aabbccddeeff00112233445566778899',
  'f2a3b4c5d6e7012223a4b5c6d7e8f901bbccddeeff00112233445566778899aa',
];

export const generateMockCheckpoints = (): Checkpoint[] => {
  const checkpoints: Checkpoint[] = [];
  
  for (let i = 1; i <= 12; i++) {
    checkpoints.push({
      id: i,
      title: `Node 0${i}`,
      area: `Sector ${String.fromCharCode(64 + i)}`,
      clue: `Locate checkpoint 0${i} situated within Sector ${String.fromCharCode(64 + i)}.`,
      qrHash: SHA256_HASHES[i - 1],
      challenge: {
        id: `chal_${i}`,
        nodeId: i,
        type: i % 2 === 0 ? 'mcq' : 'passcode',
        question: i % 2 === 0 
          ? `What is the protocol override standard for Sector ${String.fromCharCode(64 + i)}?` 
          : `Decrypt the passcode for Node 0${i}`,
        options: i % 2 === 0 ? ['Alpha', 'Beta', 'Gamma', 'Delta'] : undefined,
        answer: i % 2 === 0 ? 'Alpha' : `pass${i}`,
      },
    });
  }
  return checkpoints;
};

export const MOCK_CHECKPOINTS = generateMockCheckpoints();
