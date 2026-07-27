import {
  createLayoutHistory,
  normalizeLayoutDocument,
  parseLayoutDocument,
  updateLayoutElement,
} from "./home-layout-editor-state.mjs";

const STORAGE_KEY = "burger.home.layout.v1";
const query = new URLSearchParams(window.location.search);
const editorEnabled = query.get("layout") === "1";

const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

function loadSavedDocument() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? parseLayoutDocument(raw) : normalizeLayoutDocument({});
  } catch {
    return normalizeLayoutDocument({});
  }
}

let history = createLayoutHistory(loadSavedDocument());
let workingDocument = history.current();
let selectedId = "";
let operation = null;
let overlayFrame = 0;
let toastTimer = 0;

function selectorFor(id) {
  return `[data-layout-id="${String(id).replaceAll('"', '\\"')}"]`;
}

function allLayoutIds() {
  return [...new Set(
    [...document.querySelectorAll("[data-layout-id]")]
      .map((element) => element.dataset.layoutId)
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b));
}

function layoutValue(id) {
  return workingDocument.elements[id] || {
    x: 0,
    y: 0,
    scale: 1,
    rotate: 0,
    z: 0,
    opacity: 1,
    visible: true,
    locked: false,
  };
}

function applyValue(element, value) {
  element.style.setProperty("--layout-x", `${value.x}px`);
  element.style.setProperty("--layout-y", `${value.y}px`);
  element.style.setProperty("--layout-scale", `${value.scale}`);
  element.style.setProperty("--layout-rotate", `${value.rotate}deg`);
  element.style.setProperty("--layout-opacity", `${value.opacity}`);
  element.style.zIndex = value.z ? String(value.z) : "";
  element.style.visibility = value.visible ? "" : "hidden";
}

function applyDocument() {
  for (const id of allLayoutIds()) {
    const value = layoutValue(id);
    document.querySelectorAll(selectorFor(id)).forEach((element) => applyValue(element, value));
  }
  scheduleOverlay();
  syncInspector();
}

function commitDocument(nextDocument = workingDocument) {
  workingDocument = history.commit(nextDocument);
  applyDocument();
  syncToolbar();
}

function saveDocument() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workingDocument));
    showToast("布局已保存在本机");
  } catch {
    showToast("保存失败，请检查浏览器存储权限");
  }
}

function showToast(message) {
  if (!editorEnabled) return;
  let toast = document.querySelector(".layout-editor-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "layout-editor-toast";
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 1800);
}

