import { REACTIONS, reactionFor, recipeTitle } from "/static/effects.js";
import { inviteFriend } from "/static/platform.js";

const app = document.querySelector("#app");
const liveStatus = document.querySelector("#live-status");
const playerId = getPlayerId();
const requestedRoom = new URLSearchParams(location.search).get("room");

let socket;
let reconnectAttempts = 0;
let lastMessage = { type: "home" };
let autoJoinSent = false;
let selectedFry = null;
let selectedSauces = [];
let activeRound = null;
let countdownHandle = null;
let reactionHandles = [];
let lastOutcomeKey = "";

connect();
renderHome();

function getPlayerId() {
  let stored = sessionStorage.getItem("witch-fries-player");
  if (!stored) {
    stored = `player-${crypto.randomUUID()}`;
    sessionStorage.setItem("witch-fries-player", stored);
  }
  return stored;
}

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws?player=${encodeURIComponent(playerId)}`);
  setConnectionState("正在连接魔法餐桌…");

  socket.addEventListener("open", () => {
    reconnectAttempts = 0;
    setConnectionState("");
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "error") {
      showToast(message.message, true);
      return;
    }
    lastMessage = message;
    render(message);
  });

  socket.addEventListener("close", () => {
    setConnectionState("连接中断，正在重连…");
    const wait = Math.min(1000 * 2 ** reconnectAttempts, 5000);
    reconnectAttempts += 1;
    window.setTimeout(connect, wait);
  });
}

function send(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    showToast("还没有连上餐桌，请稍等", true);
    return;
  }
  socket.send(JSON.stringify(payload));
}

function render(message) {
  clearCountdown();
  if (message.type === "home") {
    renderHome();
    tryInviteAutoJoin();
    return;
  }
  if (message.type === "matching") return renderMatching();
  if (message.type !== "state") return;

  syncRound(message);
  if (message.phase === "waiting") return renderWaitingRoom(message);
  if (message.phase === "mixing") {
    return message.private ? renderRecipeLocked(message) : renderMixing(message);
  }
  if (message.phase === "turn") return renderTurn(message);
  if (message.phase === "finished") return renderFinished(message);
}

function tryInviteAutoJoin() {
  if (!requestedRoom || autoJoinSent) return;
  autoJoinSent = true;
  send({ type: "room.join", code: requestedRoom });
}

function syncRound(state) {
  if (activeRound === state.roundNumber) return;
  activeRound = state.roundNumber;
  selectedFry = null;
  selectedSauces = [];
  lastOutcomeKey = "";
  clearReactionTimers();
}

function renderHome() {
  activeRound = null;
  app.innerHTML = `
    <section class="screen home-screen" aria-labelledby="game-title">
      <p class="eyebrow">双人心理战 · 一局两分钟</p>
      <div class="brand-mark" aria-hidden="true"><span>🍟</span></div>
      <h1 id="game-title">女巫的毒药</h1>
      <p class="subtitle">薯条篇</p>
      <p class="tagline">调一根整蛊薯条，看谁先吃到。</p>
      <div class="home-actions">
        <button class="button button--primary" type="button" data-action="quick-match"><span class="button__icon">⚡</span><span>快速匹配</span></button>
        <button class="button button--secondary" type="button" data-action="create-room"><span class="button__icon">✦</span><span>邀请好友</span></button>
      </div>
      <form class="join-form" data-action="join-room">
        <label for="room-code">已有房间码</label>
        <div class="join-form__row">
          <input id="room-code" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="输入 6 位数字" autocomplete="off" required>
          <button class="button button--small" type="submit">加入</button>
        </div>
      </form>
    </section>`;
}

function renderMatching() {
  app.innerHTML = `
    <section class="screen center-screen">
      <p class="eyebrow">快速匹配</p>
      <div class="search-orbit" aria-hidden="true"><span>🍟</span><i></i></div>
      <h1 class="screen-title">正在寻找吃货</h1>
      <p class="muted">真人对手进入队列后会自动开局</p>
      <div class="player-slots" aria-label="匹配席位">
        <div class="player-slot player-slot--me"><span class="mini-face">●ᴗ●</span><strong>你</strong></div>
        <span class="versus">VS</span>
        <div class="player-slot player-slot--search"><span class="dot-pulse">···</span><strong>搜索中</strong></div>
      </div>
      <button class="button button--ghost" type="button" data-action="cancel-match">取消匹配</button>
    </section>`;
}

function renderWaitingRoom(state) {
  const code = state.room.code;
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("room", code);
  app.innerHTML = `
    <section class="screen center-screen room-screen">
      <p class="eyebrow">好友约战</p>
      <div class="potion-seal" aria-hidden="true">✦</div>
      <h1 class="screen-title">餐桌已经摆好</h1>
      <p class="muted">把邀请发给好友，点击后直接入座</p>
      <div class="room-code-card"><span>房间码</span><strong>${code}</strong></div>
      <button class="button button--primary" type="button" data-action="copy-invite" data-code="${code}" data-url="${url.toString()}">复制邀请链接</button>
      <div class="waiting-friend"><span class="dot-pulse">···</span><span>等待好友加入</span></div>
      <button class="text-button" type="button" data-action="leave-room">返回首页</button>
    </section>`;
}

function renderMixing(state) {
  const canLock = selectedFry !== null && selectedSauces.length === 2;
  app.innerHTML = `
    <section class="screen game-screen mixing-screen">
      ${gameHeader(state, "秘密调制")}
      ${playerRibbon(state)}
      <div class="stage-copy">
        <p class="step-pill">第 1 步</p>
        <h1 class="game-title">挑一根，偷偷加料</h1>
        <p class="private-note"><span>◉</span> 只有你能看见位置和配方</p>
      </div>
      ${fryBoard(state, { action: "select-fry", secretPosition: selectedFry, interactive: true })}
      <section class="sauce-lab" aria-labelledby="sauce-title">
        <div class="section-heading"><h2 id="sauce-title">选两份调味料</h2><span>${selectedSauces.length}/2</span></div>
        <div class="sauce-grid">${Object.entries(REACTIONS).map(([key, effect]) => sauceButton(key, effect)).join("")}</div>
        <div class="recipe-slots" aria-label="当前配方">
          ${[0, 1].map((index) => recipeSlot(index, selectedSauces[index])).join("")}
        </div>
      </section>
      <button class="button button--primary lock-button" type="button" data-action="lock-recipe" ${canLock ? "" : "disabled"}>封装这根薯条</button>
    </section>`;
}

function renderRecipeLocked(state) {
  const sauces = state.private.sauces;
  const opponentReady = state.players.some((player) => player.id !== state.me && player.ready);
  app.innerHTML = `
    <section class="screen center-screen locked-screen">
      ${gameHeader(state, "配方已封装")}
      <div class="sealed-cauldron" aria-hidden="true"><span>🍟</span><i>✦</i></div>
      <p class="eyebrow">你的整蛊薯条</p>
      <h1 class="screen-title">${recipeTitle(sauces)}</h1>
      <div class="recipe-summary">
        ${sauces.map((key) => `<span>${reactionFor(key).emoji} ${reactionFor(key).shortLabel}</span>`).join("")}
        <strong>藏在第 ${state.private.poisonPosition + 1} 根</strong>
      </div>
      <p class="private-note"><span>◉</span> 只有你能看见</p>
      <div class="waiting-friend"><span class="dot-pulse">···</span><span>${opponentReady ? "双方已准备，正在开餐" : "对手还在调味"}</span></div>
    </section>`;
}

function renderTurn(state) {
  const myTurn = state.currentPlayer === state.me && !state.paused;
  const poisonPosition = state.private?.active ? state.private.poisonPosition : null;
  const outcomeKey = state.lastOutcome ? `${state.roundNumber}-${state.lastOutcome.position}-${state.lastOutcome.picker}` : "";
  if (outcomeKey && outcomeKey !== lastOutcomeKey) {
    lastOutcomeKey = outcomeKey;
    const copy = state.lastOutcome.automatic ? "超时！系统替玩家选了一根" : "安全，暂时没中招";
    window.setTimeout(() => showToast(copy), 80);
  }
  app.innerHTML = `
    <section class="screen game-screen turn-screen ${myTurn ? "is-my-turn" : ""}">
      ${gameHeader(state, `第 ${state.roundNumber} 局`)}
      ${playerRibbon(state)}
      <div class="turn-callout">
        <div class="timer" id="turn-timer" aria-label="回合剩余时间"><strong>20</strong><span>秒</span></div>
        <div><p class="step-pill">${myTurn ? "轮到你" : "对手选择中"}</p><h1 class="game-title">${myTurn ? "哪根看起来最安全？" : "盯住对手的手…"}</h1></div>
      </div>
      ${state.paused ? `<div class="pause-banner">对手掉线，对局暂时冻结</div>` : ""}
      ${fryBoard(state, { action: "pick-fry", secretPosition: poisonPosition, interactive: myTurn })}
      <div class="legend"><span><i class="legend__secret"></i>你的整蛊薯条</span><span><i class="legend__safe"></i>未知薯条</span></div>
      <p class="turn-tip">吃掉自己调制的薯条不会中毒，但会失去这次埋伏。</p>
    </section>`;
  startCountdown(state.deadline);
}

function renderFinished(state) {
  const result = state.result ?? {};
  const sauces = result.recipe?.sauces ?? [];
  const draw = !result.winner;
  const won = result.winner === state.me;
  const victim = result.loser === state.me ? "你" : "对手";
  const requested = state.rematchVotes.includes(state.me);
  const title = draw ? "两根毒药都失效了" : won ? "埋伏成功！" : "你中招了！";
  const summary = draw ? "这局平分秋色" : `${victim}吃到了 ${recipeTitle(sauces)}`;
  const key = `${state.roundNumber}-${result.reason}-${result.winner}`;

  app.innerHTML = `
    <section class="screen reveal-screen ${won ? "reveal-screen--win" : "reveal-screen--loss"}" data-reveal-key="${key}">
      ${gameHeader(state, "配方揭晓")}
      <div class="reaction-stage" id="reaction-stage">
        <div class="reaction-burst" aria-hidden="true"></div>
        <div class="reaction-particles" aria-hidden="true">${reactionParticles(sauces)}</div>
        <div class="cartoon-face" aria-label="${victim}的夸张反应">
          <span class="face__hair">〰</span><span class="face__eye face__eye--left">●</span><span class="face__eye face__eye--right">●</span><span class="face__tear face__tear--left">◆</span><span class="face__tear face__tear--right">◆</span><span class="face__mouth">﹏</span><span class="face__steam">〽</span>
        </div>
        <p class="victim-label">${draw ? "平局" : `${victim}的表情`}</p>
        ${sauces.length ? `<button class="skip-effect" type="button" data-action="skip-effect">跳过演出</button>` : ""}
      </div>
      <div class="result-card">
        <p class="eyebrow">${won ? "WIN" : draw ? "DRAW" : "OOPS"}</p>
        <h1 class="screen-title">${title}</h1>
        <p class="muted">${summary}</p>
        ${sauces.length ? `<div class="result-recipe">${sauces.map((key) => `<span>${reactionFor(key).emoji} ${reactionFor(key).label}</span>`).join("")}</div>` : ""}
        <button class="button button--primary" type="button" data-action="rematch" ${requested ? "disabled" : ""}>${requested ? "等待对手同意…" : "再来一局"}</button>
        <button class="text-button" type="button" data-action="leave-room">返回首页</button>
      </div>
    </section>`;

  if (key !== lastOutcomeKey) {
    lastOutcomeKey = key;
    playReaction(sauces);
  } else if (sauces.length) {
    applyReactionClasses(sauces, true);
  }
}

function gameHeader(state, label) {
  return `<header class="game-header"><div><span class="game-header__brand">🍟 女巫毒药</span><small>${label}</small></div><span class="room-chip">#${state.room.code}</span></header>`;
}

