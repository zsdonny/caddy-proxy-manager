import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth";
import { listWafEvents, countWafEvents, countMutedWafEvents } from "@/src/lib/models/waf-events";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const perPage = Math.min(200, Math.max(1, parseInt(searchParams.get("per_page") ?? "50", 10) || 50));
    const search = searchParams.get("search")?.trim() || undefined;
    const includeMuted = searchParams.get("include_muted") === "1";
    const offset = (page - 1) * perPage;

    const [events, total, mutedCount] = await Promise.all([
      listWafEvents(perPage, offset, search, includeMuted),
      countWafEvents(search, includeMuted),
      countMutedWafEvents(search),
    ]);

    return NextResponse.json({ events, total, page, perPage, mutedCount });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
