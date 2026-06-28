/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep @anthropic-ai/sdk server-side only — never bundle to client
  serverExternalPackages: ['@anthropic-ai/sdk'],
};

export default nextConfig;
