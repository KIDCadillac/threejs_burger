import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_FEEDBACK_BODY_BYTES,
  buildFeedbackFiles,
  createFeedbackWorker,
  decodeDataUrl,
  validateFeedbackPayload,
  writeFeedbackCommit,
} from "../deploy/cloudflare-feedback-worker/src/index.mjs";

const PNG = `data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}`;
const WEBM = `data:video/webm;base64,${Buffer.from("webm-bytes").toString("base64")}`;

function validPayload(overrides = {}) {
  return {
    metadata: {
      message: "第三层芝士浮空",
      generatedAt: "2026-07-21T12:00:01.000Z",
      pageUrl: "https://kidcadillac.github.io/threejs_burger/cooking.html",
      userAgent: "mobile-test",
      deviceId: "device-a",
      context: { assembledOrder: ["bottom-bun", "patty"] },
    },
    screenshotDataUrl: PNG,
    replayDataUrl: WEBM,
    replayMimeType: "video/webm",
    replayFileName: "replay.webm",
    ...overrides,
  };
}

function jsonRequest(payload = validPayload(), {
  origin = "https://kidcadillac.github.io",
  uploadKey = "test-key",
  method = "POST",
} = {}) {
  return new Request("https://feedback.example.workers.dev/", {
    method,
    headers: {
      "content-type": "application/json",
      origin,
      "x-feedback-key": uploadKey,
    },
    body: method === "POST" ? JSON.stringify(payload) : undefined,
  });
}

function githubResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("data URL decoder rejects malformed and mismatched content", () => {
  assert.equal(new TextDecoder().decode(decodeDataUrl(WEBM, {
    allowedMimeTypes: ["video/webm"],
    maxBytes: 100,
  }).bytes), "webm-bytes");

  assert.throws(() => decodeDataUrl("data:video/mp4;base64,@@@@", {
    allowedMimeTypes: ["video/mp4"], maxBytes: 100,
  }), { code: "INVALID_BASE64" });
  assert.throws(() => decodeDataUrl(PNG, {
    allowedMimeTypes: ["video/webm"], maxBytes: 100,
  }), { code: "UNSUPPORTED_MIME" });
  assert.throws(() => decodeDataUrl(WEBM, {
    allowedMimeTypes: ["video/webm"], maxBytes: 2,
  }), { code: "REPLAY_TOO_LARGE" });
});

test("payload validator accepts video and returns normalized files", () => {
  const value = validateFeedbackPayload(validPayload());
  assert.equal(value.replay.mimeType, "video/webm");
  assert.equal(value.replay.extension, "webm");
  assert.equal(value.screenshot.mimeType, "image/png");
  assert.equal(value.metadata.message, "第三层芝士浮空");
});

test("payload validator enforces message, mime, and declared type", () => {
  assert.throws(() => validateFeedbackPayload(validPayload({
    metadata: { ...validPayload().metadata, message: "x".repeat(2001) },
  })), { code: "MESSAGE_TOO_LONG" });
  assert.throws(() => validateFeedbackPayload(validPayload({
    replayMimeType: "video/mp4",
  })), { code: "REPLAY_TYPE_MISMATCH" });
  assert.throws(() => validateFeedbackPayload(validPayload({
    replayDataUrl: `data:text/html;base64,${Buffer.from("bad").toString("base64")}`,
    replayMimeType: "text/html",
    replayFileName: "bad.html",
  })), { code: "UNSUPPORTED_MIME" });
});

test("feedback files are path-safe and contain one readable report", () => {
  const payload = validateFeedbackPayload(validPayload());
  const files = buildFeedbackFiles(payload, {
    reportId: "RPT-20260721-120001-ab12",
    receivedAt: "2026-07-21T12:00:02.000Z",
  });

  assert.deepEqual(files.map((entry) => entry.path), [
    "reports/2026-07-21/RPT-20260721-120001-ab12/README.md",
    "reports/2026-07-21/RPT-20260721-120001-ab12/report.json",
    "reports/2026-07-21/RPT-20260721-120001-ab12/screenshot.png",
    "reports/2026-07-21/RPT-20260721-120001-ab12/replay.webm",
  ]);
  assert.match(new TextDecoder().decode(files[0].bytes), /第三层芝士浮空/);
  assert.equal(JSON.parse(new TextDecoder().decode(files[1].bytes)).reportId,
    "RPT-20260721-120001-ab12");
});

test("GitHub writer creates blobs, one tree, one commit, and one ref update", async () => {
  const calls = [];
  let blob = 0;
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const method = options.method ?? "GET";
    if (method === "GET" && String(url).endsWith("/git/ref/heads/feedback")) {
      return githubResponse(200, { object: { sha: "head-1" } });
    }
    if (method === "GET" && String(url).endsWith("/git/commits/head-1")) {
      return githubResponse(200, { tree: { sha: "tree-1" } });
    }
    if (method === "POST" && String(url).endsWith("/git/blobs")) {
      blob += 1;
      return githubResponse(201, { sha: `blob-${blob}` });
    }
    if (method === "POST" && String(url).endsWith("/git/trees")) {
      return githubResponse(201, { sha: "tree-2" });
    }
    if (method === "POST" && String(url).endsWith("/git/commits")) {
      return githubResponse(201, { sha: "commit-2" });
    }
    if (method === "PATCH" && String(url).endsWith("/git/refs/heads/feedback")) {
      return githubResponse(200, { object: { sha: "commit-2" } });
    }
    return githubResponse(404, { message: "unexpected" });
  };

  const files = buildFeedbackFiles(validateFeedbackPayload(validPayload()), {
    reportId: "RPT-20260721-120001-ab12",
    receivedAt: "2026-07-21T12:00:02.000Z",
  });
  const result = await writeFeedbackCommit(files, {
    owner: "KIDCadillac", repo: "burger-feedback", branch: "feedback",
    token: "secret-token", fetchImpl,
  });

  assert.equal(result.commitSha, "commit-2");
  assert.equal(calls.filter((entry) => entry.url.endsWith("/git/blobs")).length, 4);
  assert.equal(calls.filter((entry) => entry.url.endsWith("/git/trees")).length, 1);
  assert.equal(calls.filter((entry) => entry.url.endsWith("/git/commits")).length, 1);
  assert.equal(calls.filter((entry) => entry.url.endsWith("/git/refs/heads/feedback")).length, 1);
  assert.ok(calls.every((entry) => entry.options.headers?.authorization === "Bearer secret-token"));
});

