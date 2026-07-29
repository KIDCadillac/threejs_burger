import {
  DEFAULT_LAYOUT_VALUE,
  PROJECT_DEFAULT_LAYOUT_ELEMENTS,
  createWorkbenchFile,
  createProjectDefaultLayoutDocument,
  createLayoutHistory,
  mergeProjectDefaultLayout,
  normalizeLayoutDocument,
  parseLayoutDocument,
  parseWorkbenchFile,
  projectDefaultLayoutValue,
  updateLayoutElement,
  updateTruckTimeline,
} from "./home-layout-editor-state.mjs?v=20260730-wheeldefaults1";
import {
  alignmentPatch,
  normalizeAlignmentSettings,
  snapDragLayout,
} from "./home-layout-guides.mjs?v=20260730-truckfocus1";

const STORAGE_KEY = "burger.home.layout.v2";
const LEGACY_STORAGE_KEY = "burger.home.layout.v1";
const THEATRE_STORAGE_KEY = "burger.home.theatre.v1";
const ALIGNMENT_STORAGE_KEY = "burger.home.editor-guides.v2";
const THEATRE_PROJECT_ID = "Burger UI Workbench";
const query = new URLSearchParams(window.location.search);
const editorEnabled = query.get("layout") === "1";
const editableSelector = "[data-layout-id],[data-layout-runtime-id]";
const animationById = new Map();
const theatreObjects = new Map();
const openLayerGroups = new Set(["burger-vehicle"]);
const TRUCK_EDITOR_BASE_IDS = new Set([
  "burger.camera",
  "burger.truck",
  "burger.body",
  "burger.service",
  "burger.menu",
  "burger.window",
  "burger.shutter",
  "burger.sign",
  "burger.wheel-front",
  "burger.wheel-rear",
]);
const NUDGE_DIRECTION_BY_KEY = Object.freeze({
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  Numpad4: "left",
  Numpad6: "right",
  Numpad8: "up",
  Numpad2: "down",
});
let theatreCore = null;
let theatreStudio = null;
let theatreProject = null;
let theatreSheet = null;
let truckTimelineObject = null;
let devMoveable = null;
let moveableScrub = null;
let moveableStartValue = null;
let moveableStartRect = null;
let moveableReferenceRect = null;
let truckFocusEnabled = true;
let studioVisible = false;

const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const escapeSelector = (value) =>
  window.CSS?.escape
    ? window.CSS.escape(String(value))
    : String(value).replaceAll('"', '\\"');

function loadSavedDocument() {
  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ||
      window.localStorage.getItem(LEGACY_STORAGE_KEY);
    return raw
      ? mergeProjectDefaultLayout(parseLayoutDocument(raw))
      : createProjectDefaultLayoutDocument();
  } catch {
    return createProjectDefaultLayoutDocument();
  }
}

function loadAlignmentSettings() {
  try {
    const raw = window.localStorage.getItem(ALIGNMENT_STORAGE_KEY);
    return normalizeAlignmentSettings(raw ? JSON.parse(raw) : {});
  } catch {
    return normalizeAlignmentSettings({});
  }
}

let history = createLayoutHistory(loadSavedDocument());
let workingDocument = history.current();
let alignmentSettings = loadAlignmentSettings();
let selectedId = "";
let activeEditorView = "home";
let operation = null;
let overlayFrame = 0;
let toastTimer = 0;
let truckPreviewTimer = 0;

const LAYER_CATEGORY_DEFINITIONS = [
  {
    key: "burger-vehicle",
    label: "整车与镜头",
    description: "完整餐车、车身、镜头与场景",
    matches: (baseId) =>
      [
        "burger.card",
        "burger.scene",
        "burger.camera",
        "burger.truck",
        "burger.body",
      ].includes(baseId),
  },
  {
    key: "burger-service",
    label: "出餐窗口与招牌",
    description: "厨师、窗口、卷帘、招牌和营业按钮",
    matches: (baseId) =>
      [
        "burger.window",
        "burger.service",
        "burger.shutter",
        "burger.sign",
        "burger.service-control",
      ].includes(baseId),
  },
  {
    key: "burger-menu",
    label: "菜单灯箱",
    description: "今日菜单与三面翻画面",
    matches: (baseId) => baseId === "burger.menu",
  },
  {
    key: "burger-wheel",
    label: "车轮",
    description: "餐车前轮与后轮",
    matches: (baseId) => baseId.startsWith("burger.wheel"),
  },
  {
    key: "burger-mode",
    label: "玩法信息",
    description: "自由练习、营业状态等文字",
    matches: (baseId) => baseId === "burger.mode",
  },
  {
    key: "global-hud",
    label: "顶部状态与标题",
    description: "体力、金币、店名和健康提示",
    matches: (baseId) =>
      ["global.hud", "global.title", "global.health-note"].includes(baseId),
  },
  {
    key: "global-carousel",
    label: "轮播与左右按钮",
    description: "餐厅卡片轨道与切换按钮",
    matches: (baseId) =>
      ["global.carousel", "global.arrow-left", "global.arrow-right"].includes(
        baseId,
      ),
  },
  {
    key: "global-navigation",
    label: "底部导航",
    description: "小馆、图鉴、签到和更多",
    matches: (baseId) => baseId === "global.bottom-nav",
  },
  {
    key: "sheet-daily",
    label: "签到弹窗",
    description: "每日签到界面中的全部元素",
    matches: (baseId) => baseId.startsWith("sheet.daily"),
  },
  {
    key: "sheet-cookbook",
    label: "图鉴弹窗",
    description: "菜品图鉴界面中的全部元素",
    matches: (baseId) => baseId.startsWith("sheet.cookbook"),
  },
  {
    key: "sheet-settings",
    label: "设置弹窗",
    description: "游戏设置界面中的全部元素",
    matches: (baseId) => baseId.startsWith("sheet.settings"),
  },
  {
    key: "sushi",
    label: "寿司店（筹备）",
    description: "未开放地图的卡片和场景",
    matches: (baseId) => baseId.startsWith("sushi."),
  },
  {
    key: "other",
    label: "其他元素",
    description: "尚未归入固定分类的页面元素",
    matches: () => true,
  },
];

const LAYER_DISPLAY_NAMES = {
  "burger.card": "汉堡餐车卡片",
  "burger.scene": "汉堡场景",
  "burger.camera": "餐车镜头",
  "burger.truck": "完整餐车",
  "burger.body": "银色车身",
  "burger.window": "出餐窗口",
  "burger.service": "出餐区域",
  "burger.shutter": "银色卷帘",
  "burger.sign": "餐车招牌",
  "burger.menu": "三面翻菜单",
  "burger.wheel-front": "前轮",
  "burger.wheel-rear": "后轮",
  "burger.mode": "玩法标签",
  "burger.service-control": "开门营业按钮",
  "global.hud": "顶部玩家状态",
  "global.title": "店铺标题",
  "global.carousel": "餐厅轮播轨道",
  "global.arrow-left": "向左切换按钮",
  "global.arrow-right": "向右切换按钮",
  "global.bottom-nav": "底部导航栏",
  "global.health-note": "健康游戏提示",
  "sushi.card": "寿司店卡片",
  "sushi.scene": "寿司店场景",
  "sheet.daily": "签到弹窗",
  "sheet.cookbook": "图鉴弹窗",
  "sheet.settings": "设置弹窗",
};

