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

function sandwich(state) {
  const bite = state === "bitten";
  const edge = bite
    ? "L100 337 Q110 343 101 350 Q111 357 100 365"
    : "L117 340 L116 366";
  return `<g class="food-shape food-shape--sandwich" data-food-state="${state}">
    <path data-food-layer="bread-bottom" d="M38 363 L76 340 ${bite ? "L101 356 Q111 362 101 370" : "L116 362"} L77 393 L38 376Z" fill="#d69a4f" stroke="#65402a" stroke-width="3"/>
    <path data-food-layer="sandwich-filling" d="M38 353 L76 333 ${bite ? "L102 348 Q111 354 101 360" : "L116 353 L116 364"} L78 383 L38 367Z" fill="#68a94d" stroke="#315d31" stroke-width="4"/>
    <path d="M42 357 L76 342 ${bite ? "L99 353" : "L111 357"}" fill="none" stroke="#e95744" stroke-width="7" stroke-linecap="round"/>
    <path data-food-layer="bread-top" d="M37 340 L76 309 ${edge} L76 371 L37 354Z" fill="#efc77a" stroke="#65402a" stroke-width="3"/>
    <path d="M47 339 L76 318 ${bite ? "L97 338" : "L107 340"}" fill="none" stroke="#ffe1a0" stroke-width="5" opacity=".8"/>
    ${bite ? `<g data-bite-cross-section>
      <path data-cross-section-layer="bread" d="M99 336 Q111 343 101 350" fill="none" stroke="#fff0bd" stroke-width="7"/>
      <path data-cross-section-layer="vegetable" d="M101 350 Q111 356 100 362" fill="none" stroke="#73bb55" stroke-width="6"/>
      <path data-cross-section-layer="tomato" d="M101 358 Q110 364 100 370" fill="none" stroke="#e95744" stroke-width="4"/>
    </g>` : ""}
  </g>`;
}

function jellyCup(state) {
  const bite = state === "bitten";
  return `<g class="food-shape food-shape--jelly-cup" data-food-state="${state}">
    <path data-food-layer="jelly-cup" d="M39 333 Q76 324 113 333 L105 394 Q76 406 47 394Z" fill="#d9f5ef" fill-opacity=".42" stroke="#416d73" stroke-width="3"/>
    <path data-food-layer="jelly" d="M46 339 Q76 332 ${bite ? "101 339 Q111 347 102 355 Q111 363 101 371" : "107 339 L103 379"} Q76 391 49 380Z" fill="#9f70da" opacity=".68" stroke="#65418f" stroke-width="3"/>
    <ellipse cx="76" cy="333" rx="38" ry="10" fill="#eefbf7" fill-opacity=".55" stroke="#416d73" stroke-width="3"/>
    <path d="M55 350 Q59 370 57 383" fill="none" stroke="#ffffff" stroke-width="5" opacity=".55" stroke-linecap="round"/>
    ${bite ? '<path data-bite-cross-section d="M101 338 Q112 347 102 355 Q112 363 101 371" fill="none" stroke="#d8b6ff" stroke-width="6"/>' : ""}
  </g>`;
}

const BUILDERS = Object.freeze({
  fry: Object.freeze({ variant: "fries", build: fries }),
  nugget: Object.freeze({ variant: "hamburger", build: hamburger }),
  donut: Object.freeze({ variant: "donut", build: donut }),
  cookie: Object.freeze({ variant: "cookie", build: cookie }),
  "onion-ring": Object.freeze({ variant: "sandwich", build: sandwich }),
  mochi: Object.freeze({ variant: "jelly-cup", build: jellyCup }),
});

export function foodAssemblyMarkup(snackKind) {
  const safeKind = Object.hasOwn(BUILDERS, snackKind) ? snackKind : "nugget";
  const { build, variant } = BUILDERS[safeKind];
  return `<g data-food-assembly data-snack-kind="${safeKind}" data-food-variant="${variant}">
    ${build("whole")}
    ${build("bitten")}
  </g>`;
}
