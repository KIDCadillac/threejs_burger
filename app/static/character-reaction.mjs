import {
  REACTION_DURATION_MS,
  REACTION_PHASES,
  captionForPhase,
  resolveReactionPlan,
} from "./reaction-model.mjs";
import { foodAssemblyMarkup } from "./food-assembly.mjs";

const MARKUP_ESCAPES = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
});

let nextInstanceId = 0;

export function createReactionSchedule() {
  return [
    ...REACTION_PHASES.map(({ name, at, caption }) => ({
      phase: name,
      at,
      caption,
    })),
    { phase: "complete", at: REACTION_DURATION_MS },
  ];
}

export function playCharacterReaction(root, sauces, options = {}) {
  const {
    scheduleTimeout = globalThis.setTimeout.bind(globalThis),
    cancelTimeout = globalThis.clearTimeout.bind(globalThis),
    onPhase = () => {},
    onComplete = () => {},
  } = options;
  const plan = resolveReactionPlan(sauces);
  let stopped = false;

  root.dataset.primaryReaction = plan?.primary ?? "none";
  root.dataset.primaryIntensity = String(plan?.primaryIntensity ?? 0);
  root.dataset.secondaryReaction = plan?.secondary ?? "none";
  root.dataset.secondaryIntensity = String(plan?.secondaryIntensity ?? 0);
  root.dataset.secondaryConsumed = "false";
  root.dataset.foodBitten = "false";
  root.dataset.phase = "notice";

  const handles = new Set();
  createReactionSchedule().forEach((event) => {
    let handle;
    handle = scheduleTimeout(() => {
      handles.delete(handle);
      if (stopped) return;

      if (event.phase === "complete") {
        stopped = true;
        onComplete();
        return;
      }

      root.dataset.phase = event.phase;
      if (event.phase === "bite") root.dataset.foodBitten = "true";
      if (event.phase === "recover" && plan?.secondary) {
        root.dataset.secondaryConsumed = "true";
      }
      const caption = root.querySelector("[data-reaction-caption]");
      if (caption) caption.textContent = captionForPhase(event.phase, plan);
      onPhase(event.phase, plan);
    }, event.at);
    handles.add(handle);
  });

  return {
    cancel() {
      if (stopped) return;
      stopped = true;
      handles.forEach((handle) => cancelTimeout(handle));
      handles.clear();
    },
  };
}

function escapeMarkup(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => (
    MARKUP_ESCAPES[character]
  ));
}

