#!/usr/bin/env python3
"""Bake Water Cup's shop sign: the few glyphs of SIGN, from Noto Sans CJK JP Bold, into apps/ak_water_cup/sign_font.js.

  python3 kit/tools/bake_water_cup_sign.py [path/to/NotoSansCJK-Bold.ttc]

The shared CJK atlas (kit/runtime/fonts/cjk.json) holds only the Chinese translations' glyphs, so the sign's own
eight are baked apart, for this app alone (kit fonts.register); the Japanese face (index 0 of the collection),
for the sign's Japanese forms. Noto Sans CJK: SIL Open Font License 1.1, Copyright 2014-2021 Adobe, with Reserved
Font Name 'Source' (the licence's text: kit/runtime/fonts/OFL-NotoSansSC.txt, the same family's).
"""
import importlib.util
import json
import sys
from pathlib import Path

from PIL import ImageFont

SIGN = '東河豆腐亀島本店'
SIZE = 40
ROOT = Path(__file__).resolve().parent.parent.parent
font = sys.argv[1] if len(sys.argv) > 1 else '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'

spec = importlib.util.spec_from_file_location('bake_fonts', Path(__file__).resolve().parent / 'bake_fonts.py')
baker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(baker)
baker.load = lambda fname, var, size: ImageFont.truetype(fname, size, index=0)
face = ImageFont.truetype(font, SIZE, index=0).getname()
if face[0] != 'Noto Sans CJK JP':
    raise SystemExit('expected Noto Sans CJK JP at index 0, got ' + ' '.join(face))
atlas = baker.bake(font, None, SIZE, SIGN)
missing = [c for c in SIGN if not atlas['glyphs'].get(ord(c), [0, 0, 0])[2]]
if missing:
    raise SystemExit('not in the font: ' + ''.join(missing))
data = {'family': 'ak_wc_sign', 'source': 'Noto Sans CJK JP Bold (OFL-1.1)', 'text': SIGN, 'sizes': [atlas]}
out = ROOT / 'apps/ak_water_cup/sign_font.js'
out.write_text("'use strict';\n// sign_font.js - made by kit/tools/bake_water_cup_sign.py (don't edit): Water Cup's shop sign, "
               + SIGN + ",\n// " + str(SIZE) + " px glyphs of Noto Sans CJK JP Bold (SIL OFL 1.1, Copyright 2014-2021 Adobe; kit/runtime/fonts/OFL-NotoSansSC.txt)\n"
               + 'module.exports = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
print('sign:', len(SIGN), 'glyphs,', atlas['atlasW'], 'x', atlas['atlasH'], 'pixels,', out.stat().st_size, 'bytes')
