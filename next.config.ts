import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The default bottom-left spot covers the recipient tray's count.
  devIndicators: { position: "top-right" },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "avatars.githubusercontent.com" }],
  },
};

export default nextConfig;
