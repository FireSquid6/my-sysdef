import { describe, test, expect } from "bun:test";
import {
  ANY_VERSION_STRING,
  type PackageInfo,
  type Shell,
  type ShellOptions,
  type ShellResult,
} from "../sysdef-src/sysdef";

import aptGen from "../providers/apt";
import archGen from "../providers/arch-official";
import aurGen from "../providers/aur";
import cargoGen from "../providers/cargo";
import bunGen from "../providers/bun";
import customGen from "../providers/custom";
import npmGen from "../providers/npm";
import pipxGen from "../providers/pipx";
import goGen from "../providers/go";
import dnfGen from "../providers/dnf";

// A recording mock Shell. Providers receive this via their generator, so every
// command they build with the injected `run` is captured here. Canned responses
// can be keyed by the exact command string.
function mockShell(responses: Record<string, Partial<ShellResult>> = {}) {
  const calls: Array<{ cmd: string; options: ShellOptions }> = [];
  const shell: Shell = async (s, options) => {
    const cmd = Array.isArray(s) ? s.join(" ") : s;
    calls.push({ cmd, options: options ?? {} });
    const r = responses[cmd];
    return { code: r?.code ?? 0, stdout: r?.stdout ?? "" };
  };
  return { shell, calls, cmds: () => calls.map((c) => c.cmd) };
}

const pkg = (name: string, version: string, provider: string): PackageInfo => ({
  name,
  version,
  provider,
});

describe("apt provider", () => {
  test("install builds a single batched `apt install -y` command as root", async () => {
    const { shell, calls, cmds } = mockShell();
    const p = aptGen(shell);
    await p.install([pkg("vim", ANY_VERSION_STRING, "apt"), pkg("git", "1:2.39", "apt")]);
    expect(cmds()).toEqual(["apt install -y vim git=1:2.39"]);
    expect(calls[0]!.options.asRoot).toBe(true);
  });

  test("install batches in groups of 10", async () => {
    const { shell, cmds } = mockShell();
    const p = aptGen(shell);
    const many = Array.from({ length: 23 }, (_, i) => pkg(`p${i}`, ANY_VERSION_STRING, "apt"));
    await p.install(many);
    const calls = cmds();
    expect(calls).toHaveLength(3); // 10 + 10 + 3
    expect(calls[0]!.split(" ").length).toBe(3 + 10); // "apt install -y" + 10 names
    expect(calls[2]!).toContain("p20 p21 p22");
  });

  test("uninstall builds `apt remove -y` as root", async () => {
    const { shell, calls, cmds } = mockShell();
    const p = aptGen(shell);
    await p.uninstall(["vim", "git"]);
    expect(cmds()).toEqual(["apt remove -y vim git"]);
    expect(calls[0]!.options.asRoot).toBe(true);
  });

  test("update with no packages does a full upgrade (two separate commands) as root", async () => {
    const { shell, calls, cmds } = mockShell();
    const p = aptGen(shell);
    await p.update([]);
    // defaultShell has no shell, so `&&` can't be used -- must be two commands
    expect(cmds()).toEqual(["apt update", "apt upgrade -y"]);
    expect(calls.every((c) => c.options.asRoot === true)).toBe(true);
  });

  test("update with packages installs each as root", async () => {
    const { shell, calls, cmds } = mockShell();
    const p = aptGen(shell);
    await p.update(["vim", "git"]);
    expect(cmds().sort()).toEqual(["apt install -y git", "apt install -y vim"]);
    expect(calls.every((c) => c.options.asRoot === true)).toBe(true);
  });

  test("checkInstallation probes with `which apt`", async () => {
    const { shell, cmds } = mockShell();
    const p = aptGen(shell);
    await p.checkInstallation!();
    expect(cmds()).toEqual(["which apt"]);
  });
});

