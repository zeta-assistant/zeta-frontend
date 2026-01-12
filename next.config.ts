// next.config.ts

const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
});

const nextConfig = {
  // ✅ This silences the Next 16 turbopack/webpack mismatch error
  turbopack: {},
};

export default withPWA(nextConfig);
