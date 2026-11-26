import { clips, mediaUrl } from 'virtual:desk-media';
import { currentDesk } from './state.ts';
import { MOTION } from './tunables.ts';
import type { Card, Clip, Video } from './layout.ts';


export function mountPlayer() {
const desk = currentDesk();
const { qs, body, reduced, sources, T } = desk;
// ---------- media: crossfading playlists ----------

// media/clips.json maps a card key to { poster, clips }; new clips drop in with no code change. Cards without an entry
// fall back to their data-video source.
const clipLists = clips; // clips.json, built in; every media address carries its file's content hash
// Each clip is "file.mp4" or { "src": "file.mp4", "start": seconds } (default start 0).
function playlistFor(s: Card): Clip[] | null {
  if (!s.media) return null; // only cards with a media area can play clips
  const e = clipLists[s.key];
  if (e?.clips?.length) return e.clips.map((c) => (typeof c === 'string' ? { src: mediaUrl('/desk-media/' + c), start: 0 } : { src: mediaUrl('/desk-media/' + c.src), start: Number(c.start) || 0 }));
  return s.videoSrc ? [{ src: s.videoSrc, start: 0 }] : null;
}
function makeVideo(src: string, lazy = false) {
  const v = document.createElement('video');
  v.muted = true; v.defaultMuted = true; v.playsInline = true; v.preload = lazy ? 'none' : 'auto';
  v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
  v.src = src;
  if (qs.has('mlog')) for (const ev of ['play', 'playing', 'pause', 'seeked', 'ended', 'waiting', 'stalled', 'error']) {
    v.addEventListener(ev, () => console.log('[media]', ev, v.currentSrc.split('/').pop(), v.currentTime.toFixed(2), 'rs', v.readyState));
  }
  Object.assign(v.style, { position: 'fixed', left: '0', top: '0', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none' });
  body.append(v);
  return v as Video; // halt sets clipStart before anything reads it
}
// Every play/pause/seek on an element runs in order, so a pending play() never races a pause().
const chain = (v: Video, fn: () => unknown) => (v.op = (v.op || Promise.resolve()).then(fn, fn));
async function playWithRetry(v: Video) {
  for (let k = 0; k < 5; k++) {
    try { await v.play(); return; } catch (err) {
      console.warn('play() rejected', v.currentSrc.split('/').pop(), (err as Error).name, (err as Error).message);
      await new Promise((r) => setTimeout(r, 120 * (k + 1)));
    }
  }
}
const play = (v: Video) => chain(v, () => playWithRetry(v));
// Pause, load the given clip if it is a different one, and rewind to the clip's start.
const halt = (v: Video, clip: Clip) => chain(v, () => {
  v.pause();
  if (!v.src.endsWith(clip.src)) { v.src = clip.src; v.load(); }
  v.clipStart = clip.start;
  v.currentTime = clip.start;
});
// Play from the clip's start: rewinds first unless it is already mid-clip.
const playFromStart = (v: Video) => chain(v, () => { if (v.ended || v.currentTime < v.clipStart) v.currentTime = v.clipStart; }).then(() => play(v));

// A card's player: two video elements; the first clip loads now, the next only once this card's video starts.
function makePlayer(s: Card) { s.player = new Player(s.playlist!); }
const wake = (v: Video) => chain(v, () => { v.preload = 'auto'; v.load(); v.currentTime = v.clipStart || 0; });
const idle = (fn: () => void) => ((window as Partial<Window>).requestIdleCallback ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 200));
// Preload: once the intro is over and the page is idle, each card's first clip loads, one at a time, the page you are on
// first, so a first hover plays at once. Later clips stay lazy. Nothing preloads on Save-Data or a 2g connection, on
// phones (no hover), with reduced motion, or without WebGPU; then a player is made on first hover, as before.
function preloadClips() {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection; // not in TS's DOM lib
  if (desk.dead || desk.view.phone || reduced || !desk.gpu || c?.saveData || /2g$/.test(c?.effectiveType || '')) return;
  const queue = sources.filter((s) => s.playlist && !s.player).sort((a, b) => Number(a.region !== desk.page) - Number(b.region !== desk.page) || a.order - b.order);
  const next = () => {
    const s = queue.shift();
    if (desk.dead || !s) return;
    if (!s.player) makePlayer(s);
    const v = s.player!.v[0];
    if (v.readyState >= 4) { idle(next); return; }
    let done = false;
    const go = () => { if (!done) { done = true; idle(next); } };
    for (const ev of ['canplaythrough', 'error', 'stalled']) v.addEventListener(ev, go, { once: true });
    setTimeout(go, 6000); // a slow clip does not hold up the rest
  };
  next();
}

// Hover playback, one state machine per media card:
//   rest: the card shows its thumbnail, both elements paused at their clip's start.
//   on:   the pointer is over the card. The video fades in (T.fadeIn) as it plays from 0, and the playlist runs with
//         XFADE crossfades for as long as the pointer stays.
//   out:  the pointer left. The current clip plays to its end, then the card fades back to the thumbnail (T.fadeOut)
//         and only then pauses and rewinds. Re-entering during "out" just continues.
// Two elements take turns: the current one plays clip i; XFADE before it ends the other starts clip i + 1 and the shader
// crossfades. The idle element then preloads the clip after that.
const XFADE = 0.6; // s
class Player {
  declare list: Clip[]; declare v: Video[]; declare cur: number; declare i: number; declare fade: number; declare fading: boolean;
  declare state: string; declare outNow: boolean; declare mix: number; declare retry: number; declare quick?: boolean;
  constructor(list: Clip[]) {
    this.list = list;
    this.v = [makeVideo(list[0].src), makeVideo(list[1 % list.length].src, true)]; // the next clip waits until this one plays
    this.v.forEach((v, k) => halt(v, list[k % list.length]));
    this.cur = 0; this.i = 0; this.fade = 0; this.fading = false;
    this.state = 'rest'; this.outNow = false; this.mix = 0; this.retry = 0;
  }
  get a() { return this.v[this.cur]; }
  get b() { return this.v[1 - this.cur]; }
  // Showing video: an element has a frame and is playing, or holds its last frame (ended) while the card fades.
  playing() { return this.v.some((v) => v.readyState >= 2 && v.currentTime > (v.clipStart || 0) && (!v.paused || v.ended)); }
  // Another card wants the video: get out of its way quickly.
  forceOut() { if (this.state !== 'rest') { this.state = 'out'; this.outNow = true; this.quick = true; } }
  reset() {
    this.fading = false; this.fade = 0; this.i = 0; this.cur = 0; this.quick = false;
    halt(this.v[0], this.list[0]); halt(this.v[1], this.list[1 % this.list.length]);
  }
  step(dt: number, hovered: boolean) {
    if (hovered && this.state === 'rest') { this.state = 'on'; playFromStart(this.a); if (this.b.preload === 'none') wake(this.b); }
    else if (hovered && this.state === 'out') { this.state = 'on'; this.outNow = false; } // keep going from here
    else if (!hovered && this.state === 'on') { this.state = 'out'; this.outNow = false; }
    if (this.state === 'rest') return;
    const { a, b } = this;
    if (this.state === 'on' && a.paused && !a.ended && (this.retry -= dt) < 0) { this.retry = 0.5; play(a); } // play() failed: try again
    if (!this.fading && a.duration) {
      if (this.state === 'on' && (a.ended || a.currentTime >= a.duration - XFADE - 0.05)) {
        this.fading = true; this.fade = 0; playFromStart(b);
        if (qs.has('mlog')) console.log('[media] crossfade', a.currentSrc.split('/').pop(), 'at', a.currentTime.toFixed(2), 'of', a.duration.toFixed(2), '->', b.currentSrc.split('/').pop(), 'from', b.currentTime.toFixed(2));
      } else if (this.state === 'out' && (a.ended || a.currentTime >= a.duration - 0.02)) this.outNow = true; // clip finished
    }
    if (this.fading && b.readyState >= 2 && !b.paused) this.fade += dt / XFADE;
    if (this.fading && this.fade >= 1) {
      this.fading = false; this.fade = 0;
      this.cur = 1 - this.cur; this.i = (this.i + 1) % this.list.length;
      halt(this.b, this.list[(this.i + 1) % this.list.length]); // the idle element preloads the next clip
      if (this.state === 'out') this.outNow = true; // the clip that was ending has ended
    }
    const target = this.state === 'on' ? (this.playing() ? 1 : 0) : this.outNow ? 0 : 1;
    this.mix = target > this.mix ? Math.min(target, this.mix + dt / T.fadeIn) : Math.max(target, this.mix - dt / (this.quick ? MOTION.quick : T.fadeOut));
    if (this.state === 'out' && this.outNow && this.mix === 0) {
      this.state = 'rest'; this.outNow = false; this.reset();
      if (qs.has('mlog')) console.log('[media] rest');
    }
  }
}

desk.videoSrc = null; desk.videoMix = 0; desk.probing = false; desk.probeKey = null; // probeKey: the probe holds hover on that card
// Only one card shows video at a time: a newly hovered card waits until the previous one has faded back to rest.
function stepMedia(dt: number) {
  if (desk.probing) return; // the crossfade probe drives the player by hand
  const hov = sources.find((s) => s.player && s.hoverOn) || null;
  if (hov && desk.videoSrc && hov !== desk.videoSrc) desk.videoSrc.player!.forceOut();
  if (hov && (!desk.videoSrc || desk.videoSrc.player!.state === 'rest')) desk.videoSrc = hov;
  for (const s of sources) s.player?.step(dt, s === hov && s === desk.videoSrc);
  desk.videoMix = desk.videoSrc ? desk.videoSrc.player!.mix : 0;
  if (desk.videoSrc && desk.videoSrc.player!.state === 'rest' && desk.videoSrc !== hov) desk.videoSrc = null;
}
return { Player, idle, makePlayer, stepMedia, clipLists, playlistFor, preloadClips, chain, play };
}
