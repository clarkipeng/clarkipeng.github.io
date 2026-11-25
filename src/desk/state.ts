// The desk's per-mount state. mountDesk builds one Desk object, then runs each part's mount function in reading order.
// A part reads that object once (currentDesk()), takes what earlier parts made, and returns what other parts use; a
// later part's function, and every variable more than one part assigns, it reaches through the object (desk.view).
// Each mount gets its own object, so a leftover callback from an earlier mount (it checks desk.dead) never touches
// the current one.
import type { DeskRouter } from './desk.ts';
import type { mountTunables } from './tunables.ts';
import type { mountWgsl } from './wgsl.ts';
import type { Card, View, mountLayout } from './layout.ts';
import type { mountTurn } from './turn.ts';
import type { mountCards } from './cards.ts';
import type { mountShove } from './shove.ts';
import type { mountFlights } from './flights.ts';
import type { Phys, mountBox } from './box.ts';
import type { mountPlayer } from './player.ts';
import type { mountTextures } from './textures.ts';
import type { Gpu, Shared, Sim, mountGpu } from './gpu.ts';
import type { mountUniforms } from './uniforms.ts';
import type { mountFrame } from './frame.ts';
import type { mountTweak } from './tweak.ts';

export interface State {
  root: HTMLElement;
  router: DeskRouter;
  signal: AbortSignal;
  addEventListener: <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => void;
  dead: boolean;
  TS: number;
  view: View;
  nameBox: { x: number; baseline: number; size: number } | null;
  topZ: number;
  hovered: Card | null;
  page: number;
  dest: number;
  mouse: { x: number; y: number } | null;
  phys: Phys | null;
  videoSrc: Card | null;
  videoMix: number;
  probing: boolean;
  probeKey: string | null;
  gpu: Gpu | null;
  sim: Sim | null;
  tweakSync: (() => void) | null;
  dealing: boolean;
  capturing: boolean;
  running: boolean;
  redraw: boolean;
  shared: Shared | null;
  sims: Sim[];
}
type TunablesPart = ReturnType<typeof mountTunables>;
type WgslPart = ReturnType<typeof mountWgsl>;
type LayoutPart = ReturnType<typeof mountLayout>;
type TurnPart = ReturnType<typeof mountTurn>;
type CardsPart = ReturnType<typeof mountCards>;
type ShovePart = ReturnType<typeof mountShove>;
type FlightsPart = ReturnType<typeof mountFlights>;
type BoxPart = ReturnType<typeof mountBox>;
type PlayerPart = ReturnType<typeof mountPlayer>;
type TexturesPart = ReturnType<typeof mountTextures>;
type GpuPart = ReturnType<typeof mountGpu>;
type UniformsPart = ReturnType<typeof mountUniforms>;
type FramePart = ReturnType<typeof mountFrame>;
type TweakPart = ReturnType<typeof mountTweak>;

