const fs = require('fs');
const path = require('path');
const p = path.resolve('src/app/book/page.tsx');
let text = fs.readFileSync(p, 'utf8');

const patchCode = `          const todayIsOpen = (todayData?.isOpen ?? true) && !state?.bookingClosedToday;
          const tomorrowIsOpen = (tomorrowData?.isOpen ?? true) && !state?.bookingClosedTomorrow;`;

text = text.replace(
  '          const todayIsOpen = todayData?.isOpen ?? true;\n          const tomorrowIsOpen = tomorrowData?.isOpen ?? true;',
  patchCode
);

const patchCode2 = `            const todayIsOpen = (todaySchedule?.isOpen ?? true) && !state?.bookingClosedToday;
            const tomorrowIsOpen = (tomorrowSchedule?.isOpen ?? true) && !state?.bookingClosedTomorrow;`;

text = text.replace(
  '            const todayIsOpen = todaySchedule?.isOpen ?? true;\n            const tomorrowIsOpen = tomorrowSchedule?.isOpen ?? true;',
  patchCode2
);

fs.writeFileSync(p, text, 'utf8');
console.log('Updated book page.tsx');
