# -*- coding: utf-8 -*-
# ILM Network brand assets, built from the "ILM Brand Kit" design
# (Claude Design project 77a3c556, 13 Sep 2026).
#
# The kit's own files embed a large content-provenance manifest, so the web
# copies are regenerated here from the exact same geometry: clean SVGs, and
# PNGs rendered by supersampling. Re-run after any change to the mark.
#
#   python scripts/build-brand-assets.py
#
# Writes:
#   marketing/public/brand/*   theilmnetwork.com
#   public/brand/*             iqraifs.com (the platform)
#   public/favicon.ico, favicon-16/32/48.png, apple-touch-icon.png,
#   icon-192.png, icon-512.png  the app's default icons (school pages swap
#                               in the school's own logo at runtime)
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

INDIGO = (79, 70, 229)
INK = (15, 23, 42)
AMBER = (245, 158, 11)
WHITE = (255, 255, 255)
MIST = (248, 250, 252)
SLATE = (71, 85, 105)
MUTED = (100, 116, 139)

# ── The mark: a row per person, one amber dot on the row needing attention ──
ROWS = [(24, 27, 30, 0.55), (24, 43.5, 48, 1.0), (24, 60, 38, 0.55)]
DOT = (78, 48, 5.5)

# Tab-size favicons (kit: third row and dot dropped). Drawn on the pixel grid
# as (x, y, width, height, opacity) - supersampled bars blur to a smudge here.
PIXEL_BARS = {
    16: [(4, 5, 6, 2, 0.55), (4, 9, 9, 2, 1.0)],
    32: [(8, 11, 11, 3, 0.55), (8, 18, 17, 3, 1.0)],
}

def mark_svg_body(bg, bar, dot, rx=22, dx=0):
    g = [f'<rect x="{dx}" width="96" height="96" rx="{rx}" fill="{bg}"/>']
    for x, y, w, a in ROWS:
        op = f' opacity="{a}"' if a < 1 else ""
        g.append(f'<rect x="{x + dx}" y="{y}" width="{w}" height="9" rx="4.5" fill="{bar}"{op}/>')
    g.append(f'<circle cx="{DOT[0] + dx}" cy="{DOT[1]}" r="{DOT[2]}" fill="{dot}"/>')
    return "".join(g)

def svg(view_w, view_h, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {view_w} {view_h}" '
            f'width="{view_w}" height="{view_h}">{body}</svg>\n')

WORDMARK_FONT = 'font-family="Public Sans, Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="900"'

SVGS = {
    "logo-mark.svg": svg(96, 96, mark_svg_body("#4f46e5", "#ffffff", "#f59e0b")),
    "logo-mark-dark.svg": svg(96, 96, mark_svg_body("#0f172a", "#ffffff", "#4f46e5")),
    "favicon.svg": svg(96, 96, mark_svg_body("#4f46e5", "#ffffff", "#f59e0b", rx=20)),
    "logo-mono-black.svg": svg(400, 96,
        mark_svg_body("#0f172a", "#ffffff", "#ffffff")
        + f'<text x="116" y="62" {WORDMARK_FONT} font-size="40" letter-spacing="-0.5" fill="#0f172a">'
          'ILM·Network</text>'),
    "logo-horizontal.svg": svg(400, 96,
        mark_svg_body("#4f46e5", "#ffffff", "#f59e0b")
        + f'<text x="116" y="62" {WORDMARK_FONT} font-size="40" letter-spacing="-0.5" fill="#0f172a">'
          'ILM<tspan fill="#4f46e5">·</tspan>Network</text>'),
    "logo-horizontal-white.svg": svg(400, 96,
        mark_svg_body("#ffffff", "#4f46e5", "#f59e0b")
        + f'<text x="116" y="62" {WORDMARK_FONT} font-size="40" letter-spacing="-0.5" fill="#ffffff">'
          'ILM<tspan fill="#818cf8">·</tspan>Network</text>'),
    "logo-stacked.svg": svg(260, 170,
        mark_svg_body("#4f46e5", "#ffffff", "#f59e0b", dx=82)
        + f'<text x="130" y="146" text-anchor="middle" {WORDMARK_FONT} font-size="34" letter-spacing="-0.5" fill="#0f172a">'
          'ILM<tspan fill="#4f46e5">·</tspan>Network</text>'),
}

