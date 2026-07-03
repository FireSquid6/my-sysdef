import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import { Lockfile } from "../sysdef-src/lockfile";

describe("Lockfile", () => {
  describe("get/set/delete", () => {
    test("returns undefined for unknown provider", () => {
      const lf = new Lockfile();
      expect(lf.getVersion("apt", "vim")).toBeUndefined();
    });

    test("returns undefined for unknown package in known provider", () => {
      const lf = new Lockfile();
      lf.setVersion("apt", "vim", "1.0.0");
      expect(lf.getVersion("apt", "emacs")).toBeUndefined();
    });

    test("stores and retrieves a version", () => {
      const lf = new Lockfile();
      lf.setVersion("apt", "vim", "8.2");
      expect(lf.getVersion("apt", "vim")).toBe("8.2");
    });

    test("keeps providers namespaced separately", () => {
      const lf = new Lockfile();
      lf.setVersion("apt", "vim", "8.2");
      lf.setVersion("cargo", "vim", "9.9");
      expect(lf.getVersion("apt", "vim")).toBe("8.2");
      expect(lf.getVersion("cargo", "vim")).toBe("9.9");
    });

    test("overwrites an existing version", () => {
      const lf = new Lockfile();
      lf.setVersion("apt", "vim", "8.2");
      lf.setVersion("apt", "vim", "9.0");
      expect(lf.getVersion("apt", "vim")).toBe("9.0");
    });

    test("deletes a package", () => {
      const lf = new Lockfile();
      lf.setVersion("apt", "vim", "8.2");
      lf.delete("apt", "vim");
      expect(lf.getVersion("apt", "vim")).toBeUndefined();
    });

    test("getPackages lists recorded package names for a provider", () => {
      const lf = new Lockfile();
      lf.setVersion("apt", "vim", "8.2");
      lf.setVersion("apt", "git", "2.39");
      lf.setVersion("cargo", "ripgrep", "13.0.0");
      expect(lf.getPackages("apt").sort()).toEqual(["git", "vim"]);
      expect(lf.getPackages("cargo")).toEqual(["ripgrep"]);
    });

    test("getPackages returns [] for an unknown provider", () => {
      const lf = new Lockfile();
      expect(lf.getPackages("apt")).toEqual([]);
    });

    test("getPackages reflects delete", () => {
      const lf = new Lockfile();
      lf.setVersion("apt", "vim", "8.2");
      lf.setVersion("apt", "git", "2.39");
      lf.delete("apt", "vim");
      expect(lf.getPackages("apt")).toEqual(["git"]);
    });

    test("delete is a no-op for unknown provider/package", () => {
      const lf = new Lockfile();
      expect(() => lf.delete("apt", "vim")).not.toThrow();
      lf.setVersion("apt", "vim", "8.2");
      expect(() => lf.delete("apt", "emacs")).not.toThrow();
      expect(lf.getVersion("apt", "vim")).toBe("8.2");
    });
  });

  describe("serialization", () => {
    let dir: string;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "sysdef-lock-"));
    });
    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test("round-trips through a file", () => {
      const lf = new Lockfile();
      lf.setVersion("apt", "vim", "8.2");
      lf.setVersion("cargo", "ripgrep", "13.0.0");
      const fp = path.join(dir, "lock.json");
      lf.serializeToFile(fp);

      const loaded = new Lockfile();
      loaded.readFromFile(fp);
      expect(loaded.getVersion("apt", "vim")).toBe("8.2");
      expect(loaded.getVersion("cargo", "ripgrep")).toBe("13.0.0");
    });

    test("writes valid JSON matching the nested schema", () => {
      const lf = new Lockfile();
      lf.setVersion("apt", "vim", "8.2");
      const fp = path.join(dir, "lock.json");
      lf.serializeToFile(fp);
      const parsed = JSON.parse(fs.readFileSync(fp).toString());
      expect(parsed).toEqual({ apt: { vim: "8.2" } });
    });

    test("reading a missing file leaves the lockfile empty", () => {
      const lf = new Lockfile();
      lf.readFromFile(path.join(dir, "does-not-exist.json"));
      expect(lf.getVersion("apt", "vim")).toBeUndefined();
    });
  });
});
