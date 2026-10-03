const fs = require('fs');
const path = require('path');
const p = path.resolve('src/lib/db/queue-store.ts');
let text = fs.readFileSync(p, 'utf8');

text = text.replace(
  'emergency_closed: false,\n    emergency_message: "",',
  'emergency_closed: false,\n    emergency_message: "",\n    booking_closed_today: false,\n    booking_closed_tomorrow: false,'
);

text = text.replace(
  'emergencyClosed: clinicDocument?.emergency_closed ?? false,\n    emergencyMessage: clinicDocument?.emergency_message ?? "",',
  'emergencyClosed: clinicDocument?.emergency_closed ?? false,\n    emergencyMessage: clinicDocument?.emergency_message ?? "",\n    bookingClosedToday: clinicDocument?.booking_closed_today ?? false,\n    bookingClosedTomorrow: clinicDocument?.booking_closed_tomorrow ?? false,'
);

text = text.replace(
  /emergency_closed,\n\s*emergency_message,/g,
  'emergency_closed,\n      emergency_message,\n      booking_closed_today,\n      booking_closed_tomorrow,'
);

text = text.replace(
  /\$\{document\.emergency_closed\},\n\s*\$\{document\.emergency_message\},/g,
  '${document.emergency_closed},\n      ${document.emergency_message},\n      ${document.booking_closed_today},\n      ${document.booking_closed_tomorrow},'
);

text = text.replace(
  /emergency_closed = \$\{nextClinicDocument\.emergency_closed\},\n\s*emergency_message = \$\{nextClinicDocument\.emergency_message\},/g,
  'emergency_closed = ${nextClinicDocument.emergency_closed},\n          emergency_message = ${nextClinicDocument.emergency_message},\n          booking_closed_today = ${nextClinicDocument.booking_closed_today},\n          booking_closed_tomorrow = ${nextClinicDocument.booking_closed_tomorrow},'
);

// We should also add updateClinicBookingState function
text += `
export async function updateClinicBookingState(
  clinicId: ClinicId,
  input: { bookingClosedToday?: boolean; bookingClosedTomorrow?: boolean },
) {
  const db = getDb();
  const timestamp = new Date().toISOString();

  await ensureClinicInitialized(db, clinicId);
  
  const updates = [];
  if (input.bookingClosedToday !== undefined) updates.push(db\`booking_closed_today = \${input.bookingClosedToday}\`);
  if (input.bookingClosedTomorrow !== undefined) updates.push(db\`booking_closed_tomorrow = \${input.bookingClosedTomorrow}\`);
  
  if (updates.length > 0) {
    await db\`
      update clinic_states
      set
        \${db.join(updates, db\`, \`)},
        last_updated = \${timestamp},
        last_synced_at = \${timestamp}
      where clinic_id = \${clinicId}
    \`;
  }

  return getRemoteClinicState(clinicId);
}
`;

fs.writeFileSync(p, text, 'utf8');
console.log('Updated queue-store.ts');
