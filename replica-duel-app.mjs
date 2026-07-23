import * as THREE from "./vendor/three.module.min.js";
import { createSoloCookingStage } from "./cooking-solo-stage.mjs";
import { createReplicaDuelStageAdapter } from "./replica-duel-stage-adapter.mjs";
import { createReplicaDuelReveal } from "./replica-duel-reveal.mjs";
import {
  createReplicaDuelLocalHost,
  joinReplicaDuelLocalPractice,
} from "./replica-duel-local-channel.mjs";

const ROLE_LABELS = Object.freeze({
  waiting: "待准备",
  creator: "制作人",
  replicator: "复刻者",
  observer: "观察者",
});

function phaseCopy(view) {
  if (!view || view.status === "lobby") return { title: "等待双方准备", panel: null };
  if (view.status === "finished") return { title: "练习完成", panel: "reveal" };
  if (view.phase === "creating") {
    return view.role === "creator"
      ? { title: "制作原作", panel: "creating" }
      : { title: "观察对手", panel: "observer" };
  }
  if (view.phase === "memorize") return { title: "记住汉堡", panel: "memorize" };
  if (view.phase === "replicating") {
    return view.role === "replicator"
      ? { title: "开始复刻", panel: "replicating" }
      : { title: "等待对手复刻", panel: "observer" };
  }
  if (view.phase === "scoring") return { title: "正在评分", panel: "reveal" };
  if (view.phase === "reveal") return { title: "揭晓对比", panel: "reveal" };
  return { title: "本地双视角练习", panel: null };
}

export function parseReplicaDuelRoute(location) {
  try {
    const url = new URL(location?.href);
    const matchId = url.searchParams.get("match");
    const channelToken = url.searchParams.get("token");
    const playerId = url.searchParams.get("player");
    if (matchId && channelToken && playerId === "B") {
      return Object.freeze({ mode: "guest", matchId, channelToken, playerId: "B" });
    }
  } catch {
    // Invalid or missing routes start a new local practice as player A.
  }
  return Object.freeze({ mode: "host", playerId: "A" });
}

export function formatReplicaDuelCountdown(view, now = Date.now()) {
  if (!Number.isFinite(view?.phaseDeadlineAt)) return "--";
  const seconds = Math.max(0, Math.ceil((view.phaseDeadlineAt - now) / 1_000));
  return String(seconds).padStart(2, "0");
}

function requiredElement(documentTarget, selector) {
  const element = documentTarget?.querySelector?.(selector);
  if (!element) throw new Error(`Missing required replica duel element: ${selector}`);
  return element;
}

function secondViewUrl(location, invite) {
  const url = new URL("./replica-duel.html", location.href);
  url.search = "";
  url.searchParams.set("match", invite.matchId);
  url.searchParams.set("token", invite.channelToken);
  url.searchParams.set("player", "B");
  return url.href;
}

