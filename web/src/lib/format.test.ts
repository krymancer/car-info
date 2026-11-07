import { describe, expect, test } from "bun:test";
import { parseNum, parseWhole } from "./format";

describe("parseNum", () => {
  test("decimal comma or dot", () => {
    expect(parseNum("6,19")).toBe(6.19);
    expect(parseNum("6.199")).toBe(6.199);
    expect(parseNum("")).toBeNull();
    expect(parseNum("abc")).toBeNull();
  });

  test("mixed separators: the last one is the decimal point", () => {
    expect(parseNum("1.234,56")).toBe(1234.56);
    expect(parseNum("1,234.56")).toBe(1234.56);
  });

  test("a repeated separator groups thousands", () => {
    expect(parseNum("1.234.567")).toBe(1234567);
    expect(parseNum("1,234,567")).toBe(1234567);
  });

  test("grouped: a lone separator before three digits groups thousands", () => {
    expect(parseNum("20.100", { grouped: true })).toBe(20100);
    expect(parseNum("20,100", { grouped: true })).toBe(20100);
    expect(parseNum("20100", { grouped: true })).toBe(20100);
    expect(parseNum("20.100,50", { grouped: true })).toBe(20100.5);
    expect(parseNum("20,5", { grouped: true })).toBe(20.5);
  });
});

describe("parseWhole", () => {
  test("ignores digit grouping", () => {
    expect(parseWhole("189.673")).toBe(189673);
    expect(parseWhole("189,673")).toBe(189673);
    expect(parseWhole("189 673")).toBe(189673);
    expect(parseWhole("")).toBeNull();
  });
});
