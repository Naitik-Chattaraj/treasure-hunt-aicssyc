import { Checkpoint, TeamProfile } from '@/types/hunt';

export const mockTeam: TeamProfile = {
  teamName: 'CYBER_PUNKS_01',
  teamLead: 'Alex Mercer',
  uid: 'AICSSYC-2026-9041',
  status: 'approved',
  assignedRoute: 1,
  members: [
    { name: 'Alex Mercer', role: 'Base Decoder', regNo: 'REG-101', phone: '555-0101' },
    { name: 'Sarah Connor', role: 'Base Decoder', regNo: 'REG-102', phone: '555-0102' },
    { name: 'John Doe', role: 'Field Scout', regNo: 'REG-103', phone: '555-0103' },
    { name: 'Marcus Wright', role: 'Field Scout', regNo: 'REG-104', phone: '555-0104' },
  ],
};

// 12 Deterministic SHA-256 tokens for Route 1
export const ROUTE_1_HASHES = [
  'bd9eac87121e230733f08e604f2e962c531bbcb9775a6b99ed20b30d346afc8c', // Node 1: Hippocrates Hall
  '3583502fd2948d5900f18951f422c396e3c31187e8fea9ada199cd0e330b0433', // Node 2: N Block
  '400a3ac3a0f3beb94798989c12750fad125c537a40b7393f8e812284977b3b8b', // Node 3: Shiva Temple
  '53cfdaff40cb230500abc46f9f32be5c47ae98d19ebab65f6f713a4e4f7f9d10', // Node 4: BEL Block
  '39cd553d3ef594283ab642c0ff5dd435d4e1e8f58bb2802b82cfd3d1e4429222', // Node 5: TP Building
  '928b524ce9d888864289c090b7aaeb3c63dab7816d7b0a2b78d6d566a40c1dbc', // Node 6: Clock Tower
  '08ec07fbd278124a852535d8d6acfa9d20d02ccb5aacbf2e897ed03827c651ea', // Node 7: UB Building
  'dc441c40a0b5b4ba2f505f5033be64d2c25dc00084676a623342568de3ccb6f2', // Node 8: Architecture Block
  'd46853b77c3dc0cbcece6817e23a29ddb0c58910f2b37e173627fa819069fb44', // Node 9: Law College
  'f862cc2b52f6bff77e2347f7e84d06ac3b71d1bc26f9d49b90a0a4df74fde4a7', // Node 10: Vendhar
  '7b6d3809e4ba60d514cc86ab57e4c88999ae00a00389036411bdd583fe358b18', // Node 11: Medical College
  'c789491605d4e6055d42a72a83ac31529b05e7d51a9fc93be11b7a6dfd63b88f', // Node 12: Hippocrates Hall
];

// 12 Deterministic SHA-256 tokens for Route 2
export const ROUTE_2_HASHES = [
  '53a63eea12e8a9d16dce66c36914f5d9ecdd3a0b3188630000472398a899e1e6', // Node 1: SRM General Hospital Lawn & Entrance
  '97409beb417220658ccb5a621a9052b8c5f87f4b6146b22bef80847b95970285', // Node 2: Dental / Pharmacy Block
  'e9a7253f987f01d999741858a9791710df97e48c114d79ad1e5ee498d8d927bd', // Node 3: Bio-Tech Block & Life Sciences Lawn
  'c784139c044369902fde1c9c5c3434058c94acd771b88c9849df26374813a1e5', // Node 4: Dr. T.P. Ganesan Auditorium
  '7891214434f28f03c7a2074c0989f0afdcd3442568b7a9fc9fea44e6417761f9', // Node 5: Vendhar Square & Clock Tower Area
  '6cb0b82b2bfa0fd7e8e7b49cb579bf4e5f77260c855981a318241cbbda0defb8', // Node 6: BEL Block
  '561da7e62342f209ffbcc79777b3d17f41c50d8db17c21a868ddda687f75415d', // Node 7: Java Green / Main Canteen
  '7020a54c0e185c7abc6940c0d6a174f1af9296f391097a3a15b62d2b307d959a', // Node 8: SRM Tech Park
  '1983f06654e9265d3521764f883397ec9db406708521b8737497d7c107f3c8eb', // Node 9: Central Library / University Building (UB)
  'b5b82967ac52ded872bc7cf842f2727233e3468228d955271e085211ff81c003', // Node 10: Post Office & Bank Complex
  '52471a6be7f54b7a7a906d7d6b16b10ec164b4434d265c4d10282c049cd2ec67', // Node 11: School of Law
  '9e561fdf50f2ea36c0d81c75a2ddcc901ff2b355370573169b61df0008d63a4c', // Node 12: Faculty of Science & Humanities (Arts College)
];

