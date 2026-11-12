import type { Metadata } from "next";
import ContestDocPage from "@/components/ContestDocPage";
import { campaignEnv, campaignOrigin, contestDocLinks } from "@/lib/campaign-host";
import { loadContestDoc } from "@/lib/contest-docs";

/**
 * The CONTEST rules (content/concurs/regulament.md). On the campaign host
 * this page answers at /regulament (src/proxy.ts); on the main host at
 * /desene/regulament, because /regulament there is the Origins Circle
 * loyalty rules, a different document.
 */
export async function generateMetadata(): Promise<Metadata> {
  const origin = campaignOrigin(campaignEnv());
  return {
    title: "Regulamentul concursului de desene · Origins",
    ...(origin ? { alternates: { canonical: `${origin}/regulament` } } : {}),
  };
}

export default async function ContestRulesPage() {
  const doc = await loadContestDoc("regulament");
  const links = contestDocLinks(campaignEnv());
  return (
    <ContestDocPage
      title={doc.title}
      updated={doc.updated}
      blocks={doc.blocks}
      toc={doc.toc}
      links={links}
      other={{ href: links.privacy, label: "Cum folosim datele" }}
      active="regulament"
    />
  );
}
