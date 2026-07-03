import { describe, test, expect, spyOn } from "bun:test";
import { 
  VariableStore, 
  type PackageInfo, 
  type Provider, 
  type Module, 
  getPackageList,
  syncPackages,
  updateLockfile,
  syncFiles,
  ANY_VERSION_STRING
} from "../sysdef-src/sysdef";
import { Lockfile } from "../sysdef-src/lockfile";
import type { Filesystem } from "../sysdef-src/connections";

describe("VariableStore", () => {
  describe("fillIn", () => {
    test("should replace single variable", () => {
      const store = new VariableStore();
      store.set("name", "John");
      
      const result = store.fillIn("Hello {name}!");
      expect(result).toBe("Hello John!");
    });

    test("should replace multiple variables", () => {
      const store = new VariableStore();
      store.set("first", "John");
      store.set("last", "Doe");
      
      const result = store.fillIn("{first} {last}");
      expect(result).toBe("John Doe");
    });

    test("should handle empty string", () => {
      const store = new VariableStore();
      
      const result = store.fillIn("");
      expect(result).toBe("");
    });

    test("should handle string without variables", () => {
      const store = new VariableStore();
      
      const result = store.fillIn("No variables here");
      expect(result).toBe("No variables here");
    });

    test("should handle undefined variables", () => {
      const store = new VariableStore();
      
      const result = store.fillIn("Hello {undefined}!");
      expect(result).toBe("Hello {undefined}!");
    });

    test("should handle empty variable name", () => {
      const store = new VariableStore();
      
      const result = store.fillIn("Hello {}!");
      expect(result).toBe("Hello {}!");
    });

    test("should handle nested braces", () => {
      const store = new VariableStore();
      store.set("var", "value");
      
      const result = store.fillIn("{{var}}");
      expect(result).toBe("{value}");
    });

    test("should handle unmatched opening brace", () => {
      const store = new VariableStore();
      store.set("name", "John");
      
      const result = store.fillIn("Hello {name");
      expect(result).toBe("Hello {name");
    });

    test("should handle unmatched closing brace", () => {
      const store = new VariableStore();
      store.set("name", "John");
      
      const result = store.fillIn("Hello name}");
      expect(result).toBe("Hello name}");
    });

    test("should handle multiple unmatched braces", () => {
      const store = new VariableStore();
      store.set("name", "John");
      
      const result = store.fillIn("{{{name");
      expect(result).toBe("{{{name");
    });

    test("should handle consecutive variables", () => {
      const store = new VariableStore();
      store.set("a", "A");
      store.set("b", "B");
      
      const result = store.fillIn("{a}{b}");
      expect(result).toBe("AB");
    });

    test("should handle variable at start of string", () => {
      const store = new VariableStore();
      store.set("name", "John");
      
      const result = store.fillIn("{name} is here");
      expect(result).toBe("John is here");
    });

    test("should handle variable at end of string", () => {
      const store = new VariableStore();
      store.set("name", "John");
      
      const result = store.fillIn("Hello {name}");
      expect(result).toBe("Hello John");
    });

    test("should handle same variable multiple times", () => {
      const store = new VariableStore();
      store.set("name", "John");
      
      const result = store.fillIn("{name} {name} {name}");
      expect(result).toBe("John John John");
    });

    test("should handle empty variable value", () => {
      const store = new VariableStore();
      store.set("empty", "");
      
      const result = store.fillIn("Hello {empty}world");
      expect(result).toBe("Hello world");
    });

    test("should handle variable with spaces in name", () => {
      const store = new VariableStore();
      store.set("full name", "John Doe");
      
      const result = store.fillIn("Hello {full name}!");
      expect(result).toBe("Hello John Doe!");
    });

    test("should handle variable with special characters in name", () => {
      const store = new VariableStore();
      store.set("var-1_test", "value");
      
      const result = store.fillIn("{var-1_test}");
      expect(result).toBe("value");
    });

    test("should handle braces in variable value", () => {
      const store = new VariableStore();
      store.set("brackets", "{value}");
      
      const result = store.fillIn("Result: {brackets}");
      expect(result).toBe("Result: {value}");
    });

    test("should handle multiple opening braces before variable", () => {
      const store = new VariableStore();
      store.set("name", "John");
      
      const result = store.fillIn("{{name}");
      expect(result).toBe("{John");
    });

    test("should handle complex nested scenario", () => {
      const store = new VariableStore();
      store.set("inner", "value");
      store.set("outer", "{inner}");
      
      const result = store.fillIn("{outer}");
      expect(result).toBe("{inner}");
    });

    test("should handle mixed content with variables and text", () => {
      const store = new VariableStore();
      store.set("name", "John");
      store.set("age", "25");
      
      const result = store.fillIn("Name: {name}, Age: {age}, Status: Active");
      expect(result).toBe("Name: John, Age: 25, Status: Active");
    });
  });

  describe("other methods", () => {
    test("should get and set variables", () => {
      const store = new VariableStore();
      store.set("key", "value");
      
      expect(store.get("key")).toBe("value");
      expect(store.has("key")).toBe(true);
      expect(store.getSafe("key")).toBe("value");
    });

    test("should throw error for missing variable", () => {
      const store = new VariableStore();
      
      expect(() => store.get("missing")).toThrow();
      expect(store.has("missing")).toBe(false);
      expect(store.getSafe("missing")).toBeUndefined();
    });

    test("should insert all variables from record", () => {
      const store = new VariableStore();
      store.insertAll({ a: "1", b: "2" });
      
      expect(store.get("a")).toBe("1");
      expect(store.get("b")).toBe("2");
    });

    test("should branch off with new variables", () => {
      const store = new VariableStore();
      store.set("original", "value");
      
      const branched = store.branchOff({ new: "added" });
      
      expect(branched.get("original")).toBe("value");
      expect(branched.get("new")).toBe("added");
      expect(() => store.get("new")).toThrow();
    });
  });
});