function loadTheatreState() {
  try {
    const raw = window.localStorage.getItem(THEATRE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") resolve();
      else existing.addEventListener("load", resolve, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    script.addEventListener("error", reject, { once: true });
    document.head.append(script);
  });
}

function elementId(element) {
  return element?.dataset.layoutRuntimeId || element?.dataset.layoutId || "";
}

function selectorFor(id) {
  const escaped = escapeSelector(id);
  return `[data-layout-id="${escaped}"],[data-layout-runtime-id="${escaped}"]`;
}

function ownedDescendants(root) {
  return [...root.querySelectorAll("*")].filter(
    (element) =>
      !element.closest(".layout-editor-ui") &&
      element.closest("[data-layout-id]") === root,
  );
}

function decorateRuntimeElements() {
  for (const root of document.querySelectorAll("[data-layout-id]")) {
    if (root.closest(".layout-editor-ui")) continue;
    const rootId = root.dataset.layoutId;
    ownedDescendants(root).forEach((element, index) => {
      if (element.hasAttribute("data-layout-id")) return;
      const tag = element.tagName.toLowerCase();
      element.dataset.layoutRuntimeId = `${rootId}::${tag}-${index + 1}`;
    });
  }
}

function allLayoutIds() {
  const domIds = [...document.querySelectorAll(editableSelector)]
    .filter((element) => !element.closest(".layout-editor-ui"))
    .map(elementId)
    .filter(Boolean);
  return [...new Set([...domIds, ...Object.keys(workingDocument.elements)])]
    .sort((a, b) => a.localeCompare(b));
}

function layoutValue(id) {
  return workingDocument.elements[id] || DEFAULT_LAYOUT_VALUE;
}

function applyValue(element, value) {
  element.style.setProperty("--layout-x", `${value.x}px`);
  element.style.setProperty("--layout-y", `${value.y}px`);
  element.style.setProperty("--layout-scale", `${value.scale}`);
  element.style.setProperty("--layout-rotate", `${value.rotate}deg`);
  element.style.setProperty("--layout-opacity", `${value.opacity}`);
  const hasPerspective =
    value.perspective > 0 || value.rotateX !== 0 || value.rotateY !== 0;
  const perspectiveTransform = [
    value.perspective > 0 ? `perspective(${value.perspective}px)` : "",
    value.rotateX !== 0 ? `rotateX(${value.rotateX}deg)` : "",
    value.rotateY !== 0 ? `rotateY(${value.rotateY}deg)` : "",
  ]
    .filter(Boolean)
    .join(" ");
  element.style.setProperty(
    "--layout-transform-3d",
    perspectiveTransform || "translateZ(0)",
  );
  // Do not write to the element's inline `transform`: the homepage carousel,
  // truck camera and other components own that property for runtime motion.
  // A class applies the optional editor perspective without clearing motion
  // when perspective is disabled.
  element.classList.toggle("layout-editor-has-perspective", hasPerspective);
  element.style.transformOrigin =
    hasPerspective || value.originX !== 50 || value.originY !== 50
      ? `${value.originX}% ${value.originY}%`
      : "";
  element.style.transformStyle = hasPerspective ? "preserve-3d" : "";
  element.style.zIndex = value.z ? String(value.z) : "";
  element.style.visibility = value.visible ? "" : "hidden";
  element.style.width = value.width > 0 ? `${value.width}px` : "";
  element.style.height = value.height > 0 ? `${value.height}px` : "";
  element.style.filter =
    value.brightness !== 1 || value.saturate !== 1 || value.blur !== 0
      ? `brightness(${value.brightness}) saturate(${value.saturate}) blur(${value.blur}px)`
      : "";
  element.style.borderRadius = value.radius >= 0 ? `${value.radius}px` : "";
  element.style.background = value.background || "";
  element.style.color = value.color || "";
}

function applyTruckTimeline() {
  const timeline = workingDocument.truckTimeline;
  const root = document.documentElement;
  root.style.setProperty("--truck-camera-start-x", `${timeline.cameraStartX}%`);
  root.style.setProperty("--truck-camera-start-y", `${timeline.cameraStartY}%`);
  root.style.setProperty("--truck-camera-start-scale", timeline.cameraStartScale);
  root.style.setProperty("--truck-camera-end-x", `${timeline.cameraEndX}%`);
  root.style.setProperty("--truck-camera-end-y", `${timeline.cameraEndY}%`);
  root.style.setProperty("--truck-camera-end-scale", timeline.cameraEndScale);
  root.style.setProperty("--truck-camera-duration", `${timeline.cameraDuration}ms`);
  root.style.setProperty("--truck-body-duration", `${timeline.bodyDuration}ms`);
  root.style.setProperty("--truck-wheel-duration", `${timeline.wheelDuration}ms`);
  root.style.setProperty("--truck-wheel-turns", `${-timeline.wheelTurns}deg`);
  root.style.setProperty("--truck-shutter-delay", `${timeline.shutterDelay}ms`);
  root.style.setProperty("--truck-shutter-duration", `${timeline.shutterDuration}ms`);
  root.style.setProperty("--truck-sign-delay", `${timeline.signDelay}ms`);
  root.style.setProperty("--truck-sign-duration", `${timeline.signDuration}ms`);
  root.style.setProperty("--truck-menu-duration", `${timeline.menuDuration}ms`);
  root.style.setProperty("--truck-menu-delay-two", `${timeline.menuStagger}ms`);
  root.style.setProperty("--truck-menu-delay-three", `${timeline.menuStagger * 2}ms`);
}

function applyDocument() {
  decorateRuntimeElements();
  for (const id of allLayoutIds()) {
    const value = layoutValue(id);
    document
      .querySelectorAll(selectorFor(id))
      .forEach((element) => applyValue(element, value));
  }
  applyTruckTimeline();
  scheduleOverlay();
  syncInspector();
  syncTimeline();
}

function theatreNumber(value, min, max, step = 1) {
  return theatreCore.types.number(value, { range: [min, max], nudgeMultiplier: step });
}

function ensureTheatreObject(id) {
  if (!theatreSheet || !id) return null;
  if (theatreObjects.has(id)) return theatreObjects.get(id);
  const value = layoutValue(id);
  const object = theatreSheet.object(
    id,
    {
      layout: {
        x: theatreNumber(value.x, -4000, 4000),
        y: theatreNumber(value.y, -4000, 4000),
        width: theatreNumber(value.width, 0, 4000),
        height: theatreNumber(value.height, 0, 4000),
        scale: theatreNumber(value.scale, 0.05, 8, 0.01),
        rotate: theatreNumber(value.rotate, -1080, 1080),
        perspective: theatreNumber(value.perspective, 0, 4000),
        rotateX: theatreNumber(value.rotateX, -180, 180),
        rotateY: theatreNumber(value.rotateY, -180, 180),
        originX: theatreNumber(value.originX, 0, 100),
        originY: theatreNumber(value.originY, 0, 100),
        z: theatreNumber(value.z, -999, 999),
        opacity: theatreNumber(value.opacity, 0, 1, 0.05),
        visible: value.visible,
        locked: value.locked,
      },
      style: {
        brightness: theatreNumber(value.brightness, 0, 4, 0.05),
        saturate: theatreNumber(value.saturate, 0, 4, 0.05),
        blur: theatreNumber(value.blur, 0, 40, 0.5),
        radius: theatreNumber(value.radius, -1, 999),
        background: value.background,
        color: value.color,
      },
    },
    { reconfigure: true },
  );

  object.onValuesChange(({ layout, style }) => {
    workingDocument = updateLayoutElement(workingDocument, id, {
      ...layout,
      ...style,
    });
    const next = layoutValue(id);
    document
      .querySelectorAll(selectorFor(id))
      .forEach((element) => applyValue(element, next));
    syncInspector();
    scheduleOverlay();
    if (selectedId === id) devMoveable?.updateRect();
  });
  theatreObjects.set(id, object);
  return object;
}

function ensureTruckTimelineObject() {
  if (!theatreSheet || truckTimelineObject) return truckTimelineObject;
  const value = workingDocument.truckTimeline;
  truckTimelineObject = theatreSheet.object(
    "餐车原生进场参数",
    {
      cameraStartX: theatreNumber(value.cameraStartX, -500, 500),
      cameraStartY: theatreNumber(value.cameraStartY, -500, 500),
      cameraStartScale: theatreNumber(value.cameraStartScale, 0.05, 8, 0.05),
      cameraEndX: theatreNumber(value.cameraEndX, -500, 500),
      cameraEndY: theatreNumber(value.cameraEndY, -500, 500),
      cameraEndScale: theatreNumber(value.cameraEndScale, 0.05, 8, 0.05),
      cameraDuration: theatreNumber(value.cameraDuration, 200, 30000, 50),
      bodyDuration: theatreNumber(value.bodyDuration, 100, 30000, 50),
      wheelDuration: theatreNumber(value.wheelDuration, 100, 30000, 50),
      wheelTurns: theatreNumber(value.wheelTurns, 0, 10000, 10),
      shutterDelay: theatreNumber(value.shutterDelay, 0, 30000, 50),
      shutterDuration: theatreNumber(value.shutterDuration, 100, 30000, 50),
      signDelay: theatreNumber(value.signDelay, 0, 30000, 50),
      signDuration: theatreNumber(value.signDuration, 100, 30000, 50),
      menuDuration: theatreNumber(value.menuDuration, 300, 30000, 100),
      menuStagger: theatreNumber(value.menuStagger, 0, 5000, 10),
    },
    { reconfigure: true },
  );
  truckTimelineObject.onValuesChange((next) => {
    workingDocument = updateTruckTimeline(workingDocument, next);
    applyTruckTimeline();
    syncInspector();
    syncTimeline();
  });
  return truckTimelineObject;
}

function setTheatrePatch(id, scope, patch) {
  const object = ensureTheatreObject(id);
  if (!object || !theatreStudio) return false;
  theatreStudio.transaction(({ set }) => {
    Object.entries(patch).forEach(([key, value]) => {
      set(object.props[scope][key], value);
    });
  });
  return true;
}

function captureTheatrePatch(id, scope, patch) {
  const object = ensureTheatreObject(id);
  if (!object || !theatreStudio) return false;
  if (!moveableScrub) moveableScrub = theatreStudio.scrub();
  moveableScrub.capture(({ set }) => {
    Object.entries(patch).forEach(([key, value]) => {
      set(object.props[scope][key], value);
    });
  });
  return true;
}

function selectInDeveloperTools(id) {
  if (devMoveable) {
    const target = id && !isWheelLayer(id) ? preferredElement(id) : null;
    devMoveable.target = target;
    devMoveable.snappable = alignmentSettings.snapping;
    devMoveable.snapThreshold = alignmentSettings.threshold;
    devMoveable.snapGridWidth = alignmentSettings.gridSize;
    devMoveable.snapGridHeight = alignmentSettings.gridSize;
    devMoveable.elementGuidelines = alignmentReference(target)
      ? [alignmentReference(target)]
      : [];
    window.requestAnimationFrame(() => devMoveable?.updateRect());
  }
  if (theatreStudio && id) {
    const object = ensureTheatreObject(id);
    if (object) theatreStudio.setSelection([object]);
  }
}

function setupMoveable() {
  if (!window.Moveable || devMoveable) return;
  devMoveable = new window.Moveable(document.body, {
    target: selectedId ? preferredElement(selectedId) : null,
    draggable: true,
    resizable: true,
    rotatable: true,
    snappable: true,
    snapThreshold: 5,
    snapGap: true,
    snapCenter: true,
    snapDirections: {
      left: true,
      top: true,
      right: true,
      bottom: true,
      center: true,
      middle: true,
    },
    elementSnapDirections: {
      left: true,
      top: true,
      right: true,
      bottom: true,
      center: true,
      middle: true,
    },
    elementGuidelines: [
      ...document.querySelectorAll(
        ".lobby-shell,.lobby-stage,.home-map-viewport,.diner-scene",
      ),
    ],
    origin: false,
    throttleDrag: 1,
    throttleResize: 1,
    throttleRotate: 1,
  });

  const begin = () => {
    if (!selectedId || layoutValue(selectedId).locked) return false;
    moveableStartValue = layoutValue(selectedId);
    const context = selectedAlignmentContext();
    moveableStartRect = context.elementRect;
    moveableReferenceRect = context.referenceRect;
    moveableScrub?.discard();
    moveableScrub = theatreStudio?.scrub() || null;
    return true;
  };
  const finish = () => {
    moveableScrub?.commit();
    moveableScrub = null;
    moveableStartValue = null;
    moveableStartRect = null;
    moveableReferenceRect = null;
    clearSnapFeedback();
    commitDocument(workingDocument);
  };

  devMoveable
    .on("dragStart", ({ stop }) => {
      if (!begin()) stop();
    })
    .on("drag", ({ dist }) => {
      if (!moveableStartValue) return;
      const patch = snappedDragPatch(
        preferredElement(selectedId),
        moveableStartValue,
        moveableStartRect,
        moveableReferenceRect,
        dist[0],
        dist[1],
      );
      if (!captureTheatrePatch(selectedId, "layout", patch)) {
        updateSelectedPreview(patch);
      }
    })
    .on("dragEnd", finish)
    .on("resizeStart", ({ stop }) => {
      if (!begin()) stop();
    })
    .on("resize", ({ width, height }) => {
      const patch = {
        width: round(width),
        height: round(height),
      };
      if (!captureTheatrePatch(selectedId, "layout", patch)) {
        updateSelectedPreview(patch);
      }
    })
    .on("resizeEnd", finish)
    .on("rotateStart", ({ stop }) => {
      if (!begin()) stop();
    })
    .on("rotate", ({ beforeRotate }) => {
      const patch = { rotate: round(beforeRotate) };
      if (!captureTheatrePatch(selectedId, "layout", patch)) {
        updateSelectedPreview(patch);
      }
    })
    .on("rotateEnd", finish);
}

async function setupDeveloperTools() {
  window.process ??= { env: {} };
  window.process.env ??= {};
  window.process.env.BUILT_FOR_PLAYGROUND = "true";
  await Promise.all([
    loadScript("./vendor/theatre/core-and-studio.js?v=0.7.2"),
    loadScript("./vendor/moveable/moveable.min.js?v=0.53.0"),
  ]);
  theatreCore = window.Theatre?.core;
  theatreStudio = window.Theatre?.studio;
  if (!theatreCore || !theatreStudio) {
    throw new Error("UI developer tools failed to load");
  }
  theatreStudio.initialize();
  const savedState = loadTheatreState();
  theatreProject = savedState
    ? theatreCore.getProject(THEATRE_PROJECT_ID, { state: savedState })
    : theatreCore.getProject(THEATRE_PROJECT_ID);
  theatreSheet = theatreProject.sheet("UI 与动画");
  await theatreProject.ready;
  ensureTruckTimelineObject();
  document.documentElement.classList.add(
    "layout-editor-devtools",
    "layout-editor-moveable",
  );
  setStudioVisibility(false);
  setupMoveable();
  selectInDeveloperTools(selectedId);
  showToast("Moveable 与 Theatre.js Studio 已接管编辑");
}

async function setupRuntimeTheatre() {
  const savedState = loadTheatreState();
  if (!savedState) return;
  await loadScript("./vendor/theatre/core-only.min.js?v=0.7.2");
  theatreCore = window.Theatre?.core;
  if (!theatreCore) return;
  theatreProject = theatreCore.getProject(THEATRE_PROJECT_ID, {
    state: savedState,
  });
  theatreSheet = theatreProject.sheet("UI 与动画");
  await theatreProject.ready;
  allLayoutIds().forEach(ensureTheatreObject);
  theatreSheet.sequence.play({ iterationCount: 1 }).catch(() => {});
}

function commitDocument(nextDocument = workingDocument) {
  workingDocument = history.commit(nextDocument);
  applyDocument();
  syncToolbar();
  renderLayerList();
}

function saveDocument() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workingDocument));
    if (theatreStudio && theatreProject) {
      const theatreState =
        theatreStudio.createContentOfSaveFile(THEATRE_PROJECT_ID);
      window.localStorage.setItem(
        THEATRE_STORAGE_KEY,
        JSON.stringify(theatreState),
      );
    }
    showToast("布局与 Theatre 时间轴已保存到本机");
  } catch {
    showToast("保存失败，请检查浏览器存储权限");
  }
}

