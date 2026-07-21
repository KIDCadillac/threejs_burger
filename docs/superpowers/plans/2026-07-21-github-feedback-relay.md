# GitHub Feedback Relay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Follow RED → GREEN → review.

**Goal:** Automatically store feedback attachments in a dedicated GitHub repository without exposing credentials or requiring Google access on the tester's phone.

**Architecture:** A Cloudflare Worker validates a bounded JSON upload, converts allowed data URLs to Git blobs, creates one tree/commit, and atomically advances a dedicated branch. The static game talks only to the Worker. The existing Google uploader remains an optional adapter.

**Tech stack:** Cloudflare Workers, GitHub Git Database REST API, JavaScript ES modules, Node test runner.

## Task 1: Build and test the Worker request validator

**Files:**
- Create: `deploy/cloudflare-feedback-worker/src/index.mjs`
- Create: `deploy/cloudflare-feedback-worker/wrangler.jsonc`
- Create: `deploy/cloudflare-feedback-worker/package.json`
- Create: `tests/github-feedback-worker.test.mjs`

- [ ] RED tests for CORS allowlist, upload key, 10MB body, 2,000-char message, replay/screenshot MIME allowlists, malformed base64, and path-safe IDs.
- [ ] Implement pure validation/decoding helpers and OPTIONS handling. Never log payloads or secrets.
- [ ] Return structured error codes consumed by the existing feedback reporter.
- [ ] Run focused/full tests and commit.

## Task 2: Write one report as one GitHub commit

**Files:**
- Modify: Worker and tests above

- [ ] RED with fake GitHub fetch: read branch head/commit, create four blobs, create tree, create commit, update ref exactly once.
- [ ] Store `README.md`, `report.json`, screenshot and replay under one date/report directory.
- [ ] Use a fine-grained token from `env.GITHUB_TOKEN`; never accept a token from the client.
- [ ] On update-ref conflict, refresh head and retry the transaction once; other failures do not retry blindly.
- [ ] Return report ID and HTML directory URL only after ref update succeeds.
- [ ] Run focused/full tests and commit.

## Task 3: Add bounded rate limiting and deployment docs

**Files:**
- Modify: Worker/wrangler files
- Create: `deploy/cloudflare-feedback-worker/README.md`
- Modify: tests

- [ ] Add a per-device/day counter binding with a 20-report limit; make the store injectable for tests.
- [ ] Document creation of a dedicated private repository and fine-grained Contents-write token, `wrangler secret put GITHUB_TOKEN`, endpoint deployment, rotation and revocation.
- [ ] Document that the token must never be pasted into the game repository or chat screenshots.
- [ ] Run dry-run bundling, tests and commit.

## Task 4: Add the GitHub uploader adapter to the game

**Files:**
- Modify: `app/static/cooking-feedback.mjs`
- Modify: `app/static/cooking-solo-app.mjs`
- Modify: `app/static/cooking.html`
- Modify: feedback/app/page tests

- [ ] RED: GitHub endpoint is preferred when configured; replay MIME/file name, screenshot, metadata and stable report ID are sent.
- [ ] Preserve 20-second timeout, cancellation, video Blob cache and retry without re-encoding.
- [ ] Keep Google adapter available only when explicitly configured; show the actual backend name in status copy.
- [ ] Do not embed GitHub token or repository write credentials anywhere in the client.
- [ ] Run focused/full tests and commit.

## Task 5: End-to-end verification

- [ ] Run all Node/Python tests, `git diff --check`, and Worker dry-run build.
- [ ] Local fake-GitHub smoke proves one submission creates one commit and correct binary MIME.
- [ ] After one-time Cloudflare/GitHub account setup, submit from mobile network without Google access and verify the private repository directory.
- [ ] Rotate/revoke the test token once to prove deployment secrets can be changed without rebuilding the game.