describe("arch-official provider", () => {
  test("install uses pacman -S as root, batched by 5", async () => {
    const { shell, calls, cmds } = mockShell();
    const p = archGen(shell);
    const many = Array.from({ length: 6 }, (_, i) => pkg(`p${i}`, ANY_VERSION_STRING, "arch-official"));
    await p.install(many);
    expect(cmds()).toHaveLength(2); // 5 + 1
    expect(cmds()[0]).toBe("pacman -S --noconfirm p0 p1 p2 p3 p4");
    expect(calls[0]!.options.asRoot).toBe(true);
  });

  test("install uses plain names (no version syntax)", async () => {
    const { shell, cmds } = mockShell();
    const p = archGen(shell);
    await p.install([pkg("vim", ANY_VERSION_STRING, "arch-official")]);
    expect(cmds()).toEqual(["pacman -S --noconfirm vim"]);
  });

  // pinned-version rejection (errorOut -> exit 1) is covered in exit-paths.test.ts

  test("uninstall uses pacman -Rs as root", async () => {
    const { shell, calls, cmds } = mockShell();
    const p = archGen(shell);
    await p.uninstall(["vim"]);
    expect(cmds()).toEqual(["pacman -Rs --noconfirm vim"]);
    expect(calls[0]!.options.asRoot).toBe(true);
  });

  test("update uses pacman -Syu as root", async () => {
    const { shell, calls, cmds } = mockShell();
    const p = archGen(shell);
    await p.update(["vim"]);
    expect(cmds()).toEqual(["pacman -Syu --noconfirm vim"]);
    expect(calls[0]!.options.asRoot).toBe(true);
  });

  test("checkInstallation probes with `which pacman`", async () => {
    const { shell, cmds } = mockShell();
    const p = archGen(shell);
    await p.checkInstallation!();
    expect(cmds()).toEqual(["which pacman"]);
  });
});

describe("aur provider", () => {
  // install()/update() build from the AUR via realShell (git clone + makepkg), so
  // they aren't mock-testable here; they're covered by the gated aur.e2e.ts.
  // pinned-version rejection is covered in exit-paths.test.ts.
  test("uninstall uses pacman -Rs as root", async () => {
    const { shell, calls, cmds } = mockShell();
    const p = aurGen(shell);
    await p.uninstall(["some-aur-pkg"]);
    expect(cmds()).toEqual(["pacman -Rs --noconfirm some-aur-pkg"]);
    expect(calls[0]!.options.asRoot).toBe(true);
  });

  test("checkInstallation probes with `which pacman`", async () => {
    const { shell, cmds } = mockShell();
    const p = aurGen(shell);
    await p.checkInstallation!();
    expect(cmds()).toEqual(["which pacman"]);
  });
});

describe("cargo provider", () => {
  test("install omits --version for ANY_VERSION_STRING", async () => {
    const { shell, cmds } = mockShell();
    const p = cargoGen(shell);
    await p.install([pkg("ripgrep", ANY_VERSION_STRING, "cargo")]);
    expect(cmds()).toEqual(["cargo install ripgrep"]);
  });

  test("install pins with --version", async () => {
    const { shell, cmds } = mockShell();
    const p = cargoGen(shell);
    await p.install([pkg("ripgrep", "13.0.0", "cargo")]);
    expect(cmds()).toEqual(["cargo install ripgrep --version 13.0.0"]);
  });

  test("uninstall uses cargo uninstall", async () => {
    const { shell, cmds } = mockShell();
    const p = cargoGen(shell);
    await p.uninstall(["ripgrep"]);
    expect(cmds()).toEqual(["cargo uninstall ripgrep"]);
  });

  test("update with packages reinstalls each at latest", async () => {
    const { shell, cmds } = mockShell();
    const p = cargoGen(shell);
    await p.update(["ripgrep"]);
    expect(cmds()).toEqual(["cargo install ripgrep"]);
  });

  // getInstalled uses realShell (so it works under --dry-run); its parsing is
  // covered by cargo.e2e.ts rather than a mock here.
});

