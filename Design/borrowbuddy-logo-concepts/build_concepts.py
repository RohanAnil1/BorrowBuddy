"""Reproducible original SVG concept geometry and outlined existing typography."""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
FONT = TTFont(PROJECT / "apps/android/app/src/main/res/font/noto_mono.ttf")
GLYPHS = FONT.getGlyphSet()
CMAP = FONT.getBestCmap()

V1 = {
    "a-return-b": 'M48 32H148C188 32 208 52 208 84C208 106 196 121 180 128C200 136 212 151 212 176C212 208 188 224 150 224H48Z M88 68H148L168 88L148 108H88Z M108 148H172V188H108L88 168Z',
    "b-buddy-brackets": 'M32 48H96L120 72V104H88V80H64V176H88V152H120V208H64L32 176Z M224 208H160L136 184V152H168V176H192V80H168V104H136V48H192L224 80Z',
    "c-cargo-fold": 'M48 32H200L128 104H184V184H216V224H48Z M88 144H144V184H88Z',
}


def translated(geometry, x, y):
    pen = SVGPathPen(None)
    parse_path(geometry, TransformPen(pen, (1, 0, 0, 1, x, y)))
    return pen.getCommands()


V2 = {
    "a-return-b": 'M48 32H148C188 32 208 52 208 84C208 106 196 121 180 128C200 136 208 151 208 176C208 208 184 224 148 224H48Z M88 68H148L168 88L148 108H88Z M108 148H172V188H108L88 168Z',
    "b-buddy-brackets": 'M32 48H96L116 68V104H88V80H64V176H88V152H116V208H64L32 176Z M224 208H160L140 188V152H168V176H192V80H168V104H140V48H192L224 80Z',
    "c-cargo-fold": translated('M48 32H200L128 104H184V184H216V224H48Z M84 144H148V184H84Z', -4, 0),
}


def svg(title, art, width=256):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} 256" role="img" aria-labelledby="title"><title id="title">{title}</title>{art}</svg>\n'


def wordmark():
    scale = 64 / FONT["OS/2"].sCapHeight
    position = 290.0
    pieces = []
    for char in "BORROWBUDDY":
        glyph = CMAP[ord(char)]
        pen = SVGPathPen(GLYPHS)
        GLYPHS[glyph].draw(TransformPen(pen, (scale, 0, 0, -scale, position, 158)))
        pieces.append(f'<path fill="#111111" d="{pen.getCommands()}"/>')
        position += (FONT["hmtx"][glyph][0] + 22) * scale
    return ''.join(pieces), round(position + 42)


def build(version, paths):
    word, width = wordmark()
    for name, geometry in paths.items():
        art = f'<path fill="#111111" fill-rule="evenodd" d="{geometry}"/>'
        (HERE / f'{name}-{version}.svg').write_text(svg(name.replace('-', ' '), art), encoding='utf-8')
        (HERE / f'{name}-lockup-{version}.svg').write_text(svg(f'BorrowBuddy {name} concept', art + word, width), encoding='utf-8')


if __name__ == '__main__':
    build('v1', V1)
    build('v2', V2)
