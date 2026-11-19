// Every tunable of the desk, with Clark's chosen defaults. With ?tune in the URL each one is also a URL parameter and a
// slider in the tune panel (press t). Distances are CSS px, speed is CSS px per second; only the agent count and the sim
// resolution re-seed the sim. Rows are [key, default, min, max, step, label]; a string default is a select (options in
// CHOICES), a 0/1 default with step 1 is a checkbox.
export type Param = [key: string, def: number | string, min: number, max: number, step: number, label: string];

export const GROUPS: Record<string, Param[]> = {
  Look: [['look', 'original', 0, 0, 0, 'preset']],
  Performance: [
    ['auto', 1, 0, 1, 1, 'auto quality'],
    ['res', 0.5, 0.2, 1, 0.05, 'sim resolution (re-seeds)'],
    ['agents', 200000, 4000, 400000, 1000, 'agents (re-seeds)'],
  ],
  Agents: [
    ['speed', 93, 10, 400, 1, 'speed px/s'],
    ['turn', 0.1, 0, 1.5, 0.01, 'turn'],
    ['sa', 0.5, 0.05, 1.5, 0.01, 'sensor angle'],
    ['sd', 26.6, 4, 80, 0.2, 'sensor distance px'],
    ['decay', 0.9, 0.8, 0.995, 0.001, 'trail decay'],
    ['deposit', 0.038, 0.005, 0.2, 0.001, 'deposit'],
    ['diffuse', 0.79, 0, 1, 0.01, 'diffuse'],
    ['respawn', 0.003, 0, 0.02, 0.0005, 'respawn / step'],
    ['hoverE', 0.04, 0, 0.2, 0.002, 'hover excitation'],
    ['cursorE', 0.1, 0, 0.2, 0.002, 'cursor excitation'],
  ],
  'Card outlines': [
    ['edgeMode', 'max', 0, 0, 0, 'mode'],
    ['edge', 0.55, 0, 2, 0.01, 'strength'],
    ['ridge', 7, 0, 40, 0.5, 'distance px'],
    ['ridgeW', 3.5, 1, 24, 0.5, 'width px'],
    ['ring2', 1, 0, 1, 1, 'second ring (on in ring2)'],
    ['ring2At', 2.25, 1.5, 6, 0.05, 'second ring at x distance'],
    ['corner', 0, 0, 4, 0.05, 'corner emphasis'],
    ['share', 1, 0.05, 1, 0.05, 'share of agents'],
  ],
  Cards: [
    ['shadowSoft', 1.1, 0.2, 3, 0.05, 'shadow softness'],
    ['shadow', 1.35, 0, 5, 0.05, 'shadow strength'],
    ['lift', 60, 0, 60, 1, 'lift height px'],
    ['tilt', 6, 0, 20, 0.5, 'tilt max deg'],
    ['flipS', 0.7, 0.15, 1.5, 0.05, 'flip duration s'],
    ['puff', 1.6, 0, 6, 0.05, 'flip puff strength'],
    ['puffAt', 0, 0, 0.6, 0.02, 'puff after landing s'],
    ['emitIn', 0.8, 0.1, 4, 0.1, 'open card color in s'],
    ['emitOut', 4, 0.5, 12, 0.25, 'color fade after close s'],
    ['puffR', 29, 0, 60, 1, 'flip puff radius px'],
    ['puffDecay', 0.955, 0.8, 0.995, 0.001, 'flip puff decay / step'],
  ],
  Media: [
    ['fadeIn', 0.4, 0.05, 2, 0.05, 'fade in s'],
    ['fadeOut', 1, 0.1, 3, 0.05, 'fade out s'],
    ['finishFirst', 1, 0, 1, 1, 'finish clip before fading out'],
    ['xfade', 0.6, 0.1, 2, 0.05, 'crossfade s'],
    ['hold', 0, 0, 10, 0.25, 'clip hold s (0 = whole clip)'],
    ['hoverDelay', 0, 0, 800, 10, 'hover delay ms'],
  ],
  // Prints: card images treated as photos printed on the desk's paper. A preset sets the knobs below it.
  Prints: [
    ['print', 'print', 0, 0, 0, 'preset'],
    ['pDesat', 0.22, 0, 1, 0.01, 'desaturate'],
    ['pWarm', 0.7, 0, 1, 0.01, 'white balance to paper'],
    ['pBlack', 0.03, 0, 0.12, 0.001, 'lift blacks to ink'],
    ['pGrain', 1, 0, 3, 0.05, 'paper grain'],
    ['pMatte', 1.5, 0, 12, 0.25, 'matte edge px'],
    ['pDuo', 0, 0, 1, 0.01, 'duotone at rest'],
  ],
  Camera: [
    ['panS', 0.9, 0.2, 2.5, 0.05, 'pan duration s'],
    ['panEase', 'cubic', 0, 0, 0, 'pan easing'],
  ],
};

