// An 8 MiB replay plus a 2 MiB screenshot expands to roughly 13.4 MiB as
// base64 inside JSON. Keep the transport cap above that encoded envelope.
export const MAX_FEEDBACK_BODY_BYTES = 15 * 1024 * 1024;
export const MAX_REPLAY_BYTES = 8 * 1024 * 1024;
export const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;
export const MAX_MESSAGE_LENGTH = 2_000;

const DEFAULT_ALLOWED_ORIGINS = [
  "https://kidcadillac.github.io",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

const REPLAY_TYPES = new Map([
  ["video/webm", "webm"],
  ["video/mp4", "mp4"],
  ["image/gif", "gif"],
]);

class FeedbackError extends Error {
  constructor(code, message = code, status = 400) {
    super(message);
    this.name = "FeedbackError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, message = code, status = 400) {
  throw new FeedbackError(code, message, status);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function extensionForMime(mimeType) {
  return REPLAY_TYPES.get(mimeType) ?? null;
}

function strictBase64ToBytes(value) {
  if (typeof value !== "string"
    || value.length === 0
    || value.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    fail("INVALID_BASE64");
  }
  let decoded;
  try {
    decoded = globalThis.atob(value);
  } catch {
    fail("INVALID_BASE64");
  }
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

export function decodeDataUrl(dataUrl, {
  allowedMimeTypes,
  maxBytes,
  tooLargeCode = "REPLAY_TOO_LARGE",
} = {}) {
  if (typeof dataUrl !== "string") fail("INVALID_DATA_URL");
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  if (!match) fail("INVALID_DATA_URL");
  const mimeType = match[1].toLowerCase();
  if (!Array.isArray(allowedMimeTypes) || !allowedMimeTypes.includes(mimeType)) {
    fail("UNSUPPORTED_MIME");
  }
  const bytes = strictBase64ToBytes(match[2]);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) fail("INVALID_SIZE_LIMIT", "", 500);
  if (bytes.byteLength > maxBytes) fail(tooLargeCode, tooLargeCode, 413);
  return { mimeType, bytes };
}

function normalizeMetadata(value) {
  if (!isRecord(value)) fail("INVALID_METADATA");
  const message = typeof value.message === "string" ? value.message.trim() : "";
  if (!message) fail("EMPTY_MESSAGE");
  if (message.length > MAX_MESSAGE_LENGTH) fail("MESSAGE_TOO_LONG", "", 413);

  return {
    ...value,
    message,
    generatedAt: typeof value.generatedAt === "string" ? value.generatedAt : null,
    pageUrl: typeof value.pageUrl === "string" ? value.pageUrl.slice(0, 2_048) : null,
    userAgent: typeof value.userAgent === "string" ? value.userAgent.slice(0, 1_024) : null,
    deviceId: typeof value.deviceId === "string" ? value.deviceId.slice(0, 128) : null,
    context: isRecord(value.context) ? value.context : {},
  };
}

export function validateFeedbackPayload(payload) {
  if (!isRecord(payload)) fail("INVALID_PAYLOAD");
  const metadata = normalizeMetadata(payload.metadata);
  const screenshot = decodeDataUrl(payload.screenshotDataUrl, {
    allowedMimeTypes: ["image/png"],
    maxBytes: MAX_SCREENSHOT_BYTES,
    tooLargeCode: "SCREENSHOT_TOO_LARGE",
  });
  const replay = decodeDataUrl(payload.replayDataUrl, {
    allowedMimeTypes: [...REPLAY_TYPES.keys()],
    maxBytes: MAX_REPLAY_BYTES,
  });
  if (payload.replayMimeType !== replay.mimeType) fail("REPLAY_TYPE_MISMATCH");
  const extension = extensionForMime(replay.mimeType);
  const expectedFileName = `replay.${extension}`;
  if (typeof payload.replayFileName === "string"
    && payload.replayFileName.toLowerCase() !== expectedFileName) {
    fail("REPLAY_TYPE_MISMATCH");
  }
  return {
    metadata,
    screenshot: { ...screenshot, extension: "png" },
    replay: { ...replay, extension, fileName: expectedFileName },
  };
}

function assertReportId(reportId) {
  if (typeof reportId !== "string"
    || !/^RPT-\d{8}-\d{6}-[a-z0-9]{4,12}$/.test(reportId)) {
    fail("INVALID_REPORT_ID", "", 500);
  }
}

function markdownSafe(value) {
  return String(value ?? "")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("`", "\\`");
}

function textBytes(value) {
  return new TextEncoder().encode(value);
}

export function buildFeedbackFiles(payload, { reportId, receivedAt } = {}) {
  assertReportId(reportId);
  const received = new Date(receivedAt);
  if (Number.isNaN(received.getTime())) fail("INVALID_RECEIVED_AT", "", 500);
  const datePath = received.toISOString().slice(0, 10);
  const directory = `reports/${datePath}/${reportId}`;
  const report = {
    reportId,
    receivedAt: received.toISOString(),
    replay: {
      mimeType: payload.replay.mimeType,
      fileName: payload.replay.fileName,
      bytes: payload.replay.bytes.byteLength,
    },
    screenshot: {
      mimeType: payload.screenshot.mimeType,
      fileName: "screenshot.png",
      bytes: payload.screenshot.bytes.byteLength,
    },
    metadata: payload.metadata,
  };
  const readme = [
    `# ${reportId}`,
    "",
    "## 问题说明",
    "",
    `> ${markdownSafe(payload.metadata.message).replaceAll("\n", "\n> ")}`,
    "",
    `- 接收时间：${report.receivedAt}`,
    `- 页面：${markdownSafe(payload.metadata.pageUrl ?? "未知")}`,
    `- 设备：${markdownSafe(payload.metadata.userAgent ?? "未知")}`,
    `- [截图](./screenshot.png)`,
    `- [操作回放](./${payload.replay.fileName})`,
    `- [完整诊断](./report.json)`,
    "",
  ].join("\n");

  return [
    { path: `${directory}/README.md`, bytes: textBytes(readme), mimeType: "text/markdown" },
    { path: `${directory}/report.json`, bytes: textBytes(`${JSON.stringify(report, null, 2)}\n`), mimeType: "application/json" },
    { path: `${directory}/screenshot.png`, bytes: payload.screenshot.bytes, mimeType: "image/png" },
    { path: `${directory}/${payload.replay.fileName}`, bytes: payload.replay.bytes, mimeType: payload.replay.mimeType },
  ];
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize));
    binary += String.fromCharCode(...chunk);
  }
  return globalThis.btoa(binary);
}

