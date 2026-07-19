export const SUPPORTED_SNACK_KINDS = Object.freeze([
  "fry",
  "nugget",
  "donut",
  "cookie",
  "onion-ring",
  "mochi",
]);

function hamburger(state) {
  const bitten = state === "bitten";
  const right = bitten ? "Q111 326 103 333 Q116 339 104 346 Q116 352 103 359 Q112 368 101 377" : "Q124 346 115 377";
  return `<g class="food-shape food-shape--burger" data-food-state="${state}">
    <path data-food-layer="bottom-bun" d="M38 376 Q76 390 115 377 ${right} Q77 406 38 377Z" fill="#d99138" stroke="#5d321f"/>
    <path data-food-layer="patty" d="M36 365 Q76 356 ${bitten ? "101 365 Q110 369 101 377" : "116 365 L116 378"} Q76 385 36 376Z" fill="#60372d" stroke="#35201e"/>
    <path data-food-layer="cheese" d="M36 356 Q76 350 ${bitten ? "103 358 L99 368" : "117 357 L112 369"} L91 366 L80 374 L68 366 L54 372 L37 366Z" fill="#ffd44d" stroke="#a86424"/>
    <path data-food-layer="tomato" d="M39 350 Q76 341 ${bitten ? "103 350 L100 359" : "114 349 L115 359"} Q76 366 39 359Z" fill="#e64f3d" stroke="#81302b"/>
    <path data-food-layer="lettuce" d="M36 343 Q48 333 59 341 Q70 330 81 340 Q93 330 ${bitten ? "103 342 L99 352" : "116 340 L114 352"} Q100 357 87 350 Q74 361 61 350 Q48 358 36 351Z" fill="#64a947" stroke="#315d31"/>
    <path data-food-layer="sauce" d="M48 337 Q65 347 82 337 Q94 332 ${bitten ? "102 340" : "107 337"}" fill="none" stroke="#f4e2a0" stroke-width="5" stroke-linecap="round"/>
    <path data-food-layer="top-bun" d="M36 340 Q39 310 76 306 Q111 307 ${bitten ? "108 326 Q98 331 105 337 Q101 342 96 347" : "119 339"} Q76 351 36 340Z" fill="#edae51" stroke="#653920"/>
    <path d="M49 327 Q75 313 102 327" fill="none" stroke="#ffd987" stroke-width="4" opacity=".8"/>
    ${bitten ? `<g data-bite-cross-section>
      <path data-cross-section-layer="bread" d="M101 320 Q112 325 103 333 Q113 339 103 346" fill="#f6d28b" stroke="#74462c" stroke-width="3"/>
      <path data-cross-section-layer="vegetable" d="M102 346 Q114 352 102 359" fill="none" stroke="#6fba51" stroke-width="6"/>
      <path data-cross-section-layer="cheese" d="M101 356 Q112 363 101 369" fill="none" stroke="#ffd44d" stroke-width="6"/>
      <path data-cross-section-layer="patty" d="M101 367 Q111 373 101 379" fill="none" stroke="#714237" stroke-width="8"/>
    </g>` : ""}
  </g>`;
}

function fries(state) {
  const bite = state === "bitten";
  return `<g class="food-shape food-shape--fries" data-food-state="${state}">
    <path d="M48 330 L53 ${bite ? 319 : 306} L63 308 L66 330 M64 330 L70 300 L80 302 L79 331 M79 331 L88 ${bite ? 316 : 305} L98 309 L94 334 M93 333 L104 313 L113 319 L105 344" fill="#f7c94d" stroke="#8b5427" stroke-width="8" stroke-linecap="round"/>
    <path d="M42 332 L111 332 L103 390 Q76 402 50 390Z" fill="#d84236" stroke="#5d2927" stroke-width="3"/>
    <path d="M54 344 Q76 354 99 344" fill="none" stroke="#ff7762" stroke-width="4"/>
    ${bite ? '<path data-bite-cross-section d="M48 322 Q57 317 64 323" fill="none" stroke="#fff0a6" stroke-width="4"/>' : ""}
  </g>`;
}

