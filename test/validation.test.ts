import { describe, test, expect } from "bun:test";
import { v } from "../sysdef-src/validation";

describe("validation (v namespace)", () => {
  describe("primitives", () => {
    test("bool", () => {
      const isBool = v.bool();
      expect(isBool(true)).toBe(true);
      expect(isBool(false)).toBe(true);
      expect(isBool("true")).toBe(false);
      expect(isBool(0)).toBe(false);
    });

    test("number", () => {
      const isNum = v.number();
      expect(isNum(0)).toBe(true);
      expect(isNum(-3.5)).toBe(true);
      expect(isNum("3")).toBe(false);
      expect(isNum(NaN)).toBe(true); // typeof NaN === "number"
    });

    test("string", () => {
      const isStr = v.string();
      expect(isStr("")).toBe(true);
      expect(isStr("hi")).toBe(true);
      expect(isStr(3)).toBe(false);
      expect(isStr(null)).toBe(false);
    });

    test("unknown accepts anything", () => {
      const isUnknown = v.unknown();
      expect(isUnknown(undefined)).toBe(true);
      expect(isUnknown({ a: 1 })).toBe(true);
      expect(isUnknown(null)).toBe(true);
    });
  });

  describe("modifiers", () => {
    test("optional allows undefined", () => {
      const val = v.optional(v.string());
      expect(val("hi")).toBe(true);
      expect(val(undefined)).toBe(true);
      expect(val(null)).toBe(false);
      expect(val(3)).toBe(false);
    });

    test("nullable allows null", () => {
      const val = v.nullable(v.number());
      expect(val(3)).toBe(true);
      expect(val(null)).toBe(true);
      expect(val(undefined)).toBe(false);
    });

    test("literal matches exact value", () => {
      const val = v.literal("sync");
      expect(val("sync")).toBe(true);
      expect(val("other")).toBe(false);
    });

    test("union matches any member", () => {
      const val = v.union(v.string(), v.number());
      expect(val("hi")).toBe(true);
      expect(val(3)).toBe(true);
      expect(val(true)).toBe(false);
    });
  });

  describe("array", () => {
    const val = v.array(v.string());
    test("accepts array of matching elements", () => {
      expect(val([])).toBe(true);
      expect(val(["a", "b"])).toBe(true);
    });
    test("rejects wrong element type", () => {
      expect(val(["a", 1])).toBe(false);
    });
    test("rejects non-arrays", () => {
      expect(val("a")).toBe(false);
      expect(val({})).toBe(false);
    });
  });

  describe("record", () => {
    const val = v.record(v.string(), v.number());
    test("accepts a matching record", () => {
      expect(val({ a: 1, b: 2 })).toBe(true);
      expect(val({})).toBe(true);
    });
    test("rejects wrong value type", () => {
      expect(val({ a: "1" })).toBe(false);
    });
    test("rejects non-objects and null", () => {
      expect(val(null)).toBe(false);
      expect(val(5)).toBe(false);
    });
  });

  describe("obj", () => {
    const val = v.obj({
      name: v.string(),
      version: v.optional(v.string()),
    });
    test("accepts a valid object", () => {
      expect(val({ name: "vim", version: "8.2" })).toBe(true);
      expect(val({ name: "vim" })).toBe(true); // optional missing
    });
    test("rejects missing required field", () => {
      expect(val({ version: "8.2" })).toBe(false);
    });
    test("rejects wrong field type", () => {
      expect(val({ name: 3 })).toBe(false);
    });
    test("rejects non-objects", () => {
      expect(val(null)).toBe(false);
      expect(val("vim")).toBe(false);
    });
    test("ignores extra fields", () => {
      expect(val({ name: "vim", extra: 1 })).toBe(true);
    });
  });

  describe("nested schemas (lockfile shape)", () => {
    const lock = v.record(v.string(), v.record(v.string(), v.string()));
    test("accepts nested map", () => {
      expect(lock({ apt: { vim: "8.2" }, cargo: {} })).toBe(true);
    });
    test("rejects malformed inner value", () => {
      expect(lock({ apt: { vim: 8 } })).toBe(false);
    });
  });

  describe("parse / parseSafe", () => {
    test("parse returns the value when valid", () => {
      const result = v.parse({ a: 1 }, v.record(v.string(), v.number()));
      expect(result).toEqual({ a: 1 });
    });
    test("parse throws when invalid", () => {
      expect(() => v.parse("nope", v.number())).toThrow();
    });
    test("parseSafe returns value when valid", () => {
      expect(v.parseSafe(5, v.number())).toBe(5);
    });
    test("parseSafe returns null when invalid", () => {
      expect(v.parseSafe("nope", v.number())).toBeNull();
    });
  });
});