# ── Raster ─────────────────────────────────────────────────────────────────
def mark_png(size, *, rx=22, full_bleed=False):
    """Supersampled render. `full_bleed` = square ground for icons the OS
    masks itself (iOS home screen, PWA). Sizes in PIXEL_BARS get the kit's
    simplified tab favicon, snapped to whole pixels."""
    simplified = size in PIXEL_BARS
    ss = max(4, 1024 // size)
    S = size * ss
    k = S / 96
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    if full_bleed:
        ImageDraw.Draw(img).rectangle([0, 0, S, S], fill=INDIGO + (255,))
    else:
        ImageDraw.Draw(img).rounded_rectangle([0, 0, S - 1, S - 1], radius=rx * k, fill=INDIGO + (255,))
    if not simplified:
        for x, y, w, a in ROWS:
            layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
            ImageDraw.Draw(layer).rounded_rectangle(
                [x * k, y * k, (x + w) * k, (y + 9) * k],
                radius=4.5 * k, fill=WHITE + (round(255 * a),))
            img = Image.alpha_composite(img, layer)
        cx, cy, r = DOT
        ImageDraw.Draw(img).ellipse([(cx - r) * k, (cy - r) * k, (cx + r) * k, (cy + r) * k], fill=AMBER + (255,))
    out = img.resize((size, size), Image.LANCZOS)
    if simplified:
        d = ImageDraw.Draw(out)
        for x, y, w, h, a in PIXEL_BARS[size]:
            col = tuple(round(a * 255 + (1 - a) * c) for c in INDIGO) + (255,)
            d.rectangle([x, y, x + w - 1, y + h - 1], fill=col)
    return out

def font(name, size):
    return ImageFont.truetype(os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", name), size)

def og_image():
    """1200x630 share card: mark, wordmark, the promise, the domain - with the
    mark's rows echoed large on the right."""
    W, H = 1200, 630
    img = Image.new("RGBA", (W, H), MIST + (255,))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 10], fill=INDIGO + (255,))

    # kept right of x=800 so it never runs under the wordmark or tagline
    for (x, y, w, col) in [(810, 212, 170, (224, 231, 255)), (810, 296, 272, (199, 210, 254)), (810, 380, 216, (224, 231, 255))]:
        d.rounded_rectangle([x, y, x + w, y + 44], radius=22, fill=col + (255,))
    d.ellipse([1106, 296, 1150, 340], fill=AMBER + (255,))

    m = mark_png(132)
    img.alpha_composite(m, (96, 118))

    black = font("seguibl.ttf", 92)
    x, base = 96, 360
    for part, col in (("ILM", INK), ("·", INDIGO), ("Network", INK)):
        d.text((x, base), part, font=black, fill=col + (255,), anchor="ls")
        x += black.getlength(part) - 2
    d.text((98, 440), "Run your school from one place.", font=font("segoeuib.ttf", 42), fill=SLATE + (255,), anchor="ls")
    d.text((98, 548), "theilmnetwork.com", font=font("segoeui.ttf", 30), fill=MUTED + (255,), anchor="ls")
    return img.convert("RGB")

def save_png(im, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, optimize=True)
    print("  wrote", os.path.relpath(path, ROOT))

def main():
    pngs = {
        "favicon-16.png": mark_png(16),
        "favicon-32.png": mark_png(32),
        "favicon-48.png": mark_png(48),
        "favicon-180.png": mark_png(180, full_bleed=True),
        "favicon-512.png": mark_png(512, full_bleed=True),
    }
    og = og_image()
    for t in (os.path.join(ROOT, "marketing", "public", "brand"), os.path.join(ROOT, "public", "brand")):
        os.makedirs(t, exist_ok=True)
        for name, body in SVGS.items():
            with open(os.path.join(t, name), "w", encoding="utf-8", newline="\n") as f:
                f.write(body)
            print("  wrote", os.path.relpath(os.path.join(t, name), ROOT))
        for name, im in pngs.items():
            save_png(im, os.path.join(t, name))
        save_png(og, os.path.join(t, "og-image.png"))

    # The app's default icons, under the names index.html and the manifest use.
    pub = os.path.join(ROOT, "public")
    for name, im in {
        "favicon-16.png": pngs["favicon-16.png"],
        "favicon-32.png": pngs["favicon-32.png"],
        "favicon-48.png": pngs["favicon-48.png"],
        "apple-touch-icon.png": pngs["favicon-180.png"],
        "icon-192.png": mark_png(192, full_bleed=True),
        "icon-512.png": pngs["favicon-512.png"],
    }.items():
        save_png(im, os.path.join(pub, name))
    ico = os.path.join(pub, "favicon.ico")
    pngs["favicon-48.png"].save(ico, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)],
                                append_images=[pngs["favicon-16.png"], pngs["favicon-32.png"]])
    print("  wrote", os.path.relpath(ico, ROOT))

if __name__ == "__main__":
    main()
