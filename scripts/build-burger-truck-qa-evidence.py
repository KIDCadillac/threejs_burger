"""Create visual QA evidence for the layered burger-truck scene."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "art" / "home" / "layered-truck"
OUTPUT_DIR = ROOT / "output" / "burger-truck-layered"
IMPLEMENTATION = OUTPUT_DIR / "browser-final-phone-v3.png"

ASSETS = [
    ("truck body", "truck-body.webp"),
    ("wheel", "truck-wheel.webp"),
    ("service window", "service-window.webp"),
    ("rolling shutter", "service-shutter.webp"),
    ("burger marquee", "burger-marquee.webp"),
    ("menu frame", "menu-frame.webp"),
    ("burger card", "menu-burger.webp"),
    ("fries card", "menu-fries.webp"),
    ("drink card", "menu-drink.webp"),
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


def build_comparison(reference_path: Path) -> None:
    reference = Image.open(reference_path)
    implementation = Image.open(IMPLEMENTATION)
    panel_size = (430, 760)
    label_height = 42
    gap = 22
    canvas = Image.new("RGB", (panel_size[0] * 2 + gap, panel_size[1] + label_height), "#2b211c")
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    canvas.paste(fit_panel(reference, panel_size, "#f8d36d"), (0, label_height))
    canvas.paste(fit_panel(implementation, panel_size, "#f8d36d"), (panel_size[0] + gap, label_height))
    draw.text((12, 14), "SOURCE: selected service-window direction", fill="#fff4d8", font=font)
    draw.text((panel_size[0] + gap + 12, 14), "IMPLEMENTATION: layered final camera", fill="#fff4d8", font=font)
    canvas.save(OUTPUT_DIR / "reference-vs-layered-final.png", optimize=True)


def build_contact_sheet() -> None:
    cell = (360, 250)
    label_height = 30
    sheet = Image.new("RGB", (cell[0] * 3, (cell[1] + label_height) * 3), "#30241e")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, (label, filename) in enumerate(ASSETS):
        x = (index % 3) * cell[0]
        y = (index // 3) * (cell[1] + label_height)
        background = checkerboard(cell)
        with Image.open(ASSET_DIR / filename) as asset:
            thumb = ImageOps.contain(asset.convert("RGBA"), (cell[0] - 24, cell[1] - 24), Image.Resampling.LANCZOS)
            background.paste(
                thumb,
                ((cell[0] - thumb.width) // 2, (cell[1] - thumb.height) // 2),
                thumb,
            )
        sheet.paste(background, (x, y))
        draw.text((x + 10, y + cell[1] + 10), label, fill="#fff4d8", font=font)
    sheet.save(OUTPUT_DIR / "layer-assets-contact-sheet.png", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", required=True, type=Path)
    args = parser.parse_args()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    build_comparison(args.reference)
    build_contact_sheet()


if __name__ == "__main__":
    main()
