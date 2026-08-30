import {
  SUSHI_FISH_PREP,
  SUSHI_TASKS,
  changeSushiStation,
  completeSushiService,
  createSushiState,
  gripSushi,
  performSushiFishPrep,
  placeSushiFish,
  plateSushi,
  portionSushiRice,
  resetSushiState,
  shapeSushiRice,
  startSushiService,
  sushiNextTask,
} from "./sushi-state.mjs?v=20260831-sushi3";
import {
  SUSHI_FISH_TECHNIQUES,
  sushiMentorCue,
} from "./sushi-fish-techniques.mjs?v=20260831-sushi3";
import { createSushiStage } from "./sushi-stage.mjs?v=20260831-sushi3";

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.querySelector("#sushi-canvas");
const hint = document.querySelector("#sushi-stage-hint");
const feedback = document.querySelector("#sushi-feedback");
const error = document.querySelector("#sushi-error");
const taskTitle = document.querySelector("#sushi-task-title");
const taskCounter = document.querySelector("#sushi-task-counter");
const taskProgress = document.querySelector("#sushi-task-progress");
const stationName = document.querySelector("#sushi-station-name");
const toolName = document.querySelector("#sushi-tool-name");
const gestureName = document.querySelector("#sushi-gesture-name");
const techniquePanel = document.querySelector("#sushi-technique");
const mentor = document.querySelector("#sushi-mentor");
const mentorTone = document.querySelector("#sushi-mentor-tone");
const mentorCopy = document.querySelector("#sushi-mentor-copy");
const servedCount = document.querySelector("#sushi-served-count");
const orderNumber = document.querySelector("#sushi-order-number");
const resetButton = document.querySelector("#sushi-reset");
const prepButton = document.querySelector("#sushi-station-prep");
const assemblyButton = document.querySelector("#sushi-station-assembly");
const chapterNodes = [...document.querySelectorAll("[data-sushi-chapter]")];

const FISH_TASKS = Object.freeze(SUSHI_TASKS.slice(0, 6));
const TASK_META = Object.freeze({
  "scale-fish": { title: "逆鳞刮鳞", chapter: "fish", hint: "右手拿出刃刀，用刀背从鱼尾向鱼头完整刮过", gesture: "鱼尾 → 鱼头", tool: "刀背", progress: (state) => [state.scaleStrokes, SUSHI_FISH_PREP.scaleStrokesRequired] },
  "reserve-head-collar": { title: "保留鱼头鱼领", chapter: "fish", hint: "在鳃后落刀，分开鱼头鱼领并放入汤料托盘", gesture: "鳃后 ↓ 落刀", tool: "出刃刀" },
  "fillet-fish": { title: "贴骨开片", chapter: "fish", hint: "左手压稳鱼身，右手贴着中骨从头端拉到尾端", gesture: "头端 → 尾端", tool: "出刃刀" },
  "remove-pinbones": { title: "逐根拔针骨", chapter: "fish", hint: "夹稳露出的针骨，顺着骨头方向向上拔出", gesture: "夹稳 ↑ 拔出", tool: "骨拔镊", progress: (state) => [state.pinBonesRemoved, SUSHI_FISH_PREP.pinBonesRequired] },
  "skin-fillet": { title: "压皮取肉", chapter: "fish", hint: "左手压住尾端鱼皮，刀身放平贴着皮向前推", gesture: "压皮 → 平推", tool: "出刃刀" },
  "slice-fillet": { title: "拉切寿司片", chapter: "fish", hint: "刀斜放，一刀拉切到底；不要前后锯鱼肉", gesture: "斜刀 ↓ 拉切", tool: "柳刃刀", progress: (state) => [state.sliceCuts, SUSHI_FISH_PREP.sliceCutsRequired] },
  "portion-rice": { title: "取一口醋饭", chapter: "rice", hint: "左手从饭桶取一份醋饭，拖到竹帘中央", gesture: "左手取饭", tool: "左手" },
  "shape-rice": { title: "整形饭坯", chapter: "rice", hint: "按住醋饭前后短揉两次，让两手把它收成椭圆饭坯", gesture: "按住 · 往返两次", tool: "双手" },
  "place-fish": { title: "鱼片覆饭", chapter: "assembly", hint: "横滑到右侧握寿司台，用右手把鱼片盖到饭坯上", gesture: "右手夹取并对齐", tool: "右手" },
  "grip-sushi": { title: "两手定型", chapter: "assembly", hint: "按住寿司，两手从侧面收紧，等它压合后回弹", gesture: "长按收紧", tool: "双手" },
  "plate-sushi": { title: "装盘", chapter: "assembly", hint: "托起完整握寿司，拖到陶盘中央再松手", gesture: "托起 → 装盘", tool: "右手" },
  serve: { title: "按铃出餐", chapter: "serve", hint: "点击料理台上的实体出餐铃，把这一贯送走", gesture: "点击实体铃", tool: "食指" },
});

