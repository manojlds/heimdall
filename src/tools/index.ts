/**
 * Tools Registration
 *
 * Central module for registering all MCP tools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PyodideManager } from "../core/pyodide-manager.js";
import type { BashManager } from "../core/bash-manager.js";
import { registerPythonExecutionTools } from "./python-execution.js";
import { registerFilesystemTools } from "./filesystem.js";
import { registerBashExecutionTools } from "./bash-execution.js";

/**
 * Register all tools with the MCP server
 */
export function registerAllTools(
  server: McpServer,
  pyodideManager: PyodideManager,
  bashManager: BashManager
): void {
  registerPythonExecutionTools(server, pyodideManager);
  registerFilesystemTools(server, pyodideManager);
  registerBashExecutionTools(server, bashManager, pyodideManager);
}
