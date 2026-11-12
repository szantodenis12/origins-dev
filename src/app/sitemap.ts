import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { campaignEnv, campaignOrigin, isCampaignRequest } from "@/lib/campaign-host";

/**
 * The campaign host's sitemap: the gallery, the registration page and the
 * two contest documents, at their short addresses. Individual drawings are
 * NOT listed: they are children's drawings, reachable by whoever has the
 * link (regulament art. 13.3), and a sitemap would push them to search
 * engines on our initiative. The main host lists nothing here.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers();
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host");
  const env = campaignEnv();
  const origin = campaignOrigin(env);
  if (!isCampaignRequest(host, env) || !origin) return [];
  return [
    { url: `${origin}/`, changeFrequency: "daily", priority: 1 },
    { url: `${origin}/desen`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${origin}/regulament`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${origin}/confidentialitate`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
