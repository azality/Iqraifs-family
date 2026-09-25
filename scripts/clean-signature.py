# Turn a phone photo of a signature on paper into a clean transparent PNG
# fit to print on a report card's signature line (25 Sep 2026).
#
#   python scripts/clean-signature.py <photo.jpg> <out.png>
#   deno run ... scripts/upload-teacher-signatures.ts <out.png> "<Name>" --apply
#
# Three things a phone photo needs before it can sit on a printed line:
#   - the paper's grey/yellow cast and uneven lighting removed, without
#     eating thin strokes (divide by a blurred copy = local paper tone);
#   - the crop taken from the INK, ignoring paper dust and - in one real
#     photo - a 1214x1 hairline along the image edge that was the single
#     largest dark shape in the picture;
#   - a badly-off-axis signature straightened. Sidra's was written at
#     +73 degrees and printed as a vertical sliver on the line.
import math
import sys
from PIL import Image, ImageOps, ImageFilter

def ink_bbox(mask, keep_frac=0.05):
    """Bounding box of the real strokes: label connected blobs and ignore
    any far smaller than the biggest one. A pen dot on the paper is a
    solid blob too, so eroding does not remove it - only its SIZE tells
    it apart from a signature stroke."""
    w, h = mask.size
    px = mask.load()
    seen = bytearray(w * h)
    blobs = []
    for sy in range(h):
        for sx in range(w):
            if px[sx, sy] == 0 or seen[sy * w + sx]:
                continue
            stack = [(sx, sy)]
            seen[sy * w + sx] = 1
            x0 = x1 = sx
            y0 = y1 = sy
            area = 0
            while stack:
                x, y = stack.pop()
                area += 1
                if x < x0: x0 = x
                if x > x1: x1 = x
                if y < y0: y0 = y
                if y > y1: y1 = y
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and px[nx, ny]:
                        seen[ny * w + nx] = 1
                        stack.append((nx, ny))
            blobs.append((area, x0, y0, x1, y1))
    # A hairline along the photo's edge is a scan artifact, not ink - and
    # in Rizwana's photo it was the LARGEST blob (1214x1 across the top),
    # which pinned the crop to the full width. Real pen strokes have
    # thickness in both directions.
    blobs = [b for b in blobs if min(b[3] - b[1], b[4] - b[2]) >= 3]
    if not blobs:
        return None
    biggest = max(b[0] for b in blobs)
    kept = [b for b in blobs if b[0] >= biggest * keep_frac]
    return (min(b[1] for b in kept), min(b[2] for b in kept),
            max(b[3] for b in kept) + 1, max(b[4] for b in kept) + 1)


def ink_axis(rgba):
    """Angle of the line the ink actually runs along, from its second
    moments. A signature photographed sideways reads as a sliver on the
    card's signature line - Sidra's came in at +73 degrees."""
    a = rgba.getchannel("A").load()
    w, h = rgba.size
    pts = [(x, y) for y in range(0, h, 2) for x in range(0, w, 2) if a[x, y] > 60]
    if len(pts) < 50:
        return 0.0
    n = len(pts)
    mx = sum(p[0] for p in pts) / n
    my = sum(p[1] for p in pts) / n
    sxx = sum((x - mx) ** 2 for x, y in pts) / n
    syy = sum((y - my) ** 2 for x, y in pts) / n
    sxy = sum((x - mx) * (y - my) for x, y in pts) / n
    return math.degrees(0.5 * math.atan2(2 * sxy, sxx - syy))


def straighten(rgba, target=-8.0, only_beyond=30.0):
    """Bring a badly-off-axis signature back to a natural slight rise.
    Left alone below `only_beyond` so an ordinary slant (Rizwana's -14)
    keeps the hand that wrote it."""
    ang = ink_axis(rgba)
    if abs(ang) <= only_beyond:
        return rgba, ang, 0.0
    delta = target - ang
    return rgba.rotate(-delta, resample=Image.BICUBIC, expand=True,
                       fillcolor=(0, 0, 0, 0)), ang, delta


def clean(src, dst, ink=(17, 24, 39), max_w=900):
    im = Image.open(src).convert("L")
    im = ImageOps.exif_transpose(im)

    # Paper tone = heavily blurred copy; dividing by it flattens shadows
    # and the yellow cast of a phone photo taken indoors.
    bg = im.filter(ImageFilter.GaussianBlur(radius=max(im.size) / 25))
    flat = Image.new("L", im.size)
    px, bp, fp = im.load(), bg.load(), flat.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            b = bp[x, y] or 1
            v = int(min(255, px[x, y] * 255 / b))   # >255 clipped = paper
            fp[x, y] = v

    # Alpha from how much darker than paper the pixel is. The floor kills
    # sensor noise; the ceiling makes solid strokes fully opaque.
    LO, HI = 150, 105
    alpha = Image.new("L", im.size)
    ap, fp = alpha.load(), flat.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            v = fp[x, y]
            if v >= LO:
                a = 0
            elif v <= HI:
                a = 255
            else:
                a = int(255 * (LO - v) / (LO - HI))
            ap[x, y] = a

    out = Image.new("RGBA", im.size, ink + (0,))
    out.putalpha(alpha)

    # Crop to the INK, not to the paper's dust. A speck survives the
    # alpha ramp and would otherwise hold the bounding box wide open
    # (Rizwana's photo cropped to a huge empty field because of two).
    # Opening the mask removes isolated specks; the bbox comes from that,
    # while the pixels kept are the original full-fidelity strokes.
    solid = alpha.point(lambda v: 255 if v >= 110 else 0)
    bbox = ink_bbox(solid) or alpha.getbbox()
    if bbox:
        pad = int(max(im.size) * 0.025)
        bbox = (max(0, bbox[0] - pad), max(0, bbox[1] - pad),
                min(im.size[0], bbox[2] + pad), min(im.size[1], bbox[3] + pad))
        out = out.crop(bbox)

    out, was, delta = straighten(out)
    if delta:
        bb2 = out.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
        if bb2:
            pad2 = int(max(out.size) * 0.02)
            out = out.crop((max(0, bb2[0] - pad2), max(0, bb2[1] - pad2),
                            min(out.size[0], bb2[2] + pad2), min(out.size[1], bb2[3] + pad2)))
        print(f"  straightened {was:+.1f} -> {ink_axis(out):+.1f} deg")

    if out.size[0] > max_w:
        h = int(out.size[1] * max_w / out.size[0])
        out = out.resize((max_w, h), Image.LANCZOS)

    out.save(dst, "PNG", optimize=True)
    ink_px = sum(1 for p in out.getdata() if p[3] > 40)
    total = out.size[0] * out.size[1]
    print(f"{dst}  {out.size[0]}x{out.size[1]}  ink {100*ink_px/total:.1f}%")

if __name__ == "__main__":
    clean(sys.argv[1], sys.argv[2])
