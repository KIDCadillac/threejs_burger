import { inviteFriend } from "/static/platform.js";

const app = document.querySelector("#app");
const liveStatus = document.querySelector("#live-status");
const playerId = getPlayerId();
const requestedRoom = new URLSearchParams(location.search).get("room");

let socket;
let reconnectAttempts = 0;
let lastMessage = { type: "home" };
let autoJoinSent = false;

connect();

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
    if (requestedRoom && !autoJoinSent) {
      autoJoinSent = true;
      send({ type: "room.join", code: requestedRoom });
    }
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
  if (message.type === "home") {
    renderHome();
    return;
  }
  if (message.type === "matching") {
    renderMatching();
    return;
  }
  if (message.type === "state" && message.phase === "waiting") {
    renderWaitingRoom(message);
    return;
  }
  if (message.type === "state") {
    renderGamePlaceholder(message);
  }
}

function renderHome() {
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
      <div class="room-code-card">
        <span>房间码</span>
        <strong>${code}</strong>
      </div>
      <button class="button button--primary" type="button" data-action="copy-invite" data-code="${code}" data-url="${url.toString()}">复制邀请链接</button>
      <div class="waiting-friend"><span class="dot-pulse">···</span><span>等待好友加入</span></div>
      <button class="text-button" type="button" data-action="leave-room">返回首页</button>
    </section>`;
}

function renderGamePlaceholder(state) {
  const copy = state.phase === "mixing" ? "两位玩家正在秘密调制" : "餐桌同步成功";
  app.innerHTML = `
    <section class="screen center-screen">
      <p class="eyebrow">房间 ${state.room.code}</p>
      <div class="brand-mark brand-mark--small" aria-hidden="true"><span>🍟</span></div>
      <h1 class="screen-title">${copy}</h1>
      <p class="muted">薯条盘和配方操作正在装盘</p>
    </section>`;
}

function setConnectionState(message) {
  document.body.classList.toggle("is-offline", Boolean(message));
  if (message) showToast(message, false, 0);
}

function showToast(message, isError = false, duration = 2600) {
  liveStatus.textContent = message;
  liveStatus.classList.toggle("toast--error", isError);
  liveStatus.classList.add("toast--visible");
  if (duration) {
    window.setTimeout(() => liveStatus.classList.remove("toast--visible"), duration);
  }
}

app.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "quick-match") send({ type: "match.join" });
  if (action === "create-room") send({ type: "room.create" });
  if (action === "cancel-match") send({ type: "match.cancel" });
  if (action === "leave-room") send({ type: "room.leave" });
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
  if (!/^\d{6}$/.test(code)) {
    showToast("请输入六位数字房间码", true);
    return;
  }
  send({ type: "room.join", code });
});

render(lastMessage);
