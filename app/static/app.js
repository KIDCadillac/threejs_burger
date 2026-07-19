import { REACTIONS, reactionFor, recipeTitle, snackFor } from "/static/effects.js";
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
let deploymentPlaying = false;
let gestureLockedUntil = 0;

const GESTURES = Object.freeze({
  calm: { emoji: "😌", label: "装镇定", bubble: "我一点都不慌" },
  laugh: { emoji: "🤭", label: "偷笑", bubble: "嘿嘿，随便选" },
  point: { emoji: "👉", label: "指错方向", bubble: "就选那一个！" },
  hurry: { emoji: "😝", label: "催他快吃", bubble: "别磨蹭，快吃！" },
  sneak: { emoji: "🤫", label: "鬼鬼祟祟", bubble: "我什么都没做" },
  mix: { emoji: "🧪", label: "偷偷搅拌", bubble: "正在调制秘密配方" },
  sealed: { emoji: "😏", label: "抱住配方", bubble: "已经藏好了" },
});

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

  if (deploymentPlaying && message.phase === "mixing" && !message.private) return;

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
  deploymentPlaying = false;
  clearReactionTimers();
}

function renderHome() {
  activeRound = null;
  app.innerHTML = `
    <section class="screen home-screen" aria-labelledby="game-title">
      <p class="eyebrow">双人心理战 · 一局两分钟</p>
      <div class="brand-mark" aria-hidden="true"><span>🍽️</span></div>
      <h1 id="game-title">女巫的毒药</h1>
      <p class="subtitle">零食乱斗篇</p>
      <p class="tagline">同一盘零食，各自秘密埋伏。</p>
      <div class="home-actions">
        <button class="button button--practice" type="button" data-action="start-practice"><span class="button__icon">🧙</span><span class="button__copy"><strong>单人练习</strong><small>立即对战电脑女巫</small></span></button>
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
      <div class="matching-actions">
        <button class="button button--practice" type="button" data-action="start-practice"><span class="button__icon">🧙</span><span class="button__copy"><strong>没人？和电脑玩</strong><small>不用等待，立即开局</small></span></button>
        <button class="button button--ghost" type="button" data-action="cancel-match">取消匹配</button>
      </div>
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
      ${opponentPose(state, "mixing")}
      <div class="stage-copy">
        <p class="step-pill">第 1 步</p>
        <h1 class="game-title">从公共盘挑一个，偷偷加料</h1>
        <p class="private-note"><span>◉</span> 只有你能看见位置和配方</p>
      </div>
      ${snackBoard(state, { action: "select-snack", secretPosition: selectedFry, interactive: true })}
      <section class="sauce-lab" aria-labelledby="sauce-title">
        <div class="section-heading"><h2 id="sauce-title">选两份调味料</h2><span>${selectedSauces.length}/2</span></div>
        <div class="sauce-grid">${Object.entries(REACTIONS).map(([key, effect]) => sauceButton(key, effect)).join("")}</div>
        <div class="recipe-slots" aria-label="当前配方">
          ${[0, 1].map((index) => recipeSlot(index, selectedSauces[index])).join("")}
        </div>
      </section>
      <button class="button button--primary lock-button" type="button" data-action="lock-recipe" ${canLock ? "" : "disabled"}>开始秘密下料</button>
    </section>`;
}

function renderRecipeLocked(state) {
  const sauces = state.private.sauces;
  const snack = state.snacks?.[state.private.poisonPosition] ?? { kind: "fry" };
  const opponentReady = state.players.some((player) => player.id !== state.me && player.ready);
  app.innerHTML = `
    <section class="screen center-screen locked-screen">
      ${gameHeader(state, "配方已封装")}
      ${opponentPose(state, "mixing")}
      <div class="sealed-cauldron" aria-hidden="true">${snackPiece(snack.kind, true)}<i>✦</i></div>
      <p class="eyebrow">你的整蛊${snackFor(snack.kind).label}</p>
      <h1 class="screen-title">${recipeTitle(sauces)}</h1>
      <div class="recipe-summary">
        ${sauces.map((key) => `<span>${reactionFor(key).emoji} ${reactionFor(key).shortLabel}</span>`).join("")}
        <strong>藏在公共盘的秘密位置</strong>
      </div>
      <p class="private-note"><span>◉</span> 只有你能看见</p>
      <div class="waiting-friend"><span class="dot-pulse">···</span><span>${opponentReady ? "双方已准备，正在开餐" : "对手还在秘密下料"}</span></div>
    </section>`;
}

