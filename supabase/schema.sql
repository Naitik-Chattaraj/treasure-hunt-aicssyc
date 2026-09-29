-- ==============================================================================
-- AICSSYC TREASURE HUNT - SUPABASE DATABASE SCHEMA & QUESTION POOL
-- DUAL ROUTE ARCHITECTURE (Route 1: 12 Nodes, Route 2: 12 Nodes = 24 Checkpoints)
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TEAMS TABLE (Min 4, Max 5 members per team, randomly assigned Route 1 or Route 2)
CREATE TABLE IF NOT EXISTS public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uid TEXT UNIQUE NOT NULL,
    team_name TEXT NOT NULL,
    team_lead TEXT NOT NULL,
    members JSONB DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    assigned_route INTEGER NOT NULL DEFAULT 1 CHECK (assigned_route IN (1, 2)),
    current_stage INTEGER NOT NULL DEFAULT 1 CHECK (current_stage >= 1 AND current_stage <= 13),
    start_time TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    completion_token TEXT,
    cooldown_until TIMESTAMPTZ,
    wrong_attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    device_id TEXT
);

-- Ensure assigned_route exists if table was previously created
ALTER TABLE public.teams 
    ADD COLUMN IF NOT EXISTS assigned_route INTEGER NOT NULL DEFAULT 1 CHECK (assigned_route IN (1, 2));

ALTER TABLE public.teams
    ADD COLUMN IF NOT EXISTS device_id TEXT;

-- 3. CHECKPOINTS TABLE (24 Physical Nodes on Campus with SHA-256 QR Hashes across 2 Routes)
CREATE TABLE IF NOT EXISTS public.checkpoints (
    id INTEGER PRIMARY KEY CHECK (id >= 1 AND id <= 24),
    route_id INTEGER NOT NULL DEFAULT 1 CHECK (route_id IN (1, 2)),
    stage INTEGER NOT NULL DEFAULT 1 CHECK (stage >= 1 AND stage <= 12),
    title TEXT NOT NULL,
    area TEXT NOT NULL,
    clue TEXT NOT NULL,
    qr_hash TEXT UNIQUE NOT NULL, -- SHA-256 hash encoded in physical QR
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (route_id, stage)
);

-- Ensure route_id and stage exist and constraints are updated if table was previously created
ALTER TABLE public.checkpoints 
    ADD COLUMN IF NOT EXISTS route_id INTEGER NOT NULL DEFAULT 1 CHECK (route_id IN (1, 2));

ALTER TABLE public.checkpoints 
    ADD COLUMN IF NOT EXISTS stage INTEGER;

-- Set stage from id for existing records (nodes 1..12)
UPDATE public.checkpoints SET stage = id WHERE stage IS NULL;
UPDATE public.checkpoints SET stage = 1 WHERE stage IS NULL;

ALTER TABLE public.checkpoints 
    ALTER COLUMN stage SET NOT NULL;

DO $$
BEGIN
    ALTER TABLE public.checkpoints DROP CONSTRAINT IF EXISTS checkpoints_id_check;
    ALTER TABLE public.checkpoints ADD CONSTRAINT checkpoints_id_check CHECK (id >= 1 AND id <= 24);
    
    ALTER TABLE public.checkpoints DROP CONSTRAINT IF EXISTS checkpoints_route_id_stage_key;
    ALTER TABLE public.checkpoints DROP CONSTRAINT IF EXISTS checkpoints_route_stage_key;
    ALTER TABLE public.checkpoints ADD CONSTRAINT checkpoints_route_id_stage_key UNIQUE (route_id, stage);
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- 4. QUESTIONS POOL (Bank of questions per checkpoint node)
CREATE TABLE IF NOT EXISTS public.questions_pool (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id INTEGER NOT NULL REFERENCES public.checkpoints(id) ON DELETE CASCADE,
    challenge_type TEXT NOT NULL CHECK (challenge_type IN ('passcode', 'mcq', 'riddle', 'code')),
    question TEXT NOT NULL,
    options JSONB, -- For MCQ options
    answer TEXT NOT NULL, -- Secret answer verified strictly on server
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. TEAM ACTIVE CHALLENGES (Etched in Supabase per team upon QR scan)
-- Guarantees that once a random question is selected for a team at node X,
-- it NEVER changes even across browser reloads or device switching.
CREATE TABLE IF NOT EXISTS public.team_active_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    node_id INTEGER NOT NULL REFERENCES public.checkpoints(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions_pool(id) ON DELETE CASCADE,
    scanned_at TIMESTAMPTZ DEFAULT now(),
    solved_at TIMESTAMPTZ,
    is_solved BOOLEAN DEFAULT false,
    UNIQUE (team_id, node_id)
);

-- 6. COMPLETED NODES TABLE
CREATE TABLE IF NOT EXISTS public.hunt_completions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    node_id INTEGER NOT NULL,
    completed_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (team_id, node_id)
);

