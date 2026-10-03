const fs = require('fs');
const path = require('path');
const p = path.resolve('src/features/clinic/state/clinic-provider.tsx');
let text = fs.readFileSync(p, 'utf8');

text = text.replace(
  'setClinicState(nextState);',
  'applyState(requestedClinicId, nextState);'
);

fs.writeFileSync(p, text, 'utf8');
