import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The parent agency repo has its own lockfile; pin the root to this app so
  // Turbopack does not infer the wrong workspace.
  turbopack: {
    root: import.meta.dirname,
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
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default nextConfig;
