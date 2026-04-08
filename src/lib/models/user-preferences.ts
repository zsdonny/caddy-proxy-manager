import db, { nowIso } from "../db";
import { userPreferences } from "../db/schema";
import { and, eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FolderItem = {
  name: string;
  itemIds: string[];
};

export type FolderStateData = {
  folders: FolderItem[];
  ungrouped: string[];
};

/** Known preference keys for type safety in callers. */
export type PrefKey = "proxy_host_folders" | "l4_proxy_host_folders";

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function getUserPreference<T>(userId: number, key: string): Promise<T | null> {
  const row = await db.query.userPreferences.findFirst({
    where: (table, { and, eq }) => and(eq(table.userId, userId), eq(table.key, key)),
  });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export async function setUserPreference<T>(userId: number, key: string, value: T): Promise<void> {
  const payload = JSON.stringify(value);
  const now = nowIso();
  await db
    .insert(userPreferences)
    .values({ userId, key, value: payload, updatedAt: now })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.key],
      set: { value: payload, updatedAt: now },
    });
}

export async function clearUserPreference(userId: number, key: string): Promise<void> {
  await db
    .delete(userPreferences)
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, key)));
}

/** Returns all user preference rows — used for replica sync payload. */
export async function getAllUserPreferencesForSync(): Promise<
  Array<{ userId: number; key: string; value: string; updatedAt: string }>
> {
  return await db
    .select({
      userId: userPreferences.userId,
      key: userPreferences.key,
      value: userPreferences.value,
      updatedAt: userPreferences.updatedAt,
    })
    .from(userPreferences);
}

/** Bulk-upsert user preferences — called on replicas when applying a sync payload. */
export async function upsertUserPreferencesBulk(
  rows: Array<{ userId: number; key: string; value: string; updatedAt: string }>
): Promise<void> {
  if (rows.length === 0) return;
  const now = nowIso();
  for (const row of rows) {
    await db
      .insert(userPreferences)
      .values({ userId: row.userId, key: row.key, value: row.value, updatedAt: row.updatedAt ?? now })
      .onConflictDoUpdate({
        target: [userPreferences.userId, userPreferences.key],
        set: { value: row.value, updatedAt: row.updatedAt ?? now },
      });
  }
}
