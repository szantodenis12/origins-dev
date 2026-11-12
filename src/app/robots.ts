import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { campaignEnv, campaignOrigin, isCampaignRequest } from "@/lib/campaign-host";

/**
 * robots.txt, per host (src/proxy.ts lets /robots.txt through on the
 * campaign host). Admin panels are never crawled, on either host: the
 * campaign panel (/admin there, /campanie-admin inside) and the Origins
 * admin. The campaign host points to its own sitemap.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host");
  const env = campaignEnv();
  if (isCampaignRequest(host, env)) {
    const origin = campaignOrigin(env);
    return {
      rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/campanie-admin"] },
      ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}),
    };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/campanie-admin", "/dev"] },
  };
}
