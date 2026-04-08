export const dynamic = 'force-dynamic';

import L4ProxyHostsClient from "./L4ProxyHostsClient";
import L4ProxyHostsFolderClient from "./L4ProxyHostsFolderClient";
import { listL4ProxyHostsPaginated, countL4ProxyHosts, listL4ProxyHosts } from "@/src/lib/models/l4-proxy-hosts";
import { listCertificates } from "@/src/lib/models/certificates";
import { listCaCertificates } from "@/src/lib/models/ca-certificates";
import { requireAdmin } from "@/src/lib/auth";
import { getFolderOrganizationSettings } from "@/src/lib/settings";
import { getUserPreference } from "@/src/lib/models/user-preferences";
import type { FolderStateData } from "@/src/lib/models/user-preferences";
const PER_PAGE = 25;

interface PageProps {
  searchParams: Promise<{ page?: string; search?: string; sortBy?: string; sortDir?: string }>;
}

export default async function L4ProxyHostsPage({ searchParams }: PageProps) {
  const session = await requireAdmin();
  const { page: pageParam, search: searchParam, sortBy: sortByParam, sortDir: sortDirParam } = await searchParams;
  const sortDir = (sortDirParam === "asc" || sortDirParam === "desc") ? sortDirParam : "desc";

  const [folderOrgSettings, certs, caCerts] = await Promise.all([
    getFolderOrganizationSettings(),
    listCertificates(),
    listCaCertificates(),
  ]);

  const folderOrgEnabled = folderOrgSettings?.enabled === true;

  if (folderOrgEnabled) {
    const [hosts, folderState] = await Promise.all([
      listL4ProxyHosts(),
      getUserPreference<FolderStateData>(Number(session.user.id), "l4_proxy_host_folders"),
    ]);
    return (
      <L4ProxyHostsFolderClient
        hosts={hosts}
        certificates={certs}
        caCertificates={caCerts}
        initialFolderState={folderState}
      />
    );
  }

  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const search = searchParam?.trim() || undefined;
  const offset = (page - 1) * PER_PAGE;
  const sortBy = sortByParam || undefined;

  const [hosts, total] = await Promise.all([
    listL4ProxyHostsPaginated(PER_PAGE, offset, search, sortBy, sortDir),
    countL4ProxyHosts(search),
  ]);

  return (
    <L4ProxyHostsClient
      hosts={hosts}
      pagination={{ total, page, perPage: PER_PAGE }}
      initialSearch={search ?? ""}
      initialSort={{ sortBy: sortBy ?? "created_at", sortDir }}
      certificates={certs}
      caCertificates={caCerts}
    />
  );
}
