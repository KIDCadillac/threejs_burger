"""Build readable before/after evidence for the in-app UI motion editor."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "layout-editor-audit"
BEFORE = OUTPUT / "01-current-editor.png"
AFTER = OUTPUT / "02-ui-motion-workbench.png"


def first_browser_tile(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGB")
    # The Codex in-app browser screenshot is returned as a 3 × 3 tiled surface.
    return image.crop((0, 0, image.width // 3, image.height // 3))


def fit(image: Image.Image, width: int) -> Image.Image:
    height = round(image.height * width / image.width)
    return image.resize((width, height), Image.Resampling.LANCZOS)


def label_font(size: int) -> ImageFont.ImageFont:
    candidates = [
        Path("C:/Windows/Fonts/msyhbd.ttc"),
        Path("C:/Windows/Fonts/msyh.ttc"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    before = fit(first_browser_tile(BEFORE), 1200)
    after = fit(first_browser_tile(AFTER), 1200)
    before.save(OUTPUT / "01-current-editor-crop.png", quality=94)
    after.save(OUTPUT / "02-ui-motion-workbench-crop.png", quality=94)

    header = 72
    gutter = 20
    canvas = Image.new(
        "RGB",
        (before.width + after.width + gutter, max(before.height, after.height) + header),
        "#171311",
    )
    draw = ImageDraw.Draw(canvas)
    font = label_font(26)
    draw.text((20, 18), "改造前：仅预设框排版", fill="#D5B9A4", font=font)
    draw.text(
        (before.width + gutter + 20, 18),
        "改造后：任意 UI + 动画时间轴",
        fill="#FFD26D",
        font=font,
    )
    canvas.paste(before, (0, header))
    canvas.paste(after, (before.width + gutter, header))
    canvas.save(OUTPUT / "03-before-after.png", quality=94)


if __name__ == "__main__":
    main()
