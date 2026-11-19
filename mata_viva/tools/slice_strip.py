"""Slice a Pixelwright render_preview filmstrip (zoom 1, background none) into frames.

Layout observed: frames in a grid, left to right, top to bottom; a 1 px separator column
between frame columns; a header band of HEADER px (frame numbers) above every grid row.
Usage: python3 -I slice_strip.py <strip.png> <frame_w> <frame_h> <count> <out_prefix>
"""
import sys
from PIL import Image

HEADER = 21


def slice_strip(path, fw, fh, count):
    im = Image.open(path).convert("RGBA")
    W, H = im.size
    if count == 1 and (W, H) == (fw, fh):
        return [im]
    cols = (W + 1) // (fw + 1)
    rows = H // (HEADER + fh)
    if cols * (fw + 1) - 1 != W or rows * (HEADER + fh) != H:
        raise SystemExit(f"unexpected layout {W}x{H} for {fw}x{fh} frames (cols {cols}, rows {rows})")
    if cols * rows < count:
        raise SystemExit(f"grid {cols}x{rows} too small for {count} frames")
    frames = []
    for i in range(count):
        c, r = i % cols, i // cols
        x = c * (fw + 1)
        y = r * (HEADER + fh) + HEADER
        frames.append(im.crop((x, y, x + fw, y + fh)))
    return frames


if __name__ == "__main__":
    path, fw, fh, n, prefix = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
    fr = slice_strip(path, fw, fh, n)
    for i, f in enumerate(fr):
        f.save(f"{prefix}_{i}.png")
    print(f"{len(fr)} frames ok from {Image.open(path).size}")
