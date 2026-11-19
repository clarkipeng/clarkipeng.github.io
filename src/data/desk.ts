// The desk's cards: where each lies, how it looks, and its media. Titles, descriptions, and links come from siteData;
// only the desk's own captions (the short label and the gray aside) live here.
import { experience, portfolioProjects, publications, shortBio, siteConfig, socialLinks } from './siteData';

export type DeskRegion = 0 | 1; // 0: main desk ("/"), 1: research desk ("/publications")
export const deskPath = (region: DeskRegion) => (region ? '/publications' : '/');
export type DeskLink = { label: string; href: string };
export type DeskCard = {
  key: string;
  kind: 'photo' | 'polaroid' | 'note';
  region: DeskRegion;
  slot: [x: number, y: number, width: number, rotation: number]; // center and width on a 1440x900 region, degrees
  order: number; // position in the phone column
  label: string; // caption title, polaroid line, or note text (\n breaks a line)
  sub?: string; // gray aside next to the caption
  image?: string;
  alt?: string;
  aspect?: number; // image area width / height
  frame?: [zoom: number, x: number, y: number]; // crop placement, like object-position, for the image and its clips
  clips?: string[]; // hover playlist, crossfaded
  hue?: string; // own hue in the dark (spectrum) style
  ink?: string; // own ink on paper, emitted while the card is open
  jink?: string; // own ink on the research desk
  back?: { title?: string; paras: string[]; links: DeskLink[] };
  nav?: DeskRegion; // a note that pans to the other desk instead of flipping
};

const media = (file: string) => `/desk/${file}`;
const clips = (key: string, nums: number[]) => nums.map((n) => media(`clips/${key}-0${n}.mp4`));
const project = (id: number) => {
  const p = portfolioProjects.find((x) => x.id === id)!;
  return { paras: [p.description], links: p.links };
};
const paper = (id: number) => {
  const p = publications.find((x) => x.id === id)!;
  return { title: p.title, paras: [p.abstract], links: p.links };
};
const catapult = experience[0];
const linkTypes = ['github', 'scholar', 'linkedin', 'x', 'kaggle'];
export const deskLinks: DeskLink[] = [
  ...linkTypes.map((t) => socialLinks.find((l) => l.type === t)!).map(({ label, href }) => ({ label, href })),
  { label: 'Resume', href: siteConfig.resumeUrl },
];

