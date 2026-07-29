"""Build the transparent marionette control-bar overlay used on the home card.

The asset is intentionally geometric and flat so it matches the existing
hand-drawn UI instead of introducing another generated illustration style.
"""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "art" / "home" / "layered-truck" / "marionette-rig.png"
SCALE = 4
WIDTH = 764
HEIGHT = 1044


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
    scaled_box((239, 132, 525, 160)),
    radius=12 * SCALE,
    fill=outline,
)
draw.rounded_rectangle(
    scaled_box((244, 136, 520, 155)),
    radius=8 * SCALE,
    fill=wood,
)
draw.rounded_rectangle(
    scaled_box((256, 139, 508, 144)),
    radius=2 * SCALE,
    fill=wood_light,
)
draw.rounded_rectangle(
    scaled_box((268, 150, 496, 154)),
    radius=2 * SCALE,
    fill=wood_shadow,
)

# Short central grip, like a stagehand's marionette controller.
draw.rounded_rectangle(
    scaled_box((368, 121, 396, 173)),
    radius=10 * SCALE,
    fill=outline,
)
draw.rounded_rectangle(
    scaled_box((373, 125, 391, 169)),
    radius=6 * SCALE,
    fill=wood,
)
draw.rounded_rectangle(
    scaled_box((377, 128, 383, 163)),
    radius=3 * SCALE,
    fill=wood_light,
)

# Two pairs of cords terminate around the truck roof and sign. Double strokes
# keep them visible on both the teal shutters and the warm shop background.
cords = (
    ((286, 153), (270, 570)),
    ((333, 154), (344, 594)),
    ((431, 154), (420, 594)),
    ((478, 153), (494, 570)),
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
for x, y in ((270, 570), (344, 594), (420, 594), (494, 570)):
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