const ROUTE_1_CONFIG = [
  {
    stage: 1,
    title: 'Node 01: Hippocrates Hall',
    area: 'Medical Complex - Hippocrates Concourse',
    clue: 'Begin at Hippocrates Hall. Search near the main entrance directory board and seminar foyer on the ground level.',
    type: 'passcode' as const,
    question: 'Enter the initialization code etched onto the Hippocrates Hall foyer terminal.',
    answer: 'HIPPOCRATES2026',
  },
  {
    stage: 2,
    title: 'Node 02: N Block',
    area: 'Academic Quad - N-Block Ground Arcade',
    clue: 'Advance to N Block. Inspect the perimeter pillars adjacent to the main departmental notice bulletin.',
    type: 'mcq' as const,
    question: 'Which network topology connects every node to a central hub switch in academic server grids?',
    options: ['Star', 'Ring', 'Bus', 'Mesh'],
    answer: 'Star',
  },
  {
    stage: 3,
    title: 'Node 03: Shiva Temple',
    area: 'Campus Sanctuary - Shiva Temple Grounds',
    clue: 'Navigate towards the campus Shiva Temple. Look along the perimeter stone walkway boundary markers.',
    type: 'riddle' as const,
    question: 'I have a spine, but no bones. I have leaves, but no branches. I hold knowledge of all eras. What am I?',
    answer: 'book',
  },
  {
    stage: 4,
    title: 'Node 04: BEL Block',
    area: 'Technology Sector - BEL Block Entrance Foyer',
    clue: 'Locate BEL Block. Search the exterior pillar near the engineering laboratory entrance corridor sign.',
    type: 'passcode' as const,
    question: 'Convert the binary octet 10101010 to hexadecimal.',
    answer: 'AA',
  },
  {
    stage: 5,
    title: 'Node 05: TP Building',
    area: 'Tech Park Zone - TP Building Ground Podium',
    clue: 'Proceed to TP Building. Check the structural support column beside the central elevator bank.',
    type: 'mcq' as const,
    question: 'What is the default port number assigned for standard encrypted HTTPS web traffic?',
    options: ['80', '443', '8080', '22'],
    answer: '443',
  },
  {
    stage: 6,
    title: 'Node 06: Clock Tower',
    area: 'Campus Heart - Heritage Clock Tower Plaza',
    clue: 'Head to the landmark Clock Tower. Search the stonework base facing the central pedestrian avenue.',
    type: 'riddle' as const,
    question: 'I have hands that cannot hold, a face that cannot smile, and I run without moving an inch. What am I?',
    answer: 'clock',
  },
  {
    stage: 7,
    title: 'Node 07: UB Building',
    area: 'University Building - Ground Floor Concourse',
    clue: 'Enter the University Building (UB). Locate the checkpoint near the main atrium digital information terminal.',
    type: 'passcode' as const,
    question: 'Compute the checksum: (16 * 16) - 16.',
    answer: '240',
  },
  {
    stage: 8,
    title: 'Node 08: Architecture Block',
    area: 'School of Architecture - Design Portico',
    clue: 'Move to the Architecture Block. Search near the model exhibition foyer and student gallery facade.',
    type: 'mcq' as const,
    question: 'In computer graphics and architectural CAD rendering, what coordinate system uses (X, Y, Z)?',
    options: ['Cartesian', 'Polar', 'Spherical', 'Cylindrical'],
    answer: 'Cartesian',
  },
  {
    stage: 9,
    title: 'Node 09: Law College',
    area: 'School of Law - Academic Portal',
    clue: 'Advance to Law College. Look near the moot court hall outer bulletin frame.',
    type: 'riddle' as const,
    question: 'I can be broken without being held. I can be given and kept. What am I?',
    answer: 'promise',
  },
  {
    stage: 10,
    title: 'Node 10: Vendhar',
    area: 'Vendhar Square - Central Promenade',
    clue: 'Reach Vendhar Square. Inspect the perimeter brick wall facing the central landscaped island.',
    type: 'passcode' as const,
    question: 'Enter the founding acronym of this championship.',
    answer: 'AICSSYC',
  },
  {
    stage: 11,
    title: 'Node 11: Medical College',
    area: 'Health Sciences - SRM Medical College Quad',
    clue: 'Proceed to SRM Medical College. Search near the dean office outer corridor archway.',
    type: 'mcq' as const,
    question: 'Which molecule carries genetic instructions in all biological organisms?',
    options: ['DNA', 'RNA', 'ATP', 'Glucose'],
    answer: 'DNA',
  },
  {
    stage: 12,
    title: 'Node 12: Hippocrates Hall',
    area: 'Grand Finale - Hippocrates Hall Apex Podium',
    clue: 'Return to Hippocrates Hall for the final breach! Scan the victory checkpoint situated at the main podium stage.',
    type: 'passcode' as const,
    question: 'MASTER CITADEL OVERRIDE: Enter the victory key for Route 1.',
    answer: 'VICTORY2026',
  },
];

