import assert from "node:assert/strict";
import test from "node:test";
import { resolveRequestPath, root } from "../../scripts/serve.mjs";

test("static path resolution keeps ordinary public files inside the project root", () => {
  const resolved = resolveRequestPath("/assets/images/example.svg?version=1", root);
  assert.equal(resolved.error, undefined);
  assert.ok(resolved.candidate.startsWith(root));
  assert.ok(resolved.candidate.endsWith("example.svg"));
});

test("static path resolution blocks traversal, encoded traversal, backslashes and hidden files", () => {
  for (const requestPath of ["/../secret", "/%2e%2e/secret", "/assets%2f..%2fsecret", "/.git/config", "/.env", "/assets\\secret"]) {
    assert.equal(resolveRequestPath(requestPath, root).error, 403, requestPath);
  }
});

test("malformed URL encoding is rejected as a bad request", () => {
  assert.equal(resolveRequestPath("/%zz", root).error, 400);
});
