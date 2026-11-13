import { describe, expect, test } from "bun:test";
import { createCaffeineModel } from "../ags/caffeine-model";

function harness() {
  let acquisitions = 0, releases = 0;
  const model = createCaffeineModel(async () => { acquisitions++; return () => { releases++; }; }, () => {});
  return { model, acquisitions: () => acquisitions, releases: () => releases };
}

describe("Caffeine idle inhibition", () => {
  test("starts off, only enables when ready, and releases on toggle off", async () => {
    const h = harness();
    await h.model.toggle();
    expect(h.acquisitions()).toBe(0);
    h.model.ready(false);
    await h.model.toggle();
    expect(h.model.state().enabled).toBe(true);
    expect(h.acquisitions()).toBe(1);
    await h.model.toggle();
    expect(h.model.state().enabled).toBe(false);
    expect(h.releases()).toBe(1);
  });
  test("lid closure releases inhibition; reopening never re-enables it", async () => {
    const h = harness();
    h.model.ready(false);
    await h.model.toggle();
    h.model.ready(true);
    expect(h.model.state()).toMatchObject({ enabled: false, busy: false, lidClosed: true });
    expect(h.releases()).toBe(1);
    await h.model.toggle();
    expect(h.acquisitions()).toBe(1);
    h.model.ready(false);
    expect(h.model.state().enabled).toBe(false);
    await h.model.toggle();
    expect(h.model.state().enabled).toBe(true);
  });
  for (const reason of ["lid", "off", "shutdown", "disconnect"] as const) {
    test(`${reason} invalidates a pending acquisition and releases its late handle`, async () => {
      let resolve!: (release: () => void) => void;
      let released = 0;
      const model = createCaffeineModel(() => new Promise(r => { resolve = r; }), () => {});
      model.ready(false);
      const pending = model.toggle();
      expect(model.state().busy).toBe(true);
      if (reason === "lid") { model.ready(true); model.ready(false); }
      if (reason === "off") await model.toggle();
      if (reason === "shutdown") model.stop();
      if (reason === "disconnect") model.unavailable("Lost logind");
      resolve(() => { released++; });
      await pending;
      expect(model.state()).toMatchObject({ enabled: false, busy: false });
      expect(released).toBe(1);
    });
  }
  test("errors are visible and can be retried", async () => {
    let fail = true;
    const model = createCaffeineModel(async () => { if (fail) throw Error("Denied"); return () => {}; }, () => {});
    model.ready(false);
    await model.toggle();
    expect(model.state()).toMatchObject({ enabled: false, busy: false });
    expect(model.state().error).toContain("Denied");
    fail = false;
    await model.toggle();
    expect(model.state()).toMatchObject({ enabled: true, error: "" });
    model.stop();
  });
  test("bus loss and shutdown release active inhibitors exactly once", async () => {
    const h = harness();
    h.model.ready(false);
    await h.model.toggle();
    h.model.unavailable("Lost logind");
    expect(h.releases()).toBe(1);
    expect(h.model.state()).toMatchObject({ enabled: false, available: false, error: "Lost logind" });
    h.model.ready(false);
    await h.model.toggle();
    h.model.stop(); h.model.stop();
    expect(h.releases()).toBe(2);
    await h.model.toggle(); h.model.ready(false);
    expect(h.acquisitions()).toBe(2);
  });
  test("a fresh acquisition cannot be overwritten by an older reply", async () => {
    const resolvers: Array<(release: () => void) => void> = [];
    const released: string[] = [];
    const model = createCaffeineModel(() => new Promise(r => resolvers.push(r)), () => {});
    model.ready(false);
    const old = model.toggle();
    await model.toggle();
    const fresh = model.toggle();
    resolvers[1]!(() => released.push("fresh"));
    await fresh;
    resolvers[0]!(() => released.push("old"));
    await old;
    expect(model.state().enabled).toBe(true);
    expect(released).toEqual(["old"]);
    await model.toggle();
    expect(released).toEqual(["old", "fresh"]);
  });
});
