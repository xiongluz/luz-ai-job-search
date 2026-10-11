import test from "node:test";
import assert from "node:assert/strict";
import { normalizePath, requiresLoginForPath } from "../src/authRoutePolicy.js";

test("only the landing page is public", () => {
  assert.equal(requiresLoginForPath("/"), false);
  assert.equal(requiresLoginForPath("/?campaign=wechat"), false);
  assert.equal(requiresLoginForPath("/#about"), false);
});

test("all business pages require login", () => {
  assert.equal(requiresLoginForPath("/dashboard"), true);
  assert.equal(requiresLoginForPath("/campus?page=2"), true);
  assert.equal(requiresLoginForPath("/community/post/example"), true);
  assert.equal(requiresLoginForPath("/unknown"), true);
});

test("legacy workspace hashes also require login", () => {
  assert.equal(requiresLoginForPath("/#/workspace/resume"), true);
});

test("normalizes trailing slashes consistently", () => {
  assert.equal(normalizePath("/"), "/");
  assert.equal(normalizePath("/campus///"), "/campus");
});