function showToast(message, duration = 1800) {
  if (!editorEnabled) return;
  let toast = document.querySelector(".layout-editor-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "layout-editor-toast layout-editor-ui";
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(
    () => toast.classList.remove("is-visible"),
    duration,
  );
}

function preferredElement(id) {
  const matches = [...document.querySelectorAll(selectorFor(id))].filter(
    (element) =>
      element.getClientRects().length &&
      getComputedStyle(element).visibility !== "hidden",
  );
  return (
    matches.find((element) => element.closest('[data-card-offset="0"]')) ||
    matches[0] ||
    null
  );
}

function elementLabel(id) {
  const element =
    preferredElement(id) || document.querySelector(selectorFor(id));
  if (!element) return "暂未出现在页面";
  const text = (element.getAttribute("aria-label") || element.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
  const classes = [...element.classList].slice(0, 2).join(".");
  return `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ""}${
    text ? ` · ${text}` : ""
  }`;
}

function baseLayoutId(id) {
  return String(id).split("::")[0];
}

function layerCategory(id) {
  const baseId = baseLayoutId(id);
  return (
    LAYER_CATEGORY_DEFINITIONS.find((definition) =>
      definition.matches(baseId),
    ) || LAYER_CATEGORY_DEFINITIONS.at(-1)
  );
}

function isTruckEditorId(id) {
  return TRUCK_EDITOR_BASE_IDS.has(baseLayoutId(id));
}

function truckEditorRootId(id) {
  const baseId = baseLayoutId(id);
  return TRUCK_EDITOR_BASE_IDS.has(baseId) ? baseId : "";
}

function isWheelLayer(id) {
  return Boolean(id && layerCategory(id).key === "burger-wheel");
}

function numericZIndex(element) {
  if (!element) return 0;
  const value = Number.parseInt(window.getComputedStyle(element).zIndex, 10);
  return Number.isFinite(value) ? value : 0;
}

function nativeLayerValue(element) {
  if (!element?.style.zIndex) return numericZIndex(element);
  const inlineValue = element.style.zIndex;
  element.style.zIndex = "";
  const nativeValue = numericZIndex(element);
  element.style.zIndex = inlineValue;
  return nativeValue;
}

function effectiveLayerValue(id, element = preferredElement(id)) {
  if (!id || !element) return 0;
  const explicit = layoutValue(id).z;
  return explicit === 0 ? nativeLayerValue(element) : explicit;
}

function selectedLayerContext() {
  const element = selectedId ? preferredElement(selectedId) : null;
  if (!element) {
    return {
      element: null,
      path: "请选择餐车零件",
      current: 0,
      original: 0,
      explicit: false,
      min: 0,
      max: 0,
    };
  }
  const value = layoutValue(selectedId);
  const category = layerCategory(selectedId);
  const displayName = layerDisplayName(selectedId, elementLabel(selectedId));
  const peers = [...(element.parentElement?.children || [])].filter(
    (peer) =>
      peer instanceof HTMLElement &&
      peer.getClientRects().length &&
      window.getComputedStyle(peer).position !== "static",
  );
  const peerLayers = peers.map((peer) => {
    const peerId = elementId(peer);
    return peerId
      ? effectiveLayerValue(peerId, peer)
      : numericZIndex(peer);
  });
  const current = effectiveLayerValue(selectedId, element);
  return {
    element,
    path: `${category.label} › ${displayName}`,
    current,
    original: nativeLayerValue(element),
    explicit: value.z !== 0,
    min: peerLayers.length ? Math.min(...peerLayers) : current,
    max: peerLayers.length ? Math.max(...peerLayers) : current,
  };
}

function wheelAlignmentInfo() {
  if (!isWheelLayer(selectedId)) return null;
  const selected = preferredElement(selectedId);
  const partnerId =
    baseLayoutId(selectedId) === "burger.wheel-front"
      ? "burger.wheel-rear"
      : "burger.wheel-front";
  const partner = preferredElement(partnerId);
  if (!selected || !partner) return null;
  const selectedRect = selected.getBoundingClientRect();
  const partnerRect = partner.getBoundingClientRect();
  const delta =
    selectedRect.top +
    selectedRect.height / 2 -
    (partnerRect.top + partnerRect.height / 2);
  return {
    selected,
    partner,
    partnerId,
    delta,
    aligned: Math.abs(delta) <= 0.5,
  };
}

function plainRect(rect) {
  if (!rect) return null;
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function layoutToViewportMatrix(element) {
  let matrix = new DOMMatrix();
  let ancestor = element?.parentElement;
  while (ancestor) {
    const transform = window.getComputedStyle(ancestor).transform;
    if (transform && transform !== "none") {
      try {
        matrix = new DOMMatrix(transform).multiply(matrix);
      } catch {
        // Ignore a browser-specific transform string and keep the usable axes.
      }
    }
    ancestor = ancestor.parentElement;
  }
  return matrix;
}

function layoutDeltaToViewport(element, deltaX, deltaY) {
  const matrix = layoutToViewportMatrix(element);
  return {
    x: matrix.a * deltaX + matrix.c * deltaY,
    y: matrix.b * deltaX + matrix.d * deltaY,
  };
}

function viewportDeltaToLayout(element, deltaX, deltaY) {
  const matrix = layoutToViewportMatrix(element);
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (Math.abs(determinant) < 0.000001) {
    return { x: deltaX, y: deltaY };
  }
  return {
    x: (matrix.d * deltaX - matrix.c * deltaY) / determinant,
    y: (-matrix.b * deltaX + matrix.a * deltaY) / determinant,
  };
}

function alignmentReference(element) {
  if (!element) return null;
  const service = element.closest(".silver-truck__service");
  if (service && service !== element) return service;
  const truck = element.closest(".silver-truck");
  if (truck && truck !== element) return truck;
  const scene = element.closest(".diner-scene");
  if (scene && scene !== element) return scene;
  const slide = element.closest(
    '.home-map-slide[data-card-offset="0"]',
  );
  if (slide && slide !== element) return slide;
  const stage = element.closest(".lobby-stage");
  if (stage && stage !== element) return stage;
  const shell = element.closest(".lobby-shell");
  if (shell && shell !== element) return shell;
  return document.querySelector(".lobby-shell") || document.documentElement;
}

function alignmentReferenceLabel(reference) {
  if (!reference) return "未找到对齐范围";
  if (reference.matches(".silver-truck__service")) return "出餐区边界";
  if (reference.matches(".silver-truck")) return "完整餐车边界";
  if (reference.matches(".diner-scene")) return "餐厅场景边界";
  if (reference.matches(".home-map-slide")) return "当前餐厅卡片";
  if (reference.matches(".lobby-stage")) return "主页舞台";
  if (reference.matches(".lobby-shell")) return "整页画布";
  return "父级容器";
}

function selectedAlignmentContext() {
  const element = selectedId ? preferredElement(selectedId) : null;
  const reference = alignmentReference(element);
  return {
    element,
    reference,
    elementRect: plainRect(element?.getBoundingClientRect()),
    referenceRect: plainRect(reference?.getBoundingClientRect()),
  };
}

function guideLinePosition(line, axis, position, start, length) {
  if (!line) return;
  if (axis === "x") {
    line.style.left = `${position}px`;
    line.style.top = `${start}px`;
    line.style.height = `${length}px`;
  } else {
    line.style.left = `${start}px`;
    line.style.top = `${position}px`;
    line.style.width = `${length}px`;
  }
}

function updateGuides() {
  const guides = document.querySelector(".layout-editor-guides");
  const dock = document.querySelector(".layout-editor-align-dock");
  if (!guides) return;
  const { reference, referenceRect } = selectedAlignmentContext();
  const visible = Boolean(selectedId && referenceRect?.width && referenceRect?.height);
  guides.hidden = !visible;
  dock?.classList.toggle("has-no-selection", !visible);
  if (!visible) return;

  const inset = alignmentSettings.inset;
  const grid = guides.querySelector(".layout-editor-grid-surface");
  grid.hidden = !alignmentSettings.showGrid;
  grid.style.left = `${referenceRect.left}px`;
  grid.style.top = `${referenceRect.top}px`;
  grid.style.width = `${referenceRect.width}px`;
  grid.style.height = `${referenceRect.height}px`;
  grid.style.setProperty(
    "--layout-guide-grid-size",
    `${alignmentSettings.gridSize}px`,
  );

  const boundary = guides.querySelector(".layout-editor-guide-boundary");
  boundary.style.left = `${referenceRect.left}px`;
  boundary.style.top = `${referenceRect.top}px`;
  boundary.style.width = `${referenceRect.width}px`;
  boundary.style.height = `${referenceRect.height}px`;

  const positions = {
    left: referenceRect.left + inset,
    center: referenceRect.left + referenceRect.width / 2,
    right: referenceRect.right - inset,
    top: referenceRect.top + inset,
    middle: referenceRect.top + referenceRect.height / 2,
    bottom: referenceRect.bottom - inset,
  };
  guideLinePosition(
    guides.querySelector('[data-guide="left"]'),
    "x",
    positions.left,
    referenceRect.top,
    referenceRect.height,
  );
  guideLinePosition(
    guides.querySelector('[data-guide="center"]'),
    "x",
    positions.center,
    referenceRect.top,
    referenceRect.height,
  );
  guideLinePosition(
    guides.querySelector('[data-guide="right"]'),
    "x",
    positions.right,
    referenceRect.top,
    referenceRect.height,
  );
  guideLinePosition(
    guides.querySelector('[data-guide="top"]'),
    "y",
    positions.top,
    referenceRect.left,
    referenceRect.width,
  );
  guideLinePosition(
    guides.querySelector('[data-guide="middle"]'),
    "y",
    positions.middle,
    referenceRect.left,
    referenceRect.width,
  );
  guideLinePosition(
    guides.querySelector('[data-guide="bottom"]'),
    "y",
    positions.bottom,
    referenceRect.left,
    referenceRect.width,
  );

  const referenceOutput = dock?.querySelector("[data-align-reference]");
  if (referenceOutput) {
    referenceOutput.textContent = `${alignmentReferenceLabel(reference)} · ${Math.round(
      referenceRect.width,
    )}×${Math.round(referenceRect.height)}`;
  }
}

function showSnapFeedback(snapX = "", snapY = "") {
  const guides = document.querySelector(".layout-editor-guides");
  if (!guides) return;
  guides.querySelectorAll("[data-guide]").forEach((line) => {
    line.classList.toggle(
      "is-active",
      line.dataset.guide === snapX || line.dataset.guide === snapY,
    );
  });
  const status = document.querySelector("[data-align-status]");
  if (status) {
    const labels = {
      left: "左边缘",
      center: "水平中心",
      right: "右边缘",
      top: "上边缘",
      middle: "垂直中心",
      bottom: "下边缘",
      grid: "网格",
    };
    status.textContent =
      [labels[snapX], labels[snapY]].filter(Boolean).join(" + ") ||
      "拖动时会自动吸附";
  }
}

function clearSnapFeedback() {
  showSnapFeedback("", "");
}

function saveAlignmentSettings() {
  window.localStorage.setItem(
    ALIGNMENT_STORAGE_KEY,
    JSON.stringify(alignmentSettings),
  );
}

function applySelectedLayoutPatch(patch, message = "") {
  if (!selectedId || !Object.keys(patch).length) return;
  const normalizedPatch = Object.fromEntries(
    Object.entries(patch).map(([key, value]) => [
      key,
      typeof value === "number" ? round(value) : value,
    ]),
  );
  const nextDocument = updateLayoutElement(
    workingDocument,
    selectedId,
    normalizedPatch,
  );
  workingDocument = nextDocument;
  setTheatrePatch(selectedId, "layout", normalizedPatch);
  commitDocument(nextDocument);
  scheduleOverlay();
  if (message) showToast(message);
}

function alignSelected(mode) {
  const { element, elementRect, referenceRect } = selectedAlignmentContext();
  if (!elementRect || !referenceRect) {
    showToast("当前元素没有可用的对齐范围");
    return;
  }
  const value = layoutValue(selectedId);
  const viewportPatch = alignmentPatch({
    mode,
    value,
    elementRect,
    referenceRect,
    inset: alignmentSettings.inset,
  });
  const layoutDelta = viewportDeltaToLayout(
    element,
    viewportPatch.x === undefined ? 0 : viewportPatch.x - value.x,
    viewportPatch.y === undefined ? 0 : viewportPatch.y - value.y,
  );
  const patch = {};
  if (viewportPatch.x !== undefined) patch.x = value.x + layoutDelta.x;
  if (viewportPatch.y !== undefined) patch.y = value.y + layoutDelta.y;
  const names = {
    left: "左边缘",
    hcenter: "水平居中",
    right: "右边缘",
    top: "上边缘",
    vcenter: "垂直居中",
    bottom: "下边缘",
  };
  applySelectedLayoutPatch(patch, `已${names[mode]}对齐`);
  showSnapFeedback(
    mode === "hcenter" ? "center" : ["left", "right"].includes(mode) ? mode : "",
    mode === "vcenter" ? "middle" : ["top", "bottom"].includes(mode) ? mode : "",
  );
}

function changeSelectedLayer(action) {
  if (!selectedId || layoutValue(selectedId).locked) return;
  const context = selectedLayerContext();
  if (!context.element) return;
  let next = context.current;
  if (action === "forward") next = context.current + 1;
  else if (action === "backward") next = context.current - 1;
  else if (action === "front") next = context.max + 1;
  else if (action === "back") next = context.min - 1;
  else if (action === "original") next = 0;
  applySelectedLayoutPatch(
    { z: next },
    action === "original"
      ? "已恢复零件原始图层"
      : `当前显示层：${next}`,
  );
  syncAlignmentDock();
}

function alignSelectedWheelHeight() {
  const info = wheelAlignmentInfo();
  if (!info) {
    showToast("请选择前轮或后轮");
    return;
  }
  const value = layoutValue(selectedId);
  const correction = viewportDeltaToLayout(
    info.selected,
    0,
    -info.delta,
  );
  applySelectedLayoutPatch(
    { y: value.y + correction.y },
    "两只车轮的轮心已经同高",
  );
  showSnapFeedback("", "middle");
}

function nudgeSelected(deltaX, deltaY) {
  if (!selectedId || layoutValue(selectedId).locked) return;
  const value = layoutValue(selectedId);
  applySelectedLayoutPatch({
    x: value.x + deltaX,
    y: value.y + deltaY,
  });
}

function selectedNudgeStep() {
  const input = document.querySelector("[data-nudge-step]");
  const value = Number(input?.value);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function nudgeSelectedDirection(direction, { boost = false } = {}) {
  const vectors = {
    left: [-1, 0],
    right: [1, 0],
    up: [0, -1],
    down: [0, 1],
  };
  const vector = vectors[direction];
  if (!vector) return;
  const step = selectedNudgeStep() * (boost ? 10 : 1);
  nudgeSelected(vector[0] * step, vector[1] * step);
}

function snappedDragPatch(
  element,
  startValue,
  startRect,
  referenceRect,
  deltaX,
  deltaY,
  deltaSpace = "layout",
) {
  const layoutDelta =
    deltaSpace === "viewport"
      ? viewportDeltaToLayout(element, deltaX, deltaY)
      : { x: deltaX, y: deltaY };
  if (!startRect) {
    return {
      x: round(startValue.x + layoutDelta.x),
      y: round(startValue.y + layoutDelta.y),
    };
  }
  const viewportDelta = layoutDeltaToViewport(
    element,
    layoutDelta.x,
    layoutDelta.y,
  );
  const next = snapDragLayout({
    startValue: { x: 0, y: 0 },
    startRect,
    referenceRect,
    deltaX: viewportDelta.x,
    deltaY: viewportDelta.y,
    settings: alignmentSettings,
  });
  const correction = viewportDeltaToLayout(
    element,
    next.x - viewportDelta.x,
    next.y - viewportDelta.y,
  );
  showSnapFeedback(next.snapX, next.snapY);
  return {
    x: round(startValue.x + layoutDelta.x + correction.x),
    y: round(startValue.y + layoutDelta.y + correction.y),
  };
}

function layerDisplayName(id, label = "") {
  const baseId = baseLayoutId(id);
  const rootName = LAYER_DISPLAY_NAMES[baseId] || baseId;
  if (!String(id).includes("::")) return rootName;
  const lowered = label.toLowerCase();
  let part = "内层元素";
  if (lowered.includes("burger-menu-panel--one")) part = "菜单灯箱 1";
  else if (lowered.includes("burger-menu-panel--two")) part = "菜单灯箱 2";
  else if (lowered.includes("burger-menu-panel--three")) part = "菜单灯箱 3";
  else if (lowered.includes("burger-menu-panel__rotor")) part = "菜单翻转层";
  else if (lowered.includes("burger-menu-panel__face")) part = "菜单画面";
  else if (lowered.includes("silver-truck")) part = "餐车主体层";
  else if (lowered.startsWith("img")) part = "图片";
  else if (lowered.startsWith("button")) part = "按钮";
  else if (lowered.startsWith("strong")) part = "主文字";
  else if (lowered.startsWith("small")) part = "说明文字";
  else if (lowered.startsWith("span")) part = "文字容器";
  else if (lowered.startsWith("nav")) part = "导航容器";
  else if (lowered.startsWith("article")) part = "卡片容器";
  else if (lowered.startsWith("div")) part = "布局容器";
  return `${rootName} / ${part}`;
}

function escapeMarkup(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function openSelectedLayerGroup(id, scroll = false) {
  if (!id) return;
  const category = layerCategory(id);
  openLayerGroups.add(category.key);
  const details = document.querySelector(
    `[data-layer-group="${escapeSelector(category.key)}"]`,
  );
  if (details) details.open = true;
  if (scroll) {
    document
      .querySelector(
        `.layout-editor-layer[data-id="${escapeSelector(id)}"]`,
      )
      ?.scrollIntoView({ block: "nearest" });
  }
}

function scheduleOverlay() {
  if (!editorEnabled || overlayFrame) return;
  overlayFrame = window.requestAnimationFrame(() => {
    overlayFrame = 0;
    updateOverlay();
    updateGuides();
  });
}

function updateOverlay() {
  const overlay = document.querySelector(".layout-editor-selection");
  if (!overlay) return;
  const element = selectedId ? preferredElement(selectedId) : null;
  if (!element || !layoutValue(selectedId).visible) {
    overlay.hidden = true;
    return;
  }
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    overlay.hidden = true;
    return;
  }
  overlay.hidden = false;
  overlay.style.left = `${rect.left}px`;
  overlay.style.top = `${rect.top}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
  const displayName = layerDisplayName(selectedId, elementLabel(selectedId));
  const layer = effectiveLayerValue(selectedId, element);
  overlay.querySelector(".layout-editor-selection__label").textContent =
    `${displayName} · 层 ${layer}`;
}

function setSelected(id) {
  selectedId = id || "";
  const wheelMode = isWheelLayer(selectedId);
  document.documentElement.classList.toggle(
    "layout-editor-wheel-mode",
    Boolean(wheelMode),
  );
  if (wheelMode) {
    setTruckOverview(true);
  }
  document
    .querySelectorAll(".layout-editor-selected-target")
    .forEach((element) =>
      element.classList.remove("layout-editor-selected-target"),
    );
  if (selectedId) {
    document
      .querySelectorAll(selectorFor(selectedId))
      .forEach((element) =>
        element.classList.add("layout-editor-selected-target"),
      );
  }
  openSelectedLayerGroup(selectedId);
  document
    .querySelectorAll(".layout-editor-layer.is-selected")
    .forEach((button) => button.classList.remove("is-selected"));
  if (selectedId) {
    document
      .querySelector(`.layout-editor-layer[data-id="${escapeSelector(selectedId)}"]`)
      ?.classList.add("is-selected");
    openSelectedLayerGroup(selectedId, true);
  }
  syncInspector();
  scheduleOverlay();
  selectInDeveloperTools(selectedId);
}

function fieldMarkup(field, label, options = {}) {
  const scope = options.scope || "layout";
  const type = options.type || "number";
  const attrs = [
    `type="${type}"`,
    `data-field="${field}"`,
    `data-scope="${scope}"`,
  ];
  if (options.step != null) attrs.push(`step="${options.step}"`);
  if (options.min != null) attrs.push(`min="${options.min}"`);
  if (options.max != null) attrs.push(`max="${options.max}"`);
  if (options.placeholder) attrs.push(`placeholder="${options.placeholder}"`);
  return `<label class="layout-editor-field"><span>${label}</span><input ${attrs.join(
    " ",
  )}></label>`;
}

function selectMarkup(field, label, options, scope = "motion") {
  return `<label class="layout-editor-field"><span>${label}</span><select data-field="${field}" data-scope="${scope}">${options
    .map(([value, text]) => `<option value="${value}">${text}</option>`)
    .join("")}</select></label>`;
}

function truckField(field, label, step = 10) {
  return fieldMarkup(field, label, { scope: "timeline", step });
}

function setEditorView(view) {
  activeEditorView = view;
  const sheetByView = {
    daily: document.querySelector("#daily-checkin"),
    cookbook: document.querySelector("#cookbook-sheet"),
    settings: document.querySelector("#settings-sheet"),
  };
  const backdrop = document.querySelector("#sheet-backdrop");
  for (const [name, sheet] of Object.entries(sheetByView)) {
    if (!sheet) continue;
    const open = name === view;
    sheet.hidden = !open;
    sheet.dataset.open = String(open);
    sheet.setAttribute("aria-hidden", String(!open));
  }
  if (backdrop) backdrop.hidden = view === "home";
  document.querySelectorAll("[data-editor-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.editorView === view);
  });
  scheduleOverlay();
}

function requestEditorMap(mapId) {
  window.dispatchEvent(
    new CustomEvent("burger:editor-select-map", {
      detail: { mapId },
    }),
  );
}

function activateBurgerMapForFocus() {
  if (!truckFocusEnabled) return;
  requestEditorMap("burger");
  scheduleOverlay();
  window.requestAnimationFrame(() => devMoveable?.updateRect());
}

function setStudioVisibility(visible, { announce = false } = {}) {
  if (!theatreStudio?.ui) return;
  studioVisible = Boolean(visible);
  if (studioVisible) theatreStudio.ui.restore();
  else theatreStudio.ui.hide();
  document.documentElement.classList.toggle(
    "layout-editor-studio-visible",
    studioVisible,
  );
  document
    .querySelectorAll('[data-action="toggle-studio"]')
    .forEach((button) => {
      button.classList.toggle("is-active", studioVisible);
      button.textContent = studioVisible ? "关闭高级动画面板" : "高级动画面板";
    });
  if (announce) {
    showToast(
      studioVisible
        ? "已打开高级动画面板"
        : "已关闭高级动画面板，继续专心调整餐车",
    );
  }
}

function setTruckFocus(enabled, { announce = false } = {}) {
  truckFocusEnabled = Boolean(enabled);
  document.documentElement.classList.toggle(
    "layout-editor-truck-focus",
    truckFocusEnabled,
  );
  document
    .querySelectorAll('[data-action="toggle-truck-focus"]')
    .forEach((button) => {
      button.classList.toggle("is-active", truckFocusEnabled);
      button.textContent = truckFocusEnabled ? "餐车专注 ✓" : "进入餐车专注";
    });
  if (truckFocusEnabled) {
    activateBurgerMapForFocus();
    [120, 480, 1200].forEach((delay) => {
      window.setTimeout(activateBurgerMapForFocus, delay);
    });
    setEditorView("home");
    setTruckOverview(true);
    const focusedId = truckEditorRootId(selectedId);
    setSelected(focusedId || "burger.truck");
  }
  renderLayerList();
  scheduleOverlay();
  window.requestAnimationFrame(() => devMoveable?.updateRect());
  if (announce) {
    showToast(
      truckFocusEnabled
        ? "已进入餐车专注：只显示餐车零件"
        : "已返回整页 UI 编辑",
    );
  }
}

function buildEditor() {
  document.documentElement.classList.add("layout-editor-active");

  const topbar = document.createElement("header");
  topbar.className = "layout-editor-topbar layout-editor-ui";
  topbar.innerHTML = `
    <div class="layout-editor-brand">
      <strong>汉堡小馆 · 餐车工作台</strong>
      <span>选零件 → 拖动或对齐 → 调整图层 → 下载文件</span>
    </div>
    <div class="layout-editor-view-switcher" aria-label="编辑页面状态">
      <button type="button" class="is-active" data-editor-view="home">主画面</button>
      <button type="button" data-editor-view="daily">签到弹窗</button>
      <button type="button" data-editor-view="cookbook">图鉴弹窗</button>
      <button type="button" data-editor-view="settings">设置弹窗</button>
    </div>
    <div class="layout-editor-topbar__actions">
      <button type="button" data-action="undo">撤销</button>
      <button type="button" data-action="redo">重做</button>
      <button type="button" data-action="play-theatre">播放时间轴</button>
      <button type="button" data-action="select-truck-timing">餐车时序参数</button>
      <button type="button" data-action="toggle-truck-focus" class="is-active">餐车专注 ✓</button>
      <button type="button" data-action="replay-truck">预览餐车动画</button>
      <button type="button" data-action="toggle-studio">高级动画面板</button>
      <button type="button" data-action="save">暂存到浏览器</button>
      <button type="button" data-action="export" class="layout-editor-primary">下载调整文件</button>
      <label class="layout-editor-import-label">导入调整文件<input type="file" accept="application/json,.json" data-action="import"></label>
      <button type="button" data-action="reset-all" class="layout-editor-danger">全部复位</button>
      <button type="button" data-action="done">退出编辑</button>
    </div>
  `;

  const layers = document.createElement("aside");
  layers.className = "layout-editor-layers layout-editor-ui";
  layers.innerHTML = `
    <div class="layout-editor-panel-title">
      <strong data-layer-panel-title>餐车图层</strong><span data-layer-count></span>
    </div>
    <div class="layout-editor-transfer-tip">
      <b>怎么用</b>
      <span>这里只列餐车零件。选中后会显示所属层级和对齐状态。</span>
      <span>拖动只改位置，不会自动改变前后图层。</span>
    </div>
    <label class="layout-editor-search">
      <span>搜索</span>
      <input type="search" placeholder="车轮、车身、窗口、招牌…" data-layer-search>
    </label>
    <div class="layout-editor-layer-groups" data-layer-groups></div>
  `;

  const alignmentDock = document.createElement("aside");
  alignmentDock.className = "layout-editor-align-dock layout-editor-ui";
  alignmentDock.innerHTML = `
    <div class="layout-editor-align-dock__heading">
      <span><strong>对齐与外观</strong><small data-align-reference>请选择元素</small></span>
      <output data-align-status>拖动时会自动吸附</output>
    </div>
    <div class="layout-editor-align-section layout-editor-layer-context">
      <b>当前零件与图层</b>
      <p data-layer-path>请选择餐车零件</p>
      <output data-layer-status>当前显示层：—</output>
      <div class="layout-editor-layer-order">
        <button type="button" data-layer-order="backward" title="向车身后面移动一层">下一层</button>
        <button type="button" data-layer-order="forward" title="向画面前面移动一层">上一层</button>
        <button type="button" data-layer-order="back" title="放到同级零件最后面">置底</button>
        <button type="button" data-layer-order="front" title="放到同级零件最前面">置顶</button>
        <button type="button" data-layer-order="original" class="layout-editor-layer-original">恢复原层</button>
      </div>
      <div class="layout-editor-wheel-check" data-wheel-check hidden>
        <output data-wheel-status>正在检查两只车轮</output>
        <button type="button" data-wheel-align>两轮轮心同高</button>
      </div>
    </div>
    <div class="layout-editor-align-section layout-editor-nudge-section">
      <div class="layout-editor-nudge-heading">
        <b>精细移动</b>
        <label>每次
          <select data-nudge-step aria-label="微调步长">
            <option value="0.1">0.1px</option>
            <option value="1" selected>1px</option>
            <option value="5">5px</option>
            <option value="10">10px</option>
          </select>
        </label>
      </div>
      <div class="layout-editor-nudge-grid" role="group" aria-label="所选零件精细移动">
        <button type="button" class="layout-editor-nudge-up" data-nudge="up" aria-label="向上微调" title="方向键上 / 小键盘 8"><span>↑</span><kbd>8</kbd></button>
        <button type="button" class="layout-editor-nudge-left" data-nudge="left" aria-label="向左微调" title="方向键左 / 小键盘 4"><span>←</span><kbd>4</kbd></button>
        <output data-nudge-position>X — · Y —</output>
        <button type="button" class="layout-editor-nudge-right" data-nudge="right" aria-label="向右微调" title="方向键右 / 小键盘 6"><span>→</span><kbd>6</kbd></button>
        <button type="button" class="layout-editor-nudge-down" data-nudge="down" aria-label="向下微调" title="方向键下 / 小键盘 2"><span>↓</span><kbd>2</kbd></button>
      </div>
      <small class="layout-editor-nudge-hint">方向键或小键盘 2 / 4 / 6 / 8；按住 Shift 为当前步长 ×10</small>
    </div>
    <div class="layout-editor-align-section">
      <b>对齐到当前容器</b>
      <div class="layout-editor-align-buttons">
        <button type="button" data-align="left" title="左边缘对齐">左边</button>
        <button type="button" data-align="hcenter" title="水平居中">水平中</button>
        <button type="button" data-align="right" title="右边缘对齐">右边</button>
        <button type="button" data-align="top" title="上边缘对齐">上边</button>
        <button type="button" data-align="vcenter" title="垂直居中">垂直中</button>
        <button type="button" data-align="bottom" title="下边缘对齐">下边</button>
      </div>
    </div>
    <div class="layout-editor-align-section">
      <b>吸附设置</b>
      <div class="layout-editor-guide-settings">
        <label><span>网格</span><select data-guide-setting="gridSize">
          ${[1, 4, 8, 12, 16, 24, 32]
            .map((size) => `<option value="${size}">${size}px</option>`)
            .join("")}
        </select></label>
        <label><span>边距</span><input type="number" min="0" max="200" step="1" data-guide-setting="inset"></label>
      </div>
      <div class="layout-editor-toggle-row layout-editor-guide-toggles">
        <label><input type="checkbox" data-guide-setting="snapping">自动吸附</label>
        <label><input type="checkbox" data-guide-setting="showGrid">显示网格</label>
      </div>
    </div>
    <div class="layout-editor-align-section">
      <b>快速外观</b>
      <label class="layout-editor-range-field">
        <span>不透明度 <output data-quick-output="opacity">100%</output></span>
        <input type="range" min="0" max="100" step="1" data-quick-field="opacity" data-unit="percent">
      </label>
      <div class="layout-editor-quick-fields">
        <label><span>透视 px</span><input type="number" min="0" max="4000" step="10" data-quick-field="perspective"></label>
        <label><span>层级</span><input type="number" min="-999" max="999" step="1" data-quick-field="z"></label>
        <label><span>横向透视</span><input type="number" min="-180" max="180" step="1" data-quick-field="rotateY"></label>
        <label><span>纵向透视</span><input type="number" min="-180" max="180" step="1" data-quick-field="rotateX"></label>
      </div>
    </div>
  `;

  const inspector = document.createElement("aside");
  inspector.className = "layout-editor-inspector layout-editor-ui";
  inspector.innerHTML = `
    <div class="layout-editor-inspector__heading">
      <strong data-selected-name>请选择页面元素</strong>
      <small data-selected-label>可直接点击中间画布</small>
    </div>
    <div class="layout-editor-tabs" role="tablist">
      <button type="button" class="is-active" data-tab="layout">布局</button>
      <button type="button" data-tab="style">样式</button>
      <button type="button" data-tab="motion">动画</button>
      <button type="button" data-tab="truck">餐车时间轴</button>
    </div>
    <section class="layout-editor-tab is-active" data-panel="layout">
      <div class="layout-editor-fields">
        ${fieldMarkup("x", "水平 X", { step: 1 })}
        ${fieldMarkup("y", "垂直 Y", { step: 1 })}
        ${fieldMarkup("width", "宽度（0=自动）", { step: 1, min: 0 })}
        ${fieldMarkup("height", "高度（0=自动）", { step: 1, min: 0 })}
        ${fieldMarkup("scale", "缩放", { step: 0.01, min: 0.05, max: 8 })}
        ${fieldMarkup("rotate", "旋转角度", { step: 1, min: -1080, max: 1080 })}
        ${fieldMarkup("perspective", "透视距离 px（0=关闭）", { step: 10, min: 0, max: 4000 })}
        ${fieldMarkup("rotateY", "横向透视角度", { step: 1, min: -180, max: 180 })}
        ${fieldMarkup("rotateX", "纵向透视角度", { step: 1, min: -180, max: 180 })}
        ${fieldMarkup("originX", "透视原点 X%", { step: 1, min: 0, max: 100 })}
        ${fieldMarkup("originY", "透视原点 Y%", { step: 1, min: 0, max: 100 })}
        ${fieldMarkup("z", "图层级别", { step: 1, min: -999, max: 999 })}
        ${fieldMarkup("opacity", "不透明度（0~1）", { step: 0.05, min: 0, max: 1 })}
      </div>
      <div class="layout-editor-toggle-row">
        <label><input type="checkbox" data-field="visible" data-scope="layout">显示</label>
        <label><input type="checkbox" data-field="locked" data-scope="layout">锁定</label>
      </div>
    </section>
    <section class="layout-editor-tab" data-panel="style">
      <div class="layout-editor-fields">
        ${fieldMarkup("brightness", "亮度", { scope: "style", step: 0.05, min: 0, max: 4 })}
        ${fieldMarkup("saturate", "饱和度", { scope: "style", step: 0.05, min: 0, max: 4 })}
        ${fieldMarkup("blur", "模糊 px", { scope: "style", step: 0.5, min: 0, max: 40 })}
        ${fieldMarkup("radius", "圆角 px（-1=原样）", { scope: "style", step: 1, min: -1 })}
        ${fieldMarkup("background", "背景 CSS", { scope: "style", type: "text", placeholder: "#fff / linear-gradient(…)" })}
        ${fieldMarkup("color", "文字颜色", { scope: "style", type: "text", placeholder: "#3c291c" })}
      </div>
    </section>
    <section class="layout-editor-tab" data-panel="motion">
      <div class="layout-editor-toggle-row layout-editor-motion-enable">
        <label><input type="checkbox" data-field="enabled" data-scope="motion">启用此元素动画</label>
      </div>
      <div class="layout-editor-fields">
        ${selectMarkup("trigger", "触发方式", [["manual", "仅手动预览"], ["load", "页面打开"], ["loop", "循环播放"]])}
        ${selectMarkup("direction", "播放方向", [["normal", "正向"], ["reverse", "反向"], ["alternate", "往返"]])}
        ${fieldMarkup("fromX", "起点 X 偏移", { scope: "motion", step: 1 })}
        ${fieldMarkup("fromY", "起点 Y 偏移", { scope: "motion", step: 1 })}
        ${fieldMarkup("fromScale", "起点缩放", { scope: "motion", step: 0.05, min: 0.05, max: 8 })}
        ${fieldMarkup("fromRotate", "起点旋转", { scope: "motion", step: 1 })}
        ${fieldMarkup("fromOpacity", "起点透明度", { scope: "motion", step: 0.05, min: 0, max: 1 })}
        ${fieldMarkup("duration", "时长 ms", { scope: "motion", step: 50, min: 50 })}
        ${fieldMarkup("delay", "延迟 ms", { scope: "motion", step: 50, min: 0 })}
        ${fieldMarkup("iterations", "次数", { scope: "motion", step: 1, min: 1, max: 99 })}
        ${fieldMarkup("easing", "缓动曲线", { scope: "motion", type: "text" })}
      </div>
      <button type="button" class="layout-editor-wide-button" data-action="preview-motion">预览所选元素动画</button>
    </section>
    <section class="layout-editor-tab" data-panel="truck">
      <p class="layout-editor-help">调整后点“重播整车进场”，镜头、车身、车轮、卷帘、招牌和三面翻菜单会使用新参数。</p>
      <div class="layout-editor-fields">
        ${truckField("cameraStartX", "镜头起点 X%", 1)}
        ${truckField("cameraStartY", "镜头起点 Y%", 1)}
        ${truckField("cameraStartScale", "镜头起点缩放", 0.05)}
        ${truckField("cameraEndX", "聚焦终点 X%", 1)}
        ${truckField("cameraEndY", "聚焦终点 Y%", 1)}
        ${truckField("cameraEndScale", "聚焦终点缩放", 0.05)}
        ${truckField("cameraDuration", "镜头时长 ms", 50)}
        ${truckField("bodyDuration", "车身回弹 ms", 50)}
        ${truckField("wheelDuration", "车轮滚动 ms", 50)}
        ${truckField("wheelTurns", "车轮旋转角度", 10)}
        ${truckField("shutterDelay", "卷帘延迟 ms", 50)}
        ${truckField("shutterDuration", "卷帘时长 ms", 50)}
        ${truckField("signDelay", "招牌延迟 ms", 50)}
        ${truckField("signDuration", "招牌时长 ms", 50)}
        ${truckField("menuDuration", "菜单翻转周期 ms", 100)}
        ${truckField("menuStagger", "菜单错峰 ms", 10)}
      </div>
      <button type="button" class="layout-editor-wide-button layout-editor-primary" data-action="replay-truck">预览整车进场</button>
    </section>
    <div class="layout-editor-action-row">
      <button type="button" data-action="reset-selected">复位所选</button>
      <button type="button" data-action="deselect">取消选择</button>
    </div>
  `;

  const timeline = document.createElement("section");
  timeline.className = "layout-editor-timeline layout-editor-ui";
  timeline.innerHTML = `
    <div class="layout-editor-timeline__head">
      <strong>餐车进场时间轴</strong>
      <button type="button" data-action="replay-truck">▶ 预览</button>
      <output data-timeline-total></output>
    </div>
    <div class="layout-editor-timeline__tracks">
      ${["镜头", "车身", "车轮", "卷帘", "招牌", "菜单"].map((label, index) => `
        <div class="layout-editor-timeline__row" data-track="${index}">
          <span>${label}</span><div class="layout-editor-timeline__rail"><i></i></div>
        </div>`).join("")}
    </div>
  `;

  const overlay = document.createElement("div");
  overlay.className = "layout-editor-selection layout-editor-ui";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="layout-editor-selection__label"></div>
    <button type="button" class="layout-editor-handle layout-editor-handle--rotate" aria-label="旋转"></button>
    <button type="button" class="layout-editor-handle layout-editor-handle--scale" aria-label="缩放"></button>
  `;

  const guides = document.createElement("div");
  guides.className = "layout-editor-guides layout-editor-ui";
  guides.hidden = true;
  guides.innerHTML = `
    <div class="layout-editor-grid-surface"></div>
    <div class="layout-editor-guide-boundary"></div>
    <i class="layout-editor-guide-line layout-editor-guide-line--vertical" data-guide="left"></i>
    <i class="layout-editor-guide-line layout-editor-guide-line--vertical is-center" data-guide="center"></i>
    <i class="layout-editor-guide-line layout-editor-guide-line--vertical" data-guide="right"></i>
    <i class="layout-editor-guide-line layout-editor-guide-line--horizontal" data-guide="top"></i>
    <i class="layout-editor-guide-line layout-editor-guide-line--horizontal is-center" data-guide="middle"></i>
    <i class="layout-editor-guide-line layout-editor-guide-line--horizontal" data-guide="bottom"></i>
  `;

  document.body.append(
    topbar,
    layers,
    alignmentDock,
    inspector,
    timeline,
    guides,
    overlay,
  );
  bindEditor(topbar, layers, alignmentDock, inspector, timeline, overlay);
  requestEditorMap("burger");
  setTruckOverview(true);
  setTruckFocus(true);
  syncToolbar();
  setEditorView("home");
  [400, 1200, 2500].forEach((delay) => {
    window.setTimeout(() => setEditorView(activeEditorView), delay);
  });
  setSelected("burger.truck");
}

function updateSelectedPreview(partial, scope = "layout") {
  if (!selectedId) return;
  const patch = scope === "motion" ? { motion: partial } : partial;
  workingDocument = updateLayoutElement(workingDocument, selectedId, patch);
  applyDocument();
}

function syncInspector() {
  const inspector = document.querySelector(".layout-editor-inspector");
  if (!inspector) return;
  const hasSelection = Boolean(selectedId);
  inspector.classList.toggle("has-no-selection", !hasSelection);
  inspector.querySelector("[data-selected-name]").textContent =
    selectedId || "请选择页面元素";
  inspector.querySelector("[data-selected-label]").textContent = hasSelection
    ? elementLabel(selectedId)
    : "可直接点击中间画布";

  const value = hasSelection ? layoutValue(selectedId) : DEFAULT_LAYOUT_VALUE;
  inspector.querySelectorAll("[data-field]").forEach((input) => {
    if (document.activeElement === input) return;
    const field = input.dataset.field;
    const scope = input.dataset.scope;
    let nextValue;
    if (scope === "motion") nextValue = value.motion[field];
    else if (scope === "timeline") {
      nextValue = workingDocument.truckTimeline[field];
    } else nextValue = value[field];
    if (input.type === "checkbox") input.checked = Boolean(nextValue);
    else input.value = String(nextValue ?? "");
    if (scope !== "timeline") input.disabled = !hasSelection;
  });
  inspector
    .querySelectorAll('[data-action="preview-motion"],[data-action="reset-selected"]')
    .forEach((button) => {
      button.disabled = !hasSelection;
    });
  syncAlignmentDock();
}

function syncAlignmentDock() {
  const dock = document.querySelector(".layout-editor-align-dock");
  if (!dock) return;
  const hasSelection = Boolean(selectedId);
  const value = hasSelection ? layoutValue(selectedId) : DEFAULT_LAYOUT_VALUE;
  dock.classList.toggle("has-no-selection", !hasSelection);
  dock.querySelectorAll("[data-align]").forEach((button) => {
    button.disabled = !hasSelection || value.locked;
  });
  dock.querySelectorAll("[data-quick-field]").forEach((input) => {
    if (document.activeElement === input) return;
    const field = input.dataset.quickField;
    const nextValue =
      input.dataset.unit === "percent"
        ? Math.round(value[field] * 100)
        : value[field];
    input.value = String(nextValue ?? "");
    input.disabled = !hasSelection || value.locked;
  });
  const opacityOutput = dock.querySelector('[data-quick-output="opacity"]');
  if (opacityOutput) {
    opacityOutput.textContent = `${Math.round(value.opacity * 100)}%`;
  }
  const layerContext = selectedLayerContext();
  const layerPath = dock.querySelector("[data-layer-path]");
  const layerStatus = dock.querySelector("[data-layer-status]");
  if (layerPath) layerPath.textContent = layerContext.path;
  if (layerStatus) {
    layerStatus.textContent = hasSelection
      ? layerContext.explicit
        ? `当前显示层：${layerContext.current}（原始 ${layerContext.original}）`
        : `当前显示层：原始 ${layerContext.original}`
      : "当前显示层：—";
  }
  dock.querySelectorAll("[data-layer-order]").forEach((button) => {
    button.disabled = !hasSelection || value.locked;
  });
  dock.querySelectorAll("[data-nudge]").forEach((button) => {
    button.disabled = !hasSelection || value.locked;
  });
  const nudgePosition = dock.querySelector("[data-nudge-position]");
  if (nudgePosition) {
    nudgePosition.textContent = hasSelection
      ? `X ${round(value.x)} · Y ${round(value.y)}`
      : "X — · Y —";
  }
  const wheelCheck = dock.querySelector("[data-wheel-check]");
  const wheelStatus = dock.querySelector("[data-wheel-status]");
  const wheelInfo = wheelAlignmentInfo();
  if (wheelCheck) wheelCheck.hidden = !wheelInfo;
  if (wheelInfo && wheelStatus) {
    const partnerName =
      baseLayoutId(wheelInfo.partnerId) === "burger.wheel-front"
        ? "前轮"
        : "后轮";
    wheelStatus.textContent = wheelInfo.aligned
      ? `✓ 与${partnerName}轮心同高`
      : `与${partnerName}轮心相差 ${Math.abs(wheelInfo.delta).toFixed(1)}px（${
          wheelInfo.delta > 0 ? "当前更低" : "当前更高"
        }）`;
    wheelStatus.classList.toggle("is-aligned", wheelInfo.aligned);
  }
  dock.querySelectorAll("[data-guide-setting]").forEach((input) => {
    if (document.activeElement === input) return;
    const field = input.dataset.guideSetting;
    if (input.type === "checkbox") {
      input.checked = Boolean(alignmentSettings[field]);
    } else {
      input.value = String(alignmentSettings[field]);
    }
  });
  if (!hasSelection) {
    const referenceOutput = dock.querySelector("[data-align-reference]");
    if (referenceOutput) referenceOutput.textContent = "请选择元素";
  }
}

function syncToolbar() {
  const topbar = document.querySelector(".layout-editor-topbar");
  if (!topbar) return;
  topbar.querySelector('[data-action="undo"]').disabled = !history.canUndo();
  topbar.querySelector('[data-action="redo"]').disabled = !history.canRedo();
}

function renderLayerList() {
  const container = document.querySelector("[data-layer-groups]");
  if (!container) return;
  const visibleIds = allLayoutIds().filter(
    (id) => !truckFocusEnabled || TRUCK_EDITOR_BASE_IDS.has(id),
  );
  const search = document
    .querySelector("[data-layer-search]")
    ?.value.trim()
    .toLowerCase();
  const groups = new Map(
    LAYER_CATEGORY_DEFINITIONS.map((definition) => [
      definition.key,
      { definition, items: [] },
    ]),
  );
  for (const id of visibleIds) {
    const label = elementLabel(id);
    const displayName = layerDisplayName(id, label);
    const category = layerCategory(id);
    if (
      search &&
      !`${id} ${label} ${displayName} ${category.label}`
        .toLowerCase()
        .includes(search)
    ) {
      continue;
    }
    groups.get(category.key).items.push({ id, label, displayName });
  }

  container.innerHTML = [...groups.values()]
    .filter(({ items }) => items.length)
    .map(
      ({ definition, items }) => `
        <details data-layer-group="${escapeMarkup(definition.key)}" ${
          search ||
          openLayerGroups.has(definition.key) ||
          (selectedId && definition.key === layerCategory(selectedId).key)
            ? "open"
            : ""
        }>
          <summary>
            <span><strong>${escapeMarkup(definition.label)}</strong><small>${escapeMarkup(definition.description)}</small></span>
            <b>${items.length}</b>
          </summary>
          <div class="layout-editor-layer-list">
            ${items
              .map(
                ({ id, label, displayName }) => `
                  <button type="button" class="layout-editor-layer${
                    id === selectedId ? " is-selected" : ""
                  }" data-id="${escapeMarkup(id)}">
                    <strong>${escapeMarkup(displayName)}</strong>
                    <small>${escapeMarkup(id)} · ${escapeMarkup(label)}</small>
                  </button>`,
              )
              .join("")}
          </div>
        </details>`,
    )
    .join("");
  const title = document.querySelector("[data-layer-panel-title]");
  if (title) title.textContent = truckFocusEnabled ? "餐车图层" : "页面图层";
  document.querySelector("[data-layer-count]").textContent =
    `${visibleIds.length} 个`;
}

function syncTimeline() {
  const timeline = document.querySelector(".layout-editor-timeline");
  if (!timeline) return;
  const t = workingDocument.truckTimeline;
  const tracks = [
    [0, t.cameraDuration],
    [0, t.bodyDuration],
    [0, t.wheelDuration],
    [t.shutterDelay, t.shutterDuration],
    [t.signDelay, t.signDuration],
    [0, t.menuDuration + t.menuStagger * 2],
  ];
  const total = Math.max(...tracks.map(([start, duration]) => start + duration));
  timeline.querySelector("[data-timeline-total]").textContent = `${(
    total / 1000
  ).toFixed(2)}s`;
  timeline.querySelectorAll("[data-track]").forEach((row, index) => {
    const [start, duration] = tracks[index];
    const bar = row.querySelector("i");
    bar.style.left = `${(start / total) * 100}%`;
    bar.style.width = `${Math.max(2, (duration / total) * 100)}%`;
    bar.title = `${start}ms → ${start + duration}ms`;
  });
}

function switchTab(name) {
  const inspector = document.querySelector(".layout-editor-inspector");
  if (!inspector) return;
  inspector.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === name);
  });
  inspector.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.panel === name);
  });
  if (name === "truck" && theatreStudio) {
    const object = ensureTruckTimelineObject();
    if (object) theatreStudio.setSelection([object]);
  } else if (selectedId && theatreStudio) {
    selectInDeveloperTools(selectedId);
  }
}