const CHAPTER_ORDER = Object.freeze(["fish", "rice", "assembly", "serve"]);
const STATION_LABELS = Object.freeze({ prep: "整鱼备料台", assembly: "握寿司出餐台" });
const demonstrated = new Set();
const demoTimers = new Set();
let state = createSushiState();
let stage = null;
let mentorTimer = 0;
let feedbackTimer = 0;
let audioContext = null;

function currentTask() {
  return sushiNextTask(state);
}

function setHint(message) {
  hint.textContent = message;
}

function showFeedback(message, tone = "success") {
  window.clearTimeout(feedbackTimer);
  feedback.textContent = message;
  feedback.dataset.tone = tone;
  feedback.classList.remove("is-visible");
  void feedback.offsetWidth;
  feedback.classList.add("is-visible");
  feedbackTimer = window.setTimeout(() => feedback.classList.remove("is-visible"), 720);
}

function playMentorGrumble() {
  try {
    audioContext ??= new (window.AudioContext ?? window.webkitAudioContext)();
    const now = audioContext.currentTime;
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    const oscillator = audioContext.createOscillator();
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(116, now);
    oscillator.frequency.linearRampToValueAtTime(82, now + 0.11);
    oscillator.frequency.linearRampToValueAtTime(132, now + 0.2);
    oscillator.frequency.linearRampToValueAtTime(78, now + 0.34);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.35);
  } catch {
    // Audio is optional and may be blocked by the browser.
  }
}

function presentMentorCue(cue) {
  if (!cue?.message) return;
  window.clearTimeout(mentorTimer);
  mentor.hidden = false;
  mentor.dataset.tone = cue.kind;
  mentorTone.textContent = cue.kind === "error"
    ? (cue.slowReplay ? "停手，再看慢动作" : "喂！刀路错了")
    : cue.kind === "success" ? "这下像样" : "先看大将做";
  mentorCopy.textContent = cue.message;
  if (cue.kind === "error") {
    playMentorGrumble();
    try { window.navigator.vibrate?.([26, 36, 42]); } catch { /* optional */ }
  }
  const duration = cue.slowReplay ? 3000 : cue.kind === "demo" ? 2500 : 1700;
  mentorTimer = window.setTimeout(() => { mentor.hidden = true; }, duration);
}

function chapterStatus(chapter, nextTask) {
  const currentIndex = CHAPTER_ORDER.indexOf(TASK_META[nextTask]?.chapter ?? "serve");
  const chapterIndex = CHAPTER_ORDER.indexOf(chapter);
  if (state.phase === "serving" || state.served) return "complete";
  if (chapterIndex < currentIndex) return "complete";
  if (chapterIndex === currentIndex) return "active";
  return "pending";
}

