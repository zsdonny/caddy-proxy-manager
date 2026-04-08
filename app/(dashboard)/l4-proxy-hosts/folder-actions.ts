"use server";

import { setUserPreference } from "@/src/lib/models/user-preferences";
import type { FolderStateData } from "@/src/lib/models/user-preferences";
import { requireAdmin } from "@/src/lib/auth";

export async function saveL4FolderStateAction(state: FolderStateData): Promise<void> {
  const session = await requireAdmin();
  await setUserPreference(Number(session.user.id), "l4_proxy_host_folders", state);
}
