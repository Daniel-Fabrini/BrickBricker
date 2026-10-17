#!/usr/bin/env python3
"""Generates the Android launcher icons and native splash assets for Brick Breaker Infinite.

Usage:  python3 scripts/android-assets.py        (requires Pillow and `npm ci` for the fonts)

Outputs into android/app/src/main/res:
  mipmap-*/ic_launcher.png, ic_launcher_round.png, ic_launcher_foreground.png
  drawable-*/splash_logo.png, splash_credit.png   (used by drawable/splash.xml)
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
FONTS = os.path.join(ROOT, 'node_modules', '@fontsource', 'orbitron', 'files')
BG = (5, 1, 15, 255)
BRICKS = [((8, 10), (255, 43, 214)), ((25, 10), (0, 229, 255)), ((42, 10), (255, 225, 77)), ((16, 20), (57, 255, 136)), ((34, 20), (138, 92, 255))]
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
CREDIT = ('by ', 'Daniel Aleixo')


def font(weight, size):
    return ImageFont.truetype(os.path.join(FONTS, f'orbitron-latin-{weight}-normal.woff'), size)


def art(size, inset=0.0, background=True, glow=True):
    """The 64x64 logo design (bricks, ball, paddle) drawn into a size x size image."""
    ss = 4
    s = size * ss
    img = Image.new('RGBA', (s, s), BG if background else (0, 0, 0, 0))
    k = s * (1 - 2 * inset) / 64
    off = s * inset

    def r(x, y, w, h):
        return [off + x * k, off + y * k, off + (x + w) * k, off + (y + h) * k]

    halo = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    g = ImageDraw.Draw(halo)
    for (x, y), col in BRICKS:
        g.rounded_rectangle(r(x, y, 14, 7), radius=1.5 * k, fill=col + (200,))
    g.rounded_rectangle(r(18, 51, 28, 5), radius=2.5 * k, fill=(0, 229, 255, 220))
    g.ellipse(r(34, 36, 8, 8), fill=(200, 250, 255, 200))
    if glow:
        img.alpha_composite(halo.filter(ImageFilter.GaussianBlur(radius=2.2 * k)))
    d = ImageDraw.Draw(img)
    for (x, y), col in BRICKS:
        d.rounded_rectangle(r(x, y, 14, 7), radius=1.5 * k, fill=col + (255,))
        d.rounded_rectangle(r(x + 1.2, y + 1.2, 11.6, 1.6), radius=0.8 * k, fill=(255, 255, 255, 90))
    d.rounded_rectangle(r(18, 51, 28, 5), radius=2.5 * k, fill=(0, 229, 255, 255))
    d.rounded_rectangle(r(18, 51, 5, 5), radius=2.5 * k, fill=(255, 43, 214, 255))
    d.rounded_rectangle(r(41, 51, 5, 5), radius=2.5 * k, fill=(255, 43, 214, 255))
    d.ellipse(r(34, 36, 8, 8), fill=(255, 255, 255, 255))
    return img.resize((size, size), Image.LANCZOS)


def masked(img, shape, radius_ratio=0.18):
    mask = Image.new('L', img.size, 0)
    box = [0, 0, img.size[0] - 1, img.size[1] - 1]
    if shape == 'circle':
        ImageDraw.Draw(mask).ellipse(box, fill=255)
    else:
        ImageDraw.Draw(mask).rounded_rectangle(box, radius=int(img.size[0] * radius_ratio), fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def glow_text(canvas, xy, text, fnt, fill, glow, blur, spacing=0):
    """Draws text (optionally letter-spaced) with a soft coloured glow."""
    layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=fnt, fill=fill)
        x += fnt.getlength(ch) + spacing
    halo = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    halo.paste(Image.new('RGBA', canvas.size, glow), (0, 0), layer.split()[3])
    canvas.alpha_composite(halo.filter(ImageFilter.GaussianBlur(blur)))
    canvas.alpha_composite(layer)


def text_width(text, fnt, spacing=0):
    return sum(fnt.getlength(ch) for ch in text) + spacing * (len(text) - 1)


def splash_logo(f):
    """Logo mark + title, transparent background, 280dp wide."""
    w, h = int(280 * f), int(250 * f)
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    mark = art(int(132 * f), background=False)
    img.alpha_composite(mark, ((w - mark.size[0]) // 2, 0))
    title = font(900, int(28 * f))
    tw = text_width('Brick Breaker', title)
    glow_text(img, ((w - tw) / 2, 150 * f), 'Brick Breaker', title, (232, 247, 255, 255), (0, 229, 255, 200), 5 * f)
    sub = font(500, int(13 * f))
    spacing = 6.5 * f
    sw = text_width('Infinite', sub, spacing)
    glow_text(img, ((w - sw) / 2, 196 * f), 'Infinite', sub, (255, 43, 214, 255), (255, 43, 214, 180), 3 * f, spacing)
    return img


def splash_credit(f):
    """"by Daniel Aleixo" credit line, transparent background."""
    by_font, name_font = font(500, int(14 * f)), font(700, int(14 * f))
    spacing = 1.6 * f
    by_w = text_width(CREDIT[0], by_font, spacing)
    name_w = text_width(CREDIT[1], name_font, spacing)
    w, h = int(by_w + name_w + 24 * f), int(30 * f)
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    x = (w - by_w - name_w) / 2
    glow_text(img, (x, 6 * f), CREDIT[0], by_font, (158, 167, 214, 255), (0, 0, 0, 0), 1, spacing)
    glow_text(img, (x + by_w + spacing, 6 * f), CREDIT[1], name_font, (232, 247, 255, 255), (0, 229, 255, 170), 3 * f, spacing)
    return img


def main():
    for name, f in DENSITIES.items():
        mipmap = os.path.join(RES, f'mipmap-{name}')
        os.makedirs(mipmap, exist_ok=True)
        legacy = int(48 * f)
        masked(art(legacy, inset=0.06), 'rounded').save(os.path.join(mipmap, 'ic_launcher.png'))
        masked(art(legacy, inset=0.12), 'circle').save(os.path.join(mipmap, 'ic_launcher_round.png'))
        # Adaptive icon foreground: keep the art inside the 66dp safe zone of the 108dp canvas.
        art(int(108 * f), inset=0.2, background=False).save(os.path.join(mipmap, 'ic_launcher_foreground.png'))

        drawable = os.path.join(RES, f'drawable-{name}')
        os.makedirs(drawable, exist_ok=True)
        splash_logo(f).save(os.path.join(drawable, 'splash_logo.png'), optimize=True)
        splash_credit(f).save(os.path.join(drawable, 'splash_credit.png'), optimize=True)
    print('Android assets written to', RES)


if __name__ == '__main__':
    main()
