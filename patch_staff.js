const fs = require('fs');
const path = require('path');
const p = path.resolve('src/app/staff/page.tsx');
let text = fs.readFileSync(p, 'utf8');

const hookPatch = `    setEmergencyState,
    setBookingState,
    syncPendingEntries,`;
text = text.replace(/setEmergencyState,\s+syncPendingEntries,/, hookPatch);

const uiPatch = `          {/* Booking Controls */}
          {isDoctor && (
            <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-container)] overflow-hidden">
              <div className="border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3 font-semibold text-sm flex items-center gap-2 text-[var(--accent-strong)]">
                <CalendarCheck className="h-4 w-4" /> Booking Controls
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Online Booking (Aaj)</p>
                    <p className="text-xs text-[var(--foreground-muted)] opacity-80">Allow patients to book slots for today</p>
                  </div>
                  <button 
                    type="button" 
                    className={\`px-3 py-1.5 rounded-full text-xs font-bold transition-colors \${!clinicState.bookingClosedToday ? "bg-[var(--primary)] text-white" : "bg-[rgba(19,49,58,0.1)] text-[var(--foreground-muted)]"}\`}
                    onClick={() => {
                      void runAction(
                        async () => {
                          await setBookingState({ bookingClosedToday: !clinicState.bookingClosedToday });
                        },
                        "Toggle Booking Today"
                      );
                    }}
                  >
                    {!clinicState.bookingClosedToday ? "ON" : "OFF"}
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Online Booking (Kal)</p>
                    <p className="text-xs text-[var(--foreground-muted)] opacity-80">Allow patients to book slots for tomorrow</p>
                  </div>
                  <button 
                    type="button" 
                    className={\`px-3 py-1.5 rounded-full text-xs font-bold transition-colors \${!clinicState.bookingClosedTomorrow ? "bg-[var(--primary)] text-white" : "bg-[rgba(19,49,58,0.1)] text-[var(--foreground-muted)]"}\`}
                    onClick={() => {
                      void runAction(
                        async () => {
                          await setBookingState({ bookingClosedTomorrow: !clinicState.bookingClosedTomorrow });
                        },
                        "Toggle Booking Tomorrow"
                      );
                    }}
                  >
                    {!clinicState.bookingClosedTomorrow ? "ON" : "OFF"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Queue Tabs */}`;

text = text.replace('{/* Queue Tabs */}', uiPatch);
text = text.replace('ShieldAlert, ShieldCheck', 'ShieldAlert, ShieldCheck, CalendarCheck');

fs.writeFileSync(p, text, 'utf8');
console.log('Updated staff page.tsx');