function renderTurn(state) {
  const myTurn = state.currentPlayer === state.me && !state.paused;
  const poisonPosition = state.private?.active ? state.private.poisonPosition : null;
  const pending = state.pendingPick;
  const iAmPicker = pending?.picker === state.me;
  const canAim = myTurn && (!pending || (iAmPicker && !pending.changed));
  const bluff = pending?.bluff ? gestureFor(pending.bluff) : null;
  const outcomeKey = state.lastOutcome ? `${state.roundNumber}-${state.lastOutcome.position}-${state.lastOutcome.picker}` : "";
  if (outcomeKey && outcomeKey !== lastOutcomeKey) {
    lastOutcomeKey = outcomeKey;
    const safeCopies = ["咔嚓……安全！", "虚惊一场，还能嘴硬", "没中招，对手先别笑"];
    const copy = state.lastOutcome.automatic ? "超时！系统替玩家吃了一件" : safeCopies[state.lastOutcome.position % safeCopies.length];
    window.setTimeout(() => showToast(copy), 80);
  }
  app.innerHTML = `
    <section class="screen game-screen turn-screen ${myTurn ? "is-my-turn" : ""}">
      ${gameHeader(state, `第 ${state.roundNumber} 局`)}
      ${playerRibbon(state)}
      ${opponentPose(state, "turn")}
      <div class="turn-callout">
        <div class="timer" id="turn-timer" aria-label="回合剩余时间"><strong>20</strong><span>秒</span></div>
        <div><p class="step-pill">${myTurn ? (pending ? "正在试探" : "轮到你") : "对手选择中"}</p><h1 class="game-title">${turnPrompt(state, pending, myTurn)}</h1></div>
      </div>
      ${state.paused ? `<div class="pause-banner">对手掉线，对局暂时冻结</div>` : ""}
      ${snackBoard(state, { action: "aim-snack", secretPosition: poisonPosition, aimedPosition: pending?.position, interactive: canAim })}
      ${iAmPicker ? `<div class="aim-confirm"><div><strong>${bluff ? `${bluff.emoji} 对手说：“${bluff.bubble}”` : "正在观察对手表情…"}</strong><small>${pending.changed ? "已经改选过，接下来只能吃" : "可以改选一次，也可以坚持"}</small></div><button class="button button--primary" type="button" data-action="confirm-snack">就吃这个</button></div>` : ""}
      ${gestureBar(state)}
      <div class="legend"><span><i class="legend__secret"></i>你的秘密陷阱</span><span><i class="legend__aim"></i>正在瞄准</span></div>
      <p class="turn-tip">公共盘双方共用；吃掉自己的陷阱不会中招，但埋伏会失效。</p>
    </section>`;
  startCountdown(state.deadline);
}

