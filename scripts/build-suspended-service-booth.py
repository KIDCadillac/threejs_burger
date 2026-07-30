"""Derive the suspended service-booth frame from the approved silver truck art.

The source truck already contains a clean transparent service-window opening.
Cropping that section keeps the established line work and palette while
removing the cab, wheels, wheel arches, and all vehicle-specific silhouette.
"""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art" / "home" / "layered-truck" / "silver-truck-body.webp"
OUTPUT = (
    ROOT
    / "art"
    / "home"
    / "layered-truck"
    / "silver-service-booth-frame.png"
)

# The service half of the approved 1539 x 638 truck. The bottom cut stops
# above the rear wheel arch so the result reads as a hanging theatre booth.
CROP_BOX = (460, 0, 1539, 500)


def main() -> None:
    with Image.open(SOURCE) as opened:
        frame = opened.convert("RGBA").crop(CROP_BOX)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    frame.save(OUTPUT, optimize=True)
    print(f"{OUTPUT}: {frame.width}x{frame.height}")


if __name__ == "__main__":
    main()