test("GitHub writer retries one ref conflict without recreating blobs", async () => {
  let headReads = 0;
  let blobWrites = 0;
  let refWrites = 0;
  const fetchImpl = async (url, options = {}) => {
    const path = String(url);
    const method = options.method ?? "GET";
    if (method === "GET" && path.endsWith("/git/ref/heads/feedback")) {
      headReads += 1;
      return githubResponse(200, { object: { sha: `head-${headReads}` } });
    }
    if (method === "GET" && /\/git\/commits\/head-\d$/.test(path)) {
      return githubResponse(200, { tree: { sha: `base-tree-${headReads}` } });
    }
    if (method === "POST" && path.endsWith("/git/blobs")) {
      blobWrites += 1;
      return githubResponse(201, { sha: `blob-${blobWrites}` });
    }
    if (method === "POST" && path.endsWith("/git/trees")) {
      return githubResponse(201, { sha: `tree-${headReads}` });
    }
    if (method === "POST" && path.endsWith("/git/commits")) {
      return githubResponse(201, { sha: `commit-${headReads}` });
    }
    if (method === "PATCH" && path.endsWith("/git/refs/heads/feedback")) {
      refWrites += 1;
      return refWrites === 1
        ? githubResponse(409, { message: "conflict" })
        : githubResponse(200, { object: { sha: "commit-2" } });
    }
    return githubResponse(404, { message: "unexpected" });
  };

  const result = await writeFeedbackCommit(
    buildFeedbackFiles(validateFeedbackPayload(validPayload()), {
      reportId: "RPT-20260721-120001-ab12",
      receivedAt: "2026-07-21T12:00:02.000Z",
    }),
    { owner: "KIDCadillac", repo: "burger-feedback", branch: "feedback", token: "t", fetchImpl },
  );
  assert.equal(result.commitSha, "commit-2");
  assert.equal(headReads, 2);
  assert.equal(refWrites, 2);
  assert.equal(blobWrites, 4);
});

test("worker enforces CORS, key, body bound, and daily limit", async () => {
  const counters = new Map();
  const rateStore = {
    async get(key) { return counters.get(key) ?? null; },
    async put(key, value) { counters.set(key, value); },
  };
  const worker = createFeedbackWorker({
    now: () => new Date("2026-07-21T12:00:02.000Z"),
    randomUUID: () => "ab12cd34-0000-0000-0000-000000000000",
    writeCommit: async () => ({ commitSha: "commit-ok" }),
  });
  const env = {
    ALLOWED_ORIGINS: "https://kidcadillac.github.io,http://localhost:4173",
    UPLOAD_KEY: "test-key",
    GITHUB_OWNER: "KIDCadillac",
    GITHUB_REPO: "burger-feedback",
    GITHUB_BRANCH: "feedback",
    GITHUB_TOKEN: "hidden",
    FEEDBACK_COUNTERS: rateStore,
    DAILY_REPORT_LIMIT: "2",
  };

  const deniedOrigin = await worker.fetch(jsonRequest(validPayload(), {
    origin: "https://evil.example",
  }), env);
  assert.equal(deniedOrigin.status, 403);
  assert.equal((await deniedOrigin.json()).error, "ORIGIN_NOT_ALLOWED");

  const deniedKey = await worker.fetch(jsonRequest(validPayload(), {
    uploadKey: "wrong",
  }), env);
  assert.equal(deniedKey.status, 401);
  assert.equal((await deniedKey.json()).error, "INVALID_UPLOAD_KEY");

  for (let index = 0; index < 2; index += 1) {
    const response = await worker.fetch(jsonRequest(), env);
    assert.equal(response.status, 201);
    assert.equal(response.headers.get("access-control-allow-origin"),
      "https://kidcadillac.github.io");
  }
  const limited = await worker.fetch(jsonRequest(), env);
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error, "DAILY_LIMIT_REACHED");

  const hugeRequest = new Request("https://feedback.example.workers.dev/", {
    method: "POST",
    headers: {
      origin: "https://kidcadillac.github.io",
      "x-feedback-key": "test-key",
      "content-type": "application/json",
      "content-length": String(MAX_FEEDBACK_BODY_BYTES + 1),
    },
    body: "{}",
  });
  const huge = await worker.fetch(hugeRequest, env);
  assert.equal(huge.status, 413);
  assert.equal((await huge.json()).error, "REQUEST_TOO_LARGE");
});

test("worker handles preflight without touching GitHub", async () => {
  const worker = createFeedbackWorker({
    writeCommit: async () => assert.fail("must not write"),
  });
  const response = await worker.fetch(new Request("https://feedback.example/", {
    method: "OPTIONS",
    headers: { origin: "https://kidcadillac.github.io" },
  }), {
    ALLOWED_ORIGINS: "https://kidcadillac.github.io",
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"),
    "https://kidcadillac.github.io");
  assert.match(response.headers.get("access-control-allow-headers"), /x-feedback-key/i);
});