export function characterReactionMarkup({ victim, snackKind }) {
  const foodMarkup = foodAssemblyMarkup(snackKind);
  const safeVictim = escapeMarkup(victim);
  const instancePrefix = `character-reaction-${nextInstanceId += 1}`;
  const skinId = `${instancePrefix}-skin`;
  const hoodieId = `${instancePrefix}-hoodie`;
  const fireId = `${instancePrefix}-fire`;
  const titleId = `${instancePrefix}-title`;

  return `
    <section class="character-reaction" data-character-reaction data-phase="notice" data-food-bitten="false" tabindex="-1">
      <p class="reaction-caption" data-reaction-caption>看起来还挺正常……</p>
      <svg class="reaction-rig" viewBox="0 0 390 500" role="img" aria-labelledby="${titleId}">
        <title id="${titleId}">${safeVictim}的完整进食动画</title>
        <defs>
          <linearGradient id="${skinId}" x1="0" y1="0" x2="1" y2="1">
            <stop stop-color="#ffd5b5"/>
            <stop offset="1" stop-color="#d98e70"/>
          </linearGradient>
          <linearGradient id="${hoodieId}" x1="0" y1="0" x2="1" y2="1">
            <stop stop-color="#738a67"/>
            <stop offset="1" stop-color="#344b3b"/>
          </linearGradient>
          <radialGradient id="${fireId}" cx="30%" cy="50%" r="70%">
            <stop stop-color="#fff49a"/>
            <stop offset=".45" stop-color="#ffae32"/>
            <stop offset="1" stop-color="#f0442f"/>
          </radialGradient>
        </defs>

        <ellipse class="rig-shadow" cx="198" cy="472" rx="102" ry="16"/>
        <g class="rig-person">
          <g data-bone="torso">
            <path class="rig-hoodie" fill="url(#${hoodieId})" d="M126 237 Q194 205 262 237 L282 405 Q198 438 108 405Z"/>
            <path class="rig-pocket" d="M151 345 Q195 369 239 345 L230 392 Q195 408 160 392Z"/>
            <path class="rig-hoodie-string" d="M179 237 L176 280 M211 237 L214 280"/>
          </g>

          <g data-bone="head">
            <ellipse class="rig-neck" fill="url(#${skinId})" cx="195" cy="241" rx="28" ry="37"/>
            <path class="rig-face" fill="url(#${skinId})" d="M121 116 Q194 53 270 115 L258 217 Q196 270 132 216Z"/>
            <g data-bone="hair">
              <path class="rig-hair" d="M119 132 Q113 54 178 66 Q222 28 274 83 Q301 119 263 151 Q251 106 216 105 Q164 119 126 166Z"/>
            </g>
            <g class="rig-eyes">
              <ellipse cx="165" cy="160" rx="9" ry="13"/>
              <ellipse cx="226" cy="160" rx="9" ry="13"/>
            </g>
            <path class="rig-brow rig-brow--left" d="M147 137 Q165 126 181 137"/>
            <path class="rig-brow rig-brow--right" d="M210 137 Q229 126 244 139"/>
            <path class="rig-mouth rig-mouth--closed" d="M177 205 Q196 215 216 204"/>
            <ellipse class="rig-mouth rig-mouth--open" cx="197" cy="207" rx="25" ry="19"/>
            <g data-effect="mouth-anchor">
              <g data-effect="fire">
                <path class="fire-outer" fill="url(#${fireId})" d="M237 203 C286 171 301 215 359 180 C335 229 367 249 293 252 C266 248 246 235 229 218Z"/>
                <path class="fire-core" d="M246 209 C282 195 297 221 330 205 C309 235 280 236 246 220Z"/>
              </g>
              <g data-effect="sneeze">
                <path d="M230 185 Q267 165 295 183"/><path d="M238 193 Q274 186 303 203"/>
                <circle cx="281" cy="174" r="5"/><circle cx="307" cy="198" r="4"/>
              </g>
              <g data-effect="sticky-strands">
                <path d="M181 207 Q157 223 145 251"/><path d="M211 208 Q237 225 247 252"/>
              </g>
            </g>
          </g>

          <g data-bone="left-arm">
            <path class="rig-sleeve" fill="url(#${hoodieId})" d="M138 251 Q95 266 79 327 L112 341 Q132 303 166 283Z"/>
            <g data-bone="left-hand" data-hand-layer="base">
              <path class="rig-hand" fill="url(#${skinId})" d="M78 319 Q59 321 56 340 Q60 358 79 354 L107 337Z"/>
              <path class="rig-finger" fill="url(#${skinId})" d="M65 329 Q78 324 91 333"/>
            </g>
          </g>

          <g data-bone="right-arm">
            <path class="rig-sleeve" fill="url(#${hoodieId})" d="M252 249 Q296 264 314 324 L282 340 Q263 303 230 283Z"/>
            <g data-bone="right-hand">
              <path class="rig-hand" fill="url(#${skinId})" d="M308 316 Q328 318 331 337 Q327 356 307 352 L280 335Z"/>
            </g>
          </g>

          <g class="rig-legs">
            <path class="rig-pants" d="M132 397 L188 397 L178 466 L120 466Z"/>
            <path class="rig-pants" d="M204 397 L259 397 L270 466 L212 466Z"/>
            <path class="rig-shoe" d="M119 449 Q150 445 180 463 L179 478 L107 478 Q105 462 119 449Z"/>
            <path class="rig-shoe" d="M211 463 Q241 445 271 450 Q286 462 284 478 L212 478Z"/>
          </g>
        </g>

        <g data-prop="food">
          <g data-hand-layer="back">
            <path class="rig-hand" fill="url(#${skinId})" d="M91 328 Q111 316 126 331 Q135 350 120 369 Q109 380 94 367 Q101 347 91 328Z"/>
          </g>
          ${foodMarkup}
          <g data-hand-layer="front">
            <path class="rig-finger" fill="url(#${skinId})" d="M96 341 Q111 335 121 343 Q124 351 116 356 Q106 350 97 357Z"/>
            <path class="rig-finger" fill="url(#${skinId})" d="M93 358 Q108 353 119 361 Q121 369 113 373 Q103 367 94 374Z"/>
          </g>
          <g class="food-crumbs">
            <circle cx="70" cy="336" r="4"/>
            <circle cx="91" cy="347" r="3"/>
            <circle cx="104" cy="330" r="2"/>
          </g>
        </g>

        <g data-effect="heat">
          <path d="M260 83 Q282 57 270 32"/>
          <path d="M292 105 Q320 80 306 51"/>
        </g>
        <g data-effect="sweat">
          <path d="M274 161 Q294 185 275 200 Q256 184 274 161Z"/>
        </g>
        <g data-effect="sour-wave">
          <path d="M116 139 Q92 160 116 181 Q140 202 116 223"/>
          <path d="M278 139 Q302 160 278 181 Q254 202 278 223"/>
        </g>
        <g data-effect="secondary">
          <g data-secondary-effect="chili"><path d="M287 235 Q307 216 322 239 Q306 255 287 235Z"/></g>
          <g data-secondary-effect="mustard"><circle cx="289" cy="174" r="8"/><circle cx="308" cy="165" r="4"/></g>
          <g data-secondary-effect="sour"><path d="M111 203 Q91 219 111 235"/></g>
          <g data-secondary-effect="sticky"><path d="M155 216 Q135 239 151 258"/></g>
        </g>
      </svg>
      <p class="victim-label">${safeVictim}正在努力表情管理</p>
    </section>`;
}
