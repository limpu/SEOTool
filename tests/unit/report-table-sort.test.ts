import { describe, expect, it } from "vitest";

import {
  nextSortDirection,
  parseSort,
  sortAriaLabel,
  sortRows,
  type SortableColumn,
} from "@/components/report/table-sort";

interface Row {
  keyword: string;
  clicks: number;
  position: number | null;
}

const COLUMNS: SortableColumn<Row>[] = [
  { key: "keyword", label: "Keyword", value: (row) => row.keyword, defaultDirection: "asc" },
  { key: "clicks", label: "Clicks", value: (row) => row.clicks, defaultDirection: "desc" },
  { key: "position", label: "Position", value: (row) => row.position, defaultDirection: "asc", lowerIsBetter: true },
];

const FALLBACK = { key: "clicks", direction: "desc" as const };

describe("parseSort", () => {
  it("reads a valid column and direction from the URL", () => {
    expect(parseSort({ sort: "position", dir: "desc" }, COLUMNS, FALLBACK)).toEqual({
      key: "position",
      direction: "desc",
    });
  });

  it("falls back for an unknown column rather than rendering an arbitrary order", () => {
    expect(parseSort({ sort: "traffic", dir: "asc" }, COLUMNS, FALLBACK)).toEqual(FALLBACK);
  });

  it("falls back to the column's own default for an unknown direction", () => {
    expect(parseSort({ sort: "position", dir: "sideways" }, COLUMNS, FALLBACK)).toEqual({
      key: "position",
      direction: "asc",
    });
  });

  it("accepts the repeated-param form the platform's own links can produce", () => {
    expect(parseSort({ sort: ["clicks", "keyword"] }, COLUMNS, FALLBACK)).toEqual({
      key: "clicks",
      direction: "desc",
    });
  });
});

describe("sortRows", () => {
  const rows: Row[] = [
    { keyword: "beta", clicks: 5, position: 12 },
    { keyword: "alpha", clicks: 9, position: null },
    { keyword: "gamma", clicks: 5, position: 3 },
  ];

  it("does not mutate its input", () => {
    const snapshot = [...rows];
    sortRows(rows, COLUMNS, { key: "clicks", direction: "desc" });
    expect(rows).toEqual(snapshot);
  });

  it("sorts numerically, not lexically", () => {
    const numbers: Row[] = [
      { keyword: "a", clicks: 9, position: 1 },
      { keyword: "b", clicks: 100, position: 1 },
      { keyword: "c", clicks: 20, position: 1 },
    ];
    expect(sortRows(numbers, COLUMNS, { key: "clicks", direction: "desc" }).map((r) => r.clicks)).toEqual([100, 20, 9]);
  });

  it("sinks missing values to the bottom ASCENDING — a 'not ranked' keyword is not the best", () => {
    const sorted = sortRows(rows, COLUMNS, { key: "position", direction: "asc" });
    expect(sorted.map((r) => r.position)).toEqual([3, 12, null]);
  });

  it("sinks missing values to the bottom DESCENDING too — nor is it the worst", () => {
    const sorted = sortRows(rows, COLUMNS, { key: "position", direction: "desc" });
    expect(sorted.map((r) => r.position)).toEqual([12, 3, null]);
    // The unmeasured row is last in BOTH directions. This is the whole rule.
    expect(sorted[sorted.length - 1].position).toBeNull();
  });

  it("is stable: ties keep the upstream ordering", () => {
    const sorted = sortRows(rows, COLUMNS, { key: "clicks", direction: "desc" });
    expect(sorted.map((r) => r.keyword)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("sorts strings case-insensitively", () => {
    const mixed: Row[] = [
      { keyword: "Zebra", clicks: 1, position: 1 },
      { keyword: "apple", clicks: 1, position: 1 },
    ];
    expect(sortRows(mixed, COLUMNS, { key: "keyword", direction: "asc" }).map((r) => r.keyword)).toEqual([
      "apple",
      "Zebra",
    ]);
  });

  it("returns the rows untouched for an unknown sort key", () => {
    expect(sortRows(rows, COLUMNS, { key: "nope", direction: "asc" })).toEqual(rows);
  });
});

describe("nextSortDirection", () => {
  it("flips the direction of the column that is already sorted", () => {
    expect(nextSortDirection(COLUMNS[1], { key: "clicks", direction: "desc" })).toBe("asc");
    expect(nextSortDirection(COLUMNS[1], { key: "clicks", direction: "asc" })).toBe("desc");
  });

  it("starts a different column at its OWN default, not the current direction", () => {
    expect(nextSortDirection(COLUMNS[0], { key: "clicks", direction: "desc" })).toBe("asc");
    expect(nextSortDirection(COLUMNS[1], { key: "keyword", direction: "asc" })).toBe("desc");
  });
});

describe("sortAriaLabel", () => {
  it("says 'best first' for an inverted-scale column, not 'lowest first'", () => {
    expect(sortAriaLabel(COLUMNS[2], { key: "clicks", direction: "desc" })).toBe("Sort by Position, best first");
  });

  it("says lowest/highest for a normal column", () => {
    expect(sortAriaLabel(COLUMNS[1], { key: "clicks", direction: "desc" })).toBe("Sort by Clicks, lowest first");
  });
});
