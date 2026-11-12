import type { Metadata } from "next";
import ContestDocPage from "@/components/ContestDocPage";
import { campaignEnv, campaignOrigin, contestDocLinks } from "@/lib/campaign-host";
import { loadContestDoc } from "@/lib/contest-docs";

/**
 * The CONTEST privacy note (content/concurs/confidentialitate.md). On the
 * campaign host this page answers at /confidentialitate (src/proxy.ts); on
 * the main host at /desene/confidentialitate, because /confidentialitate
 * there is the app's own privacy page.
 */
export async function generateMetadata(): Promise<Metadata> {
  const origin = campaignOrigin(campaignEnv());
  return {
    title: "Cum folosim datele · Concursul de desene · Origins",
    ...(origin ? { alternates: { canonical: `${origin}/confidentialitate` } } : {}),
  };
}

export default async function ContestPrivacyPage() {
  // The link to the rules carries the rules' own title, whatever the file says.
  const [doc, rules] = await Promise.all([
    loadContestDoc("confidentialitate"),
    loadContestDoc("regulament"),
  ]);
  const links = contestDocLinks(campaignEnv());
  return (
    <ContestDocPage
      title={doc.title}
      updated={doc.updated}
      blocks={doc.blocks}
      toc={doc.toc}
      links={links}
      other={{ href: links.rules, label: rules.title }}
      active={null}
    />
  );
}
