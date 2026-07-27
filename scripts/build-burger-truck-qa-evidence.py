"""Create visual QA evidence for the flat/AI hybrid burger-truck scene."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "art" / "home" / "layered-truck"
OUTPUT_DIR = ROOT / "output" / "burger-truck-hybrid"
ARRIVAL = OUTPUT_DIR / "browser-arrival-phone.png"
FINAL = OUTPUT_DIR / "browser-final-phone.png"

ASSETS = [
    ("service-window insert", "service-window.webp"),
    ("flat burger card", "menu-burger.webp"),
    ("flat fries card", "menu-fries.webp"),
    ("flat drink card", "menu-drink.webp"),
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


def crop_reference_phone(reference: Image.Image) -> Image.Image:
    """Isolate the phone mockup from the user's annotated reference screenshot."""
    width, height = reference.size
    if width >= 900 and height >= 300:
        return reference.crop((22, 18, 166, min(height - 10, 276)))
    return reference


def build_comparison(reference_path: Path) -> None:
    with Image.open(reference_path) as source:
        reference = crop_reference_phone(source.copy())
    with Image.open(ARRIVAL) as source:
        arrival = source.copy()
    with Image.open(FINAL) as source:
        final = source.copy()

    panel_size = (372, 744)
    label_height = 46
    gap = 18
    canvas = Image.new(
        "RGB",
        (panel_size[0] * 3 + gap * 2, panel_size[1] + label_height),
        "#241b17",
    )
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    entries = (
        ("SOURCE: flat mobile-game language", reference),
        ("ARRIVAL: full truck", arrival),
        ("FINAL: service-window focus", final),
    )
    for index, (label, image) in enumerate(entries):
        x = index * (panel_size[0] + gap)
        canvas.paste(fit_panel(image, panel_size, "#f8d36d"), (x, label_height))
        draw.text((x + 12, 16), label, fill="#fff4d8", font=font)
    canvas.save(OUTPUT_DIR / "reference-vs-hybrid.png", optimize=True)


def build_contact_sheet() -> None:
    cell = (420, 300)
    label_height = 30
    sheet = Image.new("RGB", (cell[0] * 2, (cell[1] + label_height) * 2), "#30241e")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, (label, filename) in enumerate(ASSETS):
        x = (index % 2) * cell[0]
        y = (index // 2) * (cell[1] + label_height)
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
    sheet.save(OUTPUT_DIR / "hybrid-raster-assets.png", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", required=True, type=Path)
    args = parser.parse_args()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    build_comparison(args.reference)
    build_contact_sheet()


if __name__ == "__main__":
    main()
