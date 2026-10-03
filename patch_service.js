const fs = require('fs');
const path = require('path');
const p = path.resolve('src/features/clinic/services/clinic-service.ts');
let text = fs.readFileSync(p, 'utf8');

const newMethod = `
  async setBookingState(
    clinicId: ClinicId,
    input: { bookingClosedToday?: boolean; bookingClosedTomorrow?: boolean }
  ) {
    if (hasRemoteSyncConfig()) {
      const response = await apiClient.patch<{ state: ClinicState }>(
        \`/api/clinics/\${clinicId}/state/booking\`,
        input,
      );
      return persistState(sortQueueState(response.data.state));
    }
    const state = await readClinicState(clinicId);
    return persistState({ ...state, ...input });
  },
`;

text = text.replace('async setEmergencyState(', newMethod + '\n  async setEmergencyState(');
fs.writeFileSync(p, text, 'utf8');
console.log('Updated clinic-service.ts');