// none: no food | max: a band of food that tops the trail up | plus: the band adds to the trail | corners: blobs at the
// four corners | center: one blob under the card | ring2: max plus a second ridge farther out
export const EDGE_MODES = ['none', 'max', 'plus', 'corners', 'center', 'ring2'];
export const EASES: Record<string, (u: number) => number> = {
  cubic: (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2),
  quint: (u) => (u < 0.5 ? 16 * u ** 5 : 1 - (-2 * u + 2) ** 5 / 2),
  sine: (u) => -(Math.cos(Math.PI * u) - 1) / 2,
  linear: (u) => u,
};
export const PRINTS: Record<string, Record<string, number>> = {
  print: { pDesat: 0.22, pWarm: 0.7, pBlack: 0.03, pGrain: 1, pMatte: 1.5, pDuo: 0 },
  duotone: { pDesat: 0.22, pWarm: 0.7, pBlack: 0.03, pGrain: 1, pMatte: 1.5, pDuo: 1 }, // full color fades in as the card plays
  'as-is': { pDesat: 0, pWarm: 0, pBlack: 0, pGrain: 0, pMatte: 0, pDuo: 0 },
};

export type Style = Record<string, number | string>;

// Looks set the agents and the main page's ink. original: the first desk (26k agents on a 0.45x grid, soft pale veins,
// big open cells); k8: denser, finer olive veins.
export const LOOKS: Record<string, { T: Record<string, number>; main: Style }> = {
  original: { T: { res: 0.45, agents: 32100, speed: 147, turn: 0.35, sa: 0.5, sd: 26.7, decay: 0.9, deposit: 0.045, diffuse: 1, respawn: 0, edge: 0.14 },
    main: { ink: 'b0b993', opacity: 1, gain: 1.1, gamma: 1.8, soft: 0.4, grain: 0.16, glow: 0, halo: 0, tint: 0 } },
  k8: { T: { res: 0.5, agents: 200000, speed: 93, turn: 0.1, sa: 0.5, sd: 26.6, decay: 0.9, deposit: 0.038, diffuse: 0.79, respawn: 0.003, edge: 0.55 },
    main: { ink: 'a5a970', opacity: 1, gain: 0.69, gamma: 1.47, soft: 0.8, grain: 0.16, glow: 0, halo: 0, tint: 0 } },
};

export const MODES = ['paper', 'spectrum', 'j'];
export const CHOICES: Record<string, string[]> = { look: Object.keys(LOOKS), edgeMode: EDGE_MODES, panEase: Object.keys(EASES), mode: MODES, print: Object.keys(PRINTS) };
export const RESEED = ['agents', 'res', 'auto']; // the only settings that rebuild the sim

// Per-page styles. paper: light paper, one muted ink that darkens like dye. spectrum: a dark surface where each card's
// veins glow in the card's own hue and add like light. j: warm paper, each card's own ink, a light stain over cards.
export const PAGE_NAMES = ['main', 'research'] as const;
export const STYLE_PARAMS: Param[] = [
  ['mode', 'paper', 0, 0, 0, 'style'],
  ['bg', 'f3f1ea', 0, 0, 0, 'background'],
  ['ink', '929664', 0, 0, 0, 'ink'],
  ['opacity', 1, 0, 4, 0.05, 'ink opacity'],
  ['gain', 1.1, 0.1, 4, 0.01, 'gain'],
  ['gamma', 1.8, 0.4, 3, 0.01, 'gamma'],
  ['soft', 0.7, 0, 2, 0.05, 'softness'],
  ['grain', 0.1, 0, 0.6, 0.01, 'paper grain'],
  ['glow', 1.5, 0, 4, 0.05, 'glow'], // paper: darker dense vein cores; spectrum: vein brightness
  ['halo', 0.6, 0, 2, 0.05, 'halo'], // paper: a soft ink bleed around veins; spectrum: a soft light around veins
  ['tint', 0, 0, 1, 0.01, 'project color strength'],
  ['hueMix', 0, 0, 1, 0.01, 'project hue (0 = olive, 1 = own hue)'],
  ['stain', 0.1, 0, 1, 0.01, 'ink stain over cards'],
  ['bleed', 7, 0, 24, 0.5, 'ink bleed into borders px'],
  ['bloom', 1.5, 0.2, 5, 0.1, 'bloom into colors s'],
];
export const J_KEYS = ['stain', 'bleed', 'bloom'];
const J_DEFAULTS = { stain: 0.1, bleed: 7, bloom: 1.5 };
// Light theme: the main desk on paper, research in the J desk's look. Dark theme: both pages in the spectrum style.
export const LIGHT_STYLES: Record<string, Style> = {
  main: { mode: 'paper', bg: 'f3f1ea', ink: 'a5a970', opacity: 1, gain: 0.69, gamma: 1.47, soft: 0.8, grain: 0.16, glow: 0, halo: 0, tint: 0, hueMix: 0.3, ...J_DEFAULTS },
  research: { mode: 'j', bg: 'f3f1ea', ink: 'a5a970', opacity: 0.65, gain: 0.8, gamma: 1.3, soft: 0.9, grain: 0, glow: 1.6, halo: 0.7, tint: 0.3, hueMix: 1, ...J_DEFAULTS },
};
const SPECTRUM: Style = { mode: 'spectrum', bg: '070707', ink: '929664', opacity: 1, gain: 1.5, gamma: 1.3, soft: 0.9, grain: 0, glow: 1.6, halo: 0.7, tint: 0, hueMix: 0, ...J_DEFAULTS };
export const DARK_STYLES: Record<string, Style> = { main: SPECTRUM, research: SPECTRUM };
