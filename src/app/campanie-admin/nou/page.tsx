import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CampaignCounterForm from "@/components/campaign-admin/CampaignCounterForm";
import Shell from "@/components/campaign-admin/Shell";
import { COLUMN } from "@/components/campaign-admin/ui";
import { readCampaignRole } from "@/lib/admin/drawing-access";
import { CONTEST_LOCATIONS } from "@/lib/drawing";

export const metadata: Metadata = {
  title: "Înscrie un desen · Panoul desenelor",
  robots: { index: false, follow: false },
};

/** Any logged-in panel user: the parent is at the counter, staff type. */
export default async function CampaignCounterPage() {
  const role = await readCampaignRole();
  if (!role) redirect("/admin");
  return (
    <Shell role={role} active="nou">
      <div className={COLUMN}>
        <CampaignCounterForm locations={CONTEST_LOCATIONS.map(({ slug, name }) => ({ slug, name }))} />
      </div>
    </Shell>
  );
}