describe("getPackageList", () => {
  test("should extract packages from modules", () => {
    const mockLockfile = new Lockfile();
    mockLockfile.setVersion("npm", "package1", "1.0.0");
    mockLockfile.setVersion("apt", "package3", "1.0.0");

    const modules: Module[] = [
      {
        name: "test-module",
        variables: {},
        packages: {
          npm: ["package1", "package2:2.0.0"],
          apt: ["package3"]
        },
        directories: {},
        files: {}
      }
    ];

    const result = getPackageList(modules, mockLockfile);
    
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      name: "package1",
      version: "1.0.0",
      provider: "npm"
    });
    expect(result[1]).toEqual({
      name: "package2",
      version: "2.0.0",
      provider: "npm"
    });
    expect(result[2]).toEqual({
      name: "package3",
      version: "1.0.0",
      provider: "apt"
    });
  });

  test("should use ANY_VERSION_STRING when lockfile has no version", () => {
    const mockLockfile = new Lockfile();

    const modules: Module[] = [
      {
        name: "test-module",
        variables: {},
        packages: {
          npm: ["package1"]
        },
        directories: {},
        files: {}
      }
    ];

    const result = getPackageList(modules, mockLockfile);
    
    expect(result[0]!.version).toBe(ANY_VERSION_STRING);
  });
});

