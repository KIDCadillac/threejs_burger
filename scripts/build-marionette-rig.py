"""Build the transparent marionette control-bar overlay used on the home card.

The booth is treated as one rigid piece of scenery, so it uses two clear
weight-bearing cords rather than the four busy strings from the full truck.
The asset is intentionally flat and geometric to match the existing game art.
"""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "art" / "home" / "layered-truck" / "marionette-rig.png"
SCALE = 4
WIDTH = 764
HEIGHT = 790


def scaled_box(box):
    return tuple(round(value * SCALE) for value in box)


canvas = Image.new("RGBA", (WIDTH * SCALE, HEIGHT * SCALE), (0, 0, 0, 0))
draw = ImageDraw.Draw(canvas)

outline = (60, 41, 28, 245)
wood = (184, 104, 52, 255)
wood_light = (239, 177, 87, 255)
wood_shadow = (116, 62, 37, 255)
cord_shadow = (60, 41, 28, 150)
cord_light = (255, 240, 197, 210)

# Horizontal theatre control bar.
draw.rounded_rectangle(
    scaled_box((178, 82, 586, 116)),
    radius=12 * SCALE,
    fill=outline,
)
draw.rounded_rectangle(
    scaled_box((184, 87, 580, 110)),
    radius=8 * SCALE,
    fill=wood,
)
draw.rounded_rectangle(
    scaled_box((201, 91, 563, 97)),
    radius=2 * SCALE,
    fill=wood_light,
)
draw.rounded_rectangle(
    scaled_box((219, 104, 545, 109)),
    radius=2 * SCALE,
    fill=wood_shadow,
)

# Short central grip, like a stagehand's marionette controller.
draw.rounded_rectangle(
    scaled_box((365, 67, 399, 130)),
    radius=10 * SCALE,
    fill=outline,
)
draw.rounded_rectangle(
    scaled_box((371, 72, 393, 125)),
    radius=6 * SCALE,
    fill=wood,
)
draw.rounded_rectangle(
    scaled_box((376, 77, 383, 118)),
    radius=3 * SCALE,
    fill=wood_light,
)

# Two load-bearing cords attach to the booth's upper frame. Fewer, stronger
# strings make the weight and suspension legible at mobile size.
cords = (
    ((238, 109), (108, 382)),
    ((526, 109), (656, 382)),
)
for start, end in cords:
    draw.line(
        (tuple(value * SCALE for value in start), tuple(value * SCALE for value in end)),
        fill=cord_shadow,
        width=3 * SCALE,
    )
    draw.line(
        (
            tuple(value * SCALE for value in (start[0] - 1, start[1])),
            tuple(value * SCALE for value in (end[0] - 1, end[1])),
        ),
        fill=cord_light,
        width=SCALE,
    )

# Small metal attachment eyes at the lower cord ends.
for x, y in ((108, 382), (656, 382)):
    draw.ellipse(
        scaled_box((x - 5, y - 5, x + 5, y + 5)),
        fill=outline,
    )
    draw.ellipse(
        scaled_box((x - 2, y - 2, x + 2, y + 2)),
        fill=wood_light,
    )

canvas = canvas.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
canvas.save(OUTPUT, optimize=True)
print(OUTPUT)