const ROUTE_2_CONFIG = [
  {
    stage: 1,
    title: 'Node 01: SRM General Hospital Lawn & Entrance',
    area: 'Hospital Frontage - Emergency Lawn & Gateway',
    clue: 'Rendezvous at SRM General Hospital Lawn & Entrance. Search near the emergency ramp guide sign.',
    type: 'passcode' as const,
    question: 'Enter the emergency access protocol key for Sector Medical Alpha.',
    answer: 'HOSPITAL2026',
  },
  {
    stage: 2,
    title: 'Node 02: Dental / Pharmacy Block',
    area: 'Health Sciences - Dental & Pharmacy Arcade',
    clue: 'Proceed to Dental / Pharmacy Block. Look near the clinical dispensary lobby notice board.',
    type: 'mcq' as const,
    question: 'Which cryptographic algorithm was standardized by NIST to replace DES?',
    options: ['AES', 'RSA', 'Blowfish', 'MD5'],
    answer: 'AES',
  },
  {
    stage: 3,
    title: 'Node 03: Bio-Tech Block & Life Sciences Lawn',
    area: 'Bio-Sciences Sector - Life Sciences Lawn & Pod',
    clue: 'Navigate to the Bio-Tech Block. Check the ground pavilion overlooking the Life Sciences Lawn.',
    type: 'riddle' as const,
    question: 'I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?',
    answer: 'echo',
  },
  {
    stage: 4,
    title: 'Node 04: Dr. T.P. Ganesan Auditorium',
    area: 'Grand Convention - Auditorium Portico',
    clue: 'Advance to Dr. T.P. Ganesan Auditorium. Search near the grand staircase leading to the main entrance foyer.',
    type: 'passcode' as const,
    question: 'Evaluate (2^10) bytes in standard Kilobytes.',
    answer: '1',
  },
  {
    stage: 5,
    title: 'Node 05: Vendhar Square & Clock Tower Area',
    area: 'Central Junction - Vendhar Square & Clock Tower',
    clue: 'Move to the Vendhar Square & Clock Tower Area. Inspect the base of the lighting mast facing the plaza.',
    type: 'mcq' as const,
    question: 'Which protocol securely transmits files between networked hosts via SSH?',
    options: ['SFTP', 'FTP', 'Telnet', 'TFTP'],
    answer: 'SFTP',
  },
  {
    stage: 6,
    title: 'Node 06: BEL Block',
    area: 'Engineering Wing - BEL Block East Gateway',
    clue: 'Locate BEL Block. Search the exterior covered pathway leading to the computing research labs.',
    type: 'riddle' as const,
    question: 'The more you take, the more you leave behind. What am I?',
    answer: 'footsteps',
  },
  {
    stage: 7,
    title: 'Node 07: Java Green / Main Canteen',
    area: 'Food Court Plaza - Java Green & Main Canteen',
    clue: 'Head to Java Green / Main Canteen. Inspect the wooden pergola pillar near the outdoor seating walkway.',
    type: 'passcode' as const,
    question: 'Decipher the Caesar shift of "KHOOR" backwards by 3 letters.',
    answer: 'HELLO',
  },
  {
    stage: 8,
    title: 'Node 08: SRM Tech Park',
    area: 'IT Sector - SRM Tech Park Main Atrium',
    clue: 'Proceed to SRM Tech Park. Search near the ground floor directory totem by the glass revolving doors.',
    type: 'mcq' as const,
    question: 'Which data structure operates on a Last-In, First-Out (LIFO) order?',
    options: ['Stack', 'Queue', 'Array', 'Linked List'],
    answer: 'Stack',
  },
  {
    stage: 9,
    title: 'Node 09: Central Library / University Building (UB)',
    area: 'Knowledge Core - Central Library & UB Concourse',
    clue: 'Enter the Central Library / UB Building. Check near the library return drop kiosk on the concourse level.',
    type: 'riddle' as const,
    question: 'I have keys but no doors, space but no rooms, and you can enter but never exit outside. What am I?',
    answer: 'keyboard',
  },
  {
    stage: 10,
    title: 'Node 10: Post Office & Bank Complex',
    area: 'Campus Services - Post Office & Banking Arcade',
    clue: 'Locate the Post Office & Bank Complex. Search beside the ATM vestibule outer glass panel.',
    type: 'passcode' as const,
    question: 'Binary translation: Convert the binary number 11110000 to decimal.',
    answer: '240',
  },
  {
    stage: 11,
    title: 'Node 11: School of Law',
    area: 'Juridical Wing - School of Law Forecourt',
    clue: 'Advance to the School of Law. Look near the legal aid clinic entrance sign on the ground floor.',
    type: 'mcq' as const,
    question: 'Which layer of the OSI model is responsible for end-to-end communication and error recovery?',
    options: ['Transport Layer', 'Network Layer', 'Data Link Layer', 'Session Layer'],
    answer: 'Transport Layer',
  },
  {
    stage: 12,
    title: 'Node 12: Faculty of Science & Humanities (Arts College)',
    area: 'Arts & Humanities - FSH Main Entrance Portico',
    clue: 'Reach Faculty of Science & Humanities (Arts College). Scan the final node at the main administrative portal, then rush to finish at Hippocrates Hall!',
    type: 'passcode' as const,
    question: 'FINAL PROTOCOL KEY: Enter the Route 2 clearance key before reporting to Hippocrates Hall.',
    answer: 'FINISH2026',
  },
];

