// K. Desk, minimal: the B desk (sparse slime under paper cards), rebuilt as one WebGPU pass chain.
// Every step: excitation field E -> a few tens of thousands of agents (steer, deposit by atomics) -> trail diffuse/decay.
// The slime lives on a soft, lower-resolution grid under the whole desk; cards lie on top. Agents only find a little
// food in a thin band just outside each card's edge, so veins hug the cards as a soft outline that follows a dragged card.
// Clicking a card flips it in 3D to its back (details and links). Every time a card comes down onto the desk (the first
// visit's fly-in, a flip, a drop, a page change) it lands: one burst of ink from its edge, scaled by how hard it landed.
// One fragment pass at full device resolution draws paper grain, one muted ink (Beer-Lambert, so it darkens like dye),
// the crisp signature, and the cards (atlas texture, video via importExternalTexture) with soft drop shadows.
// The DOM keeps invisible hit targets and the accessible text.
// Site port of .context/mockups/k-desk-minimal.js: the same code, run inside mountDesk(root, router), which returns a
// teardown. Its pages have their own addresses (the mockup's #research is /publications here); router.push(path, state)
// and router.state() go through the site's router, so it keeps the history and the page title.

import { setDesk, type Desk } from './state.ts';
import { mountTunables } from './tunables.ts';
import { mountWgsl } from './wgsl.ts';
import { mountLayout } from './layout.ts';
import { mountTurn } from './turn.ts';
import { mountCards } from './cards.ts';
import { mountShove } from './shove.ts';
import { mountFlights } from './flights.ts';
import { mountBox } from './box.ts';
import { mountPlayer } from './player.ts';
import { mountTextures } from './textures.ts';
import { mountGpu } from './gpu.ts';
import { mountUniforms } from './uniforms.ts';
import { mountFrame } from './frame.ts';
import { mountTweak } from './tweak.ts';
import { mountProbe } from './probe.ts';

/** The site's router, as the desk uses it: push an address (with history state), and read the current state. */
declare global { interface Window { __j?: { at?: number; freeze?: boolean } & Record<string, unknown> } } // the test hook
export type DeskRouter = { push: (path: string, state?: object) => void; state: () => { fromMain?: boolean } | null };

/** Runs the desk inside root (which holds desk.html's markup); returns the teardown. */
export function mountDesk(root: HTMLElement, router: DeskRouter): () => void {
const ac = new AbortController(), signal = ac.signal;
const addEventListener = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) =>
  window.addEventListener(type, fn, { ...opts, signal });
const desk = { root, router, signal, addEventListener, dead: false } as Desk;
setDesk(desk);
for (const mount of [mountTunables, mountWgsl, mountLayout, mountTurn, mountCards, mountShove, mountFlights, mountBox, mountPlayer,
  mountTextures, mountGpu, mountUniforms, mountFrame, mountTweak, mountProbe]) Object.assign(desk, mount());
desk.main();
// Leaving the page: stop the frame loop and timers' effects, drop listeners, stop and release every video, free the GPU.
return () => {
  desk.dead = true; desk.running = false; ac.abort();
  for (const s of desk.sources) for (const v of s.player?.v || []) { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); }
  desk.gpu?.ctx.unconfigure(); desk.gpu?.device.destroy();
  delete window.__j;
};
}
