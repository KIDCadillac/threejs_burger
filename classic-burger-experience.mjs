import { HOME_PROGRESS_KEY, normalizeHomeProgress } from "./home-lobby-state.mjs";

export const CLASSIC_BURGER_RECIPE_ID = "classic-beef";
export const CLASSIC_BURGER_ATTEMPT_KEY = "classic-burger-attempt-v1";
export const CLASSIC_BURGER_SETTLEMENTS_KEY = "classic-burger-settlements-v1";

export const CLASSIC_LAYER_NAMES = Object.freeze({
  "bottom-bun": "下层面包",
  patty: "牛肉饼",
  pickle: "酸黄瓜",
  onion: "洋葱碎",
  "top-bun": "上层面包",
});

export const CLASSIC_SAUCE_NAMES = Object.freeze({
  ketchup: "番茄酱",
});

function safeParse(value, fallback) {
  try {
    return typeof value === "string" && value.length ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
function safeGet(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(storage, key, value) {
  try {
    storage?.setItem?.(key, value);
    return true;
  } catch {
    return false;
  }
}

function finiteCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function recipeStepLabel(step) {
  if (step?.kind === "layer") {
    return CLASSIC_LAYER_NAMES[step.ingredientId] ?? String(step.ingredientId ?? "食材");
  }
  if (step?.kind === "sauce") {
    return CLASSIC_SAUCE_NAMES[step.sauceId] ?? String(step.sauceId ?? "酱料");
  }
  return "订单步骤";
}

function targetLayerName(recipe, step) {
  const target = recipe?.steps?.find?.((candidate) => candidate.id === step.targetLayerSlotId);
  return CLASSIC_LAYER_NAMES[target?.ingredientId] ?? "指定食材";
}

function nextInstruction(recipe, step) {
  if (!step) return "订单已经装好，按铃出餐";
  if (step.kind === "layer") {
    return `下一步：把${recipeStepLabel(step)}放到餐盘中央`;
  }
  return `下一步：把${recipeStepLabel(step)}挤在${targetLayerName(recipe, step)}上`;
}

export function evaluateClassicBurger(recipe, state = {}) {
  const steps = Array.isArray(recipe?.steps) ? recipe.steps : [];
  const order = Array.isArray(state?.assembledOrder) ? state.assembledOrder : [];
  const instances = state?.instances && typeof state.instances === "object" ? state.instances : {};
  const strokes = Array.isArray(state?.strokes) ? state.strokes : [];
  const recipeSlotToInstance = new Map();
  let completedSteps = 0;
  let layerCursor = 0;
  let issue = null;

  for (const step of steps) {
    if (step.kind === "layer") {
      const actualLayerId = order[layerCursor];
      if (!actualLayerId) break;
      const actualIngredientId = instances[actualLayerId] ?? actualLayerId;
      if (actualIngredientId !== step.ingredientId) {
        issue = Object.freeze({
          kind: "wrong-layer",
          stepIndex: completedSteps,
          actualLayerId,
          actualIngredientId,
          expectedIngredientId: step.ingredientId,
          message: `第 ${completedSteps + 1} 步应该放${recipeStepLabel(step)}`,
        });
        break;
      }
      recipeSlotToInstance.set(step.id, actualLayerId);
      layerCursor += 1;
      completedSteps += 1;
      continue;
    }

    if (step.kind === "sauce") {
      const targetLayerId = recipeSlotToInstance.get(step.targetLayerSlotId);
      if (!targetLayerId) break;
      const matched = strokes.some((stroke) => (
        stroke?.sauce === step.sauceId && stroke?.layerId === targetLayerId
      ));
      if (!matched) break;
      completedSteps += 1;
    }
  }

  const nextStep = issue ? steps[issue.stepIndex] ?? null : steps[completedSteps] ?? null;
  if (!issue && nextStep?.kind === "sauce" && order.length > layerCursor) {
    const actualLayerId = order[layerCursor];
    issue = Object.freeze({
      kind: "layer-before-sauce",
      stepIndex: completedSteps,
      actualLayerId,
      actualIngredientId: instances[actualLayerId] ?? actualLayerId,
      expectedSauceId: nextStep.sauceId,
      message: `先把${recipeStepLabel(nextStep)}挤好，再放下一层食材`,
    });
  } else if (!issue && !nextStep && order.length > layerCursor) {
    const actualLayerId = order[layerCursor];
    issue = Object.freeze({
      kind: "extra-layer",
      stepIndex: completedSteps,
      actualLayerId,
      actualIngredientId: instances[actualLayerId] ?? actualLayerId,
      message: "订单已经装齐，不需要再加食材",
    });
  }

  const relevantSauceIds = new Set(steps
    .filter((step) => step.kind === "sauce")
    .map((step) => step.sauceId));
  const recipeTargetLayerIds = new Set([...recipeSlotToInstance.values()]);
  const unrelatedStroke = strokes.find((stroke) => (
    !relevantSauceIds.has(stroke?.sauce) || !recipeTargetLayerIds.has(stroke?.layerId)
  ));
  if (!issue && unrelatedStroke) {
    issue = Object.freeze({
      kind: "wrong-sauce",
      stepIndex: Math.min(completedSteps, Math.max(0, steps.length - 1)),
      actualSauceId: unrelatedStroke.sauce,
      actualLayerId: unrelatedStroke.layerId,
      message: "这份订单只需要把番茄酱挤在牛肉饼上",
    });
  }

  const complete = steps.length > 0 && completedSteps === steps.length && !issue;
  const resolvedNextStep = complete ? null : steps[Math.min(completedSteps, steps.length - 1)] ?? null;
  const actualTargetLayerId = resolvedNextStep?.kind === "sauce"
    ? recipeSlotToInstance.get(resolvedNextStep.targetLayerSlotId) ?? null
    : null;

  return Object.freeze({
    complete,
    compatible: !issue,
    completedSteps,
    targetSteps: steps.length,
    nextStep: resolvedNextStep,
    nextStepIndex: complete ? steps.length : completedSteps,
    actualTargetLayerId,
    issue,
    instruction: issue?.message ?? nextInstruction(recipe, resolvedNextStep),
  });
}

function stateChangeCount(previous = [], next = []) {
  return Math.max(previous.length, next.length) - previous.filter((item, index) => item === next[index]).length;
}

export function validateClassicTransition(recipe, previousState = {}, nextState = {}, reason = "") {
  const previous = evaluateClassicBurger(recipe, previousState);
  const next = evaluateClassicBurger(recipe, nextState);
  const expected = previous.nextStep;

  if (reason === "drop-layer") {
    const changed = stateChangeCount(previousState.assembledOrder, nextState.assembledOrder);
    const progressed = next.completedSteps > previous.completedSteps;
    if (!next.compatible || (changed > 0 && !progressed)) {
      const expectedLabel = expected ? recipeStepLabel(expected) : "出餐铃";
      return Object.freeze({
        valid: false,
        message: expected?.kind === "sauce"
          ? `这一步先挤${expectedLabel}，刚才的食材已放回`
          : `这一步要放${expectedLabel}，刚才的食材已放回`,
        evaluation: next,
      });
    }
  }

  if (reason === "sauce-stroke" || reason === "sauce-gesture") {
    const previousStrokes = Array.isArray(previousState.strokes) ? previousState.strokes.length : 0;
    const addedStrokes = (Array.isArray(nextState.strokes) ? nextState.strokes : []).slice(previousStrokes);
    const sauceMatches = expected?.kind === "sauce"
      && addedStrokes.length > 0
      && addedStrokes.every((stroke) => (
        stroke?.sauce === expected.sauceId
        && stroke?.layerId === previous.actualTargetLayerId
      ));
    if (!sauceMatches || !next.compatible) {
      return Object.freeze({
        valid: false,
        message: expected?.kind === "sauce"
          ? `${recipeStepLabel(expected)}要挤在${targetLayerName(recipe, expected)}上，刚才那条没有计入`
          : `现在该放${recipeStepLabel(expected)}，暂时不用加酱`,
        evaluation: next,
      });
    }
  }

  return Object.freeze({ valid: true, message: "", evaluation: next });
}

function newAttemptId(now, random) {
  return `classic-${Math.round(now)}-${Math.floor(random * 0xFFFFFF).toString(36)}`;
}

export function startClassicBurgerAttempt({
  storage,
  now = Date.now(),
  random = Math.random(),
} = {}) {
  const attempt = Object.freeze({
    id: newAttemptId(now, random),
    startedAt: Math.max(0, Math.round(Number(now) || 0)),
    mistakes: 0,
    completedAt: null,
  });
  safeSet(storage, CLASSIC_BURGER_ATTEMPT_KEY, JSON.stringify(attempt));
  return attempt;
}

export function loadClassicBurgerAttempt({ storage, now = Date.now(), random = Math.random() } = {}) {
  const saved = safeParse(safeGet(storage, CLASSIC_BURGER_ATTEMPT_KEY), null);
  if (!saved || typeof saved.id !== "string" || !saved.id.length) {
    return startClassicBurgerAttempt({ storage, now, random });
  }
  return Object.freeze({
    id: saved.id,
    startedAt: Math.max(0, Math.round(Number(saved.startedAt) || Number(now) || 0)),
    mistakes: finiteCount(saved.mistakes),
    completedAt: Number.isFinite(Number(saved.completedAt)) ? Number(saved.completedAt) : null,
  });
}

export function recordClassicBurgerMistake(attempt, { storage } = {}) {
  const next = Object.freeze({
    ...attempt,
    mistakes: finiteCount(attempt?.mistakes) + 1,
  });
  safeSet(storage, CLASSIC_BURGER_ATTEMPT_KEY, JSON.stringify(next));
  return next;
}

export function scoreClassicBurgerAttempt(attempt, { now = Date.now() } = {}) {
  const mistakes = finiteCount(attempt?.mistakes);
  const score = Math.max(60, 100 - mistakes * 8);
  const coins = score >= 96 ? 120 : score >= 80 ? 90 : 60;
  const rating = score >= 96 ? "满分好评" : score >= 80 ? "满意" : "顺利出餐";
  const quote = score >= 96
    ? "顺序刚刚好，番茄酱也落在牛肉饼上。这个就是我想要的经典味道。"
    : score >= 80
      ? "味道很对，下次动作再稳一点，就能做成招牌汉堡。"
      : "汉堡送到了。再熟悉几次顺序，出餐会更漂亮。";
  return Object.freeze({
    score,
    coins,
    rating,
    quote,
    mistakes,
    elapsedMs: Math.max(0, Number(now) - Number(attempt?.startedAt || now)),
  });
}

function normalizedSettlements(storage) {
  const value = safeParse(safeGet(storage, CLASSIC_BURGER_SETTLEMENTS_KEY), []);
  return Array.isArray(value) ? value.filter((item) => item && typeof item.id === "string") : [];
}

export function settleClassicBurgerAttempt(attempt, result, {
  storage,
  now = Date.now(),
} = {}) {
  const settlements = normalizedSettlements(storage);
  const existing = settlements.find((item) => item.id === attempt?.id);
  if (existing) {
    return Object.freeze({
      awarded: false,
      coins: finiteCount(existing.coins),
      totalCoins: finiteCount(existing.totalCoins),
      attempt: Object.freeze({ ...attempt, completedAt: existing.completedAt ?? attempt?.completedAt }),
    });
  }

  const homeProgress = normalizeHomeProgress(safeParse(safeGet(storage, HOME_PROGRESS_KEY), null));
  const coins = finiteCount(result?.coins);
  const nextProgress = normalizeHomeProgress({ ...homeProgress, coins: homeProgress.coins + coins });
  const completedAt = Math.max(0, Math.round(Number(now) || 0));
  const completedAttempt = Object.freeze({ ...attempt, completedAt });
  const settlement = Object.freeze({
    id: attempt.id,
    completedAt,
    score: finiteCount(result?.score),
    coins,
    totalCoins: nextProgress.coins,
  });

  const progressSaved = safeSet(storage, HOME_PROGRESS_KEY, JSON.stringify(nextProgress));
  const ledgerSaved = safeSet(
    storage,
    CLASSIC_BURGER_SETTLEMENTS_KEY,
    JSON.stringify([...settlements, settlement].slice(-32)),
  );
  safeSet(storage, CLASSIC_BURGER_ATTEMPT_KEY, JSON.stringify(completedAttempt));

  return Object.freeze({
    awarded: progressSaved && ledgerSaved,
    coins,
    totalCoins: nextProgress.coins,
    attempt: completedAttempt,
  });
}
