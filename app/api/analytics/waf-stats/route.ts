import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { requireUser } from '@/src/lib/auth';
import { INTERVAL_SECONDS } from '@/src/lib/analytics-db';
import { countWafEventsInRange, countWafEventsInRangeDual, getTopWafRulesWithHosts, getWafEventCountries } from '@/src/lib/models/waf-events';
import { cachedResponse, ttlForRange } from '@/src/lib/analytics-cache';

function resolveRange(params: URLSearchParams): { from: number; to: number } {
  const fromParam = params.get('from');
  const toParam = params.get('to');
  if (fromParam && toParam) {
    return { from: parseInt(fromParam, 10), to: parseInt(toParam, 10) };
  }
  const interval = params.get('interval') ?? '1h';
  const to = Math.floor(Date.now() / 1000);
  const from = to - (INTERVAL_SECONDS[interval as keyof typeof INTERVAL_SECONDS] ?? INTERVAL_SECONDS['1h']);
  return { from, to };
}

export async function GET(req: NextRequest) {
  await requireUser();
  const { from, to } = resolveRange(req.nextUrl.searchParams);
  const includeMuted = req.nextUrl.searchParams.get('include_muted') === '1';
  const key = `waf-stats:${from}:${to}:${includeMuted ? '1' : '0'}`;

  if (includeMuted) {
    const data = await cachedResponse(key, ttlForRange(from, to), async () => {
      const [dual, topRules, byCountry] = await Promise.all([
        countWafEventsInRangeDual(from, to),
        getTopWafRulesWithHosts(from, to, 10, true),
        getWafEventCountries(from, to, true),
      ]);
      return {
        total: dual.muted + dual.unmuted,
        totalMuted: dual.muted,
        totalUnmuted: dual.unmuted,
        topRules,
        byCountry,
      };
    });
    return NextResponse.json(data);
  }

  const data = await cachedResponse(key, ttlForRange(from, to), async () => {
    const [total, topRules, byCountry] = await Promise.all([
      countWafEventsInRange(from, to, false),
      getTopWafRulesWithHosts(from, to, 10, false),
      getWafEventCountries(from, to, false),
    ]);
    return { total, topRules, byCountry };
  });
  return NextResponse.json(data);
}
