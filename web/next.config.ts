import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't write AGENTS.md / CLAUDE.md into web/ when `next dev` runs under a coding agent.
  agentRules: false,
  // Keep the dev-mode route indicator out of screenshots.
  devIndicators: false,
};

export default nextConfig;