function startOperation(event, kind) {
  if (!selectedId || layoutValue(selectedId).locked) {
    showToast("该元素已锁定");
    return;
  }
  const element = preferredElement(selectedId);
  if (!element) return;
  event.preventDefault();
  event.stopPropagation();
  const rect = element.getBoundingClientRect();
  const reference = alignmentReference(element);
  const value = layoutValue(selectedId);
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  operation = {
    kind,
    id: selectedId,
    startX: event.clientX,
    startY: event.clientY,
    centerX,
    centerY,
    startValue: value,
    startDistance: Math.max(
      24,
      Math.hypot(event.clientX - centerX, event.clientY - centerY),
    ),
    startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
    startRect: plainRect(rect),
    referenceRect: plainRect(reference?.getBoundingClientRect()),
  };
}

function playElementMotion(id, force = false) {
  const value = layoutValue(id);
  const motion = value.motion;
  if (!force && !motion.enabled) return;
  animationById.get(id)?.forEach((animation) => animation.cancel());
  const animations = [...document.querySelectorAll(selectorFor(id))]
    .filter((element) => element.getClientRects().length)
    .map((element) =>
      element.animate(
        [
          {
            translate: `${value.x + motion.fromX}px ${
              value.y + motion.fromY
            }px`,
            rotate: `${value.rotate + motion.fromRotate}deg`,
            scale: `${value.scale * motion.fromScale}`,
            opacity: value.opacity * motion.fromOpacity,
          },
          {
            translate: `${value.x}px ${value.y}px`,
            rotate: `${value.rotate}deg`,
            scale: `${value.scale}`,
            opacity: value.opacity,
          },
        ],
        {
          duration: motion.duration,
          delay: motion.delay,
          easing: motion.easing,
          direction: motion.direction,
          iterations: motion.trigger === "loop" ? Infinity : motion.iterations,
          fill: "both",
        },
      ),
    );
  animationById.set(id, animations);
}

