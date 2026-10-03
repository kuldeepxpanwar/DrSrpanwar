const fs = require('fs');
const path = require('path');
const p = path.resolve('src/app/api/clinics/[clinicId]/walkin/route.ts');
let text = fs.readFileSync(p, 'utf8');

text = text.replace(
  'import { createRemoteWalkIn } from "@/lib/db/queue-store";',
  'import { createRemoteWalkIn, getRemoteClinicState } from "@/lib/db/queue-store";'
);

const checkLogic = `
    const clinicState = await getRemoteClinicState(clinicId);
    if (clinicState.emergency_closed || clinicState.emergencyClosed) {
      throw new ApiRouteError("Clinic is currently closed. Walk-ins are not allowed.", 403);
    }

    const state = await createRemoteWalkIn({`;

text = text.replace(
  'const state = await createRemoteWalkIn({',
  checkLogic
);

fs.writeFileSync(p, text, 'utf8');
console.log('Updated walkin api route');