export const generateRouteCheckpoints = (routeId: 1 | 2): Checkpoint[] => {
  const configs = routeId === 1 ? ROUTE_1_CONFIG : ROUTE_2_CONFIG;
  const hashes = routeId === 1 ? ROUTE_1_HASHES : ROUTE_2_HASHES;
  const offset = routeId === 1 ? 0 : 12;

  return configs.map((cfg, idx) => ({
    id: offset + cfg.stage, // 1..12 for Route 1, 13..24 for Route 2
    routeId,
    route_id: routeId,
    stage: cfg.stage,
    title: cfg.title,
    area: cfg.area,
    clue: cfg.clue,
    qrHash: hashes[idx],
    qr_hash: hashes[idx],
    challenge: {
      id: `chal_r${routeId}_s${cfg.stage}`,
      nodeId: offset + cfg.stage,
      type: cfg.type,
      question: cfg.question,
      options: cfg.options,
      answer: cfg.answer,
    },
  }));
};

export const ROUTE_1_CHECKPOINTS = generateRouteCheckpoints(1);
export const ROUTE_2_CHECKPOINTS = generateRouteCheckpoints(2);
export const MOCK_CHECKPOINTS: Checkpoint[] = [...ROUTE_1_CHECKPOINTS, ...ROUTE_2_CHECKPOINTS];
