import assert from "node:assert/strict";
import test from "node:test";
import { GitLabApiError, GitLabClient } from "../src/gitlab-client.js";

const config = {
  apiUrl: "https://gitlab.example.local/api/v4",
  token: "test-token",
  readOnly: false,
  timeoutMs: 5_000,
};

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("encodes project paths and sends the private token header", async () => {
  let request: Request | undefined;
  globalThis.fetch = (async (input, init) => {
    request = new Request(input, init);
    return new Response(JSON.stringify({ id: 7, path: "dashboard" }), { status: 200 });
  }) as typeof fetch;

  const result = await new GitLabClient(config).getProject("group/dashboard");

  assert.deepEqual(result, { id: 7, path: "dashboard" });
  assert.equal(request?.url, "https://gitlab.example.local/api/v4/projects/group%2Fdashboard");
  assert.equal(request?.headers.get("PRIVATE-TOKEN"), "test-token");
});

test("surfaces GitLab API errors without exposing request credentials", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ message: "404 Project Not Found" }), {
    status: 404,
    statusText: "Not Found",
  })) as typeof fetch;

  await assert.rejects(
    () => new GitLabClient(config).getProject("missing/project"),
    (error: unknown) => {
      assert.ok(error instanceof GitLabApiError);
      assert.match((error as Error).message, /404 Project Not Found/);
      assert.doesNotMatch((error as Error).message, /test-token/);
      return true;
    },
  );
});

test("blocks write operations in read-only mode before making a request", async () => {
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  await assert.rejects(
    () => new GitLabClient({ ...config, readOnly: true }).addIssueNote("1", 2, "comment"),
    /GITLAB_READ_ONLY=true/,
  );
  assert.equal(called, false);
});
