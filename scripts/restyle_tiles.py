"""Restyle flat mahjong tiles with two smooth edge layers only.

Usage:  python restyle_tiles.py INPUT_FOLDER OUTPUT_FOLDER
        python restyle_tiles.py single_tile.png out.png
Artwork is NOT redrawn: the original face is reused and two anti-aliased
green/grey layers are stacked above it. No baked shadow or face recolour:
a 120x160 input becomes a 120x181 RGBA tile.
"""
import sys, os
from PIL import Image, ImageDraw, ImageChops

# ---- tweakable style ----
GREEN = (26, 125, 26)          # face tiles: top strip, a little darker than Back.png green (34,158,34)
GREY = (176, 176, 181)         # face tiles: middle layer = tile side
GREEN_RATIO = 0.055            # green band height / face height
GREY_RATIO = 0.075             # grey band height / face height
CORNER_RADIUS_RATIO = 0.055    # change ONLY this if corners look too round or too square
BACK_TOP = (223, 223, 220)     # back tile: top layer = white/ivory tile face (#DFDFDC)
BACK_GREEN = None              # keep Back.png's original green
BACK_SIDE = (26, 125, 26)      # back tile: side band, darker green (was grey)

SS = 4


def tile_mask(im):
    """Mask of the tile body: from alpha if present, else from background colour key."""
    if im.mode == "RGBA" and im.getextrema()[3][0] < 255:
        return im.getchannel("A")
    rgb = im.convert("RGB")
    bg = Image.new("RGB", rgb.size, rgb.getpixel((0, 0)))
    diff = ImageChops.difference(rgb, bg).convert("L")
    return diff.point(lambda v: 255 if v > 20 else 0)


def rounded_mask(size, rad):
    """Anti-aliased rounded-rectangle mask, supersampled with LANCZOS."""
    w, h = size
    big = Image.new("L", (w * SS, h * SS), 0)
    ImageDraw.Draw(big).rounded_rectangle(
        [0, 0, w * SS - 1, h * SS - 1], radius=rad * SS, fill=255,
    )
    return big.resize(size, Image.LANCZOS)


def clip_rounded(tile, rad):
    """Clip a tile to the same anti-aliased rounded outline."""
    tile = tile.convert("RGBA")
    mask = rounded_mask(tile.size, rad)
    tile.putalpha(ImageChops.multiply(tile.getchannel("A"), mask))
    return tile


def smooth_band(size, y0, y1, rad, colour):
    """Rounded, anti-aliased colour band, built the same way as the back-tile bands."""
    w, h = size
    y0, y1 = max(0, y0), min(h, y1)
    band_h = max(1, y1 - y0)
    band = Image.new("RGBA", (w, band_h), colour + (255,))
    band.putalpha(rounded_mask((w, band_h), rad))
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    layer.alpha_composite(band, (0, y0))
    return layer


def restyle(im):
    im = im.convert("RGBA")
    mask = tile_mask(im)
    box = mask.getbbox()
    face = im.crop(box)
    fmask = mask.crop(box)
    w, h = face.size

    rad = max(2, round(h * CORNER_RADIUS_RATIO))
    gh, sh = round(h * GREEN_RATIO), round(h * GREY_RATIO)
    W, H = w, h + gh + sh

    # Rounded bands first, then the face, then one final clip.
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out.alpha_composite(smooth_band((W, H), 0, gh + 3 * rad, rad, GREEN))
    out.alpha_composite(smooth_band((W, H), gh, gh + sh + 3 * rad, rad, GREY))
    face.putalpha(ImageChops.multiply(face.getchannel("A"), fmask))
    out.alpha_composite(face, (0, gh + sh))
    out = clip_rounded(out, rad)
    return out


def restyle_back(im):
    im = im.convert("RGBA")
    mask = tile_mask(im)
    box = mask.getbbox()
    back = im.crop(box)
    bmask = mask.crop(box)
    w, h = back.size

    rad = max(2, round(h * CORNER_RADIUS_RATIO))
    gh, sh = round(h * GREEN_RATIO), round(h * GREY_RATIO)
    W, H = w, h + gh + sh

    # Ivory top, darker-green side, original green back, then one final clip.
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out.alpha_composite(smooth_band((W, H), 0, gh + 3 * rad, rad, BACK_TOP))
    out.alpha_composite(smooth_band((W, H), gh, gh + sh + 3 * rad, rad, BACK_SIDE))
    back.putalpha(ImageChops.multiply(back.getchannel("A"), bmask))
    out.alpha_composite(back, (0, gh + sh))
    out = clip_rounded(out, rad)
    return out


def main(src, dst):
    if "--back" in sys.argv:
        restyle_back(Image.open(src)).save(dst)
        return
    if os.path.isdir(src):
        os.makedirs(dst, exist_ok=True)
        for f in sorted(os.listdir(src)):
            if f.lower().endswith((".png", ".webp", ".jpg", ".jpeg")):
                restyle(Image.open(os.path.join(src, f))).save(
                    os.path.join(dst, os.path.splitext(f)[0] + ".png"))
                print("done", f)
    else:
        restyle(Image.open(src)).save(dst)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
