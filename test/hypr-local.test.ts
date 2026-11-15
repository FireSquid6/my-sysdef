import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const fixtures: string[] = [];
afterEach(() => { for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true }); });

test.each([false, true])("Hyprland optional local module: present=%s; load does not run login hooks", present => {
  const root = mkdtempSync(join(tmpdir(), "hypr-local-"));
  fixtures.push(root);
  const config = join(root, "config with spaces");
  mkdirSync(join(config, "sysdef"), { recursive: true });
  if (present) writeFileSync(join(config, "sysdef/hyprland-local.lua"), `
    localLoaded = true
    hl.on("hyprland.start", function() hl.exec_cmd("fixture-start") end)
  `);
  const result = Bun.spawnSync(["lua", "-e", `
    local callbacks, commands = {}, {}
    local proxy = {}
    setmetatable(proxy, { __index = function() return proxy end, __call = function() return proxy end })
    hl = setmetatable({
      on = function(name, callback) if name == "hyprland.start" then table.insert(callbacks, callback) end end,
      exec_cmd = function(command) table.insert(commands, command) end,
    }, { __index = function() return proxy end })
    dofile(os.getenv("TEST_HYPR_CONFIG"))
    assert((localLoaded == true) == (os.getenv("TEST_EXPECT_LOCAL") == "true"), "Optional local module discovery failed")
    assert(#commands == 0, "Config evaluation ran a startup command")
    if localLoaded then
      callbacks[#callbacks]()
      assert(commands[1] == "fixture-start", "Local login callback not registered")
    end
  `], { env: { ...process.env, XDG_CONFIG_HOME: config, HYPRLAND_CMD: "--verify-config", TEST_HYPR_CONFIG: resolve("dotfiles/hypr/hyprland.lua"), TEST_EXPECT_LOCAL: String(present) } });
  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
});