function setTruckOverview(enabled, { announce = false } = {}) {
  window.clearTimeout(truckPreviewTimer);
  truckPreviewTimer = 0;
  document.documentElement.classList.toggle(
    "layout-editor-truck-overview",
    enabled,
  );
  if (enabled) {
    document.querySelectorAll("[data-truck-camera]").forEach((camera) => {
      camera.classList.remove("is-arriving");
    });
    document
      .querySelectorAll(".home-map-slide.is-truck-replaying")
      .forEach((slide) => slide.classList.remove("is-truck-replaying"));
  }
  scheduleOverlay();
  window.requestAnimationFrame(() => devMoveable?.updateRect());
  if (announce) showToast("已回到完整餐车视图，可以直接调整前后轮");
}

function replayTruck() {
  const replayButton = document.querySelector("[data-truck-replay]");
  if (replayButton) {
    replayButton.click();
  } else {
    document.querySelectorAll("[data-truck-camera]").forEach((camera) => {
      camera.classList.remove("is-arriving");
      void camera.offsetWidth;
      camera.classList.add("is-arriving");
    });
  }
  showToast("正在预览餐车动画，结束后自动回到全车视图", 3200);
}

function previewTruckAnimation() {
  setTruckOverview(false);
  replayTruck();
  truckPreviewTimer = window.setTimeout(() => {
    setTruckOverview(true, { announce: true });
  }, workingDocument.truckTimeline.cameraDuration + 300);
}

