"use server";

import { campaignRoleForPin } from "@/lib/admin/campaign-session-token";
import {
  campaignLoginAllowed,
  clearCampaignSession,
  readCampaignRole,
  writeCampaignSession,
} from "@/lib/admin/drawing-access";

/**
 * Login of the campaign panel: a PIN, nothing else. The PIN decides the role
 * (CAMPAIGN_ADMIN_PIN_MANAGER / CAMPAIGN_ADMIN_PIN_STAFF). It has nothing to
 * do with the Origins platform login: other variables, other cookie, other
 * host. Everything the panel then does goes through the existing drawings
 * server functions (app/admin/desene/actions.ts).
 */

/**
 * No `redirect()` in these two: a server function's redirect renders the
 * target route in the same response, WITHOUT the proxy that maps the
 * campaign host's /admin to this panel, so it would land on the wrong
 * tree. They return, and the screen does a full navigation to /admin.
 */
export type CampaignLoginState = { ok: true } | { ok: false; error: string } | null;

/** Staff screen: Romanian only. */
const strings = {
  tooMany: "Prea multe încercări. Mai încearcă peste un sfert de oră.",
  wrong: "Codul nu e corect.",
  locked: "Panoul nu e configurat încă. Cere codurile de la Epic Digital Hub.",
};

export async function campaignLoginAction(
  _prev: CampaignLoginState,
  formData: FormData,
): Promise<CampaignLoginState> {
  if (!(await campaignLoginAllowed())) return { ok: false, error: strings.tooMany };

  const role = campaignRoleForPin(
    String(formData.get("pin") ?? ""),
    {
      CAMPAIGN_ADMIN_PIN_MANAGER: process.env.CAMPAIGN_ADMIN_PIN_MANAGER,
      CAMPAIGN_ADMIN_PIN_STAFF: process.env.CAMPAIGN_ADMIN_PIN_STAFF,
    },
    process.env.NODE_ENV === "production",
  );
  if (!role) return { ok: false, error: strings.wrong };

  // False = no signing secret in production: locked, whatever the PIN.
  if (!(await writeCampaignSession(role))) return { ok: false, error: strings.locked };
  return { ok: true };
}

export async function campaignLogoutAction(): Promise<{ ok: true }> {
  if (await readCampaignRole()) await clearCampaignSession();
  return { ok: true };
}
