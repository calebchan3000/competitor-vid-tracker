import assert from "node:assert/strict";
import test from "node:test";
import { normalizeHandle } from "../lib/util.mjs";

test("normalizeHandle accepts YouTube shared channel links", () => {
  const cases = [
    ["https://youtube.com/@usdemsocialists?si=abc123", "@usdemsocialists"],
    ["https://www.youtube.com/@usdemsocialists?si=abc123", "@usdemsocialists"],
    ["youtube.com/@usdemsocialists?si=abc123", "@usdemsocialists"],
    ["@usdemsocialists", "@usdemsocialists"],
    ["usdemsocialists", "@usdemsocialists"],
    ["https://youtube.com/channel/UC12345678901234567890?si=abc", "channel/UC12345678901234567890"],
  ];

  for (const [input, expected] of cases) {
    assert.equal(normalizeHandle(input), expected);
  }
});