export const deskCards: DeskCard[] = [
  { key: 'slime', kind: 'photo', region: 0, slot: [318, 528, 336, -1.6], order: 1, aspect: 1.7778, frame: [1.15, 0.5, 0.5],
    label: '3D slime simulation', sub: 'also: the background', image: media('slime-poster.webp'), alt: '3D slime simulation render',
    clips: clips('slime', [2, 3, 1]), ink: '5a52b8', hue: '8f6cff', back: project(1) },
  { key: 'catapult', kind: 'photo', region: 0, slot: [792, 500, 300, -1.2], order: 2, aspect: 1.9048,
    label: catapult.company, sub: 'previously CTO', image: media('catapult-poster.webp'), alt: 'Catapult gameplay',
    clips: clips('catapult', [1, 2, 3]), ink: '8a45a8', hue: 'ff8a5c',
    back: { paras: [catapult.description, 'Music Arena: AI models make music in FL Studio and people vote.'],
      links: [{ label: 'playcatapult.io', href: siteConfig.company.url }] } },
  { key: 'suika', kind: 'photo', region: 0, slot: [1214, 604, 214, -2.2], order: 3, aspect: 1,
    label: '4D fruit merging game', sub: 'playable on itch.io', image: media('suika-poster.webp'), alt: '4D fruit merging game',
    clips: clips('suika', [1, 2, 3]), ink: 'b37a1f', hue: 'f2b544', back: project(2) },
  { key: 'rl', kind: 'photo', region: 0, slot: [520, 780, 238, 1.3], order: 4, aspect: 1.6667,
    label: 'RL arm', sub: 'learned to throw things', image: media('rl-poster.webp'), alt: 'RL arm',
    clips: clips('rl', [1, 2]), ink: '1f8580', hue: '4fc3f7', back: project(5) },
  { key: 'ray', kind: 'photo', region: 0, slot: [1214, 222, 176, 2.6], order: 5, aspect: 1, frame: [1.15, 0.2, 0.5],
    label: 'Raytracer', sub: 'for light and sound', image: media('ray-poster.webp'), alt: 'Raytraced scene',
    clips: clips('ray', [1, 2]), ink: 'a8343f', hue: 'ff5d73', back: project(6) },
  { key: 'me', kind: 'polaroid', region: 0, slot: [610, 206, 164, 3.4], order: 0, aspect: 0.8, frame: [1, 0.5, 0.3],
    label: 'me, mid-sentence', image: siteConfig.avatarUrl, alt: siteConfig.name, hue: 'f0a3c4',
    back: { title: siteConfig.name, paras: shortBio, links: [] } },
  { key: 'note', kind: 'note', region: 0, slot: [852, 166, 196, -3], order: 6, hue: 'f6e27a',
    label: 'ask me about:\n4D geometry, slime molds, why AI video can\'t pour water', back: { paras: [], links: deskLinks } },
  { key: 'to-research', kind: 'note', region: 0, slot: [1004, 786, 150, 2.2], order: 7, label: 'research →', nav: 1 },
  { key: 'vp2', kind: 'photo', region: 1, slot: [430, 318, 330, 1.4], order: 10, aspect: 1.5326,
    label: 'VideoPhy-2: can video models do physics?', sub: 'ICLR 2026 · co-first author', image: media('papers/videophy2.webp'),
    alt: 'VideoPhy-2: performance on the dataset under human evaluation', clips: clips('vp2', [1, 2, 3, 4]),
    hue: 'ffa13d', ink: 'c0622a', jink: '8c481c', back: paper(1) },
  { key: 'pdfr', kind: 'photo', region: 1, slot: [1080, 330, 262, -1], order: 11, aspect: 1.2097,
    label: 'Boundary Density Likelihood for Direct Event-Time Supervision', sub: 'arXiv 2024', image: media('papers/event-detection.webp'),
    alt: 'Event detection on a held-out sleep window', clips: clips('pdfr', [1]),
    hue: '38e0a0', ink: '2f8a63', jink: '2c3c82',
    back: { ...paper(3), links: [portfolioProjects.find((p) => p.id === 4)!.links[0], ...paper(3).links] } },
  { key: 'moe', kind: 'photo', region: 1, slot: [770, 636, 300, 1.1], order: 12, aspect: 2.4291,
    label: 'Cross-Lingual Alignment for Decoder-Only Models using MoE Routers', sub: 'arXiv 2026', image: media('papers/moe-routers.webp'),
    alt: 'Routing alignment during continued pretraining', hue: '6f9bff', ink: '3f66b8', jink: '54348a', back: paper(4) },
  { key: 'dialect', kind: 'photo', region: 1, slot: [380, 720, 330, -1.2], order: 13, aspect: 2.537,
    label: 'DialectGen: dialect robustness in image and video generation', sub: 'NeurIPS 2025 workshop', image: media('papers/dialectgen.webp'),
    alt: 'Model generations for Standard American English and a lower-resource dialect', hue: 'ff5fb0', ink: 'ad3f78', jink: '803c52', back: paper(2) },
  { key: 'tsm', kind: 'photo', region: 1, slot: [1130, 690, 300, -1.6], order: 14, aspect: 1.7266,
    label: 'Variable-Rate Harmonic-Percussive Time-Scale Modification with Real-Time Playback in Python', sub: 'arXiv 2026',
    image: media('papers/time-scale-modification.webp'), alt: 'Updating the audio buffer with PV and OLA synthesis frames',
    hue: 'b98bff', ink: '6e52b8', jink: '1e6460', back: paper(5) },
  { key: 'to-main', kind: 'note', region: 1, slot: [150, 112, 128, -2.4], order: 9, label: '← back', nav: 0 },
];
