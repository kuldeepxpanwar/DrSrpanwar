import { readClinicId, jsonError } from "@/app/api/api-helpers";
import { updateClinicBookingState } from "@/lib/db/queue-store";
import { requireStaffUser } from "@/lib/db/staff-auth";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ clinicId: string }> },
) {
  try {
    const clinicId = await readClinicId(context.params);
    const body = (await request.json()) as {
      bookingClosedToday?: boolean;
      bookingClosedTomorrow?: boolean;
    };

    await requireStaffUser(request, { clinicId });

    const state = await updateClinicBookingState(clinicId, {
      bookingClosedToday: body.bookingClosedToday,
      bookingClosedTomorrow: body.bookingClosedTomorrow,
    });

    return Response.json({ state });
  } catch (error) {
    return jsonError(error);
  }
}
