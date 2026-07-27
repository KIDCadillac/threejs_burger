"""Build compact WebP files from locally generated burger-truck PNG sources.

The raw PNG files are intentionally not committed. Place regenerated files under
``art/home/layered-truck`` with the names in ``ASSETS`` before running this tool.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "art" / "home" / "layered-truck"

ASSETS = {
    "silver-truck-body.png": ("silver-truck-body.webp", 1600, True),
    "silver-truck-wheel.png": ("silver-truck-wheel.webp", 560, True),
    "silver-truck-shutter.png": ("silver-truck-shutter.webp", 1280, True),
    "service-window-centered.png": ("service-window-centered.webp", 1300, False),
    "menu-burger.png": ("menu-burger.webp", 520, False),
    "menu-fries.png": ("menu-fries.webp", 520, False),
    "menu-drink.png": ("menu-drink.webp", 520, False),
}


def crop_alpha(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    bbox = rgba.getchannel("A").getbbox()
    return rgba.crop(bbox) if bbox else rgba


def resize_to_width(image: Image.Image, max_width: int) -> Image.Image:
    if image.width <= max_width:
        return image
    height = round(image.height * max_width / image.width)
    return image.resize((max_width, height), Image.Resampling.LANCZOS)


def main() -> None:
    for source_name, (output_name, max_width, use_alpha_crop) in ASSETS.items():
        source = ASSET_DIR / source_name
        output = ASSET_DIR / output_name
        if not source.exists():
            print(f"skip missing source: {source_name}")
            continue
        with Image.open(source) as opened:
            image = crop_alpha(opened) if use_alpha_crop else opened.convert("RGB")
            image = resize_to_width(image, max_width)
            image.save(
                output,
                "WEBP",
                quality=88,
                method=6,
                lossless=use_alpha_crop,
            )
            print(f"{source_name} -> {output_name}: {image.width}x{image.height}")


if __name__ == "__main__":
    main()