function donut(state) {
  const bite = state === "bitten";
  return `<g class="food-shape food-shape--donut" data-food-state="${state}">
    <path d="M35 348 Q40 315 77 311 Q112 313 ${bite ? "111 329 Q101 334 108 342 Q99 348 108 356 Q101 365 109 371" : "119 348"} Q113 387 76 393 Q39 388 35 348Z" fill="#d69048" stroke="#653822" stroke-width="3"/>
    <path d="M38 343 Q47 315 77 315 Q105 316 ${bite ? "105 330 Q96 336 104 343" : "116 342"} Q102 356 91 348 Q77 358 64 348 Q51 358 38 343Z" fill="#f482a6" stroke="#8f3d5c" stroke-width="3"/>
    <ellipse cx="76" cy="350" rx="14" ry="12" fill="#2b2030" stroke="#6c4228" stroke-width="4"/>
    ${bite ? '<path data-bite-cross-section d="M106 327 Q116 335 106 343 Q116 351 107 360" fill="none" stroke="#f1c58a" stroke-width="5"/>' : ""}
  </g>`;
}

function cookie(state) {
  const bite = state === "bitten";
  return `<g class="food-shape food-shape--cookie" data-food-state="${state}">
    <path d="M38 350 Q39 315 76 309 Q109 310 ${bite ? "112 326 Q101 333 110 342 Q101 350 110 360 Q104 370 112 376" : "119 351"} Q112 390 76 394 Q39 390 38 350Z" fill="#c98547" stroke="#5d3525" stroke-width="3"/>
    <g fill="#4f3027"><circle cx="58" cy="337" r="5"/><circle cx="78" cy="325" r="4"/><circle cx="85" cy="365" r="5"/><circle cx="57" cy="371" r="4"/></g>
    ${bite ? '<path data-bite-cross-section d="M108 324 Q119 332 108 341 Q118 350 108 360 Q118 369 109 378" fill="none" stroke="#edbd78" stroke-width="5"/>' : ""}
  </g>`;
}

function onionRing(state) {
  const bite = state === "bitten";
  return `<g class="food-shape food-shape--ring" data-food-state="${state}">
    <path d="M35 351 Q38 315 76 310 Q109 311 ${bite ? "111 328 Q100 336 109 345 Q99 354 109 362 Q102 373 110 379" : "118 350"} Q115 388 76 394 Q38 390 35 351Z M56 351 Q58 369 77 372 Q94 369 98 350 Q95 331 76 330 Q58 333 56 351Z" fill="#e4a94b" fill-rule="evenodd" stroke="#724022" stroke-width="4"/>
    ${bite ? '<path data-bite-cross-section d="M108 327 Q117 337 107 346 Q118 355 108 365" fill="none" stroke="#f4d08a" stroke-width="5"/>' : ""}
  </g>`;
}

function mochi(state) {
  const bite = state === "bitten";
  return `<g class="food-shape food-shape--mochi" data-food-state="${state}">
    <path d="M38 370 Q40 323 75 315 Q108 318 ${bite ? "109 333 Q99 340 108 349 Q99 357 109 366 Q103 374 108 382" : "116 370"} Q105 396 76 398 Q47 396 38 370Z" fill="#e9d7bd" stroke="#684936" stroke-width="3"/>
    <path d="M48 374 Q76 386 ${bite ? "102 374" : "108 372"}" fill="none" stroke="#bd4e6d" stroke-width="8"/>
    ${bite ? '<path data-bite-cross-section d="M107 331 Q116 340 106 349 Q116 358 107 367" fill="none" stroke="#fff3dc" stroke-width="6"/>' : ""}
  </g>`;
}

const BUILDERS = Object.freeze({
  fry: fries,
  nugget: hamburger,
  donut,
  cookie,
  "onion-ring": onionRing,
  mochi,
});

export function foodAssemblyMarkup(snackKind) {
  const safeKind = Object.hasOwn(BUILDERS, snackKind) ? snackKind : "nugget";
  const build = BUILDERS[safeKind];
  return `<g data-food-assembly data-snack-kind="${safeKind}">
    ${build("whole")}
    ${build("bitten")}
  </g>`;
}
