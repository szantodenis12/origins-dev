import type { NextConfig } from "next";

/**
 * Drawing photos in Supabase Storage (lib/storage/supabase-drawings.ts) are
 * absolute URLs under <SUPABASE_URL>/storage/v1/object/public/. Only that
 * path of that host is allowed; nothing when Supabase is not configured.
 * The local Docker stack (tools/campaign-db-local.sh) is on 127.0.0.1,
 * which Next 16 refuses to optimise unless explicitly allowed — dev only.
 */
const storageUrl = (() => {
  try {
    return process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL) : null;
  } catch {
    return null;
  }
})();
const storageIsLocal =
  storageUrl !== null && ["127.0.0.1", "localhost", "::1"].includes(storageUrl.hostname);

const nextConfig: NextConfig = {
  images: {
    remotePatterns: storageUrl
      ? [
          {
            protocol: storageUrl.protocol === "http:" ? "http" : "https",
            hostname: storageUrl.hostname,
            ...(storageUrl.port ? { port: storageUrl.port } : {}),
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
    dangerouslyAllowLocalIP: storageIsLocal && process.env.NODE_ENV !== "production",
  },
  // The parent agency repo has its own lockfile; pin the root to this app so
  // Turbopack does not infer the wrong workspace.
  turbopack: {
    root: import.meta.dirname,
  },
  // Dev only: the campaign host is tested as http://xmas.localhost:4320
  // (CAMPAIGN_HOST=xmas.localhost:4320); without this Next refuses its own
  // dev assets to another hostname.
  allowedDevOrigins: ["*.localhost"],
  // The contest's legal texts are read from disk at request time
  // (lib/contest-docs.ts), so the production file trace must carry them.
  outputFileTracingIncludes: {
    "/desene/regulament": ["./content/concurs/*.md"],
    "/desene/confidentialitate": ["./content/concurs/*.md"],
  },
  experimental: {
    // Menu photos are uploaded through a Server Action, and the default action
    // body cap is 1MB — a phone photo is 3-5MB. MAX_IMAGE_BYTES (lib/images.ts)
    // is the real limit at 8MB; the extra room here covers multipart overhead
    // so an oversized file gets our Romanian error, not a framework 413.
    serverActions: {
      bodySizeLimit: "9mb",
    },
  },
};

export default nextConfig;
