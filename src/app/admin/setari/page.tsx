import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminBar from "@/components/admin/AdminBar";
import PhoneFrame from "@/components/PhoneFrame";
import ProgramEditor from "./ProgramEditor";
import { formatBucharestDate } from "@/app/admin/push/shared";
import { readStaffSession } from "@/lib/admin/session";
import { getDb } from "@/lib/db";
import { doubleStampText } from "@/lib/program";
import {
  birthdayRule,
  freeDrinkRule,
  goldCardRule,
  goldKeepRule,
  goldPerksRule,
  goldQualifyRule,
  midRewardRule,
  rewardValueCapRule,
  stampWindowRule,
  toGoDisclaimer,
} from "@/lib/program-copy";

export const metadata: Metadata = {
  title: "Program Origins",
  robots: { index: false, follow: false },
};

export default async function SetariPage() {
  const session = await readStaffSession();
  if (!session) redirect("/admin");
  if (session.role !== "manager") redirect("/admin/scan");

  const db = getDb();
  const [location, config] = await Promise.all([
    db.getLocationBySlug(session.locationSlug),
    db.getLoyaltyConfig(),
  ]);

  // The same generators the public pages use: the manager reads exactly what
  // the customer will read.
  const preview = [
    toGoDisclaimer(),
    midRewardRule(config),
    freeDrinkRule(config),
    rewardValueCapRule(config),
    birthdayRule(config),
    doubleStampText(config.doubleStamp),
    stampWindowRule(config),
    config.gold.enabled ? goldQualifyRule(config) : null,
    config.gold.enabled ? goldCardRule(config) : null,
    config.gold.enabled ? goldPerksRule(config) : null,
    config.gold.enabled ? goldKeepRule(config) : null,
  ]
    .filter((text) => text !== null)
    .map((text) => text.ro);

  return (
    <PhoneFrame>
      <AdminBar
        locationName={location?.name ?? session.locationSlug}
        role={session.role}
      />
      <ProgramEditor
        config={config}
        preview={preview}
        updatedLabel={
          config.updatedAt ? formatBucharestDate(config.updatedAt) : null
        }
      />
    </PhoneFrame>
  );
}