function playerRibbon(state) {
  return `<div class="player-ribbon">${state.players.map((player, index) => {
    const isMe = player.id === state.me;
    const current = state.currentPlayer === player.id;
    return `<div class="ribbon-player ribbon-player--${index} ${current ? "is-current" : ""}"><span class="ribbon-face">${index === 0 ? "●ᴗ●" : "●▽●"}</span><div><strong>${isMe ? "你" : "对手"}</strong><small>${player.ready ? "已调制" : "调制中"}${player.online === false ? " · 离线" : ""}</small></div></div>`;
  }).join('<span class="ribbon-vs">VS</span>')}</div>`;
}

function fryBoard(state, { action, secretPosition, interactive }) {
  const remaining = new Set(state.remainingFries);
  return `<div class="plate-wrap"><div class="plate" role="group" aria-label="薯条餐盘">${Array.from({ length: 12 }, (_, position) => {
    if (!remaining.has(position)) return `<span class="fry-space fry-space--gone" aria-label="第 ${position + 1} 根已经被吃掉"></span>`;
    const selected = position === secretPosition;
    return `<button class="fry-space ${selected ? "fry-space--secret" : ""}" type="button" data-action="${action}" data-position="${position}" ${interactive ? "" : "disabled"} aria-label="第 ${position + 1} 根薯条${selected ? "，你的秘密薯条" : ""}"><span class="fry-stick"><i></i><i></i><i></i></span>${selected ? '<span class="secret-pin">✦</span>' : ""}</button>`;
  }).join("")}</div></div>`;
}

