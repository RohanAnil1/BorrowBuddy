"""Build the approved vector masters from the project's shared brand source."""
from pathlib import Path
import json
from shapely.geometry import Polygon
from fontTools.pens.recordingPen import RecordingPen
from fontTools.svgLib.path import parse_path
from build_concepts import wordmark

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
KIT = HERE / 'kit'
SOURCE = (PROJECT / 'packages/shared/src/brand.ts').read_text(encoding='utf-8')
BRAND = json.loads(SOURCE.split('export const BORROWBUDDY_BRAND = ', 1)[1].rsplit(' as const;', 1)[0])
PALETTE = BRAND['palette']


def inset(path, amount):
    recording = RecordingPen()
    parse_path(path, recording)
    points = [point for op, args in recording.value if op in ('moveTo','lineTo') for point in args]
    poly = Polygon(points).buffer(-amount, join_style=2)
    if poly.geom_type != 'Polygon' or poly.interiors:
        raise ValueError('Unexpected inset topology')
    points = list(poly.exterior.coords)[:-1]
    return 'M' + 'L'.join(f'{x:.3f} {y:.3f}' for x,y in points) + 'Z'


def artwork(mode='color', thin=False):
    left = BRAND['paths']['left']; right = BRAND['paths']['right']
    if thin:
        left, right = inset(left, .5), inset(right, .5)
    colors = {
        'color':(PALETTE['blue'],PALETTE['amber']),
        'dark':(PALETTE['paper'],PALETTE['amber']),
        'black':('#000000','#000000'),
        'white':('#ffffff','#ffffff'),
        'navy':(PALETTE['navy'],PALETTE['navy']),
    }[mode]
    return ''.join(f'<path fill="{color}" d="{path}"/>' for color,path in zip(colors,(left,right)))


def svg(title, art, width=256, height=256):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title"><title id="title">{title}</title>{art}</svg>\n'


def build():
    source = KIT/'source'; digital=KIT/'digital'
    source.mkdir(parents=True,exist_ok=True); digital.mkdir(parents=True,exist_ok=True)
    word, width = wordmark()
    for mode in ['color','dark','black','white','navy']:
        mark=artwork(mode,thin=mode=='white')
        word_color=PALETTE['paper'] if mode=='dark' else '#ffffff' if mode=='white' else '#000000' if mode=='black' else PALETTE['navy']
        outlined_word=word.replace('#111111',word_color)
        (source/f'borrowbuddy-symbol-{mode}.svg').write_text(svg(f'BorrowBuddy Buddy Brackets {mode}',mark),encoding='utf-8')
        (source/f'borrowbuddy-horizontal-{mode}.svg').write_text(svg(f'BorrowBuddy horizontal {mode}',mark+outlined_word,width),encoding='utf-8')
        # Wordmark has no live font dependency; normalize its horizontal origin.
        word_width=width-290
        (source/f'borrowbuddy-wordmark-{mode}.svg').write_text(svg(f'BorrowBuddy wordmark {mode}',f'<g transform="translate(-274 -78)">{outlined_word}</g>',word_width+32,96),encoding='utf-8')
        scale=384/(width-332)
        stacked=f'<g transform="translate(128 0)">{mark}</g><g transform="translate({64-290*scale:.6f} {320-158*scale:.6f}) scale({scale:.6f})">{outlined_word}</g>'
        (source/f'borrowbuddy-stacked-{mode}.svg').write_text(svg(f'BorrowBuddy stacked {mode}',stacked,512,368),encoding='utf-8')
    # Pixel-aligned compact cut: straight outer corners, larger 32-unit center gap.
    small_left=BRAND['smallPaths']['left']
    small_right=BRAND['smallPaths']['right']
    small=''.join(f'<path fill="{color}" d="{path}"/>' for color,path in [(PALETTE['paper'],small_left),(PALETTE['amber'],small_right)])
    (source/'borrowbuddy-symbol-small-dark.svg').write_text(svg('BorrowBuddy compact dark symbol',small),encoding='utf-8')
    # Square master: 192 * .88 = 168.96 units (66%); safe in circular/PWA masks.
    tile=f'<path fill="{PALETTE["navy"]}" d="M0 0H256V256H0Z"/><g transform="translate(15.36 15.36) scale(.88)">{small}</g>'
    (digital/'borrowbuddy-icon-tile.svg').write_text(svg('BorrowBuddy app icon',tile),encoding='utf-8')
    (KIT/'brand-source.json').write_text(json.dumps(BRAND,indent=2)+'\n',encoding='utf-8')
    print('Approved Buddy Brackets: 20 outlined SVG lockups, compact cut and icon tile.')


if __name__=='__main__':
    build()
