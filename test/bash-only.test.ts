/**
 * BashManager Tests (Bash Only - No Pyodide)
 *
 * Tests for bash command execution without Python integration
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { BashManager } from "../src/core/bash-manager.js";
import fs from "fs/promises";
import path from "path";

describe("BashManager (Bash Only)", () => {
  let bashManager: BashManager;
  const testWorkspace = path.resolve("./test-workspace-bash-only");

  beforeAll(async () => {
    // Create test workspace
    await fs.mkdir(testWorkspace, { recursive: true });

    // Initialize bash manager
    bashManager = new BashManager(testWorkspace);
    await bashManager.initialize();
  });

  afterAll(async () => {
    // Clean up test workspace
    await fs.rm(testWorkspace, { recursive: true, force: true });
  });

  describe("Basic Commands", () => {
    it("should execute echo command", async () => {
      const result = await bashManager.execute("echo 'Hello, World!'");
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("Hello, World!");
    });

    it("should handle stderr", async () => {
      const result = await bashManager.execute("echo 'error' >&2");
      expect(result.exitCode).toBe(0);
      expect(result.stderr.trim()).toBe("error");
    });

    it("should return non-zero exit code for false", async () => {
      const result = await bashManager.execute("false");
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe("File Operations", () => {
    it("should create and read files", async () => {
      await bashManager.execute("echo 'test' > testfile.txt");
      const result = await bashManager.execute("cat testfile.txt");
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("test");
    });

    it("should list files", async () => {
      await bashManager.execute("touch a.txt b.txt c.txt");
      const result = await bashManager.execute("ls *.txt");
      expect(result.stdout).toContain("a.txt");
      expect(result.stdout).toContain("b.txt");
      expect(result.stdout).toContain("c.txt");
    });

    it("should create directories", async () => {
      const result = await bashManager.execute("mkdir -p dir1/dir2");
      expect(result.exitCode).toBe(0);

      // Verify on host filesystem
      const stat = await fs.stat(path.join(testWorkspace, "dir1/dir2"));
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe("Text Processing", () => {
    it("should use grep", async () => {
      await bashManager.execute("echo -e 'apple\\nbanana\\ncherry' > fruits.txt");
      const result = await bashManager.execute("grep 'an' fruits.txt");
      expect(result.stdout).toContain("banana");
    });

    it("should use wc", async () => {
      await bashManager.execute("echo -e 'one\\ntwo\\nthree' > lines.txt");
      const result = await bashManager.execute("wc -l lines.txt");
      expect(result.stdout).toContain("3");
    });

    it("should use pipes", async () => {
      const result = await bashManager.execute("echo 'test' | grep 'test'");
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("test");
    });
  });

  describe("JSON Processing", () => {
    it("should use jq", async () => {
      await bashManager.execute('echo \'{"name":"Alice"}\' > data.json');
      const result = await bashManager.execute("cat data.json | jq '.name'");
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('"Alice"');
    });
  });

  describe("Find Command", () => {
    it("should find files by name", async () => {
      await bashManager.execute("mkdir -p search/sub");
      await bashManager.execute("touch search/file1.py search/sub/file2.py search/file3.txt");
      const result = await bashManager.execute("find search -name '*.py'");
      expect(result.stdout).toContain("file1.py");
      expect(result.stdout).toContain("file2.py");
      expect(result.stdout).not.toContain("file3.txt");
    });
  });

  describe("Execution Limits", () => {
    it("should prevent infinite loops", async () => {
      const result = await bashManager.execute("while true; do echo 'loop'; done");
      expect(result.exitCode).not.toBe(0);
      // Should hit either loop iterations or command count limit
      expect(result.stderr).toMatch(/maxLoopIterations|maxCommandCount/);
    });
  });

  describe("Working Directory", () => {
    it("should respect cwd option", async () => {
      await bashManager.execute("mkdir -p workdir");
      await bashManager.execute("echo 'content' > workdir/file.txt");
      const result = await bashManager.execute("cat file.txt", { cwd: "/workdir" });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("content");
    });
  });
});
