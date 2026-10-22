import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // D-94 : la vitrine du lot 6 n'existe plus ; ses anciennes adresses mènent à la page client.
  async redirects() {
    return [
      { source: "/prestations", destination: "/", permanent: true },
      { source: "/salon", destination: "/", permanent: true },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
