-- Migration: Add arrived_at to queue_entries for "I have arrived" feature

ALTER TABLE public.queue_entries 
ADD COLUMN IF NOT EXISTS arrived_at timestamptz;

-- Optional: Create an index to quickly find people who have arrived (useful for staff dashboard sorting/filtering)
CREATE INDEX IF NOT EXISTS queue_entries_arrived_at_idx 
ON public.queue_entries (arrived_at);