function exportDocument() {
  const theatreState =
    theatreStudio && theatreProject
      ? theatreStudio.createContentOfSaveFile(THEATRE_PROJECT_ID)
      : loadTheatreState();
  const payload = createWorkbenchFile(workingDocument, theatreState, {
    sourcePage: window.location.href,
  });
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const timestamp = new Date().toISOString().replaceAll(":", "-").slice(0, 19);
  link.download = `汉堡小馆-UI调整-${timestamp}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("调整文件已下载：把这个 JSON 直接发给 Codex 即可", 4200);
}

function handleAction(action) {
  if (action === "undo") {
    workingDocument = history.undo();
    applyDocument();
  } else if (action === "redo") {
    workingDocument = history.redo();
    applyDocument();
  } else if (action === "save") {
    saveDocument();
  } else if (action === "export") {
    exportDocument();
  } else if (action === "reset-all") {
    if (!window.confirm("确定复位全部 UI 与动画参数吗？")) return;
    workingDocument = history.replace(createProjectDefaultLayoutDocument());
    applyDocument();
    setSelected("burger.truck");
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workingDocument));
    window.localStorage.removeItem(THEATRE_STORAGE_KEY);
    showToast("全部参数已复位，正在重载开发工具");
    window.setTimeout(() => window.location.reload(), 240);
  } else if (action === "done") {
    saveDocument();
    const next = new URL(window.location.href);
    next.searchParams.delete("layout");
    window.location.href = next.toString();
  } else if (action === "reset-selected" && selectedId) {
    const defaultValue = projectDefaultLayoutValue(selectedId);
    let nextDocument;
    if (
      Object.prototype.hasOwnProperty.call(
        PROJECT_DEFAULT_LAYOUT_ELEMENTS,
        selectedId,
      )
    ) {
      nextDocument = updateLayoutElement(
        workingDocument,
        selectedId,
        defaultValue,
      );
    } else {
      const elements = { ...workingDocument.elements };
      delete elements[selectedId];
      nextDocument = normalizeLayoutDocument({
        ...workingDocument,
        elements,
      });
    }
    workingDocument = nextDocument;
    const object = ensureTheatreObject(selectedId);
    if (theatreStudio && object) {
      theatreStudio.transaction(({ set }) => {
        set(object.props.layout, {
          x: defaultValue.x,
          y: defaultValue.y,
          width: defaultValue.width,
          height: defaultValue.height,
          scale: defaultValue.scale,
          rotate: defaultValue.rotate,
          perspective: defaultValue.perspective,
          rotateX: defaultValue.rotateX,
          rotateY: defaultValue.rotateY,
          originX: defaultValue.originX,
          originY: defaultValue.originY,
          z: defaultValue.z,
          opacity: defaultValue.opacity,
          visible: defaultValue.visible,
          locked: defaultValue.locked,
        });
        set(object.props.style, {
          brightness: defaultValue.brightness,
          saturate: defaultValue.saturate,
          blur: defaultValue.blur,
          radius: defaultValue.radius,
          background: defaultValue.background,
          color: defaultValue.color,
        });
      });
    }
    commitDocument(nextDocument);
  } else if (action === "deselect") {
    setSelected("");
  } else if (action === "preview-motion" && selectedId) {
    playElementMotion(selectedId, true);
  } else if (action === "toggle-truck-focus") {
    setTruckFocus(!truckFocusEnabled, { announce: true });
  } else if (action === "toggle-studio") {
    setStudioVisibility(!studioVisible, { announce: true });
  } else if (action === "replay-truck") {
    switchTab("truck");
    previewTruckAnimation();
  } else if (action === "play-theatre" && theatreSheet) {
    theatreSheet.sequence.position = 0;
    theatreSheet.sequence.play({ iterationCount: 1 }).catch(() => {});
  } else if (action === "select-truck-timing" && theatreStudio) {
    switchTab("truck");
    const object = ensureTruckTimelineObject();
    if (object) theatreStudio.setSelection([object]);
  }
  syncToolbar();
}

function bindEditor(
  topbar,
  layers,
  alignmentDock,
  inspector,
  timeline,
  overlay,
) {
  document.addEventListener("click", (event) => {
    const view = event.target.closest(".layout-editor-ui [data-editor-view]")
      ?.dataset.editorView;
    if (view) {
      setEditorView(view);
      return;
    }
    const action = event.target.closest(".layout-editor-ui [data-action]")
      ?.dataset.action;
    if (action && action !== "import") handleAction(action);
  });

  topbar
    .querySelector('[data-action="import"]')
    .addEventListener("change", async (event) => {
      const [file] = event.target.files;
      if (!file) return;
      try {
        const parsed = parseWorkbenchFile(await file.text());
        workingDocument = history.replace(
          mergeProjectDefaultLayout(parsed.layoutDocument),
        );
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(workingDocument),
        );
        if (parsed.theatreState) {
          window.localStorage.setItem(
            THEATRE_STORAGE_KEY,
            JSON.stringify(parsed.theatreState),
          );
        } else {
          window.localStorage.removeItem(THEATRE_STORAGE_KEY);
        }
        applyDocument();
        renderLayerList();
        showToast("调整文件已导入，布局与时间轴正在恢复");
        window.setTimeout(() => window.location.reload(), 240);
      } catch {
        showToast("文件不是有效的汉堡小馆 UI 调整文件");
      }
      event.target.value = "";
      syncToolbar();
    });

  layers.addEventListener("input", (event) => {
    if (event.target.matches("[data-layer-search]")) renderLayerList();
  });
  layers.addEventListener("click", (event) => {
    const button = event.target.closest("[data-id]");
    if (button) setSelected(button.dataset.id);
  });
  layers.addEventListener(
    "toggle",
    (event) => {
      const details = event.target.closest("[data-layer-group]");
      if (!details) return;
      if (details.open) openLayerGroups.add(details.dataset.layerGroup);
      else openLayerGroups.delete(details.dataset.layerGroup);
      if (details.open && details.dataset.layerGroup === "burger-wheel") {
        setTruckOverview(true);
      }
    },
    true,
  );

  inspector.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-tab]")?.dataset.tab;
    if (tab) switchTab(tab);
  });
  alignmentDock.addEventListener("click", (event) => {
    const mode = event.target.closest("[data-align]")?.dataset.align;
    if (mode) {
      alignSelected(mode);
      return;
    }
    const layerOrder = event.target.closest("[data-layer-order]")?.dataset
      .layerOrder;
    if (layerOrder) {
      changeSelectedLayer(layerOrder);
      return;
    }
    const nudgeDirection = event.target.closest("[data-nudge]")?.dataset.nudge;
    if (nudgeDirection) {
      nudgeSelectedDirection(nudgeDirection);
      return;
    }
    if (event.target.closest("[data-wheel-align]")) {
      alignSelectedWheelHeight();
    }
  });
  alignmentDock.addEventListener("input", (event) => {
    const settingInput = event.target.closest("[data-guide-setting]");
    if (settingInput) {
      const field = settingInput.dataset.guideSetting;
      alignmentSettings = normalizeAlignmentSettings({
        ...alignmentSettings,
        [field]:
          settingInput.type === "checkbox"
            ? settingInput.checked
            : Number(settingInput.value),
      });
      saveAlignmentSettings();
      selectInDeveloperTools(selectedId);
      updateGuides();
      syncAlignmentDock();
      return;
    }

    const quickInput = event.target.closest("[data-quick-field]");
    if (!quickInput || !selectedId) return;
    const field = quickInput.dataset.quickField;
    const value =
      quickInput.dataset.unit === "percent"
        ? Number(quickInput.value) / 100
        : Number(quickInput.value);
    if (!setTheatrePatch(selectedId, "layout", { [field]: value })) {
      updateSelectedPreview({ [field]: value });
    }
    syncAlignmentDock();
  });
  alignmentDock.addEventListener("change", (event) => {
    if (event.target.closest("[data-quick-field]")) {
      commitDocument(workingDocument);
    }
  });
  inspector.addEventListener("input", (event) => {
    const input = event.target.closest("[data-field]");
    if (!input) return;
    const field = input.dataset.field;
    const scope = input.dataset.scope;
    const value =
      input.type === "checkbox"
        ? input.checked
        : input.type === "number"
          ? Number(input.value)
          : input.value;
    if (scope === "timeline") {
      const object = ensureTruckTimelineObject();
      if (theatreStudio && object) {
        theatreStudio.transaction(({ set }) => {
          set(object.props[field], value);
        });
      } else {
        workingDocument = updateTruckTimeline(workingDocument, {
          [field]: value,
        });
        applyDocument();
      }
    } else if (selectedId) {
      if (
        scope !== "motion" &&
        setTheatrePatch(selectedId, scope === "style" ? "style" : "layout", {
          [field]: value,
        })
      ) {
        return;
      }
      updateSelectedPreview({ [field]: value }, scope);
    }
  });
  inspector.addEventListener("change", (event) => {
    if (event.target.closest("[data-field]")) commitDocument(workingDocument);
  });

  timeline.addEventListener("click", (event) => {
    if (!event.target.closest("[data-action]")) switchTab("truck");
  });

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (
        event.target.closest(
          ".layout-editor-ui,.moveable-control-box,#theatrejs-studio-root,[data-theatrejs-studio-root]",
        )
      ) {
        return;
      }
      const element = event.target.closest(editableSelector);
      if (!element) {
        if (!devMoveable) setSelected("");
        return;
      }
      const rawId = elementId(element);
      const id = truckFocusEnabled ? truckEditorRootId(rawId) : rawId;
      if (truckFocusEnabled && !id) {
        event.preventDefault();
        return;
      }
      const useDirectWheelDrag = isWheelLayer(id);
      event.preventDefault();
      if (selectedId !== id) setSelected(id);
      if (devMoveable && !useDirectWheelDrag) return;
      event.stopImmediatePropagation();
      startOperation(event, "move");
    },
    true,
  );
  document.addEventListener(
    "click",
    (event) => {
      if (!devMoveable || event.target.closest(".layout-editor-ui")) return;
      if (event.target.closest(editableSelector)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );

  overlay
    .querySelector(".layout-editor-handle--scale")
    .addEventListener("pointerdown", (event) =>
      startOperation(event, "scale"),
    );
  overlay
    .querySelector(".layout-editor-handle--rotate")
    .addEventListener("pointerdown", (event) =>
      startOperation(event, "rotate"),
    );

  window.addEventListener(
    "pointermove",
    (event) => {
      if (!operation) return;
      event.preventDefault();
      if (operation.kind === "move") {
        updateSelectedPreview(
          snappedDragPatch(
            preferredElement(selectedId),
            operation.startValue,
            operation.startRect,
            operation.referenceRect,
            event.clientX - operation.startX,
            event.clientY - operation.startY,
            "viewport",
          ),
        );
      } else if (operation.kind === "scale") {
        const distance = Math.hypot(
          event.clientX - operation.centerX,
          event.clientY - operation.centerY,
        );
        updateSelectedPreview({
          scale: round(
            (operation.startValue.scale * distance) /
              operation.startDistance,
            2,
          ),
        });
      } else if (operation.kind === "rotate") {
        const angle = Math.atan2(
          event.clientY - operation.centerY,
          event.clientX - operation.centerX,
        );
        updateSelectedPreview({
          rotate: round(
            operation.startValue.rotate +
              ((angle - operation.startAngle) * 180) / Math.PI,
          ),
        });
      }
    },
    { passive: false },
  );

  const endOperation = () => {
    if (!operation) return;
    operation = null;
    clearSnapFeedback();
    commitDocument(workingDocument);
  };
  window.addEventListener("pointerup", endOperation);
  window.addEventListener("pointercancel", endOperation);
  window.addEventListener("resize", scheduleOverlay);
  window.addEventListener("scroll", scheduleOverlay, true);
  document.addEventListener("keydown", (event) => {
    const nudgeDirection =
      NUDGE_DIRECTION_BY_KEY[event.code] ||
      NUDGE_DIRECTION_BY_KEY[event.key];
    const editingField = event.target.closest(
      "input, textarea, select, [contenteditable]",
    );
    if (
      selectedId &&
      nudgeDirection &&
      (!editingField || editingField.matches("[data-nudge-step]"))
    ) {
      event.preventDefault();
      nudgeSelectedDirection(nudgeDirection, { boost: event.shiftKey });
      return;
    }
    if (event.key === "Escape") setSelected("");
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      workingDocument = event.shiftKey ? history.redo() : history.undo();
      applyDocument();
      syncToolbar();
    }
  });
}

const observer = new MutationObserver((mutations) => {
  const hasPageMutation = mutations.some(
    (mutation) =>
      !mutation.target.closest?.(".layout-editor-ui") &&
      [...mutation.addedNodes, ...mutation.removedNodes].some(
        (node) => node.nodeType === Node.ELEMENT_NODE,
      ),
  );
  if (!hasPageMutation) return;
  applyDocument();
  if (editorEnabled) renderLayerList();
});

function runStoredMotions() {
  for (const [id, value] of Object.entries(workingDocument.elements)) {
    if (
      value.motion.enabled &&
      ["load", "loop"].includes(value.motion.trigger)
    ) {
      playElementMotion(id);
    }
  }
}

function start() {
  workingDocument = history.current();
  decorateRuntimeElements();
  applyDocument();
  observer.observe(document.body, { childList: true, subtree: true });
  if (editorEnabled) {
    buildEditor();
    setupDeveloperTools().catch(() => {
      showToast("开发工具加载失败，已保留内置编辑器");
    });
  } else {
    setupRuntimeTheatre().catch(() => {});
    window.setTimeout(runStoredMotions, 60);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
