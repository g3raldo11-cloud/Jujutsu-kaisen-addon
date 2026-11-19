"""Generate the 'Mata Pixel' bitmap font (BMFont text .fnt + .png) with Portuguese accents.

Cell: 12 rows. Rows 0-1 accents over capitals, row 2 gap, rows 3-9 capitals (7 px),
rows 5-9 lowercase x-height, rows 10-11 descenders. Baseline after row 9 (base=10).
"""
import os
import sys
from PIL import Image

CAPS = {
 'A': ".###.|#...#|#...#|#####|#...#|#...#|#...#",
 'B': "####.|#...#|#...#|####.|#...#|#...#|####.",
 'C': ".###.|#...#|#....|#....|#....|#...#|.###.",
 'D': "####.|#...#|#...#|#...#|#...#|#...#|####.",
 'E': "#####|#....|#....|####.|#....|#....|#####",
 'F': "#####|#....|#....|####.|#....|#....|#....",
 'G': ".###.|#...#|#....|#.###|#...#|#...#|.####",
 'H': "#...#|#...#|#...#|#####|#...#|#...#|#...#",
 'I': "###|.#.|.#.|.#.|.#.|.#.|###",
 'J': "..###|...#.|...#.|...#.|#..#.|#..#.|.##..",
 'K': "#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#",
 'L': "#....|#....|#....|#....|#....|#....|#####",
 'M': "#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#",
 'N': "#...#|##..#|#.#.#|#..##|#...#|#...#|#...#",
 'O': ".###.|#...#|#...#|#...#|#...#|#...#|.###.",
 'P': "####.|#...#|#...#|####.|#....|#....|#....",
 'Q': ".###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#",
 'R': "####.|#...#|#...#|####.|#.#..|#..#.|#...#",
 'S': ".####|#....|#....|.###.|....#|....#|####.",
 'T': "#####|..#..|..#..|..#..|..#..|..#..|..#..",
 'U': "#...#|#...#|#...#|#...#|#...#|#...#|.###.",
 'V': "#...#|#...#|#...#|#...#|#...#|.#.#.|..#..",
 'W': "#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#",
 'X': "#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#",
 'Y': "#...#|#...#|.#.#.|..#..|..#..|..#..|..#..",
 'Z': "#####|....#|...#.|..#..|.#...|#....|#####",
 '0': ".###.|#...#|#..##|#.#.#|##..#|#...#|.###.",
 '1': ".#.|##.|.#.|.#.|.#.|.#.|###",
 '2': ".###.|#...#|....#|...#.|..#..|.#...|#####",
 '3': "####.|....#|....#|.###.|....#|....#|####.",
 '4': "...#.|..##.|.#.#.|#..#.|#####|...#.|...#.",
 '5': "#####|#....|####.|....#|....#|#...#|.###.",
 '6': ".###.|#....|#....|####.|#...#|#...#|.###.",
 '7': "#####|....#|...#.|..#..|.#...|.#...|.#...",
 '8': ".###.|#...#|#...#|.###.|#...#|#...#|.###.",
 '9': ".###.|#...#|#...#|.####|....#|....#|.###.",
 '!': "#|#|#|#|#|.|#",
 '?': ".###.|#...#|....#|...#.|..#..|.....|..#..",
 '.': ".|.|.|.|.|.|#",

 ':': ".|.|#|.|.|.|#",

 '-': "....|....|....|####|....|....|....",
 '+': ".....|..#..|..#..|#####|..#..|..#..|.....",
 '=': "....|....|####|....|####|....|....",
 '/': "....#|....#|...#.|..#..|.#...|#....|#....",
 '(': ".#|#.|#.|#.|#.|#.|.#",
 ')': "#.|.#|.#|.#|.#|.#|#.",
 '%': "##..#|##.#.|...#.|..#..|.#...|.#.##|#..##",
 "'": "#|#|.|.|.|.|.",
 '"': "#.#|#.#|...|...|...|...|...",
 '#': ".#.#.|#####|.#.#.|.#.#.|#####|.#.#.|.....",
 '*': ".....|#.#.#|.###.|#####|.###.|#.#.#|.....",
 '<': "...#|..#.|.#..|#...|.#..|..#.|...#",
 '>': "#...|.#..|..#.|...#|..#.|.#..|#...",
 '[': "##|#.|#.|#.|#.|#.|##",
 ']': "##|.#|.#|.#|.#|.#|##",
 '_': ".....|.....|.....|.....|.....|.....|#####",
 '•': "..|..|..|##|##|..|..",
 '·': ".|.|.|#|.|.|.",
 '–': ".....|.....|.....|#####|.....|.....|.....",
 '—': "......|......|......|######|......|......|......",
 '…': ".....|.....|.....|.....|.....|.....|#.#.#",
 '°': "###|#.#|###|...|...|...|...",
 '×': ".....|#...#|.#.#.|..#..|.#.#.|#...#|.....",
}
# lowercase: 9 rows = 2 ascender + 5 x-height + 2 descender (cell rows 3..11)
LOWER = {
 'a': ".....|.....|.###.|....#|.####|#...#|.####|.....|.....",
 'b': "#....|#....|####.|#...#|#...#|#...#|####.|.....|.....",
 'c': ".....|.....|.###.|#....|#....|#....|.###.|.....|.....",
 'd': "....#|....#|.####|#...#|#...#|#...#|.####|.....|.....",
 'e': ".....|.....|.###.|#...#|#####|#....|.###.|.....|.....",
 'f': "..##|.#..|####|.#..|.#..|.#..|.#..|....|....",
 'g': ".....|.....|.####|#...#|#...#|#...#|.####|....#|.###.",
 'h': "#....|#....|####.|#...#|#...#|#...#|#...#|.....|.....",
 'i': "#|.|#|#|#|#|#|.|.",
 'j': "..#|...|..#|..#|..#|..#|..#|#.#|.#.",
 'k': "#...|#...|#..#|#.#.|##..|#.#.|#..#|....|....",
 'l': "#.|#.|#.|#.|#.|#.|.#|..|..",
 'm': ".....|.....|##.#.|#.#.#|#.#.#|#.#.#|#.#.#|.....|.....",
 'n': ".....|.....|####.|#...#|#...#|#...#|#...#|.....|.....",
 'o': ".....|.....|.###.|#...#|#...#|#...#|.###.|.....|.....",
 'p': ".....|.....|####.|#...#|#...#|#...#|####.|#....|#....",
 'q': ".....|.....|.####|#...#|#...#|#...#|.####|....#|....#",
 'r': "....|....|#.##|##..|#...|#...|#...|....|....",
 's': ".....|.....|.####|#....|.###.|....#|####.|.....|.....",
 't': ".#..|.#..|####|.#..|.#..|.#..|..##|....|....",
 'u': ".....|.....|#...#|#...#|#...#|#...#|.####|.....|.....",
 'v': ".....|.....|#...#|#...#|#...#|.#.#.|..#..|.....|.....",
 'w': ".....|.....|#...#|#...#|#.#.#|#.#.#|.#.#.|.....|.....",
 'x': ".....|.....|#...#|.#.#.|..#..|.#.#.|#...#|.....|.....",
 'y': ".....|.....|#...#|#...#|#...#|#...#|.####|....#|.###.",
 'z': ".....|.....|#####|...#.|..#..|.#...|#####|.....|.....",
}
ACC = {  # two rows, 5 wide, centred
 'acute': ["...#.", "..#.."],
 'grave': [".#...", "..#.."],
 'circ': ["..#..", ".#.#."],
 'tilde': [".##.#", "#.##."],
 'diaer': [".....", ".#.#."],
}
COMPOSED = {
 'Á': ('A', 'acute'), 'À': ('A', 'grave'), 'Â': ('A', 'circ'), 'Ã': ('A', 'tilde'), 'Ä': ('A', 'diaer'),
 'É': ('E', 'acute'), 'Ê': ('E', 'circ'), 'È': ('E', 'grave'), 'Í': ('I', 'acute'),
 'Ó': ('O', 'acute'), 'Ô': ('O', 'circ'), 'Õ': ('O', 'tilde'), 'Ö': ('O', 'diaer'),
 'Ú': ('U', 'acute'), 'Ü': ('U', 'diaer'), 'Ñ': ('N', 'tilde'),
 'á': ('a', 'acute'), 'à': ('a', 'grave'), 'â': ('a', 'circ'), 'ã': ('a', 'tilde'), 'ä': ('a', 'diaer'),
 'é': ('e', 'acute'), 'ê': ('e', 'circ'), 'è': ('e', 'grave'),
 'ó': ('o', 'acute'), 'ô': ('o', 'circ'), 'õ': ('o', 'tilde'), 'ö': ('o', 'diaer'),
 'ú': ('u', 'acute'), 'ü': ('u', 'diaer'), 'ñ': ('n', 'tilde'),
}
H = 12