describe("syncPackages", () => {
  // records what the provider was asked to install/uninstall
  function recordingProvider(installed: PackageInfo[]) {
    const toInstall: PackageInfo[] = [];
    const toUninstall: string[] = [];
    const provider: Provider = {
      name: "npm",
      install: async (packages) => { toInstall.push(...packages); },
      uninstall: async (packages) => { toUninstall.push(...packages); },
      getInstalled: async () => installed,
      update: async () => {},
    };
    return { provider, toInstall, toUninstall };
  }

  const managed = (...names: string[]) => new Map([["npm", new Set(names)]]);
  const untracked = (...names: string[]) => new Map([["npm", new Set(names)]]);
  const noUntracked = new Map<string, Set<string>>();
  const noop = async () => {};

  test("should install missing packages", async () => {
    const { provider, toInstall, toUninstall } = recordingProvider([]);
    const requested = new Map([["npm", [{ name: "package1", version: "1.0.0", provider: "npm" }]]]);

    await syncPackages(requested, [provider], false, managed(), noUntracked, noop);

    expect(toInstall).toHaveLength(1);
    expect(toInstall[0]!.name).toBe("package1");
    expect(toUninstall).toHaveLength(0);
  });

  test("removes a managed package that is no longer requested", async () => {
    const { provider, toInstall, toUninstall } = recordingProvider([
      { name: "package1", version: "1.0.0", provider: "npm" },
    ]);
    const requested = new Map([["npm", []]]);

    // package1 was previously installed BY sysdef (managed)
    await syncPackages(requested, [provider], false, managed("package1"), noUntracked, noop);

    expect(toInstall).toHaveLength(0);
    expect(toUninstall).toEqual(["package1"]);
  });

  test("NEVER removes a package sysdef did not install (safety)", async () => {
    const { provider, toInstall, toUninstall } = recordingProvider([
      { name: "package1", version: "1.0.0", provider: "npm" },
    ]);
    const requested = new Map([["npm", []]]);

    // package1 is installed but NOT in the managed set -> must be left alone
    await syncPackages(requested, [provider], false, managed(), noUntracked, noop);

    expect(toInstall).toHaveLength(0);
    expect(toUninstall).toHaveLength(0);
  });

  test("does not remove a managed package that is still requested", async () => {
    const { provider, toUninstall } = recordingProvider([
      { name: "package1", version: "1.0.0", provider: "npm" },
    ]);
    const requested = new Map([["npm", [{ name: "package1", version: "1.0.0", provider: "npm" }]]]);

    await syncPackages(requested, [provider], false, managed("package1"), noUntracked, noop);

    expect(toUninstall).toHaveLength(0);
  });

  test("noRemove (--safe) skips uninstalling even managed packages", async () => {
    const { provider, toUninstall } = recordingProvider([
      { name: "package1", version: "1.0.0", provider: "npm" },
    ]);
    const requested = new Map([["npm", []]]);

    await syncPackages(requested, [provider], true, managed("package1"), noUntracked, noop);

    expect(toUninstall).toHaveLength(0);
  });

  test("should handle ANY_VERSION_STRING correctly", async () => {
    const { provider, toInstall, toUninstall } = recordingProvider([
      { name: "package1", version: "1.0.0", provider: "npm" },
    ]);
    const requested = new Map([
      ["npm", [{ name: "package1", version: ANY_VERSION_STRING, provider: "npm" }]],
    ]);

    await syncPackages(requested, [provider], false, managed("package1"), noUntracked, noop);

    expect(toInstall).toHaveLength(0);
    expect(toUninstall).toHaveLength(0);
  });

  test("warns and lists untracked packages when the list is short", async () => {
    const { provider } = recordingProvider([
      { name: "managed1", version: "1.0.0", provider: "npm" },
      { name: "ripgrep", version: "1.0.0", provider: "npm" },
      { name: "bat", version: "1.0.0", provider: "npm" },
    ]);
    const requested = new Map([["npm", [{ name: "managed1", version: "1.0.0", provider: "npm" }]]]);

    const log = spyOn(console, "log").mockImplementation(() => {});
    let out = "";
    try {
      await syncPackages(requested, [provider], false, managed("managed1"), noUntracked, noop);
      out = log.mock.calls.map(c => c.join(" ")).join("\n");
    } finally {
      log.mockRestore();
    }

    // ripgrep + bat are installed but not managed
    expect(out).toContain("2 untracked");
    expect(out).toContain("ripgrep, bat");
    // a managed package must not be reported as untracked
    expect(out).not.toContain("managed1,");
  });

  test("warns with a count only when there are many untracked packages", async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      name: `pkg${i}`, version: "1.0.0", provider: "npm",
    }));
    const { provider } = recordingProvider(many);
    const requested = new Map([["npm", []]]);

    const log = spyOn(console, "log").mockImplementation(() => {});
    let out = "";
    try {
      await syncPackages(requested, [provider], false, managed(), noUntracked, noop);
      out = log.mock.calls.map(c => c.join(" ")).join("\n");
    } finally {
      log.mockRestore();
    }

    expect(out).toContain("20 untracked");
    // over the threshold -> names are not enumerated
    expect(out).not.toContain("pkg0, pkg1");
  });

  test("does not warn when every installed package is managed", async () => {
    const { provider } = recordingProvider([
      { name: "package1", version: "1.0.0", provider: "npm" },
    ]);
    const requested = new Map([["npm", [{ name: "package1", version: "1.0.0", provider: "npm" }]]]);

    const log = spyOn(console, "log").mockImplementation(() => {});
    let out = "";
    try {
      await syncPackages(requested, [provider], false, managed("package1"), noUntracked, noop);
      out = log.mock.calls.map(c => c.join(" ")).join("\n");
    } finally {
      log.mockRestore();
    }

    expect(out).not.toContain("untracked");
  });

  test("suppresses explicitly-untracked packages from the warning", async () => {
    const { provider } = recordingProvider([
      { name: "ripgrep", version: "1.0.0", provider: "npm" },
      { name: "bat", version: "1.0.0", provider: "npm" },
    ]);
    const requested = new Map([["npm", []]]);

    const log = spyOn(console, "log").mockImplementation(() => {});
    let out = "";
    try {
      // ripgrep is explicitly untracked -> only bat should be reported
      await syncPackages(requested, [provider], false, managed(), untracked("ripgrep"), noop);
      out = log.mock.calls.map(c => c.join(" ")).join("\n");
    } finally {
      log.mockRestore();
    }

    expect(out).toContain("1 untracked");
    expect(out).toContain("bat");
    expect(out).not.toContain("ripgrep");
  });

  test("includes a hint pointing at the track command", async () => {
    const { provider } = recordingProvider([
      { name: "ripgrep", version: "1.0.0", provider: "npm" },
    ]);
    const requested = new Map([["npm", []]]);

    const log = spyOn(console, "log").mockImplementation(() => {});
    let out = "";
    try {
      await syncPackages(requested, [provider], false, managed(), noUntracked, noop);
      out = log.mock.calls.map(c => c.join(" ")).join("\n");
    } finally {
      log.mockRestore();
    }

    expect(out).toContain("sysdef track ignore-all npm");
    expect(out).toContain("sysdef track ignore npm");
  });
});

