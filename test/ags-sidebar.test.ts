import { describe, expect, test } from "bun:test";
import { cpuDelta, parseCpu, parseMemory, normalizeTailnet, formatBytes, deviceIP } from "../ags/sidebar-model";

describe("sidebar device clipboard", () => {
  test("prefers IPv4, falls back to IPv6 and leaves missing addresses unavailable", () => {
    expect(deviceIP({ ips: ["fd7a:115c:a1e0::2", "100.64.0.2"] })).toBe("100.64.0.2");
    expect(deviceIP({ ips: ["fd7a:115c:a1e0::2"] })).toBe("fd7a:115c:a1e0::2");
    expect(deviceIP({ ips: [] })).toBeNull();
  });
});

describe("sidebar resource model", () => {
  test("CPU uses aggregate deltas and excludes guest double counting", () => {
    expect(cpuDelta(parseCpu("cpu 10 0 10 80 0 0 0 0 9 0"), parseCpu("cpu 20 0 20 160 0 0 0 0 19 0"))).toBe(20);
    expect(cpuDelta(null, parseCpu("cpu 1 2 3 4"))).toBeNull();
    expect(parseCpu("cpu broken")).toBeNull();
    expect(cpuDelta({ total: 10, idle: 5 }, { total: 9, idle: 4 })).toBeNull();
  });
  test("RAM requires total and available, validates missing/invalid data", () => {
    expect(parseMemory("MemTotal: 1000 kB\nMemAvailable: 400 kB")).toEqual({ total: 1024000, used: 614400 });
    expect(parseMemory("MemTotal: 1000 kB")).toBeNull();
    expect(parseMemory("MemTotal: 1 kB\nMemAvailable: 2 kB")).toBeNull();
    expect(formatBytes(1024)).toBe("1.0 KiB");
    expect(formatBytes(-1)).toBe("Unavailable");
  });
});
describe("tailnet allowlisted normalization", () => {
  test("keeps every device, offline peers and self, deduplicated and sorted", () => {
    const result = normalizeTailnet({ BackendState: "Running", Self: { ID: "s", HostName: "fictional-self", Online: false }, Peer: {
      s: { ID: "s", HostName: "duplicate" }, b: { ID: "b", HostName: "fictional-beta", Online: false }, a: { ID: "a", HostName: "fictional-alpha", Online: true, TailscaleIPs: ["192.0.2.1"], CurAddr: "redacted-direct", PublicKey: "secret" },
    }, Health: ["Fictional health warning"] });
    expect(result.devices.map(d => d.id)).toEqual(["a", "b", "s"]);
    expect(result.devices[2]?.self).toBe(true);
    expect(result.devices[0]?.connection).toBe("Direct");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("redacted-direct");
    expect(result.health).toEqual(["Fictional health warning"]);
  });
  test("does not truncate an entirely offline tailnet", () => {
    const peers = Object.fromEntries(Array.from({ length: 48 }, (_, i) => [`peer-${i}`, { ID: `peer-${i}`, HostName: `fictional-${i}`, Online: false }]));
    const result = normalizeTailnet({ BackendState: "Running", Self: { ID: "self", HostName: "fictional-local", Online: false }, Peer: peers });
    expect(result.devices).toHaveLength(49);
    expect(result.devices.every(d => !d.online)).toBe(true);
    expect(result.devices.some(d => d.self)).toBe(true);
    expect(result.devices.every(d => d.ips.length === 0 && d.connection === "Idle")).toBe(true);
  });
  test("explicit login/daemon/error states and invalid data", () => {
    expect(normalizeTailnet({ BackendState: "NeedsLogin", AuthURL: "secret" }).status).toContain("login");
    expect(normalizeTailnet({ BackendState: "Stopped" }).status).toContain("Stopped");
    expect(normalizeTailnet({}).status).toContain("Invalid");
    expect(normalizeTailnet(null).devices).toEqual([]);
    expect(normalizeTailnet({ BackendState: "Running", Peer: { broken: null } }).devices).toEqual([]);
  });
});
