"""Build the flat silver puppet-theatre booth used on the home card.

The old version was a literal crop from the truck body. Although it removed
the cab and wheels, it still read as a severed vehicle panel. This asset keeps
the approved silver/red/yellow palette while rebuilding the silhouette as a
complete hanging stage: a roof, striped valance, framed service opening, and a
deep apron. Everything is drawn into one transparent raster so the result
stays crisp and deliberately flat at mobile size.
"""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = (
    ROOT
    / "art"
    / "home"
    / "layered-truck"
    / "silver-puppet-booth-frame.png"
)

SCALE = 4
WIDTH = 960
HEIGHT = 720


def box(values):
    return tuple(round(value * SCALE) for value in values)


def point(value):
    return round(value * SCALE)


def rounded(draw, bounds, radius, *, fill, outline=None, width=1):
    draw.rounded_rectangle(
        box(bounds),
        radius=point(radius),
        fill=fill,
        outline=outline,
        width=point(width),
    )


def main() -> None:
    transparent = (0, 0, 0, 0)
    ink = (60, 41, 28, 255)
    silver = (207, 214, 211, 255)
    silver_light = (239, 237, 224, 255)
    silver_shadow = (166, 178, 177, 255)
    cream = (255, 239, 195, 255)
    red = (216, 73, 57, 255)
    yellow = (242, 188, 61, 255)
    brass = (224, 159, 63, 255)
    seam = (118, 101, 86, 110)

    frame = Image.new(
        "RGBA",
        (WIDTH * SCALE, HEIGHT * SCALE),
        transparent,
    )
    draw = ImageDraw.Draw(frame)

    # A self-contained theatre body, not a cropped section of a vehicle.
    rounded(
        draw,
        (16, 24, 944, 710),
        54,
        fill=ink,
    )
    rounded(
        draw,
        (28, 35, 932, 698),
        43,
        fill=silver,
    )

    # Flat roof cap and fast-food identity stripes.
    rounded(
        draw,
        (34, 40, 926, 154),
        37,
        fill=silver_light,
    )
    draw.rectangle(box((34, 75, 926, 111)), fill=red)
    draw.rectangle(box((34, 111, 926, 133)), fill=yellow)
    draw.line(
        (point(34), point(74), point(926), point(74)),
        fill=ink,
        width=point(7),
    )
    draw.line(
        (point(34), point(111), point(926), point(111)),
        fill=ink,
        width=point(6),
    )
    draw.line(
        (point(34), point(133), point(926), point(133)),
        fill=ink,
        width=point(7),
    )

    # Alternating valance blocks echo the user's original flat diner card.
    valance_left = 58
    valance_right = 902
    segment_width = (valance_right - valance_left) / 6
    for index in range(6):
        left = valance_left + segment_width * index
        right = valance_left + segment_width * (index + 1)
        color = cream if index % 2 == 0 else red
        rounded(
            draw,
            (left, 132, right + 1, 174),
            15,
            fill=color,
            outline=ink,
            width=5,
        )
        draw.rectangle(
            box((left, 132, right + 1, 151)),
            fill=color,
        )

    # Deep apron gives the hanging booth visual weight and a complete bottom.
    draw.rectangle(box((32, 535, 928, 690)), fill=silver)
    draw.rectangle(box((32, 555, 928, 579)), fill=silver_light)
    draw.line(
        (point(32), point(557), point(928), point(557)),
        fill=ink,
        width=point(8),
    )
    draw.rectangle(box((32, 610, 928, 644)), fill=red)
    draw.line(
        (point(32), point(609), point(928), point(609)),
        fill=ink,
        width=point(6),
    )
    draw.line(
        (point(32), point(645), point(928), point(645)),
        fill=ink,
        width=point(6),
    )
    draw.rectangle(box((32, 651, 928, 690)), fill=cream)
    for x in (330, 630):
        draw.line(
            (point(x), point(557), point(x), point(690)),
            fill=seam,
            width=point(3),
        )

    # Dark service opening. Its center is cleared after the frame is drawn so
    # the real chef/interior image can sit behind this asset.
    rounded(
        draw,
        (48, 151, 912, 559),
        24,
        fill=ink,
    )
    rounded(
        draw,
        (64, 168, 896, 540),
        13,
        fill=transparent,
    )

    # Counter lip reads as a stage edge and hides the image crop cleanly.
    rounded(
        draw,
        (48, 526, 912, 572),
        18,
        fill=ink,
    )
    rounded(
        draw,
        (61, 535, 899, 558),
        10,
        fill=silver_light,
    )
    draw.rectangle(box((70, 544, 890, 551)), fill=silver_shadow)

    # Attachment eyes make the suspension physically legible.
    for x in (185, 775):
        draw.ellipse(box((x - 15, 35, x + 15, 65)), fill=ink)
        draw.ellipse(box((x - 8, 42, x + 8, 58)), fill=brass)
        draw.ellipse(box((x - 3, 47, x + 3, 53)), fill=cream)

    # Sparse rivets keep the silver identity without adding realistic noise.
    for x, y in (
        (47, 148),
        (913, 148),
        (47, 588),
        (913, 588),
        (47, 676),
        (913, 676),
    ):
        draw.ellipse(box((x - 7, y - 7, x + 7, y + 7)), fill=ink)
        draw.ellipse(
            box((x - 3, y - 3, x + 3, y + 3)),
            fill=silver_light,
        )

    frame = frame.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    frame.save(OUTPUT, optimize=True)
    print(f"{OUTPUT}: {frame.width}x{frame.height}")


if __name__ == "__main__":
    main()
