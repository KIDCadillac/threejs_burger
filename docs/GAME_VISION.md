# Game vision

## Core fantasy

The player runs a compact silver burger food truck. They face the open side serving window, receive an order, assemble a burger on a large workbench, serve it, see the customer's reaction, collect rewards, and immediately continue to the next customer.

The scene should feel warm, relaxed, cartoon-like, delicious, and tactile. It should be understandable within ten seconds by a child or a first-time player.

## Visual priority

1. Customer order and patience.
2. Large burger workbench and visible layers.
3. Ingredients and sauces within thumb or pointer reach.
4. Time, score, coins, combo, pause, reset, and trash.
5. Silver food-truck identity: metal body, rivets, serving hatch, wheel, striped awning, warm lamps, burger sign, and rotating menu lightbox.

The truck is the scene, not a decorative card behind a generic web interface.

## Responsive direction

- Desktop landscape: order/customer left, large workbench center, run status right, ingredients along the bottom.
- Mobile portrait: compact order at the top, workbench in the middle, horizontally scrollable ingredients at the bottom.
- Tablet: preserve the workbench as the largest region and avoid stretching a phone layout.

Target sizes include 1366×768, 1920×1080, 2048×1002, 768×1024, 390×844, and 375×812.

## Main loop

Each order contains a visible target recipe and time limit. The player selects or drags ingredients, stacks them, can undo or discard layers, serves the result, receives clear correctness and reward feedback, and meets the next customer without returning to a lobby.

The first complete run contains eight orders. Difficulty and ingredient variety rise gradually. The game supports correct and incorrect serving, timeout, combo, coins, results, persistence, and replay.

## Product boundaries

- Keep the current original naming and art direction; do not copy third-party branding or logos.
- Preserve sign-in, coins, saves, settings, feedback, and public-link testing.
- Future modes may reuse the workbench, but the single-player order run is the primary playable experience.

