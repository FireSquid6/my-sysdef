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
});

