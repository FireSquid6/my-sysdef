import { describe, expect, test } from "bun:test";
import { archBaseName, parseOwnedCommands, storePackageName } from "../scripts/find-package-duplicates";

describe("package duplicate evidence", () => {
  test("extracts Nix package names including hyphens and multi-output suffixes", () => {
    const hash = "a".repeat(32);
    expect(storePackageName(`/nix/store/${hash}-xdg-desktop-portal-1.20.3`)).toBe("xdg-desktop-portal");
    expect(storePackageName(`/nix/store/${hash}-glibc-2.44-57-bin`)).toBe("glibc");
    expect(storePackageName(`/nix/store/${hash}-personal-workstation`)).toBeUndefined();
  });
  test("only strips conventional Arch variant suffixes", () => {
    expect(archBaseName("hyprland-git")).toBe("hyprland");
    expect(archBaseName("visual-studio-code-bin")).toBe("visual-studio-code");
    expect(archBaseName("git")).toBe("git");
    expect(archBaseName("libgit2")).toBe("libgit2");
  });
  test("maps binary ownership without directory or nested file false matches", () => {
    const owners = parseOwnedCommands("bash /usr/bin/\nbash /usr/bin/bash\nother /bin/bash\nfoo /usr/share/bin/bash\nfoo /usr/bin/subdir/file\n");
    expect([...owners.entries()].map(([name, packages]) => [name, [...packages]])).toEqual([["bash", ["bash", "other"]]]);
  });
});
