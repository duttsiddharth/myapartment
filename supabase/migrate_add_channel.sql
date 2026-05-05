-- ═══════════════════════════════════════════════════════════════════
-- Migration: Add channel_name to calls table (needed for Agora voice)
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS channel_name text;
