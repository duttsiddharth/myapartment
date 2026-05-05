-- ═══════════════════════════════════════════════════════════════════
-- MyApartment — Reset & Re-seed Flats (No Blocks, Simple Flat Numbers)
-- Run this in Supabase SQL Editor
-- Adjust the flat numbers to match YOUR actual apartment
-- ═══════════════════════════════════════════════════════════════════

-- Step 1: Remove block/floor/unit constraints from flats table
-- (safe to run even if columns don't exist)
ALTER TABLE public.flats DROP COLUMN IF EXISTS block;
ALTER TABLE public.flats DROP COLUMN IF EXISTS unit;

-- Step 2: Clear existing flats (profiles foreign key — set null first)
UPDATE public.profiles SET flat_id = NULL;
DELETE FROM public.flats;

-- Step 3: Re-insert with simple flat numbers
-- Format: just the flat number as a string e.g. '101', '907', '1204'
-- EDIT THIS LIST to match your actual flat numbers

INSERT INTO public.flats (id, floor, resident_name) VALUES
-- Ground Floor
('001', 0, 'Vacant'),
('002', 0, 'Vacant'),
('003', 0, 'Vacant'),
('004', 0, 'Vacant'),

-- Floor 1
('101', 1, 'Vacant'),
('102', 1, 'Vacant'),
('103', 1, 'Vacant'),
('104', 1, 'Vacant'),

-- Floor 2
('201', 2, 'Vacant'),
('202', 2, 'Vacant'),
('203', 2, 'Vacant'),
('204', 2, 'Vacant'),

-- Floor 3
('301', 3, 'Vacant'),
('302', 3, 'Vacant'),
('303', 3, 'Vacant'),
('304', 3, 'Vacant'),

-- Floor 4
('401', 4, 'Vacant'),
('402', 4, 'Vacant'),
('403', 4, 'Vacant'),
('404', 4, 'Vacant'),

-- Floor 5
('501', 5, 'Vacant'),
('502', 5, 'Vacant'),
('503', 5, 'Vacant'),
('504', 5, 'Vacant'),

-- Floor 6
('601', 6, 'Vacant'),
('602', 6, 'Vacant'),
('603', 6, 'Vacant'),
('604', 6, 'Vacant'),

-- Floor 7
('701', 7, 'Vacant'),
('702', 7, 'Vacant'),
('703', 7, 'Vacant'),
('704', 7, 'Vacant'),

-- Floor 8
('801', 8, 'Vacant'),
('802', 8, 'Vacant'),
('803', 8, 'Vacant'),
('804', 8, 'Vacant'),

-- Floor 9
('901', 9, 'Vacant'),
('902', 9, 'Vacant'),
('903', 9, 'Vacant'),
('904', 9, 'Vacant'),
('905', 9, 'Vacant'),
('906', 9, 'Vacant'),
('907', 9, 'Vacant'),

-- Floor 10
('1001', 10, 'Vacant'),
('1002', 10, 'Vacant'),
('1003', 10, 'Vacant'),
('1004', 10, 'Vacant')

ON CONFLICT (id) DO NOTHING;

-- Step 4: Verify
SELECT id, floor, resident_name FROM public.flats ORDER BY floor, id;
