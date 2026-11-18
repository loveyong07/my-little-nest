import assert from "node:assert/strict";
import test from "node:test";
import { unresolvedPicomatchAdvisories } from "../scripts/audit-dependencies.mjs";

test("the upstream check flags every new moderate or higher advisory for the backport", () => {
  const backported = { url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf", severity: "high" };
  const low = { url: "https://example.com/low", severity: "low" };
  const moderate = { url: "https://example.com/moderate", severity: "moderate" };
  const high = { url: "https://example.com/high", severity: "high" };
  assert.deepEqual(unresolvedPicomatchAdvisories([backported, low, moderate, high]), [moderate, high]);
});
