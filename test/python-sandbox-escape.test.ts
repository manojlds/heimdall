/**
 * Python Sandbox Escape Prevention Tests
 *
 * Tests to verify that Python code running in the Pyodide WASM sandbox
 * cannot escape to access host resources, environment variables, network,
 * or Node.js APIs.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_WORKSPACE = path.join(__dirname, "..", "test-workspace-sandbox-escape");

let client: Client | null = null;
let transport: StdioClientTransport | null = null;

async function callTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  if (!client) throw new Error("Client not connected");
  const result = await client.callTool({ name, arguments: args });
  return result as { content: Array<{ type: string; text: string }>; isError?: boolean };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Python Sandbox Escape Prevention", () => {
  beforeAll(async () => {
    if (fs.existsSync(TEST_WORKSPACE)) {
      fs.rmSync(TEST_WORKSPACE, { recursive: true });
    }
    fs.mkdirSync(TEST_WORKSPACE, { recursive: true });

    const serverPath = path.join(__dirname, "..", "src", "server.ts");

    transport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", serverPath],
      env: {
        ...process.env,
        HEIMDALL_WORKSPACE: TEST_WORKSPACE,
      },
      cwd: path.join(__dirname, ".."),
    });

    client = new Client(
      { name: "sandbox-escape-test-client", version: "1.0.0" },
      { capabilities: {} }
    );
    await client.connect(transport);

    await sleep(5000);
  }, 60000);

  afterAll(async () => {
    if (client) {
      try {
        await client.close();
      } catch {
        // Ignore close errors
      }
    }

    if (transport) {
      try {
        await transport.close();
      } catch {
        // Ignore close errors
      }
    }

    if (fs.existsSync(TEST_WORKSPACE)) {
      fs.rmSync(TEST_WORKSPACE, { recursive: true });
    }
  });

  describe("JS/Node Bridge Escape Attempts", () => {
    it("should block access to process.env via JS bridge", async () => {
      const result = await callTool("execute_python", {
        code: `
try:
    import js
    env = js.process.env
    print(f"ESCAPE: env keys = {list(vars(env))[:5]}")
except Exception as e:
    print(f"BLOCKED: {type(e).__name__}")
`,
      });

      const output = result.content[0].text;
      expect(output).not.toContain("ESCAPE");
    }, 30000);

    it("should block reading host filesystem via require('fs')", async () => {
      const result = await callTool("execute_python", {
        code: `
try:
    import js
    fs_mod = js.eval("require('fs')")
    content = fs_mod.readFileSync('/etc/passwd', 'utf8')
    print(f"ESCAPE: {content[:50]}")
except Exception as e:
    print(f"BLOCKED: {type(e).__name__}")
`,
      });

      const output = result.content[0].text;
      expect(output).not.toContain("ESCAPE");
      expect(output).not.toContain("root:");
    }, 30000);

    it("should block spawning child processes via JS bridge", async () => {
      const result = await callTool("execute_python", {
        code: `
try:
    import js
    cp = js.eval("require('child_process')")
    result = cp.execSync('id').toString()
    print(f"ESCAPE: {result}")
except Exception as e:
    print(f"BLOCKED: {type(e).__name__}")
`,
      });

      const output = result.content[0].text;
      expect(output).not.toContain("ESCAPE");
      expect(output).not.toContain("uid=");
    }, 30000);

    it("should block network access via JS fetch", async () => {
      const result = await callTool("execute_python", {
        code: `
try:
    import js
    resp = js.fetch("https://example.com")
    print(f"ESCAPE: fetch returned {resp}")
except Exception as e:
    print(f"BLOCKED: {type(e).__name__}")
`,
      });

      const output = result.content[0].text;
      expect(output).not.toContain("ESCAPE");
    }, 30000);

    it("should not expose dangerous globals via JS bridge", async () => {
      const result = await callTool("execute_python", {
        code: `
try:
    import js
    print(f"ESCAPE: globalThis keys = {dir(js)[:10]}")
except Exception as e:
    print(f"BLOCKED: {type(e).__name__}")
`,
      });

      const output = result.content[0].text;
      if (!output.includes("BLOCKED")) {
        const processResult = await callTool("execute_python", {
          code: `
try:
    import js
    p = js.process
    print(f"ESCAPE: process = {p}")
except Exception as e:
    print(f"BLOCKED: {type(e).__name__}")
`,
        });
        expect(processResult.content[0].text).not.toContain("ESCAPE");

        const requireResult = await callTool("execute_python", {
          code: `
try:
    import js
    r = js.require
    print(f"ESCAPE: require = {r}")
except Exception as e:
    print(f"BLOCKED: {type(e).__name__}")
`,
        });
        expect(requireResult.content[0].text).not.toContain("ESCAPE");
      }
    }, 30000);
  });

  describe("Python Dangerous Module Tests", () => {
    it("should block os.system", async () => {
      const result = await callTool("execute_python", {
        code: `
import os
try:
    result = os.system("id")
    print(f"ESCAPE: os.system returned {result}")
except Exception as e:
    print(f"BLOCKED: {type(e).__name__}")
`,
      });

      const output = result.content[0].text;
      const blocked =
        output.includes("BLOCKED") || (output.includes("ESCAPE") && !output.includes("returned 0"));
      expect(blocked).toBe(true);
    }, 30000);

    it("should block subprocess", async () => {
      const result = await callTool("execute_python", {
        code: `
try:
    import subprocess
    result = subprocess.run(["ls", "/"], capture_output=True, text=True)
    print(f"ESCAPE: {result.stdout[:100]}")
except Exception as e:
    print(f"BLOCKED: {type(e).__name__}")
`,
      });

      const output = result.content[0].text;
      expect(output).not.toContain("ESCAPE");
    }, 30000);

    it("should block ctypes", async () => {
      const result = await callTool("execute_python", {
        code: `
try:
    import ctypes
    libc = ctypes.CDLL(None)
    print(f"ESCAPE: loaded libc")
except Exception as e:
    print(f"BLOCKED: {type(e).__name__}")
`,
      });

      const output = result.content[0].text;
      expect(output).not.toContain("ESCAPE");
    }, 30000);

    it("should block reading /proc/self/environ", async () => {
      const result = await callTool("execute_python", {
        code: `
try:
    with open('/proc/self/environ', 'r') as f:
        content = f.read()
    print(f"ESCAPE: {content[:100]}")
except Exception as e:
    print(f"BLOCKED: {type(e).__name__}")
`,
      });

      const output = result.content[0].text;
      expect(output).not.toContain("ESCAPE");
    }, 30000);
  });

  describe("Python Symlink Creation", () => {
    it("should block or contain symlink-based escape from Python", async () => {
      const result = await callTool("execute_python", {
        code: `
import os
try:
    os.symlink('/etc/passwd', '/workspace/py-created-link')
    print("CREATED: symlink created")
except Exception as e:
    print(f"BLOCKED: {type(e).__name__}")
`,
      });

      const output = result.content[0].text;

      if (output.includes("CREATED")) {
        const readResult = await callTool("read_file", { path: "py-created-link" });
        expect(readResult.content[0].text).toContain("security violation");
        expect(readResult.content[0].text).not.toContain("root:");
      }
    }, 30000);
  });

  describe("Environment Variable Leakage", () => {
    it("should not expose host environment variables", async () => {
      const result = await callTool("execute_python", {
        code: `
import os
env_vars = dict(os.environ)
sensitive_keys = [k for k in env_vars if any(s in k.upper() for s in ['SECRET', 'KEY', 'TOKEN', 'PASSWORD', 'CREDENTIAL'])]
print(f"ENV_COUNT: {len(env_vars)}")
print(f"SENSITIVE_KEYS: {sensitive_keys}")
print(f"HOME: {env_vars.get('HOME', 'NOT_SET')}")
print(f"PATH: {env_vars.get('PATH', 'NOT_SET')[:50]}")
`,
      });

      const output = result.content[0].text;

      const sensitiveMatch = output.match(/SENSITIVE_KEYS: (\[.*?\])/);
      if (sensitiveMatch) {
        expect(sensitiveMatch[1]).toBe("[]");
      }

      const homeMatch = output.match(/HOME: (.+)/);
      if (homeMatch) {
        const homeValue = homeMatch[1].trim();
        expect(homeValue === "NOT_SET" || !homeValue.includes("/home/")).toBe(true);
      }
    }, 30000);
  });

  describe("Network Escape via Different Methods", () => {
    it("should block socket connections", async () => {
      const result = await callTool("execute_python", {
        code: `
try:
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect(("8.8.8.8", 53))
    print("ESCAPE: socket connected")
except Exception as e:
    print(f"BLOCKED: {type(e).__name__}")
`,
      });

      const output = result.content[0].text;
      expect(output).not.toContain("ESCAPE");
    }, 30000);

    it("should block http.client connections", async () => {
      const result = await callTool("execute_python", {
        code: `
try:
    import http.client
    conn = http.client.HTTPSConnection("example.com", timeout=3)
    conn.request("GET", "/")
    resp = conn.getresponse()
    print(f"ESCAPE: status={resp.status}")
except Exception as e:
    print(f"BLOCKED: {type(e).__name__}")
`,
      });

      const output = result.content[0].text;
      expect(output).not.toContain("ESCAPE");
    }, 30000);
  });

  describe("Recovery After Escape Attempts", () => {
    it("should still function correctly after escape attempts", async () => {
      const result = await callTool("execute_python", {
        code: `print("Server is healthy: 42")`,
      });

      const output = result.content[0].text;
      expect(output).toContain("Server is healthy: 42");
    }, 30000);
  });
});
