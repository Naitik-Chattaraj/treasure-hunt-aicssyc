-- ==============================================================================
-- AICSSYC TREASURE HUNT - DATABASE SCHEMA (ROUTE 02: HOSPITAL TO ARTS LOOP)
-- Dedicated Supabase Project for Route 2 Horizontal Scaling & Egress Isolation
-- Checkpoints: Nodes 13 to 24 (Stages 1 to 12) | Route ID: 2
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TEAMS TABLE (Route 2 Cohort)
CREATE TABLE IF NOT EXISTS public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uid TEXT UNIQUE NOT NULL,
    team_name TEXT NOT NULL,
    team_lead TEXT NOT NULL,
    members JSONB DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    assigned_route INTEGER NOT NULL DEFAULT 2 CHECK (assigned_route IN (1, 2)),
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

-- Ensure assigned_route exists and defaults to 2 for this database
ALTER TABLE public.teams 
    ADD COLUMN IF NOT EXISTS assigned_route INTEGER NOT NULL DEFAULT 2 CHECK (assigned_route IN (1, 2));

ALTER TABLE public.teams
    ADD COLUMN IF NOT EXISTS device_id TEXT;

-- 3. CHECKPOINTS TABLE (12 Physical Nodes for Route 2: IDs 13..24)
CREATE TABLE IF NOT EXISTS public.checkpoints (
    id INTEGER PRIMARY KEY CHECK (id >= 1 AND id <= 24),
    route_id INTEGER NOT NULL DEFAULT 2 CHECK (route_id IN (1, 2)),
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

-- 4. QUESTIONS POOL (Bank of questions for Route 2 nodes 13..24)
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
CREATE INDEX IF NOT EXISTS idx_r2_teams_uid ON public.teams (uid);
CREATE INDEX IF NOT EXISTS idx_r2_teams_status ON public.teams (status);
CREATE INDEX IF NOT EXISTS idx_r2_checkpoints_qr_hash ON public.checkpoints (qr_hash);
CREATE INDEX IF NOT EXISTS idx_r2_checkpoints_route_stage ON public.checkpoints (route_id, stage);
CREATE INDEX IF NOT EXISTS idx_r2_active_challenges_team ON public.team_active_challenges (team_id, node_id);
CREATE INDEX IF NOT EXISTS idx_r2_hunt_completions_team ON public.hunt_completions (team_id);
CREATE INDEX IF NOT EXISTS idx_r2_questions_pool_node ON public.questions_pool (node_id);
CREATE INDEX IF NOT EXISTS idx_r2_submissions_team ON public.submissions_log (team_id);

-- 9. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_active_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hunt_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions_log ENABLE ROW LEVEL SECURITY;

-- Checkpoints: Public can read title, area, clue (but NEVER qr_hash)
DROP POLICY IF EXISTS "Public can view basic checkpoint info" ON public.checkpoints;
CREATE POLICY "Public can view basic checkpoint info" ON public.checkpoints
    FOR SELECT USING (true);

-- Teams: Public can view active approved teams for leaderboard display
DROP POLICY IF EXISTS "Public can view leaderboard teams" ON public.teams;
CREATE POLICY "Public can view leaderboard teams" ON public.teams
    FOR SELECT USING (true);

-- Hunt Completions: Public can view completions for leaderboard
DROP POLICY IF EXISTS "Public can view hunt completions" ON public.hunt_completions;
CREATE POLICY "Public can view hunt completions" ON public.hunt_completions
    FOR SELECT USING (true);

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

-- 11. CLEANUP LEGACY ROUTE 1 DATA IF RUNNING ON A PRE-EXISTING DATABASE
DELETE FROM public.questions_pool WHERE node_id <= 12;
DELETE FROM public.checkpoints WHERE route_id = 1 OR id <= 12;

-- ==============================================================================
-- 12. SEED ROUTE 2 CHECKPOINTS (NODES 13 TO 24, STAGES 01 TO 12)
-- ==============================================================================
INSERT INTO public.checkpoints (id, route_id, stage, title, area, clue, qr_hash)
VALUES
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
-- 13. SEED ROUTE 2 QUESTIONS POOL (NODES 13 TO 24)
-- ==============================================================================
DELETE FROM public.questions_pool WHERE node_id >= 13;

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
