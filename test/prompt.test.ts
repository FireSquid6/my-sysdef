import { describe, test, expect } from "bun:test";
import { partitionArray, stringifyPackageParition } from "../sysdef-src/prompt";
import { ANY_VERSION_STRING, type PackageInfo } from "../sysdef-src/sysdef";

describe("partitionArray", () => {
  test("splits into chunks of the given size", () => {
    const result = partitionArray([1, 2, 3, 4, 5], 2);
    expect(result).toEqual([[1, 2], [3, 4], [5]]);
  });

  test("returns a single chunk when smaller than size", () => {
    expect(partitionArray([1, 2], 5)).toEqual([[1, 2]]);
  });

  test("returns one chunk per element when size is 1", () => {
    expect(partitionArray([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });

  test("empty input yields a single empty partition", () => {
    // reflects current behaviour: a trailing empty partition is always pushed
    expect(partitionArray([], 3)).toEqual([[]]);
  });

  test("exact multiple of size has no trailing empty partition", () => {
    expect(partitionArray([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });
});

describe("stringifyPackageParition", () => {
  const mk = (name: string, version: string): PackageInfo => ({
    name,
    version,
    provider: "apt",
  });

  test("appends =version for pinned packages", () => {
    expect(stringifyPackageParition([mk("vim", "8.2")])).toBe("vim=8.2");
  });

  test("omits version for ANY_VERSION_STRING", () => {
    expect(stringifyPackageParition([mk("vim", ANY_VERSION_STRING)])).toBe("vim");
  });

  test("joins multiple packages with spaces", () => {
    const result = stringifyPackageParition([
      mk("vim", "8.2"),
      mk("git", ANY_VERSION_STRING),
      mk("curl", "7.0"),
    ]);
    expect(result).toBe("vim=8.2 git curl=7.0");
  });

  test("empty list stringifies to empty string", () => {
    expect(stringifyPackageParition([])).toBe("");
  });
});
