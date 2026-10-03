const fs = require('fs');
const path = require('path');
const p = path.resolve('src/app/staff/page.tsx');
let text = fs.readFileSync(p, 'utf8');

// The block to replace
const oldUi = `{/* Booking Controls */}
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
          )}`;

const newUi = `{/* Booking Controls - Only visible when clinic is Emergency Closed */}
          {isDoctor && clinicState.emergencyClosed && (
            <div className="mt-3 rounded-xl border border-[rgba(182,93,54,0.2)] bg-white overflow-hidden shadow-sm">
              <div className="border-b border-[rgba(182,93,54,0.1)] bg-[rgba(182,93,54,0.03)] px-4 py-2.5 font-semibold text-sm flex items-center justify-between text-[#8b4626]">
                <div className="flex items-center gap-2">
                  <CalendarCheck className="h-4 w-4" /> 
                  <span>Online Booking Status</span>
                </div>
                <span className="text-[10px] uppercase tracking-wider opacity-70">Optional</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Booking (Aaj)</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">Online slots for today</p>
                  </div>
                  <button 
                    type="button" 
                    className={\`px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow-sm \${!clinicState.bookingClosedToday ? "bg-green-500 text-white border-green-600" : "bg-gray-200 text-gray-600 border-gray-300"}\`}
                    onClick={() => {
                      void runAction(
                        async () => {
                          await setBookingState({ bookingClosedToday: !clinicState.bookingClosedToday });
                        },
                        "Toggle Booking Today"
                      );
                    }}
                  >
                    {!clinicState.bookingClosedToday ? "OPEN" : "CLOSED"}
                  </button>
                </div>
                <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Booking (Kal)</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">Online slots for tomorrow</p>
                  </div>
                  <button 
                    type="button" 
                    className={\`px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow-sm \${!clinicState.bookingClosedTomorrow ? "bg-green-500 text-white border-green-600" : "bg-gray-200 text-gray-600 border-gray-300"}\`}
                    onClick={() => {
                      void runAction(
                        async () => {
                          await setBookingState({ bookingClosedTomorrow: !clinicState.bookingClosedTomorrow });
                        },
                        "Toggle Booking Tomorrow"
                      );
                    }}
                  >
                    {!clinicState.bookingClosedTomorrow ? "OPEN" : "CLOSED"}
                  </button>
                </div>
              </div>
            </div>
          )}`;

text = text.replace(oldUi, newUi);

fs.writeFileSync(p, text, 'utf8');
console.log('Updated staff page UI');