async function githubRequest(fetchImpl, url, {
  token,
  method = "GET",
  body,
  allowConflict = false,
} = {}) {
  const response = await fetchImpl(url, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "burger-feedback-relay",
      "x-github-api-version": "2026-03-10",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let value = {};
  try {
    value = await response.json();
  } catch {
    value = {};
  }
  if (!response.ok && !(allowConflict && [409, 422].includes(response.status))) {
    const error = new FeedbackError("GITHUB_WRITE_FAILED", "GitHub write failed", 502);
    error.githubStatus = response.status;
    throw error;
  }
  return { response, value };
}

function apiSegment(value, code) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.-]+$/.test(value)) {
    fail(code, code, 500);
  }
  return value;
}

export async function writeFeedbackCommit(files, {
  owner,
  repo,
  branch = "feedback",
  token,
  fetchImpl = globalThis.fetch,
  apiBase = "https://api.github.com",
} = {}) {
  const safeOwner = apiSegment(owner, "INVALID_GITHUB_OWNER");
  const safeRepo = apiSegment(repo, "INVALID_GITHUB_REPO");
  const safeBranch = apiSegment(branch, "INVALID_GITHUB_BRANCH");
  if (typeof token !== "string" || !token) fail("MISSING_GITHUB_TOKEN", "", 500);
  if (typeof fetchImpl !== "function") fail("MISSING_FETCH", "", 500);
  if (!Array.isArray(files) || files.length === 0) fail("EMPTY_GITHUB_FILES", "", 500);
  const base = `${apiBase.replace(/\/$/, "")}/repos/${safeOwner}/${safeRepo}`;

  const blobEntries = [];
  for (const file of files) {
    if (!isRecord(file) || typeof file.path !== "string"
      || file.path.startsWith("/") || file.path.includes("..")
      || !(file.bytes instanceof Uint8Array)) {
      fail("INVALID_GITHUB_FILE", "", 500);
    }
    const { value } = await githubRequest(fetchImpl, `${base}/git/blobs`, {
      token,
      method: "POST",
      body: { content: bytesToBase64(file.bytes), encoding: "base64" },
    });
    if (typeof value.sha !== "string") fail("INVALID_GITHUB_RESPONSE", "", 502);
    blobEntries.push({ path: file.path, mode: "100644", type: "blob", sha: value.sha });
  }

  let lastConflict = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const ref = await githubRequest(fetchImpl, `${base}/git/ref/heads/${safeBranch}`, { token });
    const headSha = ref.value?.object?.sha;
    if (typeof headSha !== "string") fail("INVALID_GITHUB_RESPONSE", "", 502);
    const head = await githubRequest(fetchImpl, `${base}/git/commits/${headSha}`, { token });
    const baseTree = head.value?.tree?.sha;
    if (typeof baseTree !== "string") fail("INVALID_GITHUB_RESPONSE", "", 502);
    const tree = await githubRequest(fetchImpl, `${base}/git/trees`, {
      token,
      method: "POST",
      body: { base_tree: baseTree, tree: blobEntries },
    });
    const treeSha = tree.value?.sha;
    if (typeof treeSha !== "string") fail("INVALID_GITHUB_RESPONSE", "", 502);
    const commit = await githubRequest(fetchImpl, `${base}/git/commits`, {
      token,
      method: "POST",
      body: {
        message: `feedback: ${files[0].path.split("/").at(-2) ?? "report"}`,
        tree: treeSha,
        parents: [headSha],
      },
    });
    const commitSha = commit.value?.sha;
    if (typeof commitSha !== "string") fail("INVALID_GITHUB_RESPONSE", "", 502);
    const refUpdate = await githubRequest(fetchImpl, `${base}/git/refs/heads/${safeBranch}`, {
      token,
      method: "PATCH",
      body: { sha: commitSha, force: false },
      allowConflict: true,
    });
    if (refUpdate.response.ok) {
      return {
        commitSha,
        directoryUrl: `https://github.com/${safeOwner}/${safeRepo}/tree/${safeBranch}/${files[0].path.split("/").slice(0, -1).join("/")}`,
      };
    }
    lastConflict = refUpdate.response.status;
  }
  const error = new FeedbackError("GITHUB_CONFLICT", "GitHub branch changed", 409);
  error.githubStatus = lastConflict;
  throw error;
}