function renderState() {
  const nextTask = currentTask() ?? "serve";
  const meta = TASK_META[nextTask] ?? TASK_META.serve;
  const taskIndex = Math.max(0, SUSHI_TASKS.indexOf(nextTask));
  document.body.dataset.sushiPhase = state.phase;
  document.body.dataset.sushiTask = nextTask;
  document.body.dataset.sushiStation = state.station;
  taskTitle.textContent = meta.title;
  taskCounter.textContent = `第 ${taskIndex + 1} / ${SUSHI_TASKS.length} 步`;
  const taskAmounts = meta.progress?.(state);
  taskProgress.textContent = taskAmounts ? `${taskAmounts[0]} / ${taskAmounts[1]}` : "";
  taskProgress.hidden = !taskAmounts;
  stationName.textContent = STATION_LABELS[state.station];
  toolName.textContent = meta.tool;
  gestureName.textContent = meta.gesture;
  techniquePanel.hidden = false;
  servedCount.textContent = String(state.servedCount);
  orderNumber.textContent = String(state.servedCount + 1).padStart(2, "0");
  setHint(meta.hint);
  chapterNodes.forEach((node) => {
    const status = chapterStatus(node.dataset.sushiChapter, nextTask);
    node.classList.toggle("is-active", status === "active");
    node.classList.toggle("is-complete", status === "complete");
  });
  for (const [station, button] of [["prep", prepButton], ["assembly", assemblyButton]]) {
    const selected = state.station === station;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  resetButton.disabled = state.phase === "serving" || Boolean(stage?.isBusy?.());
}

function scheduleDemo(taskId = currentTask(), { slow = false, force = false } = {}) {
  if (!stage || !FISH_TASKS.includes(taskId) || (!force && demonstrated.has(taskId))) return;
  demonstrated.add(taskId);
  const timer = window.setTimeout(() => {
    demoTimers.delete(timer);
    if (currentTask() !== taskId || state.station !== "prep") return;
    const cue = sushiMentorCue(taskId, "demo");
    presentMentorCue({ ...cue, slowReplay: slow });
    stage.demonstrate(taskId, { slow });
  }, prefersReducedMotion ? 40 : 320);
  demoTimers.add(timer);
}

function reduceTask(taskId) {
  if (FISH_TASKS.includes(taskId)) return performSushiFishPrep(state, taskId);
  if (taskId === "portion-rice") return portionSushiRice(state);
  if (taskId === "shape-rice") return shapeSushiRice(state);
  if (taskId === "place-fish") return placeSushiFish(state);
  if (taskId === "grip-sushi") return gripSushi(state);
  if (taskId === "plate-sushi") return plateSushi(state);
  return null;
}

function applyCompletedAction({ taskId } = {}) {
  const beforeTask = currentTask();
  if (!taskId || taskId !== beforeTask) return false;
  const result = reduceTask(taskId);
  if (!result?.accepted) return false;
  state = result.state;
  stage.syncState(state);
  renderState();
  const nextTask = currentTask();
  if (taskId === "scale-fish" && nextTask === "scale-fish") {
    showFeedback(`鳞区 ${state.scaleStrokes} / ${SUSHI_FISH_PREP.scaleStrokesRequired}`);
  } else if (taskId === "remove-pinbones" && nextTask === "remove-pinbones") {
    showFeedback(`针骨 ${state.pinBonesRemoved} / ${SUSHI_FISH_PREP.pinBonesRequired}`);
  } else if (taskId === "slice-fillet" && nextTask === "slice-fillet") {
    showFeedback(`鱼片 ${state.sliceCuts} / ${SUSHI_FISH_PREP.sliceCutsRequired}`);
  } else {
    showFeedback(taskId === "plate-sushi" ? "装盘完成，按铃！" : "手法正确！");
  }
  if (FISH_TASKS.includes(taskId)) presentMentorCue(sushiMentorCue(taskId, "success"));
  if (nextTask === "place-fish" && state.station !== "assembly") {
    setHint("备料完成。向左横滑桌沿，去右侧握寿司台组装");
  }
  scheduleDemo(nextTask);
  return true;
}

function changeStation(nextStation, { animate = true, source = "button" } = {}) {
  if (source !== "gesture" && stage?.isBusy?.()) return false;
  const next = changeSushiStation(state, nextStation);
  if (next === state) return false;
  if (source !== "gesture" && stage.setStation(nextStation, { animate, source }) === false) return false;
  state = next;
  stage.syncState(state);
  renderState();
  if (nextStation === "prep") scheduleDemo();
  return true;
}

stage = createSushiStage({
  canvas,
  reducedMotion: prefersReducedMotion,
  onActionComplete(payload) {
    applyCompletedAction(payload);
  },
  onStationChange({ station } = {}) {
    changeStation(station, { animate: false, source: "gesture" });
  },
  onMentorCue(cue) {
    presentMentorCue(cue);
    if (cue?.slowReplay && cue.taskId) {
      window.setTimeout(() => stage.demonstrate(cue.taskId, { slow: true }), 420);
    }
  },
  onImpact({ message = "定型！", strength = 1 } = {}) {
    showFeedback(message);
    try { window.navigator.vibrate?.(Math.round(10 + strength * 10)); } catch { /* optional */ }
  },
  onServeComplete() {
    const serving = startSushiService(state);
    if (serving === state) return;
    state = completeSushiService(serving);
    stage.reset();
    stage.syncState(state);
    renderState();
    showFeedback("出餐！新鱼已上案板");
    setHint("新订单开始。大将看着你，这次自己完成整鱼处理");
  },
  onError(reason) {
    error.hidden = false;
    error.textContent = reason?.message ?? "寿司台运行异常，请刷新后重试。";
  },
});

prepButton.addEventListener("click", () => changeStation("prep"));
assemblyButton.addEventListener("click", () => changeStation("assembly"));
resetButton.addEventListener("click", () => {
  if (stage.isBusy()) return;
  state = resetSushiState(state);
  stage.reset();
  stage.syncState(state);
  renderState();
  showFeedback("本单已重做", "neutral");
  setHint("整条三文鱼重新上案板，从逆鳞刮鳞开始");
  scheduleDemo(currentTask(), { force: true });
});

window.addEventListener("pagehide", () => {
  window.clearTimeout(mentorTimer);
  window.clearTimeout(feedbackTimer);
  demoTimers.forEach((timer) => window.clearTimeout(timer));
  demoTimers.clear();
  audioContext?.close?.();
}, { once: true });

window.__sushiGameDebug = Object.freeze({
  getState: () => state,
  getStageState: () => stage.getDebugState(),
  setStation: (station) => changeStation(station),
  replayDemo: () => scheduleDemo(currentTask(), { force: true }),
});

stage.syncState(state);
renderState();
scheduleDemo();
