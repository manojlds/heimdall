#!/usr/bin/env node
/**
 * Heimdall MCP Server
 *
 * A TypeScript MCP server providing sandboxed Python and Bash execution.
 * Named after the Norse god who guards the Bifröst bridge, Heimdall watches
 * over code execution with security and vigilance.
 *
 * Features:
 * - Secure Python execution via Pyodide (WebAssembly sandbox)
 * - Bash command execution via just-bash
 * - Virtual filesystem with host sync
 * - Package installation via micropip
 * - Session persistence
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PyodideManager } from "./core/pyodide-manager.js";
import { BashManager } from "./core/bash-manager.js";
import { registerAllTools } from "./tools/index.js";
import { registerAllResources } from "./resources/index.js";

/**
 * Main entry point
 */
async function main() {
  console.error("[Heimdall] Starting server...");

  // Create manager instances
  const pyodideManager = new PyodideManager();
  const bashManager = new BashManager();

  // Create MCP server
  const server = new McpServer({
    name: "heimdall",
    version: "1.0.0",
  });

  // Register all tools and resources
  registerAllTools(server, pyodideManager, bashManager);
  registerAllResources(server, pyodideManager);

  // Pre-initialize managers (optional, improves first tool call latency)
  // Note: Disabled for now - managers will initialize lazily on first use
  // await pyodideManager.initialize();
  // await bashManager.initialize();

  // Connect transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[Heimdall] Server connected and ready");
}

main().catch((error) => {
  console.error("[Heimdall] Fatal error:", error);
  process.exit(1);
});
