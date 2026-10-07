import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't write AGENTS.md / CLAUDE.md into web/ when `next dev` runs under a coding agent.
  agentRules: false,
  // Keep the dev-mode route indicator out of screenshots.
  devIndicators: false,
  // Lets several dev servers or builds run side by side (NEXT_DIST_DIR=.next-a npx next dev -p 3001).
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