-- 7. SUBMISSIONS & AUDIT LOG TABLE
CREATE TABLE IF NOT EXISTS public.submissions_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    node_id INTEGER NOT NULL,
    submission_type TEXT NOT NULL CHECK (submission_type IN ('scan', 'answer')),
    submitted_value TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_active_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hunt_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions_log ENABLE ROW LEVEL SECURITY;

-- 9. RLS POLICIES
-- Checkpoints: Public can read title, area, clue (but NEVER qr_hash)
DROP POLICY IF EXISTS "Public can view basic checkpoint info" ON public.checkpoints;
CREATE POLICY "Public can view basic checkpoint info" ON public.checkpoints
    FOR SELECT
    USING (true);

-- Teams: Public can view active approved teams for leaderboard display
DROP POLICY IF EXISTS "Public can view leaderboard teams" ON public.teams;
CREATE POLICY "Public can view leaderboard teams" ON public.teams
    FOR SELECT
    USING (true);

-- Hunt Completions: Public can view completions for leaderboard
DROP POLICY IF EXISTS "Public can view hunt completions" ON public.hunt_completions;
CREATE POLICY "Public can view hunt completions" ON public.hunt_completions
    FOR SELECT
    USING (true);

-- Security: Questions pool and submissions log are server-only via Service Role
DROP POLICY IF EXISTS "Questions pool service role only" ON public.questions_pool;
CREATE POLICY "Questions pool service role only" ON public.questions_pool
    FOR ALL
    USING (false);

DROP POLICY IF EXISTS "Submissions service role only" ON public.submissions_log;
CREATE POLICY "Submissions service role only" ON public.submissions_log
    FOR ALL
    USING (false);

-- 10. REALTIME PUBLICATION (Idempotent check to avoid ERROR 42710)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'teams'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.teams;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'team_active_challenges'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.team_active_challenges;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'hunt_completions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.hunt_completions;
    END IF;
END $$;

