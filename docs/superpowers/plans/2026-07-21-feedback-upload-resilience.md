# Feedback Upload Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make automatic bug feedback visibly progress through GIF compression and upload, remain responsive on phones, time out safely after 20 seconds, and retry without re-encoding the replay.

**Architecture:** The recorder performs asynchronous, progress-reporting GIF encoding with a smaller bounded frame buffer. Uploaders wrap the network request in a cancellable logical timeout and classify preparation/network failures. The reporter owns submission phases, cached replay data, button locking, and lifecycle cancellation. The app supplies the real submit button.

**Tech Stack:** JavaScript ES modules, native Canvas/Blob/fetch/AbortController APIs, gifenc, Node test runner, mobile browser smoke testing.

---

## Task 1: Encode replay GIFs incrementally

**Files:**
- Modify: `app/static/cooking-feedback.mjs`
- Modify: `tests/cooking-feedback.test.mjs`

- [ ] Convert existing encoder expectations to async and add RED tests for monotonic progress, a macrotask yield between frames, and recorder defaults of 3 fps, 6 seconds, 180px, at most 18 frames.

```js
test("GIF encoder reports progress and yields between frames", async () => {
  const progress = [];
  let yields = 0;
  const bytes = await encodeReplayGif(Array(18).fill(onePixelFrame), {
    delay: 333,
    onProgress({ completed, total }) { progress.push([completed, total]); },
    async yieldFrame() { yields += 1; },
  });
  assert.deepEqual(progress, Array.from({ length: 18 }, (_, i) => [i + 1, 18]));
  assert.equal(yields, 17);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 6)), "GIF89a");
});
```

- [ ] Run the focused tests and confirm RED because the encoder is synchronous and the current recorder still keeps 24 frames at 240px.

```powershell
$nodeExe='C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $nodeExe --test tests\cooking-feedback.test.mjs
```

- [ ] Make `encodeReplayGif` async, report after each completed frame, and call an injectable `yieldFrame` between frames. The browser default must use `setTimeout(resolve, 0)`, not `Promise.resolve()`, so painting can occur.

```js
async function defaultYieldFrame() {
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

export async function encodeReplayGif(frames, {
  delay = 333, repeat = 0, onProgress = () => {}, yieldFrame = defaultYieldFrame,
} = {}) {
  validateReplayFrames(frames);
  for (let index = 0; index < frames.length; index += 1) {
    writeQuantizedFrame(frames[index]);
    onProgress({ completed: index + 1, total: frames.length });
    if (index < frames.length - 1) await yieldFrame();
  }
  return finishGif();
}
```

- [ ] Set recorder defaults to `fps=3`, `seconds=6`, `width=180`; make `exportGif({onProgress})` forward progress and return a coded `NO_REPLAY_FRAMES` error when nothing was captured.
- [ ] Re-run the focused tests until GREEN.
- [ ] Commit.

```powershell
git add app/static/cooking-feedback.mjs tests/cooking-feedback.test.mjs
git commit -m "perf: encode feedback replay incrementally"
```

## Task 2: Add a cancellable 20-second upload timeout

**Files:**
- Modify: `app/static/cooking-feedback.mjs`
- Modify: `tests/cooking-feedback.test.mjs`

- [ ] RED/GREEN cycle A: test a never-settling fetch and signal abortion at exactly 20 seconds; implement the controlled logical timeout and `UPLOAD_TIMEOUT`.
- [ ] RED/GREEN cycle B: test fallback timeout without AbortController plus late resolve/reject suppression; implement the no-controller path and consume late results.
- [ ] RED/GREEN cycle C: test timer cleanup on success/failure and implement a single finalizer.
- [ ] RED/GREEN cycle D: test replay/base64 preparation failure before fetch and implement `REPLAY_PREPARATION_FAILED`.
- [ ] RED/GREEN cycle E: test one network attempt and explicit `cancel()`; implement `UPLOAD_FAILED` and `UPLOAD_CANCELLED` without automatic retry.

```js
test("Google Drive uploader aborts a hanging request after 20 seconds", async () => {
  const uploader = createGoogleDriveFeedbackUploader({
    endpoint, fetchImpl: neverSettles,
    setTimeoutImpl: fakeTimers.set, clearTimeoutImpl: fakeTimers.clear,
    AbortControllerImpl: FakeAbortController,
  });
  const pending = uploader.submit(payload);
  fakeTimers.fire(20_000);
  await assert.rejects(pending, { code: "UPLOAD_TIMEOUT" });
  assert.equal(FakeAbortController.last.abortCalls, 1);
});
```

- [ ] Run the focused tests and confirm RED because current fetch calls have no signal, timeout, cancellation, or error codes.
- [ ] Add injectable `timeoutMs=20_000`, timer functions, and AbortController implementation to the Google Drive uploader. Provide `submit(payload,{onUploadStart})` and `cancel()`.
- [ ] Convert Blob/base64 failures to `REPLAY_PREPARATION_FAILED`, logical timeout to `UPLOAD_TIMEOUT`, explicit cancellation to `UPLOAD_CANCELLED`, and request failure to `UPLOAD_FAILED`.
- [ ] Use a controlled outer promise so timeout wins over the later AbortError. Always attach handlers to late fetch resolution/rejection, clear timers in every settled path, and never retry automatically because the Apps Script may already have created a Drive folder.
- [ ] Apply the same bounded-request helper to the alternate HTTP uploader so no implementation can wait forever.
- [ ] Re-run the focused tests until GREEN.
- [ ] Commit.

```powershell
git add app/static/cooking-feedback.mjs tests/cooking-feedback.test.mjs
git commit -m "feat: add cancellable feedback upload timeout"
```

## Task 3: Expose phases, cache replay data, and unlock safely

