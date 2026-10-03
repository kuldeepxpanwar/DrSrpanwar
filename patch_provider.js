const fs = require('fs');
const path = require('path');
const p = path.resolve('src/features/clinic/state/clinic-provider.tsx');
let text = fs.readFileSync(p, 'utf8');

text = text.replace(
  'resetClinicState: () => Promise<ClinicState>;\n  setEmergencyState: (input: {',
  'resetClinicState: () => Promise<ClinicState>;\n  setBookingState: (input: { bookingClosedToday?: boolean; bookingClosedTomorrow?: boolean }) => Promise<ClinicState>;\n  setEmergencyState: (input: {'
);

text = text.replace(
  '    setEmergencyState: async (input) => {',
  '    setBookingState: async (input) => {\n      const nextState = await clinicService.setBookingState(requestedClinicId, input);\n      setClinicState(nextState);\n      return nextState;\n    },\n    setEmergencyState: async (input) => {'
);

fs.writeFileSync(p, text, 'utf8');
console.log('Updated clinic-provider.tsx');
