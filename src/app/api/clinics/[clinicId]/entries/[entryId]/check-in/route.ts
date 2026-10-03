import { NextResponse } from "next/server";
import { jsonError } from "@/app/api/api-helpers";
import { getRemoteClinicState, updateRemoteQueueEntryArrivedAt } from "@/lib/db/queue-store";
import { ClinicId } from "@/features/clinic/types";

export async function POST(
  request: Request,
  context: { params: Promise<{ clinicId: ClinicId; entryId: string }> }
) {
  try {
    const { clinicId, entryId } = await context.params;

    await updateRemoteQueueEntryArrivedAt(clinicId, entryId, new Date().toISOString());

    const state = await getRemoteClinicState(clinicId);

    return NextResponse.json({ success: true, state });
  } catch (error) {
    return jsonError(error);
  }
}
