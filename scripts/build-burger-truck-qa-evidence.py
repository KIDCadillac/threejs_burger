"""Create visual QA evidence for the silver burger-truck redesign."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "art" / "home" / "layered-truck"
OUTPUT_DIR = ROOT / "output" / "burger-truck-silver"
ARRIVAL = OUTPUT_DIR / "browser-arrival-phone.png"
FINAL = OUTPUT_DIR / "browser-final-phone.png"

ASSETS = [
    ("silver truck body", "silver-truck-body.webp"),
    ("matching wheel", "silver-truck-wheel.webp"),
    ("silver shutter", "silver-truck-shutter.webp"),
    ("centered chef window", "service-window-centered.webp"),
    ("burger menu card", "menu-burger.webp"),
    ("fries menu card", "menu-fries.webp"),
    ("drink menu card", "menu-drink.webp"),
]


def checkerboard(size: tuple[int, int], tile: int = 14) -> Image.Image:
    image = Image.new("RGB", size, "#f4f0e8")
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            if (x // tile + y // tile) % 2:
                draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill="#ded8cf")
    return image


def fit_panel(source: Image.Image, size: tuple[int, int], background: str) -> Image.Image:
    panel = Image.new("RGB", size, background)
    contained = ImageOps.contain(source.convert("RGB"), size, Image.Resampling.LANCZOS)
    panel.paste(contained, ((size[0] - contained.width) // 2, (size[1] - contained.height) // 2))
    return panel


def build_comparison(before_arrival: Path, before_final: Path) -> None:
    paths = (before_arrival, ARRIVAL, before_final, FINAL)
    images: list[Image.Image] = []
    for path in paths:
        with Image.open(path) as source:
            images.append(source.copy())

    panel_size = (372, 720)
    label_height = 46
    gap = 18
    canvas = Image.new(
        "RGB",
        (panel_size[0] * 2 + gap, (panel_size[1] + label_height) * 2 + gap),
        "#241b17",
    )
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    entries = (
        ("BEFORE: assembled yellow truck", images[0]),
        ("AFTER: coherent silver truck", images[1]),
        ("BEFORE: off-center arms-only focus", images[2]),
        ("AFTER: centered chef and burger", images[3]),
    )
    for index, (label, image) in enumerate(entries):
        column = index % 2
        row = index // 2
        x = column * (panel_size[0] + gap)
        y = row * (panel_size[1] + label_height + gap)
        canvas.paste(fit_panel(image, panel_size, "#f8d36d"), (x, y + label_height))
        draw.text((x + 12, y + 16), label, fill="#fff4d8", font=font)
    canvas.save(OUTPUT_DIR / "before-vs-silver.png", optimize=True)


def build_contact_sheet() -> None:
    cell = (420, 270)
    label_height = 30
    columns = 3
    rows = 3
    sheet = Image.new("RGB", (cell[0] * columns, (cell[1] + label_height) * rows), "#30241e")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, (label, filename) in enumerate(ASSETS):
        x = (index % columns) * cell[0]
        y = (index // columns) * (cell[1] + label_height)
        background = checkerboard(cell)
        with Image.open(ASSET_DIR / filename) as asset:
            thumb = ImageOps.contain(
                asset.convert("RGBA"),
                (cell[0] - 24, cell[1] - 24),
                Image.Resampling.LANCZOS,
            )
            background.paste(
                thumb,
                ((cell[0] - thumb.width) // 2, (cell[1] - thumb.height) // 2),
                thumb,
            )
        sheet.paste(background, (x, y))
        draw.text((x + 10, y + cell[1] + 10), label, fill="#fff4d8", font=font)
    sheet.save(OUTPUT_DIR / "silver-assets.png", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--before-arrival", required=True, type=Path)
    parser.add_argument("--before-final", required=True, type=Path)
    args = parser.parse_args()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    build_comparison(args.before_arrival, args.before_final)
    build_contact_sheet()


if __name__ == "__main__":
    main()
