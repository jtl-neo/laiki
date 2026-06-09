import { describe, expect, it } from "vitest";
import { periodRange } from "./queryEngine.js";

const NOW = new Date("2026-06-09T08:00:00.000Z"); // Tuesday

describe("periodRange", () => {
  it("today", () => {
    expect(periodRange("today", NOW)).toEqual({ start: "2026-06-09", end: "2026-06-09" });
  });
  it("yesterday", () => {
    expect(periodRange("yesterday", NOW)).toEqual({ start: "2026-06-08", end: "2026-06-08" });
  });
  it("this_week starts Monday", () => {
    expect(periodRange("this_week", NOW)).toEqual({ start: "2026-06-08", end: "2026-06-09" });
  });
  it("this_month", () => {
    expect(periodRange("this_month", NOW)).toEqual({ start: "2026-06-01", end: "2026-06-09" });
  });
  it("last_month full range", () => {
    expect(periodRange("last_month", NOW)).toEqual({ start: "2026-05-01", end: "2026-05-31" });
  });
  it("this_year", () => {
    expect(periodRange("this_year", NOW)).toEqual({ start: "2026-01-01", end: "2026-06-09" });
  });
});