def glyph(ch):
    """Return list of 12 strings (cell rows) for a character."""
    if ch == ' ':
        return ['...'] * H
    if ch in CAPS:
        rows = CAPS[ch].split('|')
        w = len(rows[0])
        return ['.' * w] * 3 + rows + ['.' * w] * 2
    if ch in LOWER:
        rows = LOWER[ch].split('|')
        w = len(rows[0])
        return ['.' * w] * 3 + rows
    if ch == ',':
        return ['..'] * 9 + ['.#', '#.', '..']
    if ch == ';':
        return ['..'] * 5 + ['.#', '..', '..', '..', '.#', '#.', '..']
    if ch in ('Ç', 'ç'):
        base = glyph('C' if ch == 'Ç' else 'c')
        base = base[:10] + ['..#..', '.##..']
        return base
    if ch in ('í', 'ì', 'î', 'ï'):
        acc = {'í': ['.#', '#.'], 'ì': ['#.', '.#'], 'î': ['.#.', '#.#'], 'ï': ['#.#', '...']}[ch]
        w = len(acc[0])
        stem = '#' + '.' * (w - 1) if w == 2 else '.#.'
        return ['.' * w] * 2 + acc + ['.' * w] + [stem] * 5 + ['.' * w] * 2
    if ch in COMPOSED:
        b, a = COMPOSED[ch]
        g = glyph(b)
        w = len(g[0])
        acc = [r[:w] if w >= 5 else r[1:1 + w] for r in ACC[a]]
        if w < 5 and w == 3:
            acc = [r[1:4] for r in ACC[a]]
        if b.isupper():
            g = acc + g[2:]
        else:
            g = g[:2] + acc + g[4:]  # accent on rows 2-3, a gap on row 4, body from row 5
        return g
    return None


