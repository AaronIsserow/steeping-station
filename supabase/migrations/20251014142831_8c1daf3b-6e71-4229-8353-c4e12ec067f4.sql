-- Add water_ml column to tea_machine_state table
ALTER TABLE public.tea_machine_state 
ADD COLUMN IF NOT EXISTS water_ml INTEGER NOT NULL DEFAULT 0;