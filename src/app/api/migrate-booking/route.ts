import { getDb } from "@/lib/supabase/db";

export async function GET() {
  const db = getDb();
  await db`
    ALTER TABLE clinic_states 
    ADD COLUMN IF NOT EXISTS booking_closed_today boolean NOT NULL DEFAULT false, 
    ADD COLUMN IF NOT EXISTS booking_closed_tomorrow boolean NOT NULL DEFAULT false;
  `;
  return Response.json({ success: true });
}