def main(out_dir):
    chars = [chr(c) for c in range(32, 127)] + list('ÁÀÂÃÄÉÊÈÍÓÔÕÖÚÜÑÇáàâãäéêèíìîïóôõöúüñç•·–—…°×')
    glyphs = {}
    for ch in chars:
        g = glyph(ch)
        if g is None:
            continue
        w = len(g[0])
        for r in g:
            assert len(r) == w, (ch, g)
        assert len(g) == H, (ch, len(g))
        glyphs[ch] = g
    # pack into an atlas
    W = 256
    x = y = 1
    pos = {}
    for ch, g in glyphs.items():
        w = len(g[0])
        if x + w + 1 > W:
            x = 1
            y += H + 1
        pos[ch] = (x, y)
        x += w + 1
    Hh = y + H + 1
    Hh = 1 << (Hh - 1).bit_length()
    img = Image.new('RGBA', (W, Hh), (0, 0, 0, 0))
    px = img.load()
    for ch, g in glyphs.items():
        ox, oy = pos[ch]
        for r, row in enumerate(g):
            for c, v in enumerate(row):
                if v == '#':
                    px[ox + c, oy + r] = (255, 255, 255, 255)
    os.makedirs(out_dir, exist_ok=True)
    img.save(os.path.join(out_dir, 'matapixel.png'))
    lines = [
        'info face="MataPixel" size=12 bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=0 aa=1 padding=0,0,0,0 spacing=1,1 outline=0',
        f'common lineHeight=13 base=10 scaleW={W} scaleH={Hh} pages=1 packed=0 alphaChnl=0 redChnl=4 greenChnl=4 blueChnl=4',
        'page id=0 file="matapixel.png"',
        f'chars count={len(glyphs)}',
    ]
    for ch, g in glyphs.items():
        ox, oy = pos[ch]
        w = len(g[0])
        adv = w + 1 if ch != ' ' else 4
        lines.append(f'char id={ord(ch)} x={ox} y={oy} width={w} height={H} xoffset=0 yoffset=0 xadvance={adv} page=0 chnl=15')
    # A BMFont description is only written on request: inside the Godot project the .fnt
    # importer would take over matapixel.png, which the game draws from directly.
    if os.environ.get('WRITE_BMFONT'):
        with open(os.path.join(out_dir, 'matapixel.fnt'), 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines) + '\n')
    # GDScript glyph table for the game's own pixel text renderer
    proj = os.path.dirname(os.path.dirname(out_dir.rstrip('/')))
    with open(os.path.join(proj, 'scripts', 'font_db.gd'), 'w', encoding='utf-8') as f:
        f.write('# Generated by tools/build_font.py: glyph atlas metrics for assets/fonts/matapixel.png\n')
        f.write('class_name FontDB\nextends RefCounted\n\n')
        f.write('const CELL_H := %d\nconst BASE := 10\nconst LINE_H := 13\n\n' % H)
        f.write('const GLYPHS := {\n')
        for ch, g in glyphs.items():
            ox, oy = pos[ch]
            esc = ch.replace('\\', '\\\\').replace('"', '\\"')
            adv = len(g[0]) + 1 if ch != ' ' else 4
            f.write('\t"%s": [%d, %d, %d, %d],\n' % (esc, ox, oy, len(g[0]), adv))
        f.write('}\n')
    # preview
    sample = ['MATA VIVA — CAPITÃO DO MATO', 'Fúria da Mata • Raízes • Seiva', 'Salto da Onça: invulnerável!', 'ação, coração, 0123456789 (+25%)']
    sw = 4 + max(sum(len(glyphs.get(c, glyphs[' '])[0]) + 1 for c in s) for s in sample)
    prev = Image.new('RGBA', (sw, (H + 2) * len(sample) + 4), (20, 26, 24, 255))
    pp = prev.load()
    for li, s in enumerate(sample):
        cx = 2
        for c in s:
            g = glyphs.get(c, glyphs[' '])
            for r, row in enumerate(g):
                for k, v in enumerate(row):
                    if v == '#':
                        pp[cx + k, 2 + li * (H + 2) + r] = (240, 230, 200, 255)
            cx += len(g[0]) + 1
    prev = prev.resize((prev.size[0] * 4, prev.size[1] * 4), Image.NEAREST)
    prev.save(os.path.join(out_dir, 'font_preview.png')) if os.environ.get('FONT_PREVIEW') else None
    print(len(glyphs), 'glyphs', img.size)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'fonts'))