interface Parts {
  // tunables.ts
  qs: TunablesPart['qs']; HAND: TunablesPart['HAND']; font: TunablesPart['font']; T: TunablesPart['T'];
  reduced: TunablesPart['reduced']; STYLE: TunablesPart['STYLE']; applyLook: TunablesPart['applyLook'];
  // wgsl.ts
  renderWGSL: WgslPart['renderWGSL']; AGENT_WGSL: WgslPart['AGENT_WGSL'];
  // layout.ts
  sources: LayoutPart['sources']; doorEl: LayoutPart['doorEl']; pageEl: LayoutPart['pageEl'];
  linksEl: LayoutPart['linksEl']; animateFlatDoor: LayoutPart['animateFlatDoor']; placeDom: LayoutPart['placeDom'];
  hinged: LayoutPart['hinged']; paperL: LayoutPart['paperL']; nameEl: LayoutPart['nameEl'];
  taglineEl: LayoutPart['taglineEl']; BOX_T: LayoutPart['BOX_T']; measure: LayoutPart['measure'];
  shown: LayoutPart['shown']; body: LayoutPart['body']; capped: LayoutPart['capped']; STRIP: LayoutPart['STRIP'];
  CAP_LH: LayoutPart['CAP_LH']; wrapLines: LayoutPart['wrapLines']; canvas: LayoutPart['canvas'];
  regionLabel: LayoutPart['regionLabel']; absorbance: LayoutPart['absorbance']; noteProfile: LayoutPart['noteProfile'];
  noteMesh: LayoutPart['noteMesh']; hud: LayoutPart['hud']; layout: LayoutPart['layout'];
  placeDoor: LayoutPart['placeDoor'];
  // turn.ts
  turn: TurnPart['turn']; clipLinks: TurnPart['clipLinks']; cam: TurnPart['cam'];
  regionFromUrl: TurnPart['regionFromUrl']; placePage: TurnPart['placePage']; setInert: TurnPart['setInert'];
  DOOR: TurnPart['DOOR']; door: TurnPart['door']; dirOf: TurnPart['dirOf']; stepDoor: TurnPart['stepDoor'];
  cursor: TurnPart['cursor']; next: TurnPart['next']; drawStill: TurnPart['drawStill']; holdPage: TurnPart['holdPage'];
  rollR: TurnPart['rollR']; restD: TurnPart['restD']; farD: TurnPart['farD']; hull: TurnPart['hull'];
  NAMES: TurnPart['NAMES']; WARM_STEPS: TurnPart['WARM_STEPS']; syncInert: TurnPart['syncInert'];
  stepTurn: TurnPart['stepTurn']; stepWarm: TurnPart['stepWarm']; prewarm: TurnPart['prewarm'];
  // cards.ts
  land: CardsPart['land']; deskX: CardsPart['deskX']; deskY: CardsPart['deskY']; syncHover: CardsPart['syncHover'];
  stepCards: CardsPart['stepCards']; setHover: CardsPart['setHover'];
  // shove.ts
  obb: ShovePart['obb']; reach: ShovePart['reach']; stepShove: ShovePart['stepShove'];
  offCorner: ShovePart['offCorner']; shove: ShovePart['shove']; keepOut: ShovePart['keepOut'];
  cornerBox: ShovePart['cornerBox'];
  // flights.ts
  pageDeck: FlightsPart['pageDeck']; decked: FlightsPart['decked']; endFlights: FlightsPart['endFlights'];
  homeOf: FlightsPart['homeOf']; pileUp: FlightsPart['pileUp']; freeSlot: FlightsPart['freeSlot'];
  mouthPose: FlightsPart['mouthPose']; flights: FlightsPart['flights']; drawFrom: FlightsPart['drawFrom'];
  gather: FlightsPart['gather']; atHome: FlightsPart['atHome']; deckClick: FlightsPart['deckClick'];
  putBack: FlightsPart['putBack']; overDeck: FlightsPart['overDeck']; deckRect: FlightsPart['deckRect'];
  easeOutQuart: FlightsPart['easeOutQuart']; pilePose: FlightsPart['pilePose']; pileZ: FlightsPart['pileZ'];
  DRAW: FlightsPart['DRAW']; boxGather: FlightsPart['boxGather']; drawMore: FlightsPart['drawMore'];
  BOX_STEP: FlightsPart['BOX_STEP']; stepFlights: FlightsPart['stepFlights']; INTRO_DELAY: FlightsPart['INTRO_DELAY'];
  // box.ts
  placeDecks: BoxPart['placeDecks']; launch: BoxPart['launch']; arriveDeck: BoxPart['arriveDeck'];
  throwWorld: BoxPart['throwWorld']; BOX: BoxPart['BOX']; resetBox: BoxPart['resetBox']; moveDeck: BoxPart['moveDeck'];
  BOX3D: BoxPart['BOX3D']; tallySetup: BoxPart['tallySetup']; LIGHT: BoxPart['LIGHT'];
  launchPose: BoxPart['launchPose']; carried: BoxPart['carried']; boxH: BoxPart['boxH']; cross: BoxPart['cross'];
  facing: BoxPart['facing']; FAR: BoxPart['FAR']; projR: BoxPart['projR']; flyingOrder: BoxPart['flyingOrder'];
  FACE_SLOTS: BoxPart['FACE_SLOTS']; stepDecks: BoxPart['stepDecks']; stepThrows: BoxPart['stepThrows'];
  // player.ts
  Player: PlayerPart['Player']; idle: PlayerPart['idle']; makePlayer: PlayerPart['makePlayer'];
  stepMedia: PlayerPart['stepMedia']; clipLists: PlayerPart['clipLists']; playlistFor: PlayerPart['playlistFor'];
  preloadClips: PlayerPart['preloadClips']; chain: PlayerPart['chain']; play: PlayerPart['play'];
  // textures.ts
  backLayout: TexturesPart['backLayout']; paintDomBack: TexturesPart['paintDomBack']; design: TexturesPart['design'];
  BOX_NAMES: TexturesPart['BOX_NAMES']; linkAt: TexturesPart['linkAt']; coverRect: TexturesPart['coverRect'];
  renderEntries: TexturesPart['renderEntries']; buildAtlas: TexturesPart['buildAtlas'];
  drawBack: TexturesPart['drawBack']; drawCard: TexturesPart['drawCard'];
  // gpu.ts
  initGpu: GpuPart['initGpu']; createShared: GpuPart['createShared']; createSim: GpuPart['createSim'];
  autoOn: GpuPart['autoOn']; Q: GpuPart['Q']; simRes: GpuPart['simRes'];
  // uniforms.ts
  writeUniforms: UniformsPart['writeUniforms']; easeFlip: UniformsPart['easeFlip']; CARD0: UniformsPart['CARD0'];
  CARD_VEC4: UniformsPart['CARD_VEC4']; U: UniformsPart['U']; invert3: UniformsPart['invert3'];
  flipPath: UniformsPart['flipPath']; oklab: UniformsPart['oklab']; fromOklab: UniformsPart['fromOklab'];
  CHIP_OFF: UniformsPart['CHIP_OFF']; CHIP_VEC4: UniformsPart['CHIP_VEC4']; clock: UniformsPart['clock'];
  NOTE_U: UniformsPart['NOTE_U']; trans: UniformsPart['trans']; VU_OFF: UniformsPart['VU_OFF'];
  // frame.ts
  encodeStep: FramePart['encodeStep']; encodeRender: FramePart['encodeRender']; chipRegion: FramePart['chipRegion'];
  chips: FramePart['chips']; stats: FramePart['stats']; isJ: FramePart['isJ']; activeAgents: FramePart['activeAgents'];
  chipUniforms: FramePart['chipUniforms']; reseed: FramePart['reseed']; bootLog: FramePart['bootLog'];
  bench: FramePart['bench']; dropChip: FramePart['dropChip']; main: FramePart['main'];
  // tweak.ts
  tweakPanel: TweakPart['tweakPanel'];
}

// Each part's names are listed one by one, not intersected as whole parts, so TypeScript can type one without first
// typing every part.
export type Desk = State & Parts;

let current: Desk;
/** The desk being mounted; only the parts' mount functions read it. */
export const currentDesk = () => current;
export const setDesk = (d: Desk) => { current = d; };
