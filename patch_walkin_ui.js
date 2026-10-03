const fs = require('fs');
const path = require('path');
const p = path.resolve('src/app/walkin/page.tsx');
let text = fs.readFileSync(p, 'utf8');

text = text.replace(
  'const { activeClinic, activeClinicId, createWalkIn, isOnline, syncInFlight } = useClinic();',
  'const { activeClinic, activeClinicId, createWalkIn, isOnline, syncInFlight, state } = useClinic();'
);

text = text.replace(
  '{!confirmation && schedule.status === "on_leave" ? (',
  '{!confirmation && (schedule.status === "on_leave" || state?.emergencyClosed) ? ('
);

text = text.replace(
  '{schedule.message}',
  '{state?.emergencyClosed ? (state?.emergencyMessage || t("emergency", "defaultMessage")) : schedule.message}'
);

fs.writeFileSync(p, text, 'utf8');
console.log('Updated walkin page.tsx');