describe("bun provider", () => {
  // BUN_USER is hard-coded in the provider, so assert on the shape of the command
  // rather than the exact home path.
  test("install targets the global bun with @version and -E", async () => {
    const { shell, cmds } = mockShell();
    const p = bunGen(shell);
    await p.install([pkg("typescript", "5.9.3", "bun")]);
    expect(cmds()).toHaveLength(1);
    expect(cmds()[0]).toMatch(/\.bun\/bin\/bun install -g typescript@5\.9\.3 -E$/);
  });

  test("install uses @latest for ANY_VERSION_STRING", async () => {
    const { shell, cmds } = mockShell();
    const p = bunGen(shell);
    await p.install([pkg("@tailwindcss/cli", ANY_VERSION_STRING, "bun")]);
    expect(cmds()[0]).toMatch(/install -g @tailwindcss\/cli@latest -E$/);
  });

  test("install batches all packages into one command (avoids global package.json races)", async () => {
    const { shell, cmds } = mockShell();
    const p = bunGen(shell);
    await p.install([
      pkg("is-odd", ANY_VERSION_STRING, "bun"),
      pkg("left-pad", "1.2.0", "bun"),
    ]);
    expect(cmds()).toHaveLength(1);
    expect(cmds()[0]).toMatch(/install -g is-odd@latest left-pad@1\.2\.0 -E$/);
  });

  test("install with no packages shells out nothing", async () => {
    const { shell, cmds } = mockShell();
    const p = bunGen(shell);
    await p.install([]);
    expect(cmds()).toEqual([]);
  });

  test("uninstall uses `bun remove -g` with all packages", async () => {
    const { shell, cmds } = mockShell();
    const p = bunGen(shell);
    await p.uninstall(["typescript", "is-odd"]);
    expect(cmds()).toHaveLength(1);
    expect(cmds()[0]).toMatch(/\.bun\/bin\/bun remove -g typescript is-odd$/);
  });

  test("update uses `bun update -g`", async () => {
    const { shell, cmds } = mockShell();
    const p = bunGen(shell);
    await p.update(["typescript"]);
    expect(cmds()[0]).toMatch(/\.bun\/bin\/bun update -g typescript$/);
  });
});

describe("custom provider", () => {
  test("is a no-op that reports nothing installed", async () => {
    const { shell, cmds } = mockShell();
    const p = customGen(shell);
    await p.checkInstallation!();
    await p.install([pkg("whatever", ANY_VERSION_STRING, "custom")]);
    await p.uninstall(["whatever"]);
    await p.update(["whatever"]);
    expect(await p.getInstalled()).toEqual([]);
    expect(cmds()).toEqual([]); // never shells out
  });
});

describe("npm provider", () => {
  test("install batches into one `npm install -g` with @version / @latest", async () => {
    const { shell, cmds } = mockShell();
    const p = npmGen(shell);
    await p.install([pkg("is-odd", ANY_VERSION_STRING, "npm"), pkg("left-pad", "1.2.0", "npm")]);
    expect(cmds()).toEqual(["npm install -g is-odd@latest left-pad@1.2.0"]);
  });

  test("install with no packages shells out nothing", async () => {
    const { shell, cmds } = mockShell();
    const p = npmGen(shell);
    await p.install([]);
    expect(cmds()).toEqual([]);
  });

  test("uninstall uses `npm uninstall -g`", async () => {
    const { shell, cmds } = mockShell();
    const p = npmGen(shell);
    await p.uninstall(["is-odd", "left-pad"]);
    expect(cmds()).toEqual(["npm uninstall -g is-odd left-pad"]);
  });

  test("update installs each at latest", async () => {
    const { shell, cmds } = mockShell();
    const p = npmGen(shell);
    await p.update(["typescript"]);
    expect(cmds()).toEqual(["npm install -g typescript@latest"]);
  });

  test("checkInstallation probes with `which npm`", async () => {
    const { shell, cmds } = mockShell();
    const p = npmGen(shell);
    await p.checkInstallation!();
    expect(cmds()).toEqual(["which npm"]);
  });
});