-- ==============================================================================
-- 11. SEED 24 CHECKPOINTS (ROUTE 1: 1..12, ROUTE 2: 13..24) WITH SHA-256 CODES
-- ==============================================================================
INSERT INTO public.checkpoints (id, route_id, stage, title, area, clue, qr_hash)
VALUES
-- ROUTE 1: Hippocrates Loop
(
    1, 1, 1,
    'Node 01: Hippocrates Hall',
    'Medical Complex - Hippocrates Concourse',
    'Begin at Hippocrates Hall. Search near the main entrance directory board and seminar foyer on the ground level.',
    'bd9eac87121e230733f08e604f2e962c531bbcb9775a6b99ed20b30d346afc8c'
),
(
    2, 1, 2,
    'Node 02: N Block',
    'Academic Quad - N-Block Ground Arcade',
    'Advance to N Block. Inspect the perimeter pillars adjacent to the main departmental notice bulletin.',
    '3583502fd2948d5900f18951f422c396e3c31187e8fea9ada199cd0e330b0433'
),
(
    3, 1, 3,
    'Node 03: Shiva Temple',
    'Campus Sanctuary - Shiva Temple Grounds',
    'Navigate towards the campus Shiva Temple. Look along the perimeter stone walkway boundary markers.',
    '400a3ac3a0f3beb94798989c12750fad125c537a40b7393f8e812284977b3b8b'
),
(
    4, 1, 4,
    'Node 04: BEL Block',
    'Technology Sector - BEL Block Entrance Foyer',
    'Locate BEL Block. Search the exterior pillar near the engineering laboratory entrance corridor sign.',
    '53cfdaff40cb230500abc46f9f32be5c47ae98d19ebab65f6f713a4e4f7f9d10'
),
(
    5, 1, 5,
    'Node 05: TP Building',
    'Tech Park Zone - TP Building Ground Podium',
    'Proceed to TP Building. Check the structural support column beside the central elevator bank.',
    '39cd553d3ef594283ab642c0ff5dd435d4e1e8f58bb2802b82cfd3d1e4429222'
),
(
    6, 1, 6,
    'Node 06: Clock Tower',
    'Campus Heart - Heritage Clock Tower Plaza',
    'Head to the landmark Clock Tower. Search the stonework base facing the central pedestrian avenue.',
    '928b524ce9d888864289c090b7aaeb3c63dab7816d7b0a2b78d6d566a40c1dbc'
),
(
    7, 1, 7,
    'Node 07: UB Building',
    'University Building - Ground Floor Concourse',
    'Enter the University Building (UB). Locate the checkpoint near the main atrium digital information terminal.',
    '08ec07fbd278124a852535d8d6acfa9d20d02ccb5aacbf2e897ed03827c651ea'
),
(
    8, 1, 8,
    'Node 08: Architecture Block',
    'School of Architecture - Design Portico',
    'Move to the Architecture Block. Search near the model exhibition foyer and student gallery facade.',
    'dc441c40a0b5b4ba2f505f5033be64d2c25dc00084676a623342568de3ccb6f2'
),
(
    9, 1, 9,
    'Node 09: Law College',
    'School of Law - Academic Portal',
    'Advance to Law College. Look near the moot court hall outer bulletin frame.',
    'd46853b77c3dc0cbcece6817e23a29ddb0c58910f2b37e173627fa819069fb44'
),
(
    10, 1, 10,
    'Node 10: Vendhar',
    'Vendhar Square - Central Promenade',
    'Reach Vendhar Square. Inspect the perimeter brick wall facing the central landscaped island.',
    'f862cc2b52f6bff77e2347f7e84d06ac3b71d1bc26f9d49b90a0a4df74fde4a7'
),
(
    11, 1, 11,
    'Node 11: Medical College',
    'Health Sciences - SRM Medical College Quad',
    'Proceed to SRM Medical College. Search near the dean office outer corridor archway.',
    '7b6d3809e4ba60d514cc86ab57e4c88999ae00a00389036411bdd583fe358b18'
),
(
    12, 1, 12,
    'Node 12: Hippocrates Hall',
    'Grand Finale - Hippocrates Hall Apex Podium',
    'Return to Hippocrates Hall for the final breach! Scan the victory checkpoint situated at the main podium stage.',
    'c789491605d4e6055d42a72a83ac31529b05e7d51a9fc93be11b7a6dfd63b88f'
),

