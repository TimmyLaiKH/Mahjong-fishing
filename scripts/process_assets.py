#!/usr/bin/env python3
"""Build the small runtime images from the downloaded CC0/CC BY originals.

The FluffyStuff face PNGs and the CC0 flower overlays in
assets/tiles/raw/flowers/ are transparent, so each one is composited onto
Front.png and downscaled to 120x160. Raw sources are never modified. The
approved restyle_tiles.py then adds the rounded green/grey bands and an
alpha-derived shadow, producing 144x205 runtime PNGs. The background is
resized/compressed to stay below the 400 KB budget.
"""
from __future__ import annotations

import colorsys
from pathlib import Path

from PIL import Image

from restyle_tiles import restyle, restyle_back

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "assets" / "tiles" / "raw"
FACES = ROOT / "assets" / "tiles" / "faces"
BG = ROOT / "assets" / "bg"

FACE_TO_ID = {
    "Ton": "E", "Nan": "S", "Shaa": "W", "Pei": "N",
    "Chun": "C", "Hatsu": "F", "Haku": "B",
}
for suit, prefix in (("Man", "m"), ("Pin", "p"), ("Sou", "s")):
    for value in range(1, 10):
        FACE_TO_ID[f"{suit}{value}"] = f"{prefix}{value}"

SIZE = (120, 160)
FLOWER_IDS = tuple(f"H{i}" for i in range(1, 9))


def green_back(image: Image.Image) -> Image.Image:
    """Move the original red tile back to jade green, preserving its pattern."""
    result = image.copy()
    pixels = result.load()
    for y in range(result.height):
        for x in range(result.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            hue, saturation, value = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            red, green, blue = colorsys.hsv_to_rgb(
                (hue + 1 / 3) % 1, saturation, value * 0.62
            )
            pixels[x, y] = (
                round(red * 255), round(green * 255), round(blue * 255), a,
            )
    return result


def main() -> None:
    FACES.mkdir(parents=True, exist_ok=True)
    front = Image.open(RAW / "Front.png").convert("RGBA")
    front_small = front.resize(SIZE, Image.LANCZOS)

    for name, tile_id in FACE_TO_ID.items():
        body = front.copy()
        overlay = Image.open(RAW / f"{name}.png").convert("RGBA")
        if overlay.size != body.size:
            overlay = overlay.resize(body.size, Image.LANCZOS)
        body.alpha_composite(overlay)
        body.resize(SIZE, Image.LANCZOS).save(FACES / f"{tile_id}.png", optimize=True)

    for tile_id in FLOWER_IDS:
        overlay = Image.open(RAW / "flowers" / f"{tile_id}.png").convert("RGBA")
        if overlay.size != SIZE:
            overlay = overlay.resize(SIZE, Image.LANCZOS)
        face = front_small.copy()
        face.alpha_composite(overlay)
        face.save(FACES / f"{tile_id}.png", optimize=True)

    back = Image.open(RAW / "Back.png").convert("RGBA").resize(SIZE, Image.LANCZOS)
    green_back(back).save(FACES / "Back.png", optimize=True)

    # Bake the approved rounded bands and alpha-derived shadow into every runtime PNG.
    for path in sorted(FACES.glob("*.png")):
        with Image.open(path) as generated:
            baked = restyle_back(generated) if path.stem == "Back" else restyle(generated)
        baked.save(path, optimize=True)

    source = Image.open(BG / "underwater.source.jpg").convert("RGB")
    # 1920px source; keep the aspect ratio but cap the long edge at 1920.
    source.thumbnail((1920, 1920), Image.LANCZOS)
    quality = 82
    while quality >= 40:
        source.save(BG / "underwater.jpg", "JPEG", quality=quality, optimize=True,
                    progressive=True)
        if (BG / "underwater.jpg").stat().st_size <= 400 * 1024:
            break
        quality -= 4
    else:
        raise RuntimeError("Could not compress background below 400 KB")

    print(f"Generated {len(FACE_TO_ID) + len(FLOWER_IDS) + 1} runtime tile images and "
          f"assets/bg/underwater.jpg ({quality} quality, "
          f"{(BG / 'underwater.jpg').stat().st_size} bytes)")


if __name__ == "__main__":
    main()
