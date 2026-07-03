import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import { readConfig } from "../sysdef-src/configuration";

describe("readConfig", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sysdef-config-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const writeConfig = (contents: string) => {
    fs.writeFileSync(path.join(dir, "config.yaml"), contents);
  };

  test("parses a valid config", () => {
    writeConfig(`
providers:
  - apt
  - cargo
modules:
  - core
variables:
  HOME: /home/me
`);
    const config = readConfig(dir);
    expect(config.providers).toEqual(["apt", "cargo"]);
    expect(config.modules).toEqual(["core"]);
    expect(config.variables).toEqual({ HOME: "/home/me" });
  });

  test("parses empty providers/modules lists", () => {
    writeConfig(`
providers: []
modules: []
variables: {}
`);
    const config = readConfig(dir);
    expect(config.providers).toEqual([]);
    expect(config.modules).toEqual([]);
    expect(config.variables).toEqual({});
  });
});
