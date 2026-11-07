import { describe, expect, it } from "vitest";
import {
  buildPackageOptions,
  filterByPackage,
  packageLabel,
  sharePercent,
  summarizePackages,
} from "./packageSales";

const gold = { _id: "pkg-gold", name: "Gold", duration: "1 month", activityType: "gym" };
const pt = { _id: "pkg-pt", name: "PT 8", duration: "8 sessions", activityType: "pt" };

function entry(pkg, pricePaid, snapshot) {
  return { subscription: { package: pkg, packageSnapshot: snapshot, pricePaid } };
}

describe("packages sold on the targets page", () => {
  const entries = [
    entry(gold, 1000),
    entry(gold, 800),
    entry(null, 500, { name: "Walk-in", duration: "1 day", activityType: "gym", price: 9999 }),
    entry(null, 500, { name: "Walk-in", duration: "1 day", activityType: "gym", price: 1 }),
    entry({ name: "No id" }, 0, { name: "Ignored catalog", price: 400 }),
  ];

  it("groups by package id, then by the saved snapshot name", () => {
    const stats = summarizePackages(entries);
    expect(stats.map((row) => [row.label, row.count, row.revenue])).toEqual([
      ["Gold · 1 month", 2, 1800],
      ["Walk-in · 1 day", 2, 1000],
      ["No id", 1, 0],
    ]);
    expect(JSON.stringify(stats)).not.toContain("9999");
    expect(stats[0].activityType).toBe("gym");
  });

  it("filters the list to the clicked package and leaves the catalog price unused", () => {
    const stats = summarizePackages(entries);
    const goldKey = stats[0].key;
    expect(filterByPackage(entries, goldKey)).toHaveLength(2);
    expect(filterByPackage(entries, "name:Walk-in|1 day")).toHaveLength(2);
    expect(filterByPackage(entries, "")).toHaveLength(entries.length);
    expect(packageLabel({ name: "Gold" })).toBe("Gold");
    expect(packageLabel(null)).toBe("Unknown package");
  });

  it("builds options from the catalog, sold snapshots, and a missing selection", () => {
    const stats = summarizePackages(entries);
    const options = buildPackageOptions([gold, pt, gold], stats, "name:Old|week");
    expect(options.map((option) => option.label)).toEqual([
      "Gold · 1 month",
      "No id",
      "Old · week",
      "PT 8 · 8 sessions",
      "Walk-in · 1 day",
    ]);
  });

  it("rounds each package share of the range total", () => {
    const stats = summarizePackages(entries);
    const total = stats.reduce((sum, row) => sum + row.revenue, 0);
    expect(total).toBe(2800);
    expect(sharePercent(1800, total)).toBe(64);
    expect(sharePercent(0, 0)).toBe(0);
  });
});
