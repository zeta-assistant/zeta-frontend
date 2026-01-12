// next.config.ts
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  swSrc: "sw.js", // ✅ use your custom SW source
});

const nextConfig = {
  turbopack: {},
};

export default withPWA(nextConfig);
