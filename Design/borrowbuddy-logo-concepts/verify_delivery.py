"""Check the approved kit and its exact web/Android integration outputs."""
from pathlib import Path
import hashlib
import json
import struct
import shutil
import xml.etree.ElementTree as ET
from PIL import Image
from build_kit import BRAND, PROJECT, KIT


def verify():
    masters = sorted((KIT / 'source').glob('*.svg'))
    assert len(masters) == 21
    for master in masters:
        root = ET.parse(master).getroot()
        assert root.get('viewBox')
        assert not any(node.tag.rsplit('}', 1)[-1] in
                       {'text', 'image', 'filter', 'script', 'foreignObject'}
                       for node in root.iter()), master
    symbol = ET.parse(KIT / 'source/borrowbuddy-symbol-dark.svg').getroot()
    paths = [node.get('d') for node in symbol if node.tag.endswith('path')]
    assert paths == list(BRAND['paths'].values())
    kotlin = (PROJECT / 'apps/android/app/src/main/java/in/borrowbuddy/android/graphics/BorrowBuddyBrand.kt').read_text(encoding='utf-8')
    for path in paths:
        assert path in kotlin
    digital = KIT / 'digital'
    for name, size in [('icon-192.png', 192), ('icon-512.png', 512),
                       ('maskable-512.png', 512), ('apple-touch-icon.png', 180),
                       ('borrowbuddy-icon-tile-512.png', 512)]:
        with Image.open(digital / name) as image:
            assert image.size == (size, size), name
            assert image.convert('RGBA').getchannel('A').getextrema() == (255, 255), name
    for mode in ['color', 'dark', 'black', 'white']:
        with Image.open(digital / f'borrowbuddy-symbol-{mode}.png') as image:
            assert image.size == (1024, 1024)
            assert image.convert('RGBA').getchannel('A').getextrema() == (0, 255)
    ico = (digital / 'favicon.ico').read_bytes()
    assert struct.unpack_from('<HHH', ico) == (0, 1, 3)
    for index, size in enumerate([16, 32, 48]):
        width, height, _, _, _, bits, length, offset = struct.unpack_from('<BBBBHHII', ico, 6 + index * 16)
        assert width == height == size and bits == 32
        png = ico[offset:offset + length]
        assert png[:8] == b'\x89PNG\r\n\x1a\n' and png[25] == 6
    web = PROJECT / 'apps/web'
    for name in ['icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-icon.png', 'favicon.svg']:
        assert (digital / name).read_bytes() == (web / 'public/icons' / name).read_bytes()
    assert ico == (web / 'src/app/favicon.ico').read_bytes()
    res = PROJECT / 'apps/android/app/src/main/res'
    for name in ['ic_launcher', 'ic_launcher_round']:
        root = ET.parse(res / f'mipmap-anydpi/{name}.xml').getroot()
        assert root.tag == 'adaptive-icon'
        assert root.find('monochrome') is not None
        assert not (res / f'mipmap-nodpi/{name}.png').exists()
    for relative in ['mipmap-anydpi/ic_launcher.xml', 'mipmap-anydpi/ic_launcher_round.xml',
                     'drawable/borrowbuddy_launcher_foreground.xml',
                     'drawable/borrowbuddy_launcher_monochrome.xml', 'values/brand.xml']:
        destination = KIT / 'android/res' / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(res / relative, destination)
    report = dict(direction='B — Buddy Brackets', svgMasters=21,
                  outlinedTypography=True, sharedGeometryMatchesNative=True,
                  transparentSymbolPngs=True, opaqueWebIconTiles=True,
                  nextCompatibleRgbaIcoSizes=[16, 32, 48],
                  webCopiesByteIdentical=True, androidMinimumApi=31,
                  adaptiveRoundAndThemedResources=True,
                  appAcceptance='Separate; see apps/android/verification/brand-checkpoint.json')
    (KIT / 'delivery-checks.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    lines = [hashlib.sha256(file.read_bytes()).hexdigest() + '  ' + file.relative_to(KIT).as_posix()
             for file in sorted(KIT.rglob('*')) if file.is_file() and file.name != 'FILES.sha256']
    (KIT / 'FILES.sha256').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    verify()
