import { NextResponse } from 'next/server';
import { requireUser } from '@/src/lib/auth';

export const dynamic = 'force-dynamic';
import { getAnalyticsHosts } from '@/src/lib/analytics-db';
import { cachedResponse } from '@/src/lib/analytics-cache';

export async function GET() {
  await requireUser();
  const hosts = await cachedResponse('hosts', 300_000, () => getAnalyticsHosts());
  return NextResponse.json(hosts);
}
