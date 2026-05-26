import assert from "node:assert/strict";
import { test } from "node:test";
import { substituteVariables } from "../lib/passes/variables.js";

test("substitutes a defined variable", () => {
  const out = substituteVariables("Version $VERSION$ ships.", { VERSION: "1.2.3" });
  assert.equal(out, "Version 1.2.3 ships.");
});

test("substitutes multiple occurrences", () => {
  const out = substituteVariables("$NAME$ and $NAME$ again.", { NAME: "Alice" });
  assert.equal(out, "Alice and Alice again.");
});

test("leaves undefined variables untouched", () => {
  const out = substituteVariables("Keep $UNKNOWN$ as-is.", { OTHER: "x" });
  assert.equal(out, "Keep $UNKNOWN$ as-is.");
});

test("treats names as case-sensitive uppercase", () => {
  const out = substituteVariables("$Lower$ is not a match.", { Lower: "x" });
  assert.equal(out, "$Lower$ is not a match.");
});

test("accepts digits and underscores in names but not leading digits", () => {
  const vars = { API_V2: "ok", "9BAD": "no" };
  assert.equal(substituteVariables("$API_V2$", vars), "ok");
  assert.equal(substituteVariables("$9BAD$", vars), "$9BAD$");
});

test("coerces non-string values", () => {
  const out = substituteVariables("count=$COUNT$, on=$FLAG$", { COUNT: 42, FLAG: true });
  assert.equal(out, "count=42, on=true");
});

test("passes through when no variables provided", () => {
  assert.equal(substituteVariables("$X$", null), "$X$");
  assert.equal(substituteVariables("$X$", undefined), "$X$");
});

test("preserves $ that isn't a variable", () => {
  assert.equal(substituteVariables("price: $5", {}), "price: $5");
  assert.equal(substituteVariables("a $$ b", {}), "a $$ b");
});