**Files:**
- Modify: `app/static/cooking-feedback.mjs`
- Modify: `tests/cooking-feedback.test.mjs`

- [ ] RED/GREEN cycle A: extend the fake button with `disabled`; test exact phase order, button locking, and concurrent-submit rejection; implement `setStage` and the guarded `finally` unlock.
- [ ] RED/GREEN cycle B: test cached Blob identity on retry and implement cache reuse.
- [ ] RED/GREEN cycle C: test cache reset when a new feedback session opens and when recorder revision changes after new captures; implement a revision-keyed cache.
- [ ] RED/GREEN cycle D: test no-frame/encoding failures and implement their distinct copy without calling the uploader.
- [ ] RED/GREEN cycle E: test preparation/network/timeout copy and implement the fixed error map.
- [ ] RED/GREEN cycle F: test closing during upload and dispose cancellation; implement lifecycle semantics.

Expected visible phases:

```text
正在压缩操作回放 1/18
正在准备上传数据
正在上传到反馈云盘，最多等待 20 秒
反馈已提交，编号 RPT-...
```

- [ ] Run RED and verify current combined status and re-encoding behavior fail these expectations.
- [ ] Accept `submitButton`, retain its idle label, and centralize `setStage(text)` so both status and the locked button visibly update.
- [ ] Add `revision()` to the recorder. Increment its integer revision after every accepted capture and reset it only on dispose. Cache `{ replay, revision }`; reuse it only while `cached.revision === recorder.revision()`. A retry after upload failure with no new frame starts at preparation; any accepted new capture forces re-encoding. Opening a new feedback session also clears the cache.

```js
let submitting = false;
let disposed = false;
let cachedReplay = null;

async function submit() {
  if (disposed || submitting) return false;
  submitting = true;
  submitButton.disabled = true;
  try {
    if (!cachedReplay) {
      cachedReplay = await recorder.exportGif({
        onProgress({ completed, total }) {
          setStage(`正在压缩操作回放 ${completed}/${total}`);
        },
      });
    }
    setStage("正在准备上传数据");
    const metadata = buildCookingReportMetadata({
      message: reportMessage,
      generatedAt: now().toISOString(),
      pageUrl: windowTarget.location?.href,
      userAgent: windowTarget.navigator?.userAgent,
      context: getContext(),
    });
    const result = await uploader.submit({
      metadata,
      replay: cachedReplay,
      screenshotDataUrl,
    }, {
      onUploadStart() {
        setStage("正在上传到反馈云盘，最多等待 20 秒");
      },
    });
    status.textContent = `反馈已提交，编号 ${result.id ?? "已生成"}。`;
    return result;
  } finally {
    submitting = false;
    submitButton.disabled = false;
    submitButton.textContent = idleButtonText;
  }
}
```

- [ ] Map errors to distinct, actionable Chinese copy. Do not claim “上传成功” under `no-cors`; a resolved opaque request only justifies “已提交”.

```js
const ERROR_COPY = {
  NO_REPLAY_FRAMES: "暂时没有录到操作画面，请继续操作几秒后再提交",
  REPLAY_PREPARATION_FAILED: "回放数据准备失败，截图和问题说明已保留，请稍后重试。",
  UPLOAD_TIMEOUT: "网络或 Google 服务响应超时，回放已保留，可直接重试",
  UPLOAD_FAILED: "网络请求失败，回放已保留，可直接重试",
  UPLOAD_CANCELLED: "反馈提交已取消。",
};
```

- [ ] `close()` only hides the dialog; `dispose()` marks the reporter dead, clears the cache, calls `uploader.cancel?.()`, and disposes the recorder.
- [ ] Re-run focused tests until GREEN.
- [ ] Commit.

```powershell
git add app/static/cooking-feedback.mjs tests/cooking-feedback.test.mjs
git commit -m "feat: make feedback submission observable and retryable"
```

## Task 4: Wire the real submit button through the app

**Files:**
- Modify: `app/static/cooking-solo-app.mjs`
- Modify: `tests/cooking-solo-app.test.mjs`

- [ ] Add a RED app test asserting the reporter factory receives the page's `[data-action="feedback-submit"]` element.
- [ ] Query the real element with the existing feedback elements and pass it as `submitButton` when creating the reporter.
- [ ] Run both focused suites until GREEN.

```powershell
& $nodeExe --test tests\cooking-feedback.test.mjs tests\cooking-solo-app.test.mjs
```

- [ ] Commit.

```powershell
git add app/static/cooking-solo-app.mjs tests/cooking-solo-app.test.mjs
git commit -m "feat: wire feedback submission state to the page button"
```

## Task 5: Verify feedback resilience end to end

- [ ] Run all Node tests, all Python tests, and whitespace validation.

```powershell
$nodeTests = Get-ChildItem tests -Filter *.test.mjs | ForEach-Object FullName
& $nodeExe --test @nodeTests
C:\Users\KID\AppData\Local\Programs\Python\Python313\python.exe -m pytest -q
git diff --check
```

- [ ] Start `python -m http.server 4173 --directory app/static` and use a `390x844` Playwright page at `http://127.0.0.1:4173/cooking.html`.
- [ ] Intercept the Apps Script POST with a never-resolving route; assert visible compression progress changes at least twice, the upload phase appears, timeout copy appears by 21 seconds, and the submit button is enabled again.
- [ ] Retry without interacting and assert compression progress is skipped; render one new frame, retry again, and assert compression runs because recorder revision changed.
- [ ] Fulfil the intercepted request and assert the final copy contains “反馈已提交” and does not contain “上传成功”. Save `output/feedback-timeout-mobile.png`; keep `output/` untracked.
- [ ] Do not deploy until automated and browser checks pass.
