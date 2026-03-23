import { NextResponse } from "next/server";
import { getInstanceMode, getReplicaLastSync } from "@/src/lib/instance-sync";
import { requireAdmin } from "@/src/lib/auth";

export const dynamic = 'force-dynamic';

/**
 * GET /api/instances/sync-status
 *
 * Returns the last sync timestamp and error for the current replica instance.
 * Returns 403 if not in replica mode.
 */
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mode = await getInstanceMode();
  if (mode !== "replica") {
    return NextResponse.json({ error: "Instance is not in replica mode" }, { status: 403 });
  }

  const { at, error } = await getReplicaLastSync();
  return NextResponse.json({ lastSyncAt: at, lastSyncError: error });
}