describe("updateLockfile", () => {
  function providerReturning(installed: PackageInfo[]): Provider {
    return {
      name: "npm",
      install: async () => {},
      uninstall: async () => {},
      getInstalled: async () => installed,
      update: async () => {},
    };
  }

  test("records requested packages at their installed version", async () => {
    const lockfile = new Lockfile();
    const provider = providerReturning([
      { name: "package1", version: "1.0.0", provider: "npm" },
      { name: "package2", version: "2.0.0", provider: "npm" },
    ]);
    const requested = new Map([["npm", [
      { name: "package1", version: ANY_VERSION_STRING, provider: "npm" },
      { name: "package2", version: "2.0.0", provider: "npm" },
    ]]]);

    await updateLockfile(requested, [provider], lockfile);

    expect(lockfile.getVersion("npm", "package1")).toBe("1.0.0"); // resolved from install
    expect(lockfile.getVersion("npm", "package2")).toBe("2.0.0");
  });

  test("does NOT record installed packages that were not requested", async () => {
    const lockfile = new Lockfile();
    const provider = providerReturning([
      { name: "requested", version: "1.0.0", provider: "npm" },
      { name: "unmanaged", version: "9.0.0", provider: "npm" },
    ]);
    const requested = new Map([["npm", [
      { name: "requested", version: ANY_VERSION_STRING, provider: "npm" },
    ]]]);

    await updateLockfile(requested, [provider], lockfile);

    expect(lockfile.getVersion("npm", "requested")).toBe("1.0.0");
    expect(lockfile.getVersion("npm", "unmanaged")).toBeUndefined();
  });

  test("drops a previously-managed package that is no longer requested", async () => {
    const lockfile = new Lockfile();
    lockfile.setVersion("npm", "old", "1.0.0"); // was managed before
    const provider = providerReturning([
      { name: "kept", version: "2.0.0", provider: "npm" },
    ]);
    const requested = new Map([["npm", [
      { name: "kept", version: ANY_VERSION_STRING, provider: "npm" },
    ]]]);

    await updateLockfile(requested, [provider], lockfile);

    expect(lockfile.getVersion("npm", "kept")).toBe("2.0.0");
    expect(lockfile.getVersion("npm", "old")).toBeUndefined();
  });

  test("falls back to the requested version when not readable from install", async () => {
    const lockfile = new Lockfile();
    const provider = providerReturning([]); // getInstalled reports nothing
    const requested = new Map([["npm", [
      { name: "package1", version: "3.1.4", provider: "npm" },
    ]]]);

    await updateLockfile(requested, [provider], lockfile);

    expect(lockfile.getVersion("npm", "package1")).toBe("3.1.4");
  });
});

describe("syncFiles", () => {
  test("should create symlinks and write files", async () => {
    const symlinkCalls: Array<{dest: string, src: string}> = [];
    const fileCalls: Array<{path: string, content: string}> = [];

    const mockFilesystem: Filesystem = {
      ensureSymlink: async (dest: string, src: string) => {
        symlinkCalls.push({dest, src});
      },
      writeFile: async (path: string, content: string) => {
        fileCalls.push({path, content});
      },
      exists: async () => true,
      copy: async () => {},
    };

    const store = new VariableStore();
    store.set("home", "/home/user");

    const modules: Module[] = [
      {
        name: "test-module",
        variables: { localVar: "test" },
        packages: {},
        directories: {
          "{home}/.config": "config"
        },
        files: {
          "{home}/.bashrc": "bashrc",
          "{home}/.profile": (store) => `export VAR=${store.get("localVar")}`
        }
      }
    ];

    await syncFiles(modules, store, mockFilesystem, "/root/sysdef");

    expect(symlinkCalls).toHaveLength(2);
    expect(symlinkCalls.find(call => call.dest === "/home/user/.config")).toBeDefined();
    expect(symlinkCalls.find(call => call.dest === "/home/user/.bashrc")).toBeDefined();
    
    expect(fileCalls).toHaveLength(1);
    expect(fileCalls[0]!.path).toBe("/home/user/.profile");
    expect(fileCalls[0]!.content).toBe("export VAR=test");
  });
});

