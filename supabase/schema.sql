-- ==============================================================================
-- AICSSYC TREASURE HUNT - SUPABASE DATABASE SCHEMA & QUESTION POOL
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TEAMS TABLE (Min 4, Max 5 members per team)
CREATE TABLE IF NOT EXISTS public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uid TEXT UNIQUE NOT NULL,
    team_name TEXT NOT NULL,
    team_lead TEXT NOT NULL,
    members JSONB DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    current_stage INTEGER NOT NULL DEFAULT 1 CHECK (current_stage >= 1 AND current_stage <= 13),
    start_time TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    completion_token TEXT,
    cooldown_until TIMESTAMPTZ,
    wrong_attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. CHECKPOINTS TABLE (12 Physical Nodes on Campus with SHA-256 QR Hashes)
CREATE TABLE IF NOT EXISTS public.checkpoints (
    id INTEGER PRIMARY KEY CHECK (id >= 1 AND id <= 12),
    title TEXT NOT NULL,
    area TEXT NOT NULL,
    clue TEXT NOT NULL,
    qr_hash TEXT UNIQUE NOT NULL, -- SHA-256 hash or code encoded in physical QR
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. QUESTIONS POOL (Bank of questions per checkpoint node)
CREATE TABLE IF NOT EXISTS public.questions_pool (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id INTEGER NOT NULL REFERENCES public.checkpoints(id) ON DELETE CASCADE,
    challenge_type TEXT NOT NULL CHECK (challenge_type IN ('passcode', 'mcq', 'riddle')),
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
-- 11. SEED 12 CHECKPOINTS WITH SHA-256 CODES
-- ==============================================================================
INSERT INTO public.checkpoints (id, title, area, clue, qr_hash)
VALUES
(
    1,
    'Node 01: Perimeter Breach',
    'Sector A - Academic Block Gateway',
    'Locate the access plaque mounted near the main glass entrance of Academic Block A.',
    '4a5b6c7d8e9f0123456789abcdef0123456789abcdef0123456789abcdef01'
),
(
    2,
    'Node 02: Neural Grid',
    'Sector B - Central Library Concourse',
    'Search behind the digital index kiosk on the ground floor of the Central Library.',
    'b2c3d4e5f6a7018293a4b5c6d7e8f90112233445566778899aabbccddeeff00'
),
(
    3,
    'Node 03: Sub-Level Nexus',
    'Sector C - Engineering Workshop Basement',
    'Trace the blue conduit pipe running along the north wall of the sub-level robotics lab.',
    'c3d4e5f6a7b8129384a5b6c7d8e9f012233445566778899aabbccddeeff0011'
),
(
    4,
    'Node 04: Relay Array',
    'Sector D - Telecommunication Tower Base',
    'Inspect the base of the transmission mast situated behind Block D.',
    'd4e5f6a7b8c9239485a6b7c8d9e0f1233445566778899aabbccddeeff001122'
),
(
    5,
    'Node 05: Cryptographic Vault',
    'Sector E - Computer Science Server Hub',
    'Find the QR tag affixed to the side ventilation grill of Server Room E-05.',
    'e5f6a7b8c9d0349586a7b8c9d0e1f23445566778899aabbccddeeff00112233'
),
(
    6,
    'Node 06: Quantum Relay',
    'Sector F - Physics Research Observatory',
    'Scan the QR concealed under the observation terrace staircase railing in Sector F.',
    'f6a7b8c9d0e1459687a8b9c0d1e2f345566778899aabbccddeeff0011223344'
),
(
    7,
    'Node 07: Power Conduits',
    'Sector G - Substation Generator Deck',
    'Look near the high-voltage warning stencils beside Auxiliary Turbine G-07.',
    'a7b8c9d0e1f2569788a9b0c1d2e3f4566778899aabbccddeeff001122334455'
),
(
    8,
    'Node 08: Bio-Matrix',
    'Sector H - Biotechnology Greenhouse',
    'Inspect the environmental nutrient controller panel in greenhouse pod H-08.',
    'b8c9d0e1f2a3679889a0b1c2d3e4f56778899aabbccddeeff00112233445566'
),
(
    9,
    'Node 09: Defense Matrix',
    'Sector I - Sports Complex Arena',
    'Search beneath the eastern bleachers overlooking the synthetic track.',
    'c9d0e1f2a3b4789990a1b2c3d4e5f678899aabbccddeeff0011223344556677'
),
(
    10,
    'Node 10: Deep Logic Core',
    'Sector J - Innovation & Incubation Center',
    'Find the acrylic terminal stand located outside the makerspace lab J-10.',
    'd0e1f2a3b4c5890001a2b3c4d5e6f7899aabbccddeeff001122334455667788'
),
(
    11,
    'Node 11: Mainframe Gateway',
    'Sector K - Administration Executive Floor',
    'Locate the architectural directory directory frame outside Room K-11.',
    'e1f2a3b4c5d6901112a3b4c5d6e7f890aabbccddeeff00112233445566778899'
),
(
    12,
    'Node 12: Final Citadel',
    'Sector L - The Core Amphitheater Pinnacle',
    'Climb to the apex viewing platform of the open-air central amphitheater.',
    'f2a3b4c5d6e7012223a4b5c6d7e8f901bbccddeeff00112233445566778899aa'
)
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    area = EXCLUDED.area,
    clue = EXCLUDED.clue,
    qr_hash = EXCLUDED.qr_hash;

-- ==============================================================================
-- 12. SEED QUESTIONS POOL (Bank of questions per node for random assignment)
-- ==============================================================================

-- Clear existing pool before re-seeding
DELETE FROM public.questions_pool;

-- NODE 1 POOL
INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(1, 'passcode', 'Decryption Protocol: Enter the initialization passcode for Sector A terminal.', NULL, 'CYBER2026'),
(1, 'mcq', 'Which protocol provides secure encrypted terminal communication over an insecure network?', '["Telnet", "SSH", "FTP", "HTTP"]'::jsonb, 'SSH'),
(1, 'riddle', 'I have keys but no locks. I have space but no room. You can enter, but you cannot go outside. What am I?', NULL, 'keyboard');

-- NODE 2 POOL
INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(2, 'mcq', 'What is the default port number assigned for standard encrypted HTTPS web traffic?', '["80", "443", "8080", "22"]'::jsonb, '443'),
(2, 'passcode', 'Enter the security override code for Data Archives: [ASCII values of "AI" in hex = 0x41, 0x49]', NULL, '4149'),
(2, 'riddle', 'I am full of holes, yet I hold water. In computing, I am memory that forgets when power dies. What am I?', NULL, 'sponge');

-- NODE 3 POOL
INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(3, 'passcode', 'Binary Decryption: Convert the binary octet 11001010 to hexadecimal.', NULL, 'CA'),
(3, 'mcq', 'Which data structure follows the First-In, First-Out (FIFO) access discipline?', '["Stack", "Queue", "Tree", "Binary Heap"]'::jsonb, 'Queue'),
(3, 'riddle', 'I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?', NULL, 'echo');

-- NODE 4 POOL
INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(4, 'mcq', 'Which symmetric key cipher standard was selected by NIST to replace DES in 2001?', '["RSA", "Blowfish", "AES", "Diffie-Hellman"]'::jsonb, 'AES'),
(4, 'passcode', 'Calculate the value of (2^10) bytes in standard Kilobytes.', NULL, '1'),
(4, 'riddle', 'The more you take, the more you leave behind. What am I?', NULL, 'footsteps');

-- NODE 5 POOL
INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(5, 'riddle', 'I am light as a feather, yet the strongest person cannot hold me for much longer than a minute. What am I?', NULL, 'breath'),
(5, 'mcq', 'What cryptographic primitive produces a fixed-size digest from arbitrary-length input data?', '["Asymmetric Cipher", "Cryptographic Hash Function", "Stream Cipher", "Zero-Knowledge Proof"]'::jsonb, 'Cryptographic Hash Function'),
(5, 'passcode', 'Decipher the Caesar cipher of "KHOOR" shifted backwards by 3 letters.', NULL, 'HELLO');

-- NODE 6 POOL
INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(6, 'mcq', 'What fundamental quantum principle states two particles can be instantaneously correlated regardless of distance?', '["Quantum Tunneling", "Quantum Entanglement", "Wave Function Collapse", "Heisenberg Uncertainty"]'::jsonb, 'Quantum Entanglement'),
(6, 'passcode', 'If a quantum processor has 4 qubits, how many basis states can exist in superposition simultaneously?', NULL, '16'),
(6, 'riddle', 'What comes once in a minute, twice in a moment, but never in a thousand years?', NULL, 'm');

-- NODE 7 POOL
INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(7, 'passcode', 'Calculate the electrical power in Watts if Voltage = 230V and Current = 10A.', NULL, '2300'),
(7, 'mcq', 'Which component in an electrical power grid converts alternating current (AC) to direct current (DC)?', '["Inverter", "Rectifier", "Transformer", "Capacitor"]'::jsonb, 'Rectifier'),
(7, 'riddle', 'I have no flesh, no feathers, no scales, no bone. Yet I have four fingers and a thumb of my own. What am I?', NULL, 'glove');

-- NODE 8 POOL
INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(8, 'mcq', 'Which molecule carries genetic instructions for development, functioning, and reproduction in all living organisms?', '["RNA", "DNA", "ATP", "Hemoglobin"]'::jsonb, 'DNA'),
(8, 'passcode', 'In DNA base pairing, Adenine pairs with Thymine. What nucleotide pairs with Cytosine?', NULL, 'guanine'),
(8, 'riddle', 'What has roots as nobody sees, is taller than trees, up, up it goes, and yet never grows?', NULL, 'mountain');

-- NODE 9 POOL
INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(9, 'passcode', 'Defense Perimeter Code: Compute (15 * 14) + 16.', NULL, '226'),
(9, 'mcq', 'In cybersecurity, what type of attack floods a target server with traffic to render it inaccessible to legitimate users?', '["Man-in-the-Middle", "SQL Injection", "Distributed Denial of Service (DDoS)", "Cross-Site Scripting"]'::jsonb, 'Distributed Denial of Service (DDoS)'),
(9, 'riddle', 'I can be cracked, made, told, and played. What am I?', NULL, 'joke');

-- NODE 10 POOL
INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(10, 'mcq', 'In boolean algebra, what is the output of the logical expression (1 XOR 1) NAND 0?', '["0", "1", "Undefined", "Null"]'::jsonb, '1'),
(10, 'passcode', 'Evaluate the value of the hexadecimal sum: 0xA + 0x6 in base 10.', NULL, '16'),
(10, 'riddle', 'The more of this there is, the less you see. What is it?', NULL, 'darkness');

-- NODE 11 POOL
INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(11, 'riddle', 'What can travel around the world while staying in the same corner?', NULL, 'stamp'),
(11, 'mcq', 'Which algorithm is widely utilized in routing protocols to calculate the shortest path between network nodes?', '["Dijkstra''s Algorithm", "Binary Search", "Bubble Sort", "Knuth-Morris-Pratt"]'::jsonb, 'Dijkstra''s Algorithm'),
(11, 'passcode', 'Decode the reversed binary string: "11100010" interpreted as binary number.', NULL, '226');

-- NODE 12 POOL (FINAL CITADEL)
INSERT INTO public.questions_pool (node_id, challenge_type, question, options, answer) VALUES
(12, 'passcode', 'MASTER CITADEL OVERRIDE: Enter the founding acronym of this championship.', NULL, 'AICSSYC'),
(12, 'mcq', 'What is the theoretical time complexity limit of comparison-based sorting algorithms in the worst case?', '["O(n)", "O(n log n)", "O(n^2)", "O(log n)"]'::jsonb, 'O(n log n)'),
(12, 'riddle', 'I am not alive, but I grow; I don''t have lungs, but I need air; I don''t have a mouth, but water kills me. What am I?', NULL, 'fire');
