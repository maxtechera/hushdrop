#!/usr/bin/env node
// Thin wrapper so `npx hushdrop-install` works: runs the installer shipped in hushdrop-mcp,
// which detects it's running from node_modules and wires agents to `npx -y hushdrop-mcp`.
import "hushdrop-mcp/install.mjs";
