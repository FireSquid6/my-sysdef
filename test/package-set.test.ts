import { describe, test, expect } from "bun:test";
import { type PackageInfo, } from "../sysdef-src/sysdef";
import { PackageSet } from "../sysdef-src/package-set";


describe("PackageSet", () => {
  test("should add and check packages", () => {
    const set = new PackageSet();
    const pkg: PackageInfo = {
      name: "test",
      version: "1.0.0",
      provider: "npm"
    };

    set.add(pkg);
    
    expect(set.has(pkg)).toBe(true);
    expect(set.hasAnyVersion({name: "test", provider: "npm"})).toBe(true);
    expect(set.hasAnyVersion({name: "other", provider: "npm"})).toBe(false);
  });

  test("should add multiple packages with addList", () => {
    const set = new PackageSet();
    const packages: PackageInfo[] = [
      { name: "pkg1", version: "1.0.0", provider: "npm" },
      { name: "pkg2", version: "2.0.0", provider: "npm" }
    ];

    set.addList(packages);

    expect(set.has(packages[0]!)).toBe(true);
    expect(set.has(packages[1]!)).toBe(true);
    expect(set.hasAnyVersion({name: "pkg1", provider: "npm"})).toBe(true);
    expect(set.hasAnyVersion({name: "pkg2", provider: "npm"})).toBe(true);
  });

  test("has() is version-sensitive", () => {
    const set = new PackageSet();
    set.add({ name: "vim", version: "8.2", provider: "apt" });

    expect(set.has({ name: "vim", version: "8.2", provider: "apt" })).toBe(true);
    // a different version is NOT considered present by has()
    expect(set.has({ name: "vim", version: "9.0", provider: "apt" })).toBe(false);
    // ...but hasAnyVersion ignores the version
    expect(set.hasAnyVersion({ name: "vim", provider: "apt" })).toBe(true);
  });

  test("distinguishes packages by provider", () => {
    const set = new PackageSet();
    set.add({ name: "vim", version: "8.2", provider: "apt" });

    expect(set.hasAnyVersion({ name: "vim", provider: "apt" })).toBe(true);
    expect(set.hasAnyVersion({ name: "vim", provider: "cargo" })).toBe(false);
    expect(set.has({ name: "vim", version: "8.2", provider: "cargo" })).toBe(false);
  });

  test("empty set contains nothing", () => {
    const set = new PackageSet();
    expect(set.has({ name: "vim", version: "8.2", provider: "apt" })).toBe(false);
    expect(set.hasAnyVersion({ name: "vim", provider: "apt" })).toBe(false);
  });
});

