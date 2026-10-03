import { NextResponse } from "next/server";
import { jsonError } from "@/app/api/api-helpers";
import { getRemoteClinicState, updateRemoteQueueEntryArrivedAt } from "@/lib/db/queue-store";
import { ClinicId } from "@/features/clinic/types";

export async function POST(
  request: Request,
  { params }: { params: { clinicId: ClinicId; entryId: string } }
) {
  try {
    const { clinicId, entryId } = params;

    await updateRemoteQueueEntryArrivedAt(clinicId, entryId, new Date().toISOString());

    const state = await getRemoteClinicState(clinicId);

    return NextResponse.json({ success: true, state });
  } catch (error) {
    return jsonError(error);
  }
}
