import assert from "node:assert/strict";
import { test } from "node:test";
import { extractJsonpath } from "../lib/extract-jsonpath.js";

test("renders a matched object as pretty JSON", () => {
  const out = extractJsonpath('{"a":{"b":1}}', "$.a");
  assert.equal(out.length, 1);
  assert.match(out[0], /"b": 1/);
});

test("stringifies scalar matches", () => {
  assert.deepEqual(extractJsonpath('{"a":"hi"}', "$.a"), ["hi"]);
  assert.deepEqual(extractJsonpath('{"a":5}', "$.a"), ["5"]);
});

test("throws on empty content", () => {
  assert.throws(() => extractJsonpath("", "$.a"), /empty content/);
});

test("throws when the JSON cannot be parsed", () => {
  assert.throws(() => extractJsonpath("{bad", "$.a"), /JSON parse failed/);
});

test("throws when nothing matches the path", () => {
  assert.throws(() => extractJsonpath('{"a":1}', "$.zzz"), /No matches/);
});

test("a quoted key selector retains only that key", () => {
  const out = extractJsonpath('{"a":{"b":1,"c":2}}', "$.a{'b'}");
  assert.match(out[0], /"b"/);
  assert.doesNotMatch(out[0], /"c"/);
});

test("a regex key selector filters by pattern", () => {
  const out = extractJsonpath('{"a":{"foo":1,"bar":2}}', "$.a{/^f/}");
  assert.match(out[0], /"foo"/);
  assert.doesNotMatch(out[0], /"bar"/);
});

test("a malformed key regex yields a friendly build error", () => {
  // Regression: an unwrapped new RegExp threw a raw SyntaxError.
  assert.throws(() => extractJsonpath('{"a":{"b":1}}', "$.a{/(/}"), /Invalid jsonpath key regex/);
});

test("an unknown suffix option is rejected", () => {
  assert.throws(() => extractJsonpath('{"a":1}', "$.a{nope}"), /Unknown jsonpath option/);
});

test("trim-brackets strips the outer braces", () => {
  const out = extractJsonpath('{"a":{"b":1}}', "$.a{trim-brackets}");
  assert.doesNotMatch(out[0], /[{}]/);
  assert.match(out[0], /"b": 1/);
});

test("comments in JSONC source are dropped by the parser", () => {
  const src = '{\n  // a line comment\n  "a": /* inline */ 1\n}';
  assert.deepEqual(extractJsonpath(src, "$.a"), ["1"]);
});

test("remove-comments is accepted as a no-op", () => {
  const src = '{\n  // a comment\n  "a": 1\n}';
  assert.deepEqual(extractJsonpath(src, "$.a{remove-comments}"), ["1"]);
});

test("comment-like substrings inside string values survive", () => {
  // Regression: a regexp comment-strip ate // and /* */ inside strings,
  // turning "https://x" into "https:" and corrupting the parse.
  const src = '{"endpoint": "https://api.example.com/v1", "glob": "src/**/*.js"}';
  assert.deepEqual(extractJsonpath(src, "$.endpoint"), ["https://api.example.com/v1"]);
  assert.deepEqual(extractJsonpath(src, "$.glob"), ["src/**/*.js"]);
});
