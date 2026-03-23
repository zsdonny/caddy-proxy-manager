import { NextRequest, NextResponse } from "next/server";
import { existsSync, statSync } from "node:fs";

/**
 * Health check endpoint for Docker container health monitoring.
 *
 * GET /api/health          → fast 200 for Docker healthcheck
 * GET /api/health?detailed → diagnostics: memory, DB stats, log backlog
 */
export async function GET(request: NextRequest) {
  const detailed = request.nextUrl.searchParams.has("detailed");

  if (!detailed) {
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }

  // Detailed diagnostics
  const mem = process.memoryUsage();
  const diagnostics: Record<string, unknown> = {
    status: "ok",
    uptime_s: Math.round(process.uptime()),
    memory: {
      rss_mb: Math.round(mem.rss / 1024 / 1024),
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
    },
  };

  // DB connectivity + size
  try {
    const { default: db } = await import("@/src/lib/db");
    const { sql } = await import("drizzle-orm");
    db.run(sql`SELECT 1`);
    const sizeResult = db.all<{ size: number }>(
      sql`SELECT page_count * page_size AS size FROM pragma_page_count(), pragma_page_size()`
    );
    diagnostics.db = {
      connected: true,
      size_bytes: sizeResult?.[0]?.size ?? null,
    };
  } catch {
    diagnostics.db = { connected: false };
    diagnostics.status = "degraded";
  }

  // Log file sizes and parse backlog
  const logFiles: Record<string, { size_bytes: number }> = {};
  for (const [name, path] of [
    ["access_log", "/logs/access.log"],
    ["waf_audit_log", "/logs/waf-audit.log"],
    ["waf_rules_log", "/logs/waf-rules.log"],
  ] as const) {
    try {
      if (existsSync(path)) {
        logFiles[name] = { size_bytes: statSync(path).size };
      }
    } catch { /* skip */ }
  }
  if (Object.keys(logFiles).length > 0) {
    diagnostics.log_files = logFiles;
  }

  const statusCode = diagnostics.status === "ok" ? 200 : 503;
  return NextResponse.json(diagnostics, { status: statusCode });
}
