import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth";
import { getCloudflareSettings } from "@/src/lib/settings";
import { CLOUDFLARE_ALL_CIDRS } from "@/src/lib/cloudflare-ips";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin();
    const cf = await getCloudflareSettings();

    if (!cf?.fetchCloudflareIps) {
      // Live fetch disabled — return hardcoded fallback
      return NextResponse.json({ cidrs: CLOUDFLARE_ALL_CIDRS, source: "fallback" });
    }

    // Try live fetch from Cloudflare's public API
    try {
      const res = await fetch("https://api.cloudflare.com/client/v4/ips", {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as {
        success: boolean;
        result?: { ipv4_cidrs?: string[]; ipv6_cidrs?: string[] };
      };
      if (data.success && data.result) {
        const cidrs = [
          ...(data.result.ipv4_cidrs ?? []),
          ...(data.result.ipv6_cidrs ?? []),
        ];
        return NextResponse.json({ cidrs, source: "live" });
      }
      throw new Error("Unexpected API response");
    } catch {
      // Fall back to hardcoded
      return NextResponse.json({ cidrs: CLOUDFLARE_ALL_CIDRS, source: "fallback" });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
