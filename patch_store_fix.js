const fs = require('fs');
const path = require('path');
const p = path.resolve('src/lib/db/queue-store.ts');
let text = fs.readFileSync(p, 'utf8');

const newMethod = `
export async function updateClinicBookingState(
  clinicId: ClinicId,
  input: { bookingClosedToday?: boolean; bookingClosedTomorrow?: boolean },
) {
  const db = getDb();
  const timestamp = new Date().toISOString();

  await ensureClinicInitialized(db, clinicId);
  
  if (input.bookingClosedToday !== undefined && input.bookingClosedTomorrow !== undefined) {
    await db\`
      update clinic_states
      set booking_closed_today = \${input.bookingClosedToday},
          booking_closed_tomorrow = \${input.bookingClosedTomorrow},
          last_updated = \${timestamp},
          last_synced_at = \${timestamp}
      where clinic_id = \${clinicId}
    \`;
  } else if (input.bookingClosedToday !== undefined) {
    await db\`
      update clinic_states
      set booking_closed_today = \${input.bookingClosedToday},
          last_updated = \${timestamp},
          last_synced_at = \${timestamp}
      where clinic_id = \${clinicId}
    \`;
  } else if (input.bookingClosedTomorrow !== undefined) {
    await db\`
      update clinic_states
      set booking_closed_tomorrow = \${input.bookingClosedTomorrow},
          last_updated = \${timestamp},
          last_synced_at = \${timestamp}
      where clinic_id = \${clinicId}
    \`;
  }

  return getRemoteClinicState(clinicId);
}
`;

text = text.replace(/export async function updateClinicBookingState[\s\S]*?return getRemoteClinicState\(clinicId\);\n}/m, newMethod.trim());
fs.writeFileSync(p, text, 'utf8');
