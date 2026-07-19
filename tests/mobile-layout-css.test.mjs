import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(
  new URL("../app/static/styles.css", import.meta.url),
  "utf8",
);

test("the hidden reaction stage wins over the short-screen minimum height", () => {
  assert.match(
    css,
    /\.reaction-stage\.reaction-stage--hidden\s*\{[^}]*min-height:\s*0;[^}]*height:\s*0;/,
  );
});
