import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("cooking page uses a clean first-person counter without puppet scenery", async () => {
  const html = await readFile(new URL("cooking.html", root), "utf8");

  assert.match(html, /class="first-person-cooking"/);
  assert.match(html, /data-experience="first-person-counter"/);
  assert.match(html, /id="cooking-action-label"/);
  assert.match(html, /id="first-person-hands"/);
  assert.match(html, /first-person-puppet-hand\.png/);
  assert.doesNotMatch(html, /silver-puppet-booth-frame\.png/);
  assert.doesNotMatch(html, /puppet-booth-strings\.png/);
  assert.doesNotMatch(html, /marionette-rig\.png/);
  assert.doesNotMatch(html, /puppet-chef-(?:body|arm-left|arm-right)\.png/);
  assert.match(html, /id="puppet-order-progress"/);
  assert.match(html, /id="puppet-order-progress">0\/6/);
  assert.match(html, /id="finish-reaction"/);
  assert.match(html, /id="finish-score"/);
  assert.match(html, /id="finish-coins"/);
  assert.match(html, /data-action="view-finished">查看成品/);
  assert.match(html, /data-action="restart">再做一份/);
  assert.match(html, /data-action="finish"/);
  assert.match(html, /data-action="reset">重做订单/);
  assert.match(html, /data-control-grammar="drag-place condiment-rack-swipe hold-assign lift-squeeze undo serve"/);
  assert.match(html, /右侧调料罐可左右滑换酱、长按指定、上拖取用/);
  assert.doesNotMatch(html, /id="sauce-capsule"/);
  assert.doesNotMatch(html, /🍔|🧀|🥩|🏙️|✦/u);
});

test("cooking loader and app wire the fixed burger loop without a puppet performer", async () => {
  const [loader, app, css, hands] = await Promise.all([
    readFile(new URL("cooking-loader.mjs", root), "utf8"),
    readFile(new URL("cooking-solo-app.mjs", root), "utf8"),
    readFile(new URL("cooking.css", root), "utf8"),
    readFile(new URL("cooking-first-person-hands.mjs", root), "utf8"),
  ]);

  assert.doesNotMatch(loader, /importPuppetPerformer/);
  assert.doesNotMatch(loader, /puppetPerformer/);
  assert.match(loader, /importFirstPersonHands/);
  assert.match(loader, /handPerformer\?\.handleStageChange\?\.\(detail\)/);
  assert.match(loader, /handPerformer\?\.handleToolGesture\?\.\(detail\)/);
  assert.match(loader, /handPerformer\?\.handleIngredientGesture\?\.\(detail\)/);
  assert.match(loader, /onInteractionPause: \(detail\) => handPerformer\?\.handleStageChange\?\.\(detail\)/);
  assert.match(loader, /dataset\.debugIngredientTrace/);
  assert.match(loader, /dataset\.debug/);
  assert.match(loader, /dataset\.workbenchControls/);
  assert.match(loader, /searchParams\.get\("workbenchControls"\) === "1"/);
  assert.match(app, /chooseRecipe\(CLASSIC_BURGER_RECIPE_ID, \{ resume: false \}\)/);
  assert.match(app, /evaluateClassicBurger/);
  assert.match(app, /validateClassicTransition/);
  assert.match(app, /settleClassicBurgerAttempt/);
  assert.match(app, /stage\.setCameraLocked\?\.\(true\)/);
  assert.match(app, /directCondimentPickup: false/);
  assert.match(app, /createCondimentRackControls/);
  assert.doesNotMatch(app, /createSauceCapsuleGesture/);
  assert.match(app, /stage\.beginCondimentSlotGesture\?\.\(slotId, event\)/);
  assert.match(app, /stage\.endSauceGesture\?\.\(event\)/);
  assert.match(app, /onToolGesture/);
  assert.match(app, /onIngredientGesture/);
  assert.match(app, /onInteractionPause/);
  const stage = await readFile(new URL("cooking-solo-stage.mjs", root), "utf8");
  assert.match(stage, /reason: "reset-fit"/);
  assert.match(stage, /onSauceTool: onToolGesture/);
  assert.match(stage, /onIngredientGesture/);
  assert.match(stage, /onInteractionPause\(Object\.freeze\(\{ reason: "interaction-paused" \}\)\)/);
  assert.match(stage, /selectableSurfacesForLayer/);
  assert.match(stage, /state\.locations\[layerId\]\?\.kind !== "bin"/);
  assert.match(stage, /surfaces\.push\(station\.surface\)/);
  assert.match(stage, /registeredLayerSurfaces = new Map\(\)/);
  assert.match(stage, /registeredLayerSurfaces\.delete\(layerId\)/);
  assert.match(stage, /registeredLayerSurfaces\.set\(layerId, layerSurfaces\)/);
  assert.match(stage, /tools\.setDockedVisible\?\.\(true\)/);
  assert.match(stage, /getCondimentRackControlAnchors/);
  assert.match(stage, /tools\.getBySlot\?\.\(slotId\)\?\.body/);
  const interaction = await readFile(
    new URL("cooking-interaction-controller.mjs", root),
    "utf8",
  );
  assert.match(interaction, /sauceToolDetail\(session, "start"\)/);
  assert.match(interaction, /sauceToolDetail\(session, "move"\)/);
  assert.match(interaction, /sauceToolDetail\(session, "end", endReason\)/);
  assert.match(interaction, /ingredientGestureDetail\(transactionSession, "start"\)/);
  assert.match(interaction, /ingredientGestureDetail\(dragSession, "move"\)/);
  assert.match(interaction, /ingredientGestureDetail\(dragSession, "end", "pointer-up"\)/);
  assert.match(interaction, /event\?\.key !== "Escape"/);
  assert.match(interaction, /cancelGesture\("escape"\)/);
  assert.match(interaction, /directCondimentPickupEnabled/);
  assert.match(interaction, /beginCondimentSlotGesture\(slotId, event\)/);
  assert.match(interaction, /condimentTools\?\.getBySlot\?\.\(slotId\)/);
  assert.match(interaction, /release-outside-burger/);
  assert.match(interaction, /committed,/);
  assert.match(css, /\.first-person-cooking \.cooking-stage/);
  assert.match(css, /\.first-person-cooking \.first-person-action-label/);
  assert.match(
    css,
    /\.first-person-hand--left img \{ transform: rotate\(68deg\) scaleX\(-1\); \}/,
  );
  assert.match(
    css,
    /\.first-person-hand--right img \{ transform: rotate\(-68deg\); \}/,
  );
  assert.match(css, /data-hand-state="sauce-hold"/);
  assert.match(css, /data-hand-state="ingredient-hold"/);
  assert.match(hands, /case "interaction-paused"/);
  assert.match(
    css,
    /@media \(max-width: 700px\)[\s\S]*?\.first-person-cooking \.recipe-reference \{[\s\S]*?position: relative;/,
  );
  assert.match(
    css,
    /@media \(max-width: 700px\)[\s\S]*?\.first-person-cooking #cooking-canvas \{ height: 100%; \}/,
  );
  assert.match(css, /\.first-person-cooking \.workbench-slot-controls \{ display: none; \}/);
  assert.match(
    css,
    /\.first-person-cooking\[data-workbench-controls="true"\] \.workbench-slot-controls \{ display: block; \}/,
  );
  assert.match(css, /data-control-mode="condiment-rack"/);
  assert.match(css, /\.condiment-rack-control/);
  assert.match(css, /\.condiment-rack-picker__item/);
  assert.match(css, /\.first-person-cooking\[data-debug="true"\] \.header-actions/);
  assert.match(css, /touch-action: none/);
});
