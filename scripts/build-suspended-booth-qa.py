"""Normalize the browser capture and build a before/after QA sheet."""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "suspended-booth"
RAW_CAPTURE = OUTPUT / "browser-card-raw.png"
PREVIOUS_CAPTURE = ROOT / "output" / "marionette-truck" / "final-mobile.png"
FINAL_CAPTURE = OUTPUT / "final-mobile.png"
COMPARISON = OUTPUT / "reference-vs-suspended-booth.png"

TARGET_SIZE = (560, 1200)


def normalize_capture() -> Image.Image:
    raw = Image.open(RAW_CAPTURE).convert("RGB")
    width = min(TARGET_SIZE[0], raw.width)
    height = min(TARGET_SIZE[1], raw.height)
    cropped = raw.crop((0, 0, width, height))

    bottom_color = cropped.getpixel((width // 2, height - 1))
    normalized = Image.new("RGB", TARGET_SIZE, bottom_color)
    normalized.paste(cropped, (0, 0))
    normalized.save(FINAL_CAPTURE, optimize=True)
    return normalized


def build_comparison(current: Image.Image) -> None:
    previous = Image.open(PREVIOUS_CAPTURE).convert("RGB").resize(TARGET_SIZE)
    sheet = Image.new("RGB", (1144, 1246), "#201916")
    draw = ImageDraw.Draw(sheet)
    draw.text((12, 12), "BEFORE - full vehicle", fill="#ffe2a0")
    draw.text((584, 12), "AFTER - suspended service booth", fill="#ffe2a0")
    sheet.paste(previous, (12, 34))
    sheet.paste(current, (584, 34))
    sheet.save(COMPARISON, optimize=True)


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    normalized_capture = normalize_capture()
    build_comparison(normalized_capture)
    print(FINAL_CAPTURE)
    print(COMPARISON)
