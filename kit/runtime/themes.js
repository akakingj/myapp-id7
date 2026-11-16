'use strict';
/**
 * themes.js - colour schemes for kit-drawn screens. Picked per app in its
 * settings ("theme"); unknown ids fall back to M Tricolour, the default.
 * oil = colour of oil temperature (red in M Tricolour, so it stands apart from the blue coolant).
 * bar = fill of the OEM-style bars, hang = their peak hold (default: the fill colour), sel = selected tab (selText = its name, default sel), marker = the '|' at the end of a bar / on a chart.
 * ramp = colours a bar runs through from low to high; hotRamp = a dial's arc, running
 * from the theme colour to red at the dial's limit (redline, max boost, ...).
 */
const THEMES = {
    m_red: {
        name: 'M Red',
        bg: '#050506', panelTop: '#17181c', panelBottom: '#0d0d10', panelEdge: '#2a2b31',
        tab: '#e6e6e6', track: '#222329', tick: '#5a5c64', text: '#ffffff', dim: '#8e9199',
        accent: '#e1001a', accent2: '#ff5a5f', ok: '#e1001a', warn: '#ffb31a', crit: '#ff1f1f', cold: '#3d8bff',
        glow: '#e1001a55', stripes: ['#e1001a'], oil: '#e1001a', bar: '#d7001a', sel: '#e1001a', marker: '#ffffff', ramp: ['#7a0010', '#e1001a', '#ff5a64'],
        hotRamp: ['#7a0010', '#b00016', '#e1001a', '#ff2030', '#ff5a64'],
    },
    m_tricolour: {
        name: 'M Tricolour',
        bg: '#04060a', panelTop: '#141a24', panelBottom: '#0a0d13', panelEdge: '#242c39',
        tab: '#e6e6e6', track: '#1b212b', tick: '#4c5666', text: '#f4f7fb', dim: '#8a95a6',
        accent: '#f4f7fb', accent2: '#81c4ff', ok: '#f4f7fb', warn: '#ffb020', crit: '#ef2b2d', cold: '#7fd1ff',
        glow: '#ffffff40', stripes: ['#81c4ff', '#16588e', '#e7222e'], oil: '#ef2b2d', ramp: ['#7d8694', '#c9d0da', '#ffffff'],
        bar: '#a8101c', hang: '#ef2b2d', sel: '#ef2b2d', selText: '#ffffff', marker: '#ef2b2d',
        hotRamp: ['#1f5fd0', '#3d9bff', '#3d9bff', '#c04cdc', '#ef2b2d'],
    },
    ice: {
        name: 'Ice White',
        bg: '#050607', panelTop: '#1a1c20', panelBottom: '#0d0e10', panelEdge: '#2e3138',
        tab: '#ffffff', track: '#24262b', tick: '#62666e', text: '#ffffff', dim: '#9aa0a8',
        accent: '#e9f2ff', accent2: '#ffffff', ok: '#e9f2ff', warn: '#ffc94d', crit: '#ff4040', cold: '#8fd3ff',
        glow: '#e9f2ff40', stripes: ['#e9f2ff'], oil: '#e9f2ff', bar: '#c9d3df', sel: '#ffffff', marker: '#ffffff', ramp: ['#6d7785', '#c9d6e6', '#ffffff'],
        hotRamp: ['#6d7785', '#c9d6e6', '#e9f2ff', '#ff9a9a', '#ff4040'],
    },
    amber: {
        name: 'Night Amber',
        bg: '#060504', panelTop: '#1a1815', panelBottom: '#0d0c0a', panelEdge: '#2e2a24',
        tab: '#ffb000', track: '#25221d', tick: '#655d50', text: '#ffe2b0', dim: '#9a8a70',
        accent: '#ff9d00', accent2: '#ffc65c', ok: '#ff9d00', warn: '#ffd000', crit: '#ff3b1f', cold: '#7fb7ff',
        glow: '#ff9d0050', stripes: ['#ff9d00'], oil: '#ff9d00', bar: '#ff9d00', sel: '#ff9d00', marker: '#ffe2b0', ramp: ['#8a4b00', '#ff9d00', '#ffd27a'],
        hotRamp: ['#8a4b00', '#ff9d00', '#ff9d00', '#ff6a1f', '#ff3b1f'],
    },
};

/*
 * Skins: the shape of the kit's drawing as well as its colours, picked per app in its settings ("skin", or the Car
 * profile's for every app). 'classic' (the default) is the themes above. 'idrive7' draws as the head unit's own
 * screens (the G20 iDrive 7 reference): near-black, silver slanted rails and dials with a red marker, flat menu rows
 * and tabs with the orange focus gradient (focusTop -> focusBottom, a thin orange edge), regular-weight text in
 * normal case. Its palette is its own: the colour theme applies to the classic skin only.
 * line = the fine dividers (menu rows, bar edges), silver = a rail's fill from its top edge down, focusTop /
 * focusBottom = the focus gradient.
 */
const SKINS = {
    idrive7: {
        name: 'iDrive 7', skin: 'idrive7',
        bg: '#030304', panelTop: '#0b0b0d', panelBottom: '#060607', panelEdge: '#2c2b2f',
        tab: '#f4f3f2', track: '#4b4a50', tick: '#8f8d92', text: '#f4f3f2', dim: '#b5b3b4',
        accent: '#ff570c', accent2: '#ff8a4c', ok: '#e6e5e8', warn: '#ffb020', crit: '#f32d2e', cold: '#7fd1ff',
        glow: '#ff570c40', stripes: ['#ff570c'], oil: '#f32d2e', bar: '#cfced3', hang: '#ff570c', sel: '#ff570c', selText: '#ffffff',
        marker: '#f32d2e', needle: '#f32d2e',
        ramp: ['#8e8d92', '#c9c8cc', '#f2f2f4'],
        hotRamp: ['#8e8d92', '#b4b3b7', '#dcdbde', '#f0eff2', '#f32d2e'],
        line: '#545154', silver: ['#f6f6f8', '#c9c8cd', '#8d8c92'], focusTop: '#743008', focusBottom: '#361303',
    },
};

/** The colours (and with a skin other than classic, the skin) to draw with. */
function theme(id, skin) { return (skin && SKINS[skin]) || THEMES[id] || THEMES.m_tricolour; }
const ids = () => Object.keys(THEMES);

module.exports = { THEMES, SKINS, theme, ids };
