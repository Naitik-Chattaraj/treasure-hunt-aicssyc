-- ==============================================================================
-- AICSSYC TREASURE HUNT - DATABASE SCHEMA (ROUTE 01: HIPPOCRATES LOOP)
-- Dedicated Supabase Project for Route 1 Horizontal Scaling & Egress Isolation
-- Checkpoints: Nodes 1 to 12 | Route ID: 1
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TEAMS TABLE (Route 1 Cohort)
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

-- Ensure assigned_route and device_id exist for pre-existing tables
ALTER TABLE public.teams 
    ADD COLUMN IF NOT EXISTS assigned_route INTEGER NOT NULL DEFAULT 1 CHECK (assigned_route IN (1, 2));

ALTER TABLE public.teams
    ADD COLUMN IF NOT EXISTS device_id TEXT;

-- 3. CHECKPOINTS TABLE (12 Physical Nodes for Route 1)
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

-- Ensure checkpoints constraints allow nodes 1..24 and dual-route uniqueness
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

-- 4. QUESTIONS POOL (Bank of questions for Route 1 nodes 1..12)
CREATE TABLE IF NOT EXISTS public.questions_pool (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id INTEGER NOT NULL REFERENCES public.checkpoints(id) ON DELETE CASCADE,
    challenge_type TEXT NOT NULL CHECK (challenge_type IN ('passcode', 'mcq', 'riddle', 'code')),
    question TEXT NOT NULL,
    options JSONB, -- For MCQ options
    answer TEXT NOT NULL, -- Secret answer verified strictly on server
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Fix check constraint on pre-existing questions_pool table so 'code', 'passcode', 'mcq', 'riddle' are all accepted
DO $$
BEGIN
    ALTER TABLE public.questions_pool DROP CONSTRAINT IF EXISTS questions_pool_challenge_type_check;
    ALTER TABLE public.questions_pool ADD CONSTRAINT questions_pool_challenge_type_check 
        CHECK (challenge_type IN ('passcode', 'mcq', 'riddle', 'code'));
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- 5. TEAM ACTIVE CHALLENGES (Etched question per team upon QR scan)
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

-- 6. HUNT COMPLETIONS TABLE
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

-- 8. PERFORMANCE INDEXES (Minimize CPU & Egress Overhead)
CREATE INDEX IF NOT EXISTS idx_r1_teams_uid ON public.teams (uid);
CREATE INDEX IF NOT EXISTS idx_r1_teams_status ON public.teams (status);
CREATE INDEX IF NOT EXISTS idx_r1_checkpoints_qr_hash ON public.checkpoints (qr_hash);
CREATE INDEX IF NOT EXISTS idx_r1_checkpoints_route_stage ON public.checkpoints (route_id, stage);
CREATE INDEX IF NOT EXISTS idx_r1_active_challenges_team ON public.team_active_challenges (team_id, node_id);
CREATE INDEX IF NOT EXISTS idx_r1_hunt_completions_team ON public.hunt_completions (team_id);
CREATE INDEX IF NOT EXISTS idx_r1_questions_pool_node ON public.questions_pool (node_id);
CREATE INDEX IF NOT EXISTS idx_r1_submissions_team ON public.submissions_log (team_id);

-- 9. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_active_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hunt_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions_log ENABLE ROW LEVEL SECURITY;

-- Checkpoints: Public can no longer view checkpoint info
DROP POLICY IF EXISTS "Public can view basic checkpoint info" ON public.checkpoints;

-- Teams: Public can no longer view teams for leaderboard display
DROP POLICY IF EXISTS "Public can view leaderboard teams" ON public.teams;

-- Hunt Completions: Public can no longer view completions for leaderboard
DROP POLICY IF EXISTS "Public can view hunt completions" ON public.hunt_completions;

-- Server-only via Service Role Key
DROP POLICY IF EXISTS "Questions pool service role only" ON public.questions_pool;
CREATE POLICY "Questions pool service role only" ON public.questions_pool
    FOR ALL USING (false);

DROP POLICY IF EXISTS "Submissions service role only" ON public.submissions_log;
CREATE POLICY "Submissions service role only" ON public.submissions_log
    FOR ALL USING (false);

-- 10. REALTIME PUBLICATION
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

CREATE OR REPLACE FUNCTION public.claim_attempt(team_id UUID, lock_seconds INTEGER DEFAULT 1)
RETURNS UUID AS $$
DECLARE
  returned_id UUID;
BEGIN
  UPDATE public.teams
  SET cooldown_until = now() + (lock_seconds || ' seconds')::interval
  WHERE id = team_id AND (cooldown_until IS NULL OR cooldown_until < now())
  RETURNING id INTO returned_id;
  
  RETURN returned_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.claim_attempt(UUID, INTEGER) TO authenticated, service_role, anon;

-- 11. CLEANUP LEGACY ROUTE 2 DATA FROM ROUTE 1 DATABASE (If previously co-located)
DELETE FROM public.team_active_challenges WHERE node_id >= 13;
DELETE FROM public.hunt_completions WHERE node_id >= 13;
DELETE FROM public.submissions_log WHERE node_id >= 13;
DELETE FROM public.questions_pool WHERE node_id >= 13;
DELETE FROM public.checkpoints WHERE route_id = 2 OR id >= 13;

-- ==============================================================================
-- 12. SEED ROUTE 1 CHECKPOINTS (NODES 01 TO 12)
-- ==============================================================================
INSERT INTO public.checkpoints (id, route_id, stage, title, area, clue, qr_hash)
VALUES
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
)
ON CONFLICT (id) DO UPDATE SET
    route_id = EXCLUDED.route_id,
    stage = EXCLUDED.stage,
    title = EXCLUDED.title,
    area = EXCLUDED.area,
    clue = EXCLUDED.clue,
    qr_hash = EXCLUDED.qr_hash;

-- ==============================================================================
-- 13. SEED ROUTE 1 QUESTIONS POOL (NODES 01 TO 12)
-- ==============================================================================
DELETE FROM public.questions_pool WHERE node_id <= 12;

INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(1, 'passcode', 'Enter the initialization code etched onto the Hippocrates Hall foyer terminal.', NULL, 'HIPPOCRATES2026'),
(1, 'mcq', 'Which protocol provides secure encrypted terminal communication over an insecure network?', '["Telnet", "SSH", "FTP", "HTTP"]'::jsonb, 'SSH'),
(1, 'riddle', 'I have keys but no locks. I have space but no room. You can enter, but you cannot go outside. What am I?', NULL, 'keyboard'),
(1, 'passcode', 'Cyber Code: Convert the hexadecimal octet 0x2A to decimal.', NULL, '42');

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
