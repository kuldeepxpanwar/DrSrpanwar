import { getDb } from './src/lib/supabase/db'; 
async function run() { 
  const db = getDb(); 
  await db`ALTER TABLE clinic_states ADD COLUMN IF NOT EXISTS booking_closed_today boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS booking_closed_tomorrow boolean NOT NULL DEFAULT false;`; 
  console.log('Columns added!'); 
  process.exit(0); 
} 
run();