function preferredElement(id) {
  const matches = [...document.querySelectorAll(selectorFor(id))]
    .filter((element) => element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
  return matches.find((element) => element.closest('[data-card-offset="0"]')) || matches[0] || null;
}

function scheduleOverlay() {
  if (!editorEnabled || overlayFrame) return;
  overlayFrame = window.requestAnimationFrame(() => {
    overlayFrame = 0;
    updateOverlay();
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
  overlay.querySelector(".layout-editor-selection__label").textContent = selectedId;
}

function setSelected(id) {
  selectedId = id || "";
  const inspector = document.querySelector(".layout-editor-inspector");
  if (inspector) inspector.hidden = !selectedId;
  syncInspector();
  scheduleOverlay();
}

function numberInput(field, label, options = {}) {
  const wrapper = document.createElement("label");
  wrapper.className = "layout-editor-field";
  wrapper.textContent = label;
  const input = document.createElement("input");
  input.type = "number";
  input.dataset.field = field;
  input.step = String(options.step ?? 1);
  if (options.min != null) input.min = String(options.min);
  if (options.max != null) input.max = String(options.max);
  wrapper.append(input);
  return wrapper;
}

function buildEditor() {
  document.documentElement.classList.add("layout-editor-active");

  const toolbar = document.createElement("div");
  toolbar.className = "layout-editor-toolbar";
  toolbar.innerHTML = `
    <div class="layout-editor-toolbar__title">主页拼装器 · 点元素后直接拖动</div>
    <button type="button" data-action="undo">撤销</button>
    <button type="button" data-action="redo">重做</button>
    <button type="button" data-action="save" class="layout-editor-primary">保存</button>
    <button type="button" data-action="export">导出 JSON</button>
    <label class="layout-editor-import-label">导入 JSON<input type="file" accept="application/json,.json" data-action="import"></label>
    <button type="button" data-action="reset-all" class="layout-editor-danger">全部复位</button>
    <button type="button" data-action="done">完成编辑</button>
  `;

  const inspector = document.createElement("aside");
  inspector.className = "layout-editor-inspector";
  inspector.hidden = true;
  const heading = document.createElement("div");
  heading.className = "layout-editor-inspector__heading";
  const fields = document.createElement("div");
  fields.className = "layout-editor-fields";
  fields.append(
    numberInput("x", "水平 X", { step: 1 }),
    numberInput("y", "垂直 Y", { step: 1 }),
    numberInput("scale", "缩放", { step: 0.01, min: 0.1, max: 4 }),
    numberInput("rotate", "旋转", { step: 1, min: -180, max: 180 }),
    numberInput("z", "层级", { step: 1, min: -999, max: 999 }),
    numberInput("opacity", "透明度", { step: 0.05, min: 0, max: 1 }),
  );
  const toggles = document.createElement("div");
  toggles.className = "layout-editor-toggle-row";
  toggles.innerHTML = `
    <label><input type="checkbox" data-field="visible">显示</label>
    <label><input type="checkbox" data-field="locked">锁定</label>
  `;
  const actions = document.createElement("div");
  actions.className = "layout-editor-action-row";
  actions.innerHTML = `
    <button type="button" data-action="reset-selected">复位此元素</button>
    <button type="button" data-action="deselect">取消选择</button>
  `;
  inspector.append(heading, fields, toggles, actions);

  const overlay = document.createElement("div");
  overlay.className = "layout-editor-selection";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="layout-editor-selection__label"></div>
    <button type="button" class="layout-editor-handle layout-editor-handle--rotate" aria-label="旋转"></button>
    <button type="button" class="layout-editor-handle layout-editor-handle--scale" aria-label="缩放"></button>
  `;

  document.body.append(toolbar, inspector, overlay);
  bindEditor(toolbar, inspector, overlay);
  syncToolbar();
}

function updateSelectedPreview(partial) {
  if (!selectedId) return;
  workingDocument = updateLayoutElement(workingDocument, selectedId, partial);
  applyDocument();
}

function syncInspector() {
  const inspector = document.querySelector(".layout-editor-inspector");
  if (!inspector || !selectedId) return;
  const value = layoutValue(selectedId);
  inspector.querySelector(".layout-editor-inspector__heading").textContent = selectedId;
  inspector.querySelectorAll("[data-field]").forEach((input) => {
    const field = input.dataset.field;
    if (input.type === "checkbox") input.checked = Boolean(value[field]);
    else if (document.activeElement !== input) input.value = String(value[field]);
  });
}

function syncToolbar() {
  const toolbar = document.querySelector(".layout-editor-toolbar");
  if (!toolbar) return;
  toolbar.querySelector('[data-action="undo"]').disabled = !history.canUndo();
  toolbar.querySelector('[data-action="redo"]').disabled = !history.canRedo();
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
    startDistance: Math.max(24, Math.hypot(event.clientX - centerX, event.clientY - centerY)),
    startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
  };
}

function bindEditor(toolbar, inspector, overlay) {
  toolbar.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "undo") {
      workingDocument = history.undo();
      applyDocument();
    } else if (action === "redo") {
      workingDocument = history.redo();
      applyDocument();
    } else if (action === "save") {
      saveDocument();
    } else if (action === "export") {
      const blob = new Blob([JSON.stringify(workingDocument, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `burger-home-layout-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } else if (action === "reset-all") {
      if (!window.confirm("确定复位全部主页元素吗？")) return;
      workingDocument = history.replace(normalizeLayoutDocument({}));
      applyDocument();
      setSelected("");
      saveDocument();
    } else if (action === "done") {
      saveDocument();
      const next = new URL(window.location.href);
      next.searchParams.delete("layout");
      window.location.href = next.toString();
    }
    syncToolbar();
  });

  toolbar.querySelector('[data-action="import"]').addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    try {
      workingDocument = history.replace(parseLayoutDocument(await file.text()));
      applyDocument();
      saveDocument();
      showToast("布局已导入");
    } catch {
      showToast("文件不是有效的布局 JSON");
    }
    event.target.value = "";
    syncToolbar();
  });

  inspector.addEventListener("input", (event) => {
    const input = event.target.closest("[data-field]");
    if (!input || !selectedId) return;
    const field = input.dataset.field;
    const value = input.type === "checkbox" ? input.checked : Number(input.value);
    updateSelectedPreview({ [field]: value });
  });

  inspector.addEventListener("change", () => {
    if (selectedId) commitDocument(workingDocument);
  });

  inspector.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "reset-selected" && selectedId) {
      const elements = { ...workingDocument.elements };
      delete elements[selectedId];
      commitDocument({ ...workingDocument, elements });
    } else if (action === "deselect") {
      setSelected("");
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".layout-editor-toolbar,.layout-editor-inspector,.layout-editor-selection")) return;
    const element = event.target.closest("[data-layout-id]");
    if (!element) {
      setSelected("");
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    setSelected(element.dataset.layoutId);
    startOperation(event, "move");
  }, true);

  overlay.querySelector(".layout-editor-handle--scale")
    .addEventListener("pointerdown", (event) => startOperation(event, "scale"));
  overlay.querySelector(".layout-editor-handle--rotate")
    .addEventListener("pointerdown", (event) => startOperation(event, "rotate"));

  window.addEventListener("pointermove", (event) => {
    if (!operation) return;
    event.preventDefault();
    if (operation.kind === "move") {
      updateSelectedPreview({
        x: round(operation.startValue.x + event.clientX - operation.startX),
        y: round(operation.startValue.y + event.clientY - operation.startY),
      });
    } else if (operation.kind === "scale") {
      const distance = Math.hypot(event.clientX - operation.centerX, event.clientY - operation.centerY);
      updateSelectedPreview({
        scale: round(operation.startValue.scale * distance / operation.startDistance, 2),
      });
    } else if (operation.kind === "rotate") {
      const angle = Math.atan2(event.clientY - operation.centerY, event.clientX - operation.centerX);
      updateSelectedPreview({
        rotate: round(operation.startValue.rotate + (angle - operation.startAngle) * 180 / Math.PI),
      });
    }
  }, { passive: false });

  const endOperation = () => {
    if (!operation) return;
    operation = null;
    commitDocument(workingDocument);
  };
  window.addEventListener("pointerup", endOperation);
  window.addEventListener("pointercancel", endOperation);
  window.addEventListener("resize", scheduleOverlay);
  window.addEventListener("scroll", scheduleOverlay, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setSelected("");
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      workingDocument = event.shiftKey ? history.redo() : history.undo();
      applyDocument();
      syncToolbar();
    }
  });
}

const observer = new MutationObserver(() => {
  applyDocument();
});

function start() {
  workingDocument = history.current();
  applyDocument();
  observer.observe(document.body, { childList: true, subtree: true });
  if (editorEnabled) buildEditor();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