function sauceButton(key, effect) {
  const count = selectedSauces.filter((sauce) => sauce === key).length;
  return `<button class="sauce-button sauce-button--${key}" type="button" data-action="select-sauce" data-sauce="${key}" ${selectedSauces.length >= 2 ? "disabled" : ""}><span>${effect.emoji}</span><strong>${effect.shortLabel}</strong>${count ? `<i>${count}</i>` : ""}</button>`;
}

function recipeSlot(index, key) {
  if (!key) return `<span class="recipe-slot"><i>${index + 1}</i>等待加料</span>`;
  const effect = reactionFor(key);
  return `<button class="recipe-slot recipe-slot--filled" type="button" data-action="remove-sauce" data-index="${index}"><span>${effect.emoji}</span><strong>${effect.shortLabel}</strong><i>×</i></button>`;
}

function reactionParticles(sauces) {
  return sauces.flatMap((key) => reactionFor(key).particles).map((particle, index) => `<span style="--particle:${index}">${particle}</span>`).join("");
}

function playReaction(sauces) {
  clearReactionTimers();
  if (!sauces.length) return;
  const stage = document.querySelector("#reaction-stage");
  if (!stage) return;
  const first = reactionFor(sauces[0]);
  stage.classList.add(first.className, "reaction-active");
  reactionHandles.push(window.setTimeout(() => {
    const second = reactionFor(sauces[1]);
    stage.classList.add(second.className);
    if (sauces[0] === sauces[1]) stage.classList.add("reaction--double");
  }, 800));
  reactionHandles.push(window.setTimeout(() => stage.classList.add("reaction--settled"), 2500));
}