function renderFinished(state) {
  const result = state.result ?? {};
  const sauces = result.recipe?.sauces ?? [];
  const replay = result.replay;
  const hit = result.reason === "poison" && replay;
  const draw = !result.winner;
  const won = result.winner === state.me;
  const victim = result.loser === state.me ? "你" : "对手";
  const requested = state.rematchVotes.includes(state.me);
  const title = draw ? "两份陷阱都失效了" : result.reason === "disconnect" ? (won ? "对手离开了" : "你已离开对局") : won ? "埋伏成功！" : "你中招了！";
  const summary = draw ? "这局平分秋色" : hit ? `${victim}吃到了 ${recipeTitle(sauces)}${snackFor(replay.snackKind).label}` : "本局因掉线结束";
  const key = `${state.roundNumber}-${result.reason}-${result.winner}`;

  app.innerHTML = `
    <section class="screen reveal-screen ${won ? "reveal-screen--win" : "reveal-screen--loss"}" data-reveal-key="${key}">
      ${gameHeader(state, "配方揭晓")}
      <div class="reaction-stage ${hit ? "" : "reaction-stage--hidden"}" id="reaction-stage">
        <p class="reaction-caption" id="reaction-caption">《还在努力表情管理》</p>
        <div class="reaction-burst" aria-hidden="true"></div>
        <div class="reaction-particles" aria-hidden="true">${reactionParticles(sauces)}</div>
        <div class="cartoon-face" aria-label="${victim}的夸张反应">
          <span class="face__hair">〰</span><span class="face__eye face__eye--left">●</span><span class="face__eye face__eye--right">●</span><span class="face__tear face__tear--left">◆</span><span class="face__tear face__tear--right">◆</span><span class="face__mouth">﹏</span><span class="face__steam">〽</span>
        </div>
        <div class="winner-peek" aria-hidden="true"><span>≧▽≦</span><small>${won ? "你在偷笑" : "对手在偷笑"}</small></div>
        <p class="victim-label">${draw ? "平局" : `${victim}的表情`}</p>
        ${hit ? `<button class="brave-button" type="button" data-action="brave-face">😤 我没事</button><button class="skip-effect" type="button" data-action="skip-effect">直接看回放</button>` : ""}
      </div>
      ${hit ? `<div class="deployment-replay" id="deployment-replay">
        <p class="eyebrow">下料回放</p>
        <h2>原来开局的时候……</h2>
        <div class="replay-counter">${snackPiece(replay.snackKind, true)}${replay.sauces.map((key, index) => `<span class="replay-sauce replay-sauce--${index}">${reactionFor(key).emoji}</span>`).join("")}<i class="replay-spark">✦</i></div>
        <p><strong>${won ? "你" : "对手"}</strong>偷偷把 ${recipeTitle(replay.sauces)} 藏进了${snackFor(replay.snackKind).label}</p>
      </div>` : ""}
      <div class="result-card ${hit ? "result-card--delayed" : "result-card--visible"}" id="result-card">
        <p class="eyebrow">${won ? "WIN" : draw ? "DRAW" : "OOPS"}</p>
        <h1 class="screen-title">${title}</h1>
        <p class="muted">${summary}</p>
        ${sauces.length ? `<div class="result-recipe">${sauces.map((key) => `<span>${reactionFor(key).emoji} ${reactionFor(key).label}</span>`).join("")}</div>` : ""}
        ${hit ? `<button class="button button--secondary" type="button" data-action="replay-deployment">再看一次下料回放</button>` : ""}
        <button class="button button--primary" type="button" data-action="rematch" ${requested ? "disabled" : ""}>${requested ? "等待对手同意…" : "再来一局"}</button>
        <button class="text-button" type="button" data-action="leave-room">返回首页</button>
      </div>
    </section>`;

  if (key !== lastOutcomeKey) {
    lastOutcomeKey = key;
    playHitSequence(sauces, Boolean(hit));
  } else if (sauces.length) {
    applyReactionClasses(sauces, true);
    showReplayAndResult(true);
  }
}

function gameHeader(state, label) {
  return `<header class="game-header"><div><span class="game-header__brand">🍽️ 女巫毒药</span><small>${label}</small></div><span class="room-chip">#${state.room.code}</span></header>`;
}

function playerRibbon(state) {
  return `<div class="player-ribbon">${state.players.map((player, index) => {
    const isMe = player.id === state.me;
    const current = state.currentPlayer === player.id;
    const name = isMe ? "你" : player.computer ? (player.name ?? "电脑女巫") : "对手";
    const offline = player.online === false && !player.computer ? " · 离线" : "";
    return `<div class="ribbon-player ribbon-player--${index} ${current ? "is-current" : ""}"><span class="ribbon-face">${player.computer ? "🧙" : index === 0 ? "●ᴗ●" : "●▽●"}</span><div><strong>${name}</strong><small>${player.ready ? "已调制" : "调制中"}${offline}</small></div></div>`;
  }).join('<span class="ribbon-vs">VS</span>')}</div>`;
}

function gestureFor(key) {
  return GESTURES[key] ?? GESTURES.calm;
}

function opponentPose(state, context) {
  const opponent = state.players.find((player) => player.id !== state.me);
  const event = state.gestures?.find((gesture) => gesture.player === opponent?.id);
  const fallback = context === "mixing" ? "sneak" : "calm";
  const gesture = gestureFor(event?.key ?? fallback);
  return `<div class="opponent-pose opponent-pose--${event?.key ?? fallback}" data-gesture-sequence="${event?.sequence ?? 0}"><span class="opponent-pose__face">${gesture.emoji}</span><div><small>对手动作</small><strong>${gesture.label}</strong><p>${gesture.bubble}</p></div></div>`;
}

