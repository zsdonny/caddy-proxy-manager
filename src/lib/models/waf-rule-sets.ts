import db, { nowIso } from "../db";
import { wafRuleSets } from "../db/schema";
import { eq, inArray } from "drizzle-orm";

export type WafRuleSet = {
  id: number;
  name: string;
  description: string | null;
  directives: string;
  isPreset: boolean;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Built-in presets — seeded on first access if not already present
// ---------------------------------------------------------------------------

const BUILT_IN_PRESETS: { name: string; description: string; directives: string }[] = [
  {
    name: "WordPress",
    description: "Relaxes CRS rules commonly triggered by WordPress admin, REST API, and file uploads.",
    directives: [
      '# WordPress exclusions for Coraza / CRS',
      '# Disable WAF for wp-admin and wp-login (admin area)',
      'SecRule REQUEST_URI "@rx ^/wp-(?:admin|login)" "id:70001,phase:1,pass,nolog,ctl:ruleEngine=Off"',
      '# Exclude wp-json REST API body from injection rules',
      'SecRule REQUEST_URI "@beginsWith /wp-json/" "id:70002,phase:1,pass,nolog,ctl:ruleRemoveTargetByTag=OWASP_CRS;REQUEST_BODY,ctl:ruleRemoveTargetByTag=OWASP_CRS;ARGS"',
      '# Exclude xmlrpc.php (if still enabled)',
      'SecRule REQUEST_URI "@streq /xmlrpc.php" "id:70003,phase:1,pass,nolog,ctl:ruleEngine=Off"',
      '# Exclude media uploads',
      'SecRule REQUEST_URI "@rx ^/wp-content/uploads" "id:70004,phase:1,pass,nolog,ctl:ruleEngine=Off"',
    ].join('\n'),
  },
  {
    name: "Django / Python API",
    description: "Relaxes CRS rules for Django REST Framework, admin panel, and CSRF tokens.",
    directives: [
      '# Django exclusions for Coraza / CRS',
      '# Disable WAF for Django admin',
      'SecRule REQUEST_URI "@beginsWith /admin/" "id:70010,phase:1,pass,nolog,ctl:ruleEngine=Off"',
      '# Exclude CSRF token cookie from injection rules',
      'SecRule REQUEST_URI "@rx ^/" "id:70011,phase:1,pass,nolog,ctl:ruleRemoveTargetByTag=OWASP_CRS;REQUEST_COOKIES:csrftoken"',
      '# Exclude DRF API body from injection rules',
      'SecRule REQUEST_URI "@beginsWith /api/" "id:70012,phase:1,pass,nolog,ctl:ruleRemoveTargetByTag=OWASP_CRS;REQUEST_BODY,ctl:ruleRemoveTargetByTag=OWASP_CRS;ARGS"',
    ].join('\n'),
  },
  {
    name: "Node.js / Express API",
    description: "Relaxes CRS rules for JSON APIs, JWTs, and common Node.js patterns.",
    directives: [
      '# Node.js / Express API exclusions for Coraza / CRS',
      '# Disable WAF for all /api/ routes (trusted API)',
      'SecRule REQUEST_URI "@beginsWith /api/" "id:70020,phase:1,pass,nolog,ctl:ruleEngine=Off"',
      '# Exclude JWT cookies from injection rules',
      'SecRule REQUEST_URI "@rx ^/" "id:70021,phase:1,pass,nolog,ctl:ruleRemoveTargetByTag=OWASP_CRS;REQUEST_COOKIES:token,ctl:ruleRemoveTargetByTag=OWASP_CRS;REQUEST_COOKIES:jwt"',
      '# Exclude Socket.IO',
      'SecRule REQUEST_URI "@beginsWith /socket.io/" "id:70022,phase:1,pass,nolog,ctl:ruleEngine=Off"',
    ].join('\n'),
  },
];

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listWafRuleSets(): Promise<WafRuleSet[]> {
  await seedPresetsIfNeeded();
  return db.select().from(wafRuleSets).all();
}

export async function getWafRuleSet(id: number): Promise<WafRuleSet | undefined> {
  return db.select().from(wafRuleSets).where(eq(wafRuleSets.id, id)).get();
}

export async function getWafRuleSetsById(ids: number[]): Promise<WafRuleSet[]> {
  if (ids.length === 0) return [];
  return db.select().from(wafRuleSets).where(inArray(wafRuleSets.id, ids)).all();
}

export async function createWafRuleSet(data: {
  name: string;
  description?: string;
  directives: string;
  isPreset?: boolean;
}): Promise<WafRuleSet> {
  const now = nowIso();
  const result = db
    .insert(wafRuleSets)
    .values({
      name: data.name.trim(),
      description: data.description?.trim() || null,
      directives: data.directives,
      isPreset: data.isPreset ?? false,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return result;
}

export async function updateWafRuleSet(
  id: number,
  data: { name?: string; description?: string | null; directives?: string }
): Promise<WafRuleSet | undefined> {
  const existing = await getWafRuleSet(id);
  if (!existing) return undefined;
  const result = db
    .update(wafRuleSets)
    .set({
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.description !== undefined ? { description: data.description?.trim() || null } : {}),
      ...(data.directives !== undefined ? { directives: data.directives } : {}),
      updatedAt: nowIso(),
    })
    .where(eq(wafRuleSets.id, id))
    .returning()
    .get();
  return result;
}

export async function deleteWafRuleSet(id: number): Promise<boolean> {
  const before = db.select({ id: wafRuleSets.id }).from(wafRuleSets).where(eq(wafRuleSets.id, id)).get();
  if (!before) return false;
  db.delete(wafRuleSets).where(eq(wafRuleSets.id, id)).run();
  return true;
}

// ---------------------------------------------------------------------------
// Preset seeding
// ---------------------------------------------------------------------------

async function seedPresetsIfNeeded(): Promise<void> {
  const existing = db
    .select({ id: wafRuleSets.id })
    .from(wafRuleSets)
    .where(eq(wafRuleSets.isPreset, true))
    .all();
  if (existing.length > 0) return;

  const now = nowIso();
  for (const preset of BUILT_IN_PRESETS) {
    db.insert(wafRuleSets)
      .values({
        name: preset.name,
        description: preset.description,
        directives: preset.directives,
        isPreset: true,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
}
