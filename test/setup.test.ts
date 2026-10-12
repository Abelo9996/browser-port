import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runSetup, replaceTomlTable } from "../src/setup/setup.js";

describe("runSetup", () => {
  let home: string;
  beforeEach(async () => {
    home = await mkdtemp(path.join(tmpdir(), "bp-home-"));
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("dry run writes nothing", async () => {
    const r = await runSetup({ apply: false, home });
    expect(r.apply).toBe(false);
    expect(r.actions.every((a) => a.status === "would-add")).toBe(true);
    expect(existsSync(path.join(home, ".claude.json"))).toBe(false);
    expect(existsSync(path.join(home, ".codex", "config.toml"))).toBe(false);
    expect(existsSync(path.join(home, ".cursor", "mcp.json"))).toBe(false);
  });

  it("apply writes all three configs", async () => {
    const r = await runSetup({ apply: true, home });
    expect(r.actions.every((a) => a.status === "added")).toBe(true);

    const claude = JSON.parse(await readFile(path.join(home, ".claude.json"), "utf8"));
    expect(claude.mcpServers["browser-port"].command).toBe("npx");
    expect(claude.mcpServers["browser-port"].args).toEqual(["-y", "browser-port", "mcp"]);

    const cursor = JSON.parse(await readFile(path.join(home, ".cursor", "mcp.json"), "utf8"));
    expect(cursor.mcpServers["browser-port"]).toBeTruthy();

    const toml = await readFile(path.join(home, ".codex", "config.toml"), "utf8");
    expect(toml).toContain("[mcp_servers.browser-port]");
    expect(toml).toContain('command = "npx"');
  });

  it("is idempotent", async () => {
    await runSetup({ apply: true, home });
    const second = await runSetup({ apply: true, home });
    expect(second.actions.every((a) => a.status === "unchanged")).toBe(true);
  });

  it("preserves existing config and backs it up", async () => {
    const codexDir = path.join(home, ".codex");
    await mkdir(codexDir, { recursive: true });
    await writeFile(path.join(codexDir, "config.toml"), 'model = "gpt-5"\n\n[other]\nkey = "value"\n');
    await runSetup({ apply: true, home });
    const toml = await readFile(path.join(codexDir, "config.toml"), "utf8");
    expect(toml).toContain('model = "gpt-5"');
    expect(toml).toContain("[other]");
    expect(toml).toContain("[mcp_servers.browser-port]");
    expect(existsSync(path.join(codexDir, "config.toml.bak"))).toBe(true);
  });
});

describe("replaceTomlTable", () => {
  it("replaces an existing table in place", () => {
    const src = '[a]\nx = 1\n\n[mcp_servers.browser-port]\ncommand = "old"\n\n[b]\ny = 2\n';
    const block = '[mcp_servers.browser-port]\ncommand = "npx"\nargs = ["-y", "browser-port", "mcp"]';
    const out = replaceTomlTable(src, "[mcp_servers.browser-port]", block);
    expect(out).toContain('command = "npx"');
    expect(out).not.toContain('command = "old"');
    expect(out).toContain("[a]");
    expect(out).toContain("[b]");
  });
});