describe("pipx provider", () => {
  test("install uses `pipx install` per package with == version syntax", async () => {
    const { shell, cmds } = mockShell();
    const p = pipxGen(shell);
    await p.install([pkg("pycowsay", ANY_VERSION_STRING, "pipx"), pkg("black", "23.1.0", "pipx")]);
    expect(cmds()).toEqual(["pipx install --force pycowsay", "pipx install --force black==23.1.0"]);
  });

  test("uninstall uses `pipx uninstall`", async () => {
    const { shell, cmds } = mockShell();
    const p = pipxGen(shell);
    await p.uninstall(["pycowsay"]);
    expect(cmds()).toEqual(["pipx uninstall pycowsay"]);
  });

  test("update uses `pipx upgrade`", async () => {
    const { shell, cmds } = mockShell();
    const p = pipxGen(shell);
    await p.update(["pycowsay"]);
    expect(cmds()).toEqual(["pipx upgrade pycowsay"]);
  });

  test("checkInstallation probes with `which pipx`", async () => {
    const { shell, cmds } = mockShell();
    const p = pipxGen(shell);
    await p.checkInstallation!();
    expect(cmds()).toEqual(["which pipx"]);
  });
});

describe("go provider", () => {
  test("install uses `go install path@version` (default latest)", async () => {
    const { shell, cmds } = mockShell();
    const p = goGen(shell);
    await p.install([
      pkg("rsc.io/2fa", "v1.2.0", "go"),
      pkg("golang.org/x/tools/cmd/stringer", ANY_VERSION_STRING, "go"),
    ]);
    expect(cmds()).toEqual([
      "go install rsc.io/2fa@v1.2.0",
      "go install golang.org/x/tools/cmd/stringer@latest",
    ]);
  });

  test("uninstall removes the binary (basename of the module path) from GOBIN", async () => {
    // GOBIN is resolved via realShell (so it works in --dry-run), so it isn't
    // captured here; we assert the rm targets the binary basename "2fa".
    const { shell, cmds } = mockShell();
    const p = goGen(shell);
    await p.uninstall(["rsc.io/2fa"]);
    expect(cmds().some(c => /^rm -f .*2fa$/.test(c))).toBe(true);
  });

  test("update installs each at latest", async () => {
    const { shell, cmds } = mockShell();
    const p = goGen(shell);
    await p.update(["rsc.io/2fa"]);
    expect(cmds()).toEqual(["go install rsc.io/2fa@latest"]);
  });

  test("checkInstallation probes with `which go`", async () => {
    const { shell, cmds } = mockShell();
    const p = goGen(shell);
    await p.checkInstallation!();
    expect(cmds()).toEqual(["which go"]);
  });
});

describe("dnf provider", () => {
  test("install batches into one `dnf install -y` with name-version syntax as root", async () => {
    const { shell, calls, cmds } = mockShell();
    const p = dnfGen(shell);
    await p.install([pkg("sl", ANY_VERSION_STRING, "dnf"), pkg("cowsay", "3.04-1.fc40", "dnf")]);
    expect(cmds()).toEqual(["dnf install -y sl cowsay-3.04-1.fc40"]);
    expect(calls[0]!.options.asRoot).toBe(true);
  });

  test("uninstall uses `dnf remove -y` as root", async () => {
    const { shell, calls, cmds } = mockShell();
    const p = dnfGen(shell);
    await p.uninstall(["sl", "cowsay"]);
    expect(cmds()).toEqual(["dnf remove -y sl cowsay"]);
    expect(calls[0]!.options.asRoot).toBe(true);
  });

  test("update with no packages upgrades everything as root", async () => {
    const { shell, calls, cmds } = mockShell();
    const p = dnfGen(shell);
    await p.update([]);
    expect(cmds()).toEqual(["dnf upgrade -y"]);
    expect(calls[0]!.options.asRoot).toBe(true);
  });

  test("update with packages upgrades each as root", async () => {
    const { shell, calls, cmds } = mockShell();
    const p = dnfGen(shell);
    await p.update(["sl"]);
    expect(cmds()).toEqual(["dnf upgrade -y sl"]);
    expect(calls[0]!.options.asRoot).toBe(true);
  });

  test("checkInstallation probes with `which dnf`", async () => {
    const { shell, cmds } = mockShell();
    const p = dnfGen(shell);
    await p.checkInstallation!();
    expect(cmds()).toEqual(["which dnf"]);
  });
});
