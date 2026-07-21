# Autosave, Video Feedback, and Highlights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Every task follows RED → GREEN → review.

**Goal:** Persist a 60-layer burger across visits, replace low-quality GIF feedback with compact native video when available, and add real pre/post-event highlight replay.

**Architecture:** A pure versioned save codec validates state snapshots before the app touches storage. A shared replay pipeline owns timestamped frame buffering and video/GIF export. Feedback and highlights consume that pipeline but keep separate lifecycle and UI state. Google Apps Script accepts an explicit replay MIME allowlist.

**Tech stack:** JavaScript ES modules, Three.js, Canvas captureStream, MediaRecorder, localStorage, Google Apps Script, Node test runner, Playwright/browser smoke tests.

## Task 1: Make 60 the single stack limit

**Files:**
- Modify: `app/static/cooking-solo-state.mjs`
- Modify: `app/static/cooking-solo-app.mjs`
- Modify: `app/static/cooking-feedback.mjs`
- Modify: `app/static/cooking.html`
- Modify: corresponding tests

- [ ] Import one exported `MAX_SOLO_STACK_LAYERS = 60` everywhere instead of literal 20.
- [ ] Add RED tests for exact layer 60, rejection at 61, HUD copy, feedback metadata length, and reset-camera fit after a 60-layer stack.
- [ ] Replace heuristic normal/focus camera distance with actual projected-bounds fitting across portrait/landscape and pitch extremes.
- [ ] Run focused suites, full Node, and `git diff --check`; commit.

## Task 2: Add a strict versioned burger save codec

**Files:**
- Create: `app/static/cooking-solo-save.mjs`
- Modify: `app/static/cooking-solo-state.mjs`
- Create/Modify: `tests/cooking-solo-save.test.mjs`

- [ ] RED round-trip tests for duplicate slot contents, bin/assembled boundaries, rotations, strokes, recipe, finished state, instance sequence, and exactly 60 layers.
- [ ] RED rejection tests for bad JSON, unknown version, 61 layers, missing/duplicate references, invalid slot homes, NaN/range errors, and malformed strokes.
- [ ] Implement pure `serializeSoloSave`/`decodeSoloSave` plus a narrow state hydration entrypoint; intentionally restore `history: []`.
- [ ] Prove old valid v1 saves at <=20 layers still load and future versions are ignored.
- [ ] Run focused/full tests and commit.

## Task 3: Wire automatic local save and restore

**Files:**
- Modify: `app/static/cooking-solo-app.mjs`
- Modify: `app/static/cooking-solo-stage.mjs`
- Modify: `tests/cooking-solo-app.test.mjs`
- Modify: `tests/cooking-solo-stage.test.mjs`

- [ ] RED: second bootstrap with shared memory storage restores before first render/model sync.
- [ ] RED: every state identity change is debounced, pagehide/dispose flushes, finish/continue/recipe never clear, and storage failures are nonfatal.
- [ ] RED: reset cancels queued writes, removes only burger save, and cannot resurrect the previous state.
- [ ] Inject restored state before stage/controller creation; reconcile current loadout, duplicate instances, tools, focus and finished UI.
- [ ] Run focused/full tests and commit.

## Task 4: Build a reusable compact-video replay exporter

**Files:**
- Create: `app/static/cooking-replay-video.mjs`
- Create: `tests/cooking-replay-video.test.mjs`

- [ ] RED candidate-selection tests for WebM VP9/VP8, MP4 AVC/plain MP4, unsupported fallback, and accurate extension/MIME metadata.
- [ ] RED exporter tests for 480px/12fps/timestamp order, bounded ring buffer, cleanup, timeouts, and playable nonempty Blob behavior using fake MediaRecorder/canvas stream.
- [ ] Implement `isTypeSupported` feature detection, ring-buffer sampling, offline playback canvas encoding, progress callbacks, and resource release.
- [ ] Keep the existing GIF encoder as a separately callable fallback.
- [ ] Run focused/full tests and commit.

## Task 5: Upgrade feedback upload to video-first

**Files:**
- Modify: `app/static/cooking-feedback.mjs`
- Modify: `tests/cooking-feedback.test.mjs`
- Modify: `deploy/google-apps-script/Code.gs`
- Modify: `deploy/google-apps-script/README.md`

- [ ] RED: reporter prefers video, shows true format/progress, caches the replay on retry, and falls back to GIF only when unsupported/failed.
- [ ] RED: uploader sends `replayMimeType` and `replayFileName`; Apps Script accepts only WebM/MP4/GIF, uses correct extension, and rejects type mismatch/oversize payloads.
- [ ] Raise replay upload ceiling to 8MB while retaining screenshot and daily quota limits.
- [ ] Preserve timeout, cancellation, retry, no-cors wording, and screenshot behavior.
- [ ] Run JS/server source tests, full suites, and commit. Note that the user must redeploy the updated Apps Script version before the public endpoint accepts video.

## Task 6: Implement genuine high-light capture and playback

**Files:**
- Create: `app/static/cooking-highlights.mjs`
- Create: `tests/cooking-highlights.test.mjs`
- Modify: `app/static/cooking-solo-app.mjs`
- Modify: `app/static/cooking.html`
- Modify: `app/static/cooking.css`
- Modify: corresponding page/app tests

- [ ] RED: triggers exactly once at 10/20/40/60 layers and finish, snapshots 5 seconds before, waits 3 seconds after, and queues overlapping triggers safely.
- [ ] RED: no-clip/encoding/unsupported states, close/reopen behavior, download URL revocation, video playback, and Web Share fallback.
- [ ] Implement an independent highlight manager that consumes the shared frame buffer and never blocks state changes.
- [ ] Add accessible “高光回放” button/dialog with `<video controls playsinline>`, trigger title, download, optional share, Escape/backdrop/focus return, and mobile safe-area layout.
- [ ] Keep generated highlight Blobs session-only for this version.
- [ ] Run focused/full tests and commit.

## Task 7: Browser verification and deployment

- [ ] Run all Node tests, all Python tests, `git diff --check`, and production static checks.
- [ ] Mobile Chrome smoke: build a burger, refresh and verify first-frame restore; reach a milestone; view/download a WebM high-light; submit feedback and confirm video progress/timeout/retry.
- [ ] Safari-compatible test or feature-stub: MP4 candidate is selected and plays inline; unsupported MediaRecorder falls back to GIF.
- [ ] Verify 60-layer fit at portrait/landscape, orbit pitch extremes, focus, and reset.
- [ ] Copy only tracked app changes to the deployment clone, commit/push, wait for GitHub Pages, then verify the public URL with a cache-busting query.
- [ ] Update/redeploy Apps Script and perform one real Google Drive upload before claiming the public video feedback path complete.
