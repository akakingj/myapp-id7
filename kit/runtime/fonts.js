'use strict';
/**
 * fonts.js - loads the pre-baked glyph atlases (kit/runtime/fonts/*.json,
 * made by kit/tools/bake_fonts.py) and picks the best size for a request.
 *
 *   register(name, atlas) -> an app's own small atlas (the same JSON, e.g. a few glyphs of a sign in another
 *   script): text asked for in that family stays in it, not switched to the shared Korean / CJK / Cyrillic ones
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIR = path.join(__dirname, 'fonts');
const families = Object.create(null), own = Object.create(null);

const parse = (j, name) => j.sizes.map((s) => ({
    size: s.size, ascent: s.ascent, descent: s.descent, atlasW: s.atlasW, atlasH: s.atlasH,
    glyphs: s.glyphs, _alpha: s.alpha, alpha: null, family: name, cacheKey: j.cacheKey || '',
}));

function family(name) {
    if (families[name] !== undefined) return families[name];
    let fam = null;
    try { fam = parse(JSON.parse(fs.readFileSync(path.join(DIR, name + '.json'), 'utf8')), name); } catch (e) { fam = null; }
    families[name] = fam;
    return fam;
}

/** Smallest baked size >= requested (downscaling looks better), else largest. */
function get(name, size, text) {
    // Shared supplemental atlases avoid duplicating glyphs in every numeric size (an app's own family: kept).
    if (own[name]) { /* its own glyphs */ } else if (text && /[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7ff]/.test(text)) name = 'korean';
    else if (text && /[\u3000-\u9fff\uff00-\uffef]/.test(text)) name = 'cjk';
    else if (text && /[\u0400-\u04ff]/.test(text)) name = 'cyrillic';
    const fam = family(name) || family('label');
    if (!fam) return null;
    let best = null;
    for (const f of fam) if (f.size >= size && (!best || f.size < best.size)) best = f;
    if (!best) best = fam[fam.length - 1];
    if (!best.alpha) best.alpha = zlib.inflateSync(Buffer.from(best._alpha, 'base64'));
    return best;
}

/** Whether a family's atlas is there (get() falls back to 'label' for one that isn't). */
function has(name) { return !!family(name); }

function measure(f, s) {
    let w = 0;
    for (const ch of s) { const g = f.glyphs[ch.codePointAt(0)] || f.glyphs[63]; if (g) w += g[6]; }
    return w;
}

/** An app's own atlas (bake_fonts.py's JSON) as family `name`; a bad one is left out (its text falls back to 'label'). */
function register(name, j) {
    let fam = null;
    try { fam = parse(j, name); } catch (e) { fam = null; }
    if (!fam || !fam.length) return false;
    families[name] = fam; own[name] = true;
    return true;
}

module.exports = { get, has, measure, register };
