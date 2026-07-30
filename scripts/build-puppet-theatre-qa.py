"""Normalize the in-app browser capture and build a visual QA sheet.

The desktop browser currently returns a 5120 x 2880 tiled capture. The first
tile contains one centered 420 px mobile composition. This script extracts
that composition and places it beside the user's flat-art reference and the
rejected cropped-booth version.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "booth-redesign-audit"
RAW = OUTPUT / "02-local-theatre-wide.jpg"
FINAL = OUTPUT / "03-puppet-theatre-final.png"
COMPARISON = OUTPUT / "04-reference-before-after.png"
ANIMATION = OUTPUT / "08-animation-contact-sheet.png"
REFERENCE = ROOT / "docs" / "art-direction" / "reference-flat-burger-game.png"
BEFORE = ROOT / "output" / "suspended-booth" / "final-mobile.png"

MOBILE_SIZE = (420, 900)


def crop_browser_tile(raw_path: Path) -> Image.Image:
    raw = Image.open(raw_path).convert("RGB")
    # First 1595 x 896 tile: the centered 382 px app occupies x ~= 774..1156.
    crop = raw.crop((755, 0, 1175, 896))
    canvas = Image.new("RGB", MOBILE_SIZE, crop.getpixel((0, crop.height - 1)))
    canvas.paste(crop, (0, 0))
    return canvas


def normalize_browser_capture() -> Image.Image:
    canvas = crop_browser_tile(RAW)
    canvas.save(FINAL, optimize=True)
    return canvas


def reference_phone() -> Image.Image:
    source = Image.open(REFERENCE).convert("RGB")
    phone = source.crop((25, 24, 152, 265))
    scaled = phone.resize((420, 797), Image.Resampling.LANCZOS)
    panel = Image.new("RGB", MOBILE_SIZE, "#f8c654")
    panel.paste(scaled, (0, 42))
    return panel


def build_comparison(current: Image.Image) -> None:
    reference = reference_phone()
    before = Image.open(BEFORE).convert("RGB").resize(
        MOBILE_SIZE,
        Image.Resampling.LANCZOS,
    )
    sheet = Image.new("RGB", (1300, 958), "#201916")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    labels = (
        "TARGET LANGUAGE - flat outlined diner",
        "REJECTED - severed vehicle crop",
        "NEW - complete puppet theatre booth",
    )
    for index, (label, panel) in enumerate(
        zip(labels, (reference, before, current)),
    ):
        x = 10 + index * 430
        draw.text((x, 12), label, fill="#ffe2a0", font=font)
        sheet.paste(panel, (x, 42))
    sheet.save(COMPARISON, optimize=True)


def build_animation_sheet() -> None:
    frame_paths = (
        OUTPUT / "24-motion-strings.jpg",
        OUTPUT / "25-motion-drop.jpg",
        OUTPUT / "26-motion-settle.jpg",
        OUTPUT / "27-motion-open.jpg",
    )
    labels = ("cords enter", "booth descends", "weighted settle", "shutter open")
    sheet = Image.new("RGB", (1740, 952), "#201916")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, (label, frame_path) in enumerate(zip(labels, frame_paths)):
        x = 10 + index * 430
        draw.text((x, 12), label, fill="#ffe2a0", font=font)
        sheet.paste(crop_browser_tile(frame_path), (x, 42))
    sheet.save(ANIMATION, optimize=True)


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    normalized = normalize_browser_capture()
    build_comparison(normalized)
    build_animation_sheet()
    print(FINAL)
    print(COMPARISON)
    print(ANIMATION)