function gestureBar(state) {
  const disabled = state.paused || Date.now() < gestureLockedUntil;
  return `<section class="gesture-bar" aria-label="搞怪动作"><div><strong>做个动作骗骗他</strong><small>只同步表情，不会暴露陷阱</small></div><div class="gesture-grid">${["calm", "laugh", "point", "hurry"].map((key) => {
    const gesture = gestureFor(key);
    return `<button type="button" data-action="send-gesture" data-gesture="${key}" ${disabled ? "disabled" : ""}><span>${gesture.emoji}</span><small>${gesture.label}</small></button>`;
  }).join("")}</div></section>`;
}

function turnPrompt(state, pending, myTurn) {
  if (!pending) return myTurn ? "先指一个，看看对手反应" : "轮到对手，用动作干扰他";
  const snack = state.snacks?.[pending.position];
  const label = snackFor(snack?.kind).label;
  return pending.picker === state.me ? `真的要吃这个${label}？` : `对手盯上了${label}…`;
}

function snackBoard(state, { action, secretPosition = null, aimedPosition = null, interactive = false }) {
  const snacks = state.snacks ?? Array.from({ length: 12 }, (_, position) => ({ position, kind: "fry", available: state.remainingFries.includes(position) }));
  return `<div class="plate-wrap"><div class="plate" role="group" aria-label="公共零食餐盘">${snacks.map((snack) => {
    if (!snack.available) return `<span class="snack-space snack-space--gone" aria-label="这个位置已经被吃掉"></span>`;
    const selected = snack.position === secretPosition;
    const aimed = snack.position === aimedPosition;
    const label = snackFor(snack.kind).label;
    return `<button class="snack-space ${selected ? "snack-space--secret" : ""} ${aimed ? "snack-space--aimed" : ""}" type="button" data-action="${action}" data-position="${snack.position}" ${interactive ? "" : "disabled"} aria-label="${label}${selected ? "，你的秘密陷阱" : ""}${aimed ? "，正在瞄准" : ""}">${snackPiece(snack.kind)}${selected ? '<span class="secret-pin">✦</span>' : ""}${aimed ? '<span class="aim-pin">👀</span>' : ""}</button>`;
  }).join("")}</div></div>`;
}