function applyReactionClasses(sauces, settled) {
  const stage = document.querySelector("#reaction-stage");
  if (!stage) return;
  sauces.forEach((key) => stage.classList.add(reactionFor(key).className));
  if (sauces[0] === sauces[1]) stage.classList.add("reaction--double");
  if (settled) stage.classList.add("reaction--settled");
}

function clearReactionTimers() {
  reactionHandles.forEach(window.clearTimeout);
  reactionHandles = [];
}

function startCountdown(deadline) {
  const timer = document.querySelector("#turn-timer strong");
  if (!timer) return;
  const fallbackStarted = Date.now();
  const update = () => {
    const remaining = deadline ? Math.ceil(deadline * 1000 - Date.now()) : 20_000 - (Date.now() - fallbackStarted);
    const seconds = Math.max(0, Math.ceil(remaining / 1000));
    timer.textContent = String(seconds);
    timer.closest(".timer")?.classList.toggle("timer--danger", seconds <= 5);
  };
  update();
  countdownHandle = window.setInterval(update, 250);
}

function clearCountdown() {
  if (countdownHandle) window.clearInterval(countdownHandle);
  countdownHandle = null;
}

function setConnectionState(message) {
  document.body.classList.toggle("is-offline", Boolean(message));
  if (message) showToast(message, false, 0);
  else liveStatus.classList.remove("toast--visible");
}

function showToast(message, isError = false, duration = 2600) {
  liveStatus.textContent = message;
  liveStatus.classList.toggle("toast--error", isError);
  liveStatus.classList.add("toast--visible");
  if (duration) window.setTimeout(() => liveStatus.classList.remove("toast--visible"), duration);
}

app.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target || target.disabled) return;
  const action = target.dataset.action;

  if (action === "quick-match") send({ type: "match.join" });
  if (action === "create-room") send({ type: "room.create" });
  if (action === "cancel-match") send({ type: "match.cancel" });
  if (action === "leave-room") send({ type: "room.leave" });
  if (action === "select-fry") {
    selectedFry = Number(target.dataset.position);
    render(lastMessage);
  }
  if (action === "select-sauce" && selectedSauces.length < 2) {
    selectedSauces.push(target.dataset.sauce);
    render(lastMessage);
  }
  if (action === "remove-sauce") {
    selectedSauces.splice(Number(target.dataset.index), 1);
    render(lastMessage);
  }
  if (action === "lock-recipe") send({ type: "recipe.lock", position: selectedFry, sauces: selectedSauces });
  if (action === "pick-fry") send({ type: "fry.pick", position: Number(target.dataset.position) });
  if (action === "rematch") send({ type: "rematch.request" });
  if (action === "skip-effect") document.querySelector("#reaction-stage")?.classList.add("reaction--settled");
  if (action === "copy-invite") {
    const result = await inviteFriend({ code: target.dataset.code, url: target.dataset.url });
    showToast(result.copied ? "邀请已复制，发给好友吧" : "复制失败，请手动复制房间码", !result.copied);
  }
});

app.addEventListener("submit", (event) => {
  const form = event.target.closest('[data-action="join-room"]');
  if (!form) return;
  event.preventDefault();
  const code = new FormData(form).get("code")?.toString().trim() ?? "";
  if (!/^\d{6}$/.test(code)) return showToast("请输入六位数字房间码", true);
  send({ type: "room.join", code });
});