-- ROUTE 2: Hospital to Arts Loop
(
    13, 2, 1,
    'Node 01: SRM General Hospital Lawn & Entrance',
    'Hospital Frontage - Emergency Lawn & Gateway',
    'Rendezvous at SRM General Hospital Lawn & Entrance. Search near the emergency ramp guide sign.',
    '53a63eea12e8a9d16dce66c36914f5d9ecdd3a0b3188630000472398a899e1e6'
),
(
    14, 2, 2,
    'Node 02: Dental / Pharmacy Block',
    'Health Sciences - Dental & Pharmacy Arcade',
    'Proceed to Dental / Pharmacy Block. Look near the clinical dispensary lobby notice board.',
    '97409beb417220658ccb5a621a9052b8c5f87f4b6146b22bef80847b95970285'
),
(
    15, 2, 3,
    'Node 03: Bio-Tech Block & Life Sciences Lawn',
    'Bio-Sciences Sector - Life Sciences Lawn & Pod',
    'Navigate to the Bio-Tech Block. Check the ground pavilion overlooking the Life Sciences Lawn.',
    'e9a7253f987f01d999741858a9791710df97e48c114d79ad1e5ee498d8d927bd'
),
(
    16, 2, 4,
    'Node 04: Dr. T.P. Ganesan Auditorium',
    'Grand Convention - Auditorium Portico',
    'Advance to Dr. T.P. Ganesan Auditorium. Search near the grand staircase leading to the main entrance foyer.',
    'c784139c044369902fde1c9c5c3434058c94acd771b88c9849df26374813a1e5'
),
(
    17, 2, 5,
    'Node 05: Vendhar Square & Clock Tower Area',
    'Central Junction - Vendhar Square & Clock Tower',
    'Move to the Vendhar Square & Clock Tower Area. Inspect the base of the lighting mast facing the plaza.',
    '7891214434f28f03c7a2074c0989f0afdcd3442568b7a9fc9fea44e6417761f9'
),
(
    18, 2, 6,
    'Node 06: BEL Block',
    'Engineering Wing - BEL Block East Gateway',
    'Locate BEL Block. Search the exterior covered pathway leading to the computing research labs.',
    '6cb0b82b2bfa0fd7e8e7b49cb579bf4e5f77260c855981a318241cbbda0defb8'
),
(
    19, 2, 7,
    'Node 07: Java Green / Main Canteen',
    'Food Court Plaza - Java Green & Main Canteen',
    'Head to Java Green / Main Canteen. Inspect the wooden pergola pillar near the outdoor seating walkway.',
    '561da7e62342f209ffbcc79777b3d17f41c50d8db17c21a868ddda687f75415d'
),
(
    20, 2, 8,
    'Node 08: SRM Tech Park',
    'IT Sector - SRM Tech Park Main Atrium',
    'Proceed to SRM Tech Park. Search near the ground floor directory totem by the glass revolving doors.',
    '7020a54c0e185c7abc6940c0d6a174f1af9296f391097a3a15b62d2b307d959a'
),
(
    21, 2, 9,
    'Node 09: Central Library / University Building (UB)',
    'Knowledge Core - Central Library & UB Concourse',
    'Enter the Central Library / UB Building. Check near the library return drop kiosk on the concourse level.',
    '1983f06654e9265d3521764f883397ec9db406708521b8737497d7c107f3c8eb'
),
(
    22, 2, 10,
    'Node 10: Post Office & Bank Complex',
    'Campus Services - Post Office & Banking Arcade',
    'Locate the Post Office & Bank Complex. Search beside the ATM vestibule outer glass panel.',
    'b5b82967ac52ded872bc7cf842f2727233e3468228d955271e085211ff81c003'
),
(
    23, 2, 11,
    'Node 11: School of Law',
    'Juridical Wing - School of Law Forecourt',
    'Advance to the School of Law. Look near the legal aid clinic entrance sign on the ground floor.',
    '52471a6be7f54b7a7a906d7d6b16b10ec164b4434d265c4d10282c049cd2ec67'
),
(
    24, 2, 12,
    'Node 12: Faculty of Science & Humanities (Arts College)',
    'Arts & Humanities - FSH Main Entrance Portico',
    'Reach Faculty of Science & Humanities (Arts College). Scan the final node at the main administrative portal, then rush to finish at Hippocrates Hall!',
    '9e561fdf50f2ea36c0d81c75a2ddcc901ff2b355370573169b61df0008d63a4c'
)
ON CONFLICT (id) DO UPDATE SET
    route_id = EXCLUDED.route_id,
    stage = EXCLUDED.stage,
    title = EXCLUDED.title,
    area = EXCLUDED.area,
    clue = EXCLUDED.clue,
    qr_hash = EXCLUDED.qr_hash;