function snackPiece(kind, large = false) {
  return `<span class="snack-piece snack--${kind} ${large ? "snack-piece--large" : ""}" aria-hidden="true"><i></i><i></i><i></i></span>`;
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

function renderPrivateDeployment(state, position, sauces) {
  const snack = state.snacks?.[position] ?? { kind: "fry" };
  app.innerHTML = `
    <section class="screen game-screen deployment-screen">
      ${gameHeader(state, "私人下料中")}
      <div class="deployment-stage">
        <p class="eyebrow">对手看不到目标零食</p>
        <h1 class="game-title">嘘——动作小一点</h1>
        <div class="deployment-counter">${snackPiece(snack.kind, true)}${sauces.map((key, index) => `<span class="deployment-sauce deployment-sauce--${index}">${reactionFor(key).emoji}</span>`).join("")}<i>✦</i></div>
        <div class="deployment-witch"><span>🤫</span><strong>鬼鬼祟祟下料中</strong><small>只有你能看到 ${snackFor(snack.kind).label} 和配方</small></div>
      </div>
    </section>`;
}

function startPrivateDeployment(state) {
  if (selectedFry === null || selectedSauces.length !== 2 || deploymentPlaying) return;
  deploymentPlaying = true;
  const position = selectedFry;
  const sauces = [...selectedSauces];
  clearReactionTimers();
  renderPrivateDeployment(state, position, sauces);
  send({ type: "gesture.send", key: "mix" });
  reactionHandles.push(window.setTimeout(() => send({ type: "gesture.send", key: "sealed" }), 750));
  reactionHandles.push(window.setTimeout(() => {
    deploymentPlaying = false;
    send({ type: "recipe.lock", position, sauces });
  }, 1650));
}

function playHitSequence(sauces, hasReplay) {
  clearReactionTimers();
  if (!sauces.length || !hasReplay) {
    document.querySelector("#result-card")?.classList.add("result-card--visible");
    return;
  }
  const stage = document.querySelector("#reaction-stage");
  if (!stage) return;
  const first = reactionFor(sauces[0]);
  stage.classList.add(first.className, "reaction-active", "reaction--bracing");
  reactionHandles.push(window.setTimeout(() => {
    stage.classList.add("reaction--cracking");
    const caption = document.querySelector("#reaction-caption");
    if (caption) caption.textContent = "《好像有一点不对劲》";
  }, 650));
  reactionHandles.push(window.setTimeout(() => {
    const second = reactionFor(sauces[1]);
    stage.classList.add(second.className, "reaction--broken");
    if (sauces[0] === sauces[1]) stage.classList.add("reaction--double");
    const caption = document.querySelector("#reaction-caption");
    if (caption) caption.textContent = "《表情管理彻底失败》";
  }, 1350));
  reactionHandles.push(window.setTimeout(() => showReplayAndResult(false), 2900));
}

function showReplayAndResult(immediate = false) {
  document.querySelector("#reaction-stage")?.classList.add("reaction-stage--hidden");
  const replay = document.querySelector("#deployment-replay");
  replay?.classList.add("deployment-replay--active");
  const revealResult = () => document.querySelector("#result-card")?.classList.add("result-card--visible");
  if (immediate || !replay) revealResult();
  else reactionHandles.push(window.setTimeout(revealResult, 1900));
}

function replayDeployment() {
  const replay = document.querySelector("#deployment-replay");
  if (!replay) return;
  replay.classList.remove("deployment-replay--active");
  void replay.offsetWidth;
  replay.classList.add("deployment-replay--active");
  replay.scrollIntoView({ behavior: "smooth", block: "center" });
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

function sendGesture(key) {
  if (Date.now() < gestureLockedUntil) return;
  gestureLockedUntil = Date.now() + 900;
  send({ type: "gesture.send", key });
  window.setTimeout(() => {
    if (lastMessage.phase === "turn") render(lastMessage);
  }, 920);
}

function biteAndConfirm() {
  const target = document.querySelector(".snack-space--aimed");
  target?.classList.add("snack-space--biting");
  document.querySelectorAll(".snack-space, .aim-confirm button").forEach((button) => { button.disabled = true; });
  showToast("拿起来了……咔嚓！", false, 900);
  window.setTimeout(() => send({ type: "snack.confirm" }), 520);
}

app.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target || target.disabled) return;
  const action = target.dataset.action;

  if (action === "start-practice") send({ type: "practice.start" });
  if (action === "quick-match") send({ type: "match.join" });
  if (action === "create-room") send({ type: "room.create" });
  if (action === "cancel-match") send({ type: "match.cancel" });
  if (action === "leave-room") send({ type: "room.leave" });
  if (action === "select-snack") {
    selectedFry = Number(target.dataset.position);
    render(lastMessage);
    send({ type: "gesture.send", key: "sneak" });
  }
  if (action === "select-sauce" && selectedSauces.length < 2) {
    selectedSauces.push(target.dataset.sauce);
    render(lastMessage);
    send({ type: "gesture.send", key: "mix" });
  }
  if (action === "remove-sauce") {
    selectedSauces.splice(Number(target.dataset.index), 1);
    render(lastMessage);
  }
  if (action === "lock-recipe") startPrivateDeployment(lastMessage);
  if (action === "aim-snack") send({ type: "snack.aim", position: Number(target.dataset.position) });
  if (action === "confirm-snack") biteAndConfirm();
  if (action === "send-gesture") sendGesture(target.dataset.gesture);
  if (action === "rematch") send({ type: "rematch.request" });
  if (action === "brave-face") {
    const stage = document.querySelector("#reaction-stage");
    stage?.classList.add("reaction--brave");
    const caption = document.querySelector("#reaction-caption");
    if (caption) caption.textContent = "《嘴硬：我真的没事》";
    reactionHandles.push(window.setTimeout(() => stage?.classList.add("reaction--broken"), 620));
  }
  if (action === "skip-effect") {
    clearReactionTimers();
    showReplayAndResult(false);
  }
  if (action === "replay-deployment") replayDeployment();
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
