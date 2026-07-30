"""Build the two short cords that lower the puppet-theatre booth.

The previous horizontal control bar looked like a crane and the long diagonal
cords made the booth feel mechanically hoisted. Two near-vertical, slightly
imperfect cords are enough to communicate a hand-operated puppet stage.
"""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "art" / "home" / "layered-truck" / "puppet-booth-strings.png"
SCALE = 4
WIDTH = 764
HEIGHT = 790


def scaled_box(box):
    return tuple(round(value * SCALE) for value in box)


canvas = Image.new("RGBA", (WIDTH * SCALE, HEIGHT * SCALE), (0, 0, 0, 0))
draw = ImageDraw.Draw(canvas)

outline = (60, 41, 28, 205)
cord_shadow = (60, 41, 28, 160)
cord_light = (255, 240, 197, 205)
brass = (224, 159, 63, 255)

# The cords are almost vertical, with one-pixel-scale deviations that feel
# hand-tensioned rather than computer-perfect.
cords = (
    ((150, -8), (149, 70), (152, 145), (150, 220), (151, 280)),
    ((614, -8), (615, 74), (612, 150), (614, 224), (613, 280)),
)
for points in cords:
    scaled_points = [
        tuple(value * SCALE for value in point_value)
        for point_value in points
    ]
    draw.line(
        scaled_points,
        fill=cord_shadow,
        width=3 * SCALE,
        joint="curve",
    )
    draw.line(
        [(x - SCALE, y) for x, y in scaled_points],
        fill=cord_light,
        width=SCALE,
        joint="curve",
    )

# Small hook knots meet the frame's two brass attachment eyes.
for x, y in ((151, 280), (613, 280)):
    draw.ellipse(
        scaled_box((x - 5, y - 5, x + 5, y + 5)),
        fill=outline,
    )
    draw.ellipse(
        scaled_box((x - 2, y - 2, x + 2, y + 2)),
        fill=brass,
    )

canvas = canvas.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
canvas.save(OUTPUT, optimize=True)
print(OUTPUT)