export function bootReplicaDuelPage(
  documentTarget = globalThis.document,
  {
    windowTarget = globalThis,
    now = () => Date.now(),
    stageFactory = createSoloCookingStage,
    adapterFactory = createReplicaDuelStageAdapter,
    revealFactory = createReplicaDuelReveal,
    hostFactory = createReplicaDuelLocalHost,
    guestFactory = joinReplicaDuelLocalPractice,
  } = {},
) {
  const elements = {
    canvas: requiredElement(documentTarget, "#replica-duel-canvas"),
    player: requiredElement(documentTarget, "#duel-player"),
    role: requiredElement(documentTarget, "#duel-role"),
    phase: requiredElement(documentTarget, "#duel-phase"),
    countdown: requiredElement(documentTarget, "#duel-countdown"),
    status: requiredElement(documentTarget, "#duel-status"),
    revealRoot: requiredElement(documentTarget, "#duel-reveal"),
    replicaCanvas: requiredElement(documentTarget, "#replica-duel-replica-canvas"),
    scoreTotal: requiredElement(documentTarget, "#duel-score-total"),
    scoreIssues: requiredElement(documentTarget, "#duel-score-issues"),
    finalRoot: requiredElement(documentTarget, "#duel-final-result"),
    finalWinner: requiredElement(documentTarget, "#duel-final-winner"),
    finalRounds: requiredElement(documentTarget, "#duel-final-rounds"),
    ready: requiredElement(documentTarget, '[data-action="ready"]'),
    finish: requiredElement(documentTarget, '[data-action="finish"]'),
    revealReady: requiredElement(documentTarget, '[data-action="reveal-ready"]'),
    openSecond: requiredElement(documentTarget, '[data-action="open-second-view"]'),
    exit: requiredElement(documentTarget, '[data-action="exit"]'),
    panels: [...(documentTarget.querySelectorAll?.("[data-phase-panel]") ?? [])],
    scoreNodes: new Map(
      [...(documentTarget.querySelectorAll?.("[data-score]") ?? [])]
        .map((node) => [node.dataset.score, node]),
    ),
  };
  for (const key of ["ingredients", "order", "sauce", "placement", "speed"]) {
    if (!elements.scoreNodes.has(key)) {
      throw new Error(`Missing required replica duel score element: ${key}`);
    }
  }
  const route = parseReplicaDuelRoute(windowTarget.location);
  let connection = null;
  let stage = null;
  let adapter = null;
  let reveal = null;
  let unsubscribe = () => {};
  let disposed = false;
  let ended = false;
  let currentView = null;
  let timerId = null;

  function disableActions() {
    elements.ready.disabled = true;
    elements.finish.disabled = true;
    elements.revealReady.disabled = true;
  }

  function renderCountdown() {
    elements.countdown.textContent = formatReplicaDuelCountdown(currentView, now());
  }

  function renderView(view) {
    currentView = view;
    const presentation = phaseCopy(view);
    elements.player.textContent = `玩家 ${view.playerId}`;
    elements.role.textContent = ROLE_LABELS[view.role] ?? view.role;
    elements.phase.textContent = presentation.title;
    elements.canvas.setAttribute(
      "aria-label",
      view.controlsEnabled ? "三维汉堡制作台" : "只读三维汉堡观察台",
    );
    for (const panel of elements.panels) {
      panel.hidden = panel.dataset.phasePanel !== presentation.panel;
    }
    elements.ready.disabled = ended || view.status !== "lobby" || Boolean(view.ready?.[view.playerId]);
    elements.finish.disabled = ended || !view.controlsEnabled
      || !["creating", "replicating"].includes(view.phase);
    elements.revealReady.disabled = ended || view.phase !== "reveal"
      || Boolean(view.revealReady?.[view.playerId]);
    elements.ready.hidden = view.status !== "lobby";
    elements.finish.hidden = !["creating", "replicating"].includes(view.phase);
    elements.revealReady.hidden = view.phase !== "reveal";
    elements.status.textContent = view.status === "lobby"
      ? "请打开另一视角，双方准备后开始"
      : view.status === "finished"
        ? "两轮练习已完成"
        : `第 ${view.round} 轮 · ${presentation.title}`;
    if (view.scoringError) elements.status.textContent = `评分暂未完成：${view.scoringError}`;
    renderCountdown();
    adapter?.applyView(view);
    reveal?.applyView(view);
  }

  function renderEnded(message = "本地练习已结束") {
    ended = true;
    elements.status.textContent = message;
    elements.phase.textContent = "练习结束";
    elements.countdown.textContent = "--";
    disableActions();
    if (currentView) {
      adapter?.applyView({ ...currentView, controlsEnabled: false, visibleSnapshot: null });
    }
  }

  function onConnectionEvent(event) {
    if (disposed) return;
    if (event?.type === "view") renderView(event.view);
    else if (event?.type === "ended") renderEnded(event.message);
    else if (event?.type === "ack" && event.ack && !event.ack.ok) {
      elements.status.textContent = "这一步没有生效，请按当前阶段继续";
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (timerId !== null) windowTarget.clearInterval?.(timerId);
    documentTarget.removeEventListener?.("click", onClick);
    windowTarget.removeEventListener?.("resize", onResize);
    windowTarget.removeEventListener?.("beforeunload", dispose);
    unsubscribe();
    reveal?.dispose?.();
    adapter?.dispose?.();
    stage?.dispose?.();
    connection?.close?.();
  }

  function onResize() {
    stage?.resize?.();
  }

  function onClick(event) {
    const button = event?.target?.closest?.("[data-action]");
    if (!button || disposed) return;
    const action = button.dataset.action;
    if (action === "ready" && !button.disabled) connection?.send?.("ready");
    if (action === "finish" && !button.disabled) adapter?.requestFinish?.();
    if (action === "reveal-ready" && !button.disabled) connection?.send?.("reveal-ready");
    if (action === "open-second-view" && connection?.invite) {
      windowTarget.open?.(
        secondViewUrl(windowTarget.location, connection.invite),
        "_blank",
        "noopener,noreferrer",
      );
    }
    if (action === "exit") {
      dispose();
      windowTarget.location?.assign?.("./index.html");
    }
  }

  elements.openSecond.hidden = route.mode !== "host";
  disableActions();
  elements.player.textContent = `玩家 ${route.playerId}`;
  elements.role.textContent = "待准备";
  elements.phase.textContent = "正在建立本地练习";
  elements.countdown.textContent = "--";

  try {
    connection = route.mode === "guest"
      ? guestFactory({
          matchId: route.matchId,
          channelToken: route.channelToken,
          playerId: route.playerId,
        })
      : hostFactory();

    let pendingAdapter = null;
    stage = stageFactory({
      THREE,
      canvas: elements.canvas,
      documentTarget,
      storage: null,
      competitionMode: true,
      competitionReadOnly: true,
      reducedMotion: Boolean(windowTarget.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches),
      onChange: (detail) => pendingAdapter?.handleStageChange?.(detail),
      onError: (message) => { elements.status.textContent = String(message); },
    });
    adapter = adapterFactory({
      stage,
      onDraft: (snapshot) => connection.send("draft", { snapshot }),
      onFinish: (snapshot) => {
        connection.send("draft", { snapshot });
        connection.send("finish");
      },
    });
    pendingAdapter = adapter;
    reveal = revealFactory({
      root: elements.revealRoot,
      originalCanvas: elements.canvas,
      replicaCanvas: elements.replicaCanvas,
      originalStage: stage,
      createReplicaStage: ({ canvas }) => stageFactory({
        THREE,
        canvas,
        documentTarget,
        storage: null,
        competitionMode: true,
        competitionReadOnly: true,
        reducedMotion: Boolean(
          windowTarget.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
        ),
        onChange: () => {},
        onError: (message) => { elements.status.textContent = String(message); },
      }),
      total: elements.scoreTotal,
      issues: elements.scoreIssues,
      finalRoot: elements.finalRoot,
      finalWinner: elements.finalWinner,
      finalRounds: elements.finalRounds,
      scoreNodes: elements.scoreNodes,
    });
    unsubscribe = connection.subscribe(onConnectionEvent);
    const initialView = connection.getView?.();
    if (initialView && currentView !== initialView) renderView(initialView);
    documentTarget.addEventListener?.("click", onClick);
    windowTarget.addEventListener?.("resize", onResize, { passive: true });
    windowTarget.addEventListener?.("beforeunload", dispose);
    timerId = windowTarget.setInterval?.(renderCountdown, 250) ?? null;
  } catch (error) {
    connection?.close?.();
    connection = null;
    stage?.dispose?.();
    stage = null;
    adapter = null;
    reveal?.dispose?.();
    reveal = null;
    elements.status.textContent = "此浏览器暂不支持本地双视角练习";
    elements.phase.textContent = "无法开始练习";
    disableActions();
  }

  return Object.freeze({
    route,
    getView: () => currentView,
    dispose,
  });
}

if (typeof document !== "undefined") {
  bootReplicaDuelPage(document);
}