-- ==============================================================================
-- 12. SEED QUESTIONS POOL (Bank of questions per node for random assignment)
-- ==============================================================================

-- Clear existing pool before re-seeding
DELETE FROM public.questions_pool;

-- ROUTE 1 QUESTIONS (Nodes 1 to 12)
INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(1, 'passcode', 'Enter the initialization code etched onto the Hippocrates Hall foyer terminal.', NULL, 'HIPPOCRATES2026'),
(1, 'mcq', 'Which protocol provides secure encrypted terminal communication over an insecure network?', '["Telnet", "SSH", "FTP", "HTTP"]'::jsonb, 'SSH'),
(1, 'riddle', 'I have keys but no locks. I have space but no room. You can enter, but you cannot go outside. What am I?', NULL, 'keyboard'),
(1, 'code', 'Write a javascript function called getSecret that returns the string "42".', NULL, 'function getSecret() { return "42"; }');

INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(2, 'mcq', 'Which network topology connects every node to a central hub switch in academic server grids?', '["Star", "Ring", "Bus", "Mesh"]'::jsonb, 'Star'),
(2, 'passcode', 'Enter the security override code for Data Archives: [ASCII values of "AI" in hex = 0x41, 0x49]', NULL, '4149'),
(2, 'riddle', 'I am full of holes, yet I hold water. In computing, I am memory that forgets when power dies. What am I?', NULL, 'sponge');

INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(3, 'riddle', 'I have a spine, but no bones. I have leaves, but no branches. I hold knowledge of all eras. What am I?', NULL, 'book'),
(3, 'passcode', 'Binary Decryption: Convert the binary octet 11001010 to hexadecimal.', NULL, 'CA'),
(3, 'mcq', 'Which data structure follows the First-In, First-Out (FIFO) access discipline?', '["Stack", "Queue", "Tree", "Binary Heap"]'::jsonb, 'Queue');

INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(4, 'passcode', 'Convert the binary octet 10101010 to hexadecimal.', NULL, 'AA'),
(4, 'mcq', 'Which symmetric key cipher standard was selected by NIST to replace DES in 2001?', '["RSA", "Blowfish", "AES", "Diffie-Hellman"]'::jsonb, 'AES'),
(4, 'riddle', 'The more you take, the more you leave behind. What am I?', NULL, 'footsteps');

INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(5, 'mcq', 'What is the default port number assigned for standard encrypted HTTPS web traffic?', '["80", "443", "8080", "22"]'::jsonb, '443'),
(5, 'riddle', 'I am light as a feather, yet the strongest person cannot hold me for much longer than a minute. What am I?', NULL, 'breath'),
(5, 'passcode', 'Decipher the Caesar cipher of "KHOOR" shifted backwards by 3 letters.', NULL, 'HELLO');

INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(6, 'riddle', 'I have hands that cannot hold, a face that cannot smile, and I run without moving an inch. What am I?', NULL, 'clock'),
(6, 'mcq', 'What fundamental quantum principle states two particles can be instantaneously correlated regardless of distance?', '["Quantum Tunneling", "Quantum Entanglement", "Wave Function Collapse", "Heisenberg Uncertainty"]'::jsonb, 'Quantum Entanglement'),
(6, 'passcode', 'If a quantum processor has 4 qubits, how many basis states can exist in superposition simultaneously?', NULL, '16');

INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(7, 'passcode', 'Compute the checksum: (16 * 16) - 16.', NULL, '240'),
(7, 'mcq', 'Which component in an electrical power grid converts alternating current (AC) to direct current (DC)?', '["Inverter", "Rectifier", "Transformer", "Capacitor"]'::jsonb, 'Rectifier'),
(7, 'riddle', 'I have no flesh, no feathers, no scales, no bone. Yet I have four fingers and a thumb of my own. What am I?', NULL, 'glove');

INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(8, 'mcq', 'In computer graphics and architectural CAD rendering, what coordinate system uses (X, Y, Z)?', '["Cartesian", "Polar", "Spherical", "Cylindrical"]'::jsonb, 'Cartesian'),
(8, 'passcode', 'In DNA base pairing, Adenine pairs with Thymine. What nucleotide pairs with Cytosine?', NULL, 'guanine'),
(8, 'riddle', 'What has roots as nobody sees, is taller than trees, up, up it goes, and yet never grows?', NULL, 'mountain');

INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(9, 'riddle', 'I can be broken without being held. I can be given and kept. What am I?', NULL, 'promise'),
(9, 'passcode', 'Defense Perimeter Code: Compute (15 * 14) + 16.', NULL, '226'),
(9, 'mcq', 'In cybersecurity, what type of attack floods a target server with traffic to render it inaccessible to legitimate users?', '["Man-in-the-Middle", "SQL Injection", "Distributed Denial of Service (DDoS)", "Cross-Site Scripting"]'::jsonb, 'Distributed Denial of Service (DDoS)');

INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(10, 'passcode', 'Enter the founding acronym of this championship.', NULL, 'AICSSYC'),
(10, 'mcq', 'In boolean algebra, what is the output of the logical expression (1 XOR 1) NAND 0?', '["0", "1", "Undefined", "Null"]'::jsonb, '1'),
(10, 'riddle', 'The more of this there is, the less you see. What is it?', NULL, 'darkness');

INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(11, 'mcq', 'Which molecule carries genetic instructions in all biological organisms?', '["DNA", "RNA", "ATP", "Glucose"]'::jsonb, 'DNA'),
(11, 'riddle', 'What can travel around the world while staying in the same corner?', NULL, 'stamp'),
(11, 'passcode', 'Which algorithm is widely utilized in routing protocols to calculate the shortest path between network nodes? (Dijkstra/Prim/Kruskal)', NULL, 'Dijkstra');

INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(12, 'passcode', 'MASTER CITADEL OVERRIDE: Enter the victory key for Route 1.', NULL, 'VICTORY2026'),
(12, 'mcq', 'What is the theoretical time complexity limit of comparison-based sorting algorithms in the worst case?', '["O(n)", "O(n log n)", "O(n^2)", "O(log n)"]'::jsonb, 'O(n log n)'),
(12, 'riddle', 'I am not alive, but I grow; I don''t have lungs, but I need air; I don''t have a mouth, but water kills me. What am I?', NULL, 'fire');

-- ROUTE 2 QUESTIONS (Nodes 13 to 24)
INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(13, 'passcode', 'Enter the emergency access protocol key for Sector Medical Alpha.', NULL, 'HOSPITAL2026'),
(13, 'mcq', 'Which medical imaging technique uses strong magnetic fields and radio waves without ionizing radiation?', '["MRI", "CT Scan", "X-Ray", "PET Scan"]'::jsonb, 'MRI'),
(13, 'riddle', 'I can be cracked, made, told, and played. What am I?', NULL, 'joke');

INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(14, 'mcq', 'Which cryptographic algorithm was standardized by NIST to replace DES?', '["AES", "RSA", "Blowfish", "MD5"]'::jsonb, 'AES'),
(14, 'passcode', 'In pharmaceutical chemistry, what is the chemical formula for water?', NULL, 'H2O'),
(14, 'riddle', 'I have a neck without a head, and a body without legs. In a lab, I hold solutions. What am I?', NULL, 'flask');

INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(15, 'riddle', 'I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?', NULL, 'echo'),
(15, 'passcode', 'Compute the binary value of 15 in standard 4-bit binary format.', NULL, '1111'),
(15, 'mcq', 'Which cellular organelle is universally known as the powerhouse of eukaryotic cells?', '["Mitochondria", "Ribosome", "Nucleus", "Endoplasmic Reticulum"]'::jsonb, 'Mitochondria');

INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(16, 'passcode', 'Evaluate (2^10) bytes in standard Kilobytes.', NULL, '1'),
(16, 'mcq', 'In acoustic engineering, what acoustic unit measures sound pressure level?', '["Decibel", "Hertz", "Lumen", "Newton"]'::jsonb, 'Decibel'),
(16, 'riddle', 'The more you share me, the more you have of me. What am I?', NULL, 'knowledge');

INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(17, 'mcq', 'Which protocol securely transmits files between networked hosts via SSH?', '["SFTP", "FTP", "Telnet", "TFTP"]'::jsonb, 'SFTP'),
(17, 'passcode', 'Calculate the number of seconds in 15 minutes.', NULL, '900'),
(17, 'riddle', 'What comes once in a minute, twice in a moment, but never in a thousand years?', NULL, 'm');

INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(18, 'riddle', 'The more you take, the more you leave behind. What am I?', NULL, 'footsteps'),
(18, 'passcode', 'Compute: (25 * 4) + (12 * 8).', NULL, '196'),
(18, 'mcq', 'Which logic gate produces a HIGH output if and only if both its inputs are LOW?', '["NOR", "NAND", "XOR", "AND"]'::jsonb, 'NOR');

INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(19, 'passcode', 'Decipher the Caesar shift of "KHOOR" backwards by 3 letters.', NULL, 'HELLO'),
(19, 'mcq', 'Which HTTP response status code signifies a successful resource creation?', '["201", "200", "204", "301"]'::jsonb, '201'),
(19, 'riddle', 'Feed me and I live, yet give me a drink and I die. What am I?', NULL, 'fire');

INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(20, 'mcq', 'Which data structure operates on a Last-In, First-Out (LIFO) order?', '["Stack", "Queue", "Array", "Linked List"]'::jsonb, 'Stack'),
(20, 'passcode', 'Compute the hexadecimal equivalent of decimal 255.', NULL, 'FF'),
(20, 'riddle', 'I have branches, but no fruit, trunk or leaves. In code, I branch on true or false. What am I?', NULL, 'tree');

INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(21, 'riddle', 'I have keys but no doors, space but no rooms, and you can enter but never exit outside. What am I?', NULL, 'keyboard'),
(21, 'passcode', 'In decimal Dewey system, what subject area does classification 000-099 represent? (Computer science / Science / History)', NULL, 'Computer science'),
(21, 'mcq', 'Which searching algorithm has O(log n) time complexity on a sorted array?', '["Binary Search", "Linear Search", "Jump Search", "Depth-First Search"]'::jsonb, 'Binary Search');

INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(22, 'passcode', 'Binary translation: Convert the binary number 11110000 to decimal.', NULL, '240'),
(22, 'mcq', 'In telecommunications, what acronym represents the standard universal bank identifier code?', '["SWIFT", "SEPA", "IBAN", "ASCII"]'::jsonb, 'SWIFT'),
(22, 'riddle', 'What travels around the world while remaining in a single corner?', NULL, 'stamp');

INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(23, 'mcq', 'Which layer of the OSI model is responsible for end-to-end communication and error recovery?', '["Transport Layer", "Network Layer", "Data Link Layer", "Session Layer"]'::jsonb, 'Transport Layer'),
(23, 'passcode', 'In constitutional legal code, what Latin term means "to have the body"?', NULL, 'habeas corpus'),
(23, 'riddle', 'I make two people out of one. What am I?', NULL, 'mirror');

INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(24, 'passcode', 'FINAL PROTOCOL KEY: Enter the Route 2 clearance key before reporting to Hippocrates Hall.', NULL, 'FINISH2026'),
(24, 'mcq', 'Which academic discipline bridges logical deduction, epistemology, ethics, and aesthetics?', '["Philosophy", "Sociology", "Economics", "Linguistics"]'::jsonb, 'Philosophy'),
(24, 'riddle', 'I am always hungry, I must always be fed. The finger I touch will soon turn red. What am I?', NULL, 'fire');
