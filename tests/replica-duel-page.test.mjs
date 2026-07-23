import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const htmlUrl = new URL("../app/static/replica-duel.html", import.meta.url);
const cssUrl = new URL("../app/static/replica-duel.css", import.meta.url);

test("replica duel page is an honest mobile-first local two-view practice", async () => {
  const [html, css] = await Promise.all([
    readFile(htmlUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);

  assert.match(html, /本地双视角练习/);
  assert.match(html, /玩家 A/);
  assert.match(html, /玩家 B/);
  assert.match(html, /45/);
  for (const forbidden of ["在线人数", "匹配成功", "在线匹配"]) {
    assert.doesNotMatch(html, new RegExp(forbidden));
  }

  for (const action of ["ready", "finish", "reveal-ready", "open-second-view", "exit"]) {
    assert.match(html, new RegExp(`data-action=["']${action}["']`));
  }
  for (const panel of ["creating", "observer", "memorize", "replicating", "reveal"]) {
    assert.match(html, new RegExp(`data-phase-panel=["']${panel}["']`));
  }
  assert.match(html, /id=["']duel-progress["']/);
  for (const step of ["setup", "create", "replicate", "reveal"]) {
    assert.match(html, new RegExp(`data-duel-step=["']${step}["']`));
  }
  for (const label of ["开双视角", "制作", "复刻", "揭晓"]) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /先开玩家 B，再让两边都点“我准备好了”/);

  assert.match(html, /id=["']replica-duel-canvas["']/);
  assert.match(html, /id=["']replica-duel-replica-canvas["']/);
  assert.match(html, /id=["']duel-score-total["']/);
  assert.match(html, /id=["']duel-final-result["']/);
  assert.match(html, /id=["']duel-final-winner["']/);
  assert.match(html, /id=["']duel-final-rounds["']/);
  for (const score of ["ingredients", "order", "sauce", "placement", "speed"]) {
    assert.match(html, new RegExp(`data-score=["']${score}["']`));
  }
  assert.match(html, /回放稍后开放/);
  assert.match(html, /\.\/replica-duel\.css/);
  assert.match(html, /\.\/replica-duel-app\.mjs/);
  assert.doesNotMatch(html, /tuning-open|feedback-open|highlight-open|存档/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /@media\s*\(max-width:\s*480px\)[\s\S]*min-width:\s*52px/);
  assert.match(css, /@media\s*\(max-width:\s*480px\)[\s\S]*min-height:\s*52px/);
  assert.match(css, /\.duel-progress\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.duel-progress__step\[data-state=["']active["']\]/);
  assert.match(css, /\.duel-actions\s*\{[\s\S]*position:\s*sticky/);
});
