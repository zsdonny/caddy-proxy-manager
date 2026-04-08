export const dynamic = 'force-dynamic';

import ProxyHostsClient from "./ProxyHostsClient";
import ProxyHostsFolderClient from "./ProxyHostsFolderClient";
import { listProxyHostsPaginated, countProxyHosts, listProxyHosts } from "@/src/lib/models/proxy-hosts";
import { listCertificates } from "@/src/lib/models/certificates";
import { listCaCertificates } from "@/src/lib/models/ca-certificates";
import { listAccessLists } from "@/src/lib/models/access-lists";
import { getAuthentikSettings, getFolderOrganizationSettings } from "@/src/lib/settings";
import { listWafRuleSets } from "@/src/lib/models/waf-rule-sets";
import { requireAdmin } from "@/src/lib/auth";
import { getUserPreference } from "@/src/lib/models/user-preferences";
import type { FolderStateData } from "@/src/lib/models/user-preferences";
const PER_PAGE = 25;

interface PageProps {
  searchParams: Promise<{ page?: string; search?: string; sortBy?: string; sortDir?: string }>;
}

export default async function ProxyHostsPage({ searchParams }: PageProps) {
  const session = await requireAdmin();
  const { page: pageParam, search: searchParam, sortBy: sortByParam, sortDir: sortDirParam } = await searchParams;
  const sortDir = (sortDirParam === "asc" || sortDirParam === "desc") ? sortDirParam : "desc";

  const [folderOrgSettings, certificates, caCertificates, accessLists, authentikDefaults, ruleSets] = await Promise.all([
    getFolderOrganizationSettings(),
    listCertificates(),
    listCaCertificates(),
    listAccessLists(),
    getAuthentikSettings(),
    listWafRuleSets(),
  ]);

  const folderOrgEnabled = folderOrgSettings?.enabled === true;

  if (folderOrgEnabled) {
    const [hosts, folderState] = await Promise.all([
      listProxyHosts(),
      getUserPreference<FolderStateData>(Number(session.user.id), "proxy_host_folders"),
    ]);
    return (
      <ProxyHostsFolderClient
        hosts={hosts}
        certificates={certificates}
        caCertificates={caCertificates}
        accessLists={accessLists}
        authentikDefaults={authentikDefaults}
        ruleSets={ruleSets}
        initialFolderState={folderState}
      />
    );
  }

  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const search = searchParam?.trim() || undefined;
  const offset = (page - 1) * PER_PAGE;
  const sortBy = sortByParam || undefined;

  const [hosts, total] = await Promise.all([
    listProxyHostsPaginated(PER_PAGE, offset, search, sortBy, sortDir),
    countProxyHosts(search),
  ]);

  return (
    <ProxyHostsClient
      hosts={hosts}
      certificates={certificates}
      caCertificates={caCertificates}
      accessLists={accessLists}
      authentikDefaults={authentikDefaults}
      pagination={{ total, page, perPage: PER_PAGE }}
      initialSearch={search ?? ""}
      initialSort={{ sortBy: sortBy ?? "created_at", sortDir }}
      ruleSets={ruleSets}
    />
  );
}