function allowedOrigins(env) {
  const configured = typeof env.ALLOWED_ORIGINS === "string"
    ? env.ALLOWED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean)
    : [];
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

function corsHeaders(origin) {
  const headers = {
    vary: "Origin",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-feedback-key",
    "access-control-max-age": "86400",
  };
  if (origin) headers["access-control-allow-origin"] = origin;
  return headers;
}

function jsonResponse(status, value, origin) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders(origin) },
  });
}

function hashKey(value) {
  let hash = 0x811c9dc5;
  const input = String(value ?? "unknown");
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

async function reserveDailyQuota(store, key, limit) {
  if (!store || typeof store.get !== "function" || typeof store.put !== "function") return;
  const current = Number.parseInt(await store.get(key), 10) || 0;
  if (current >= limit) fail("DAILY_LIMIT_REACHED", "", 429);
  await store.put(key, String(current + 1), { expirationTtl: 172_800 });
}

function makeReportId(now, randomUUID) {
  const iso = now.toISOString();
  const date = iso.slice(0, 10).replaceAll("-", "");
  const time = iso.slice(11, 19).replaceAll(":", "");
  const suffix = String(randomUUID()).replaceAll("-", "").slice(0, 8).toLowerCase();
  return `RPT-${date}-${time}-${suffix}`;
}

function statusForError(error) {
  if (Number.isInteger(error?.status)) return error.status;
  return 500;
}

export function createFeedbackWorker({
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  randomUUID = () => globalThis.crypto.randomUUID(),
  writeCommit = writeFeedbackCommit,
} = {}) {
  return {
    async fetch(request, env = {}) {
      const origin = request.headers.get("origin") ?? "";
      const allowed = allowedOrigins(env);
      if (!allowed.has(origin)) {
        return jsonResponse(403, { ok: false, error: "ORIGIN_NOT_ALLOWED" }, null);
      }
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
      }
      if (request.method !== "POST") {
        return jsonResponse(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, origin);
      }
      if (!env.UPLOAD_KEY || request.headers.get("x-feedback-key") !== env.UPLOAD_KEY) {
        return jsonResponse(401, { ok: false, error: "INVALID_UPLOAD_KEY" }, origin);
      }
      const declaredLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
      if (declaredLength > MAX_FEEDBACK_BODY_BYTES) {
        return jsonResponse(413, { ok: false, error: "REQUEST_TOO_LARGE" }, origin);
      }

      try {
        const bytes = new Uint8Array(await request.arrayBuffer());
        if (bytes.byteLength > MAX_FEEDBACK_BODY_BYTES) fail("REQUEST_TOO_LARGE", "", 413);
        let raw;
        try {
          raw = JSON.parse(new TextDecoder().decode(bytes));
        } catch {
          fail("INVALID_JSON");
        }
        const payload = validateFeedbackPayload(raw);
        const receivedAt = now();
        if (!(receivedAt instanceof Date) || Number.isNaN(receivedAt.getTime())) {
          fail("INVALID_SERVER_CLOCK", "", 500);
        }
        const day = receivedAt.toISOString().slice(0, 10);
        const deviceIdentity = payload.metadata.deviceId
          ?? request.headers.get("cf-connecting-ip")
          ?? payload.metadata.userAgent
          ?? "unknown";
        const limit = Math.max(1, Number.parseInt(env.DAILY_REPORT_LIMIT ?? "20", 10) || 20);
        await reserveDailyQuota(env.FEEDBACK_COUNTERS,
          `feedback:${day}:${hashKey(deviceIdentity)}`, limit);
        const reportId = makeReportId(receivedAt, randomUUID);
        const files = buildFeedbackFiles(payload, {
          reportId,
          receivedAt: receivedAt.toISOString(),
        });
        const result = await writeCommit(files, {
          owner: env.GITHUB_OWNER,
          repo: env.GITHUB_REPO,
          branch: env.GITHUB_BRANCH ?? "feedback",
          token: env.GITHUB_TOKEN,
          fetchImpl,
        });
        return jsonResponse(201, {
          ok: true,
          id: reportId,
          url: result.directoryUrl ?? null,
          commit: result.commitSha ?? null,
        }, origin);
      } catch (error) {
        const code = typeof error?.code === "string" ? error.code : "INTERNAL_ERROR";
        return jsonResponse(statusForError(error), { ok: false, error: code }, origin);
      }
    },
  };
}

export default createFeedbackWorker();
