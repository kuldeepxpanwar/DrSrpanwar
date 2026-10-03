import { readClinicId, ApiRouteError, jsonError } from "@/app/api/api-helpers";
import { createRemoteWalkIn, getRemoteClinicState } from "@/lib/db/queue-store";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ clinicId: string }> },
) {
  try {
    const clinicId = await readClinicId(context.params);
    const body = (await request.json()) as {
      name?: string;
      mobile?: string;
      clientRequestId?: string;
      createdAt?: string;
      requiresPharmacyFollowUp?: boolean;
    };

    if (!body.name?.trim() && !body.mobile?.trim()) {
      throw new ApiRouteError("Walk-in form needs at least a name or mobile number.", 400);
    }

    
    const clinicState = await getRemoteClinicState(clinicId);
    if (clinicState.emergency_closed || clinicState.emergencyClosed) {
      throw new ApiRouteError("Clinic is currently closed. Walk-ins are not allowed.", 403);
    }

    const state = await createRemoteWalkIn({
      clinicId,
      name: body.name,
      mobile: body.mobile,
      clientRequestId: body.clientRequestId,
      createdAt: body.createdAt,
      requiresPharmacyFollowUp: body.requiresPharmacyFollowUp,
    });

    return Response.json({ state });
  } catch (error) {
    return jsonError(error);
  }
}
