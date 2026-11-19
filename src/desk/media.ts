// Hover playback for a card's clip playlist. Videos are created on the first hover, so nothing downloads before then.
//   rest: the card shows its poster, both elements paused at their clip's start.
//   on:   the pointer is over the card. The video fades in as it plays, and the playlist runs with crossfades.
//   out:  the pointer left. The current clip plays to its end (finishFirst), then the card fades back to the poster and
//         only then pauses and rewinds. Re-entering during "out" just continues.
// Two elements take turns: the current one plays clip i; xfade seconds before it ends the other starts clip i + 1 and
// the shader crossfades. The idle element then preloads the clip after that.

export type MediaSettings = { fadeIn: number; fadeOut: number; finishFirst: number; xfade: number; hold: number };
type Video = HTMLVideoElement & { op?: Promise<unknown>; clipStart?: number };

function makeVideo(src: string, host: HTMLElement): Video {
  const v = document.createElement('video') as Video;
  v.muted = true; v.defaultMuted = true; v.playsInline = true; v.preload = 'auto';
  v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
  v.src = src;
  Object.assign(v.style, { position: 'fixed', left: '0', top: '0', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none' });
  host.append(v);
  return v;
}
// Every play/pause/seek on an element runs in order, so a pending play() never races a pause().
const chain = (v: Video, fn: () => unknown) => (v.op = (v.op || Promise.resolve()).then(fn, fn));
async function playWithRetry(v: Video) {
  for (let k = 0; k < 5; k++) {
    try { await v.play(); return; } catch { await new Promise((r) => setTimeout(r, 120 * (k + 1))); }
  }
}
const play = (v: Video) => chain(v, () => playWithRetry(v));
// Pause, load the given clip if it is a different one, and rewind to its start.
const halt = (v: Video, src: string) => chain(v, () => {
  v.pause();
  if (!v.src.endsWith(src)) { v.src = src; v.load(); }
  v.clipStart = 0;
  v.currentTime = 0;
});
// Play from the clip's start: rewinds first unless it is already mid-clip.
const playFromStart = (v: Video) => chain(v, () => { if (v.ended || v.currentTime < (v.clipStart || 0)) v.currentTime = v.clipStart || 0; }).then(() => play(v));

export class Player {
  v: [Video, Video];
  cur = 0; i = 0; fade = 0; fading = false;
  state: 'rest' | 'on' | 'out' = 'rest'; outNow = false; quick = false; mix = 0; retry = 0;
  private list: string[];
  private T: MediaSettings;

  constructor(list: string[], host: HTMLElement, T: MediaSettings) {
    this.list = list; this.T = T;
    this.v = [makeVideo(list[0], host), makeVideo(list[1 % list.length], host)];
    this.v.forEach((v, k) => halt(v, list[k % list.length]));
  }
  get a() { return this.v[this.cur]; }
  get b() { return this.v[1 - this.cur]; }
  // Showing video: an element has a frame and is playing, or holds its last frame (ended) while the card fades.
  playing() { return this.v.some((v) => v.readyState >= 2 && v.currentTime > (v.clipStart || 0) && (!v.paused || v.ended)); }
  // Another card wants the video: get out of its way quickly.
  forceOut() { if (this.state !== 'rest') { this.state = 'out'; this.outNow = true; this.quick = true; } }
  reset() {
    this.fading = false; this.fade = 0; this.i = 0; this.cur = 0; this.quick = false; this.mix = 0;
    halt(this.v[0], this.list[0]); halt(this.v[1], this.list[1 % this.list.length]);
  }
  destroy() { for (const v of this.v) { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); } }
  step(dt: number, hovered: boolean) {
    const T = this.T;
    if (hovered && this.state === 'rest') { this.state = 'on'; playFromStart(this.a); }
    else if (hovered && this.state === 'out') { this.state = 'on'; this.outNow = false; } // keep going from here
    else if (!hovered && this.state === 'on') { this.state = 'out'; this.outNow = !T.finishFirst; }
    if (this.state === 'rest') return;
    const { a, b } = this;
    const end = T.hold > 0 ? Math.min(a.duration, T.hold) : a.duration;
    if (this.state === 'on' && a.paused && !a.ended && (this.retry -= dt) < 0) { this.retry = 0.5; play(a); } // play() failed: try again
    if (!this.fading && a.duration) {
      if (this.state === 'on' && (a.ended || a.currentTime >= end - T.xfade - 0.05)) { this.fading = true; this.fade = 0; playFromStart(b); }
      else if (this.state === 'out' && (a.ended || a.currentTime >= end - 0.02)) this.outNow = true; // clip finished
    }
    if (this.fading && b.readyState >= 2 && !b.paused) this.fade += dt / T.xfade;
    if (this.fading && this.fade >= 1) {
      this.fading = false; this.fade = 0;
      this.cur = 1 - this.cur; this.i = (this.i + 1) % this.list.length;
      halt(this.b, this.list[(this.i + 1) % this.list.length]); // the idle element preloads the next clip
      if (this.state === 'out') this.outNow = true; // the clip that was ending has ended
    }
    const target = this.state === 'on' ? (this.playing() ? 1 : 0) : this.outNow ? 0 : 1;
    this.mix = target > this.mix ? Math.min(target, this.mix + dt / T.fadeIn) : Math.max(target, this.mix - dt / (this.quick ? 0.25 : T.fadeOut));
    if (this.state === 'out' && this.outNow && this.mix === 0) { this.state = 'rest'; this.outNow = false; this.reset(); }
  }
}
