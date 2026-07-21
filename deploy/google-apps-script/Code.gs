const MAX_REPLAY_BYTES = 4 * 1024 * 1024;
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;
const MAX_REPORTS_PER_DEVICE_PER_DAY = 20;

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function decodeDataUrl(dataUrl, expectedType, maxBytes) {
  const prefix = `data:${expectedType};base64,`;
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(prefix)) {
    throw new Error(`invalid ${expectedType} payload`);
  }
  const bytes = Utilities.base64Decode(dataUrl.slice(prefix.length));
  if (!bytes.length || bytes.length > maxBytes) throw new Error(`${expectedType} payload too large`);
  return Utilities.newBlob(bytes, expectedType);
}

function safeName(value) {
  return String(value || "unknown").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48) || "unknown";
}

function reserveDeviceQuota(metadata) {
  const properties = PropertiesService.getScriptProperties();
  const day = Utilities.formatDate(new Date(), "UTC", "yyyyMMdd");
  const userAgent = String(metadata && metadata.userAgent || "unknown");
  const deviceHash = Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      userAgent,
      Utilities.Charset.UTF_8,
    ),
  ).slice(0, 18);
  const key = `quota:${day}:${deviceHash}`;
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const count = Number(properties.getProperty(key) || 0);
    if (count >= MAX_REPORTS_PER_DEVICE_PER_DAY) throw new Error("daily report limit reached");
    properties.setProperty(key, String(count + 1));
  } finally {
    lock.releaseLock();
  }
}

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents);
    const properties = PropertiesService.getScriptProperties();
    const expectedKey = properties.getProperty("FEEDBACK_UPLOAD_KEY") || "";
    if (expectedKey && payload.uploadKey !== expectedKey) throw new Error("upload key rejected");
    const id = safeName(payload.id);
    if (!/^FB-/.test(id)) throw new Error("invalid report id");
    const metadata = payload.metadata || {};
    if (!String(metadata.message || "").trim()) throw new Error("message required");
    reserveDeviceQuota(metadata);

    const rootFolderId = properties.getProperty("FEEDBACK_FOLDER_ID");
    if (!rootFolderId) throw new Error("FEEDBACK_FOLDER_ID is not configured");
    const reportFolder = DriveApp.getFolderById(rootFolderId).createFolder(id);
    reportFolder.createFile(
      decodeDataUrl(payload.replayDataUrl, "image/gif", MAX_REPLAY_BYTES).setName("replay.gif"),
    );
    if (payload.screenshotDataUrl) {
      reportFolder.createFile(
        decodeDataUrl(payload.screenshotDataUrl, "image/png", MAX_SCREENSHOT_BYTES).setName("screenshot.png"),
      );
    }
    reportFolder.createFile(
      Utilities.newBlob(JSON.stringify(metadata, null, 2), "application/json", "report.json"),
    );
    return jsonResponse({ ok: true, id });
  } catch (error) {
    console.error(error);
    return jsonResponse({ ok: false, error: String(error && error.message || error) });
  }
}
