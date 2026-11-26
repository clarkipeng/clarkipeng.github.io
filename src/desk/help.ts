// What each admin panel setting does, shown when you hover its row. Keys are the tunables' keys (tunables.ts, tally.ts),
// the page style's keys, tok.* for the color tokens (TOK), and card.* for each card's ink.
export const HELP: Record<string, string> = {
  // Performance
  res: 'Slime grid cells per CSS pixel. Higher is finer veins and more GPU work. Changing it restarts the slime.',
  agents: 'How many slime agents at 1440x900; scales with screen area and resolution. Changing it restarts the slime.',
  // Agents
  speed: 'How fast each agent moves.',
  turn: 'How sharply an agent turns toward the stronger trail. Low makes long smooth veins, high makes tight curls.',
  sa: 'The angle between an agent\'s left, center and right sensors. Wider makes rounder, smaller cells.',
  sd: 'How far ahead an agent looks for trail. Farther makes bigger cells and thicker veins.',
  decay: 'How much trail survives each step. Higher keeps faint veins around longer.',
  deposit: 'How much trail each agent leaves per step. Higher makes darker, denser veins.',
  diffuse: 'How much trail blurs into its neighbors each step. Higher makes softer, wider veins.',
  respawn: 'The chance per step that an agent jumps somewhere random, which keeps empty areas from staying bare.',
  hoverE: 'How strongly a hovered card excites the slime around it (agents speed up and gather there).',
  cursorE: 'How strongly the cursor excites the slime under it.',
  // Card outlines
  edge: 'How much food the cards put out, so how strongly veins hug them.',
  ridge: 'How far outside the card edge the food band sits.',
  ridgeW: 'How wide each food band is.',
  // Cards
  shadow: 'How dark card shadows are.',
  lift: 'How high a picked-up card rises.',
  flipS: 'How long a card takes to flip open. Closing takes a bit less.',
  cardScale: 'Card size on the desk (text never goes below 12 px).',
  emitIn: 'How long an opened card takes to reach its full ink color in the slime.',
  emitOut: 'How long that color takes to fade after the card closes.',
  // Landing
  landBurst: 'How hard a landing card pushes the slime under it out past its edges.',
  drawStagger: 'The delay between cards dealt off a deck.',
  shove: 'How far a dropped card pushes the cards it lands on. 0 turns it off.',
  // Media
  fadeIn: 'How long a hovered card\'s clip takes to fade in.',
  fadeOut: 'How long it takes to fade back to the still.',
  // Notebook
  turnS: 'How long a page turn takes.',
  // World
  gravity: 'Gravity on everything that falls: the card box a page turn throws off, chips, and the turning sticky note.',
  friction: 'Friction for the card box and chips.',
  bounce: 'How bouncy the card box and chips are.',
  // Box
  lidS: 'How long the card box flap takes to fold open or shut.',
  // Tally
  tallyWidth: 'The pencil tally on each card box: line width.',
  tallyDark: 'How dark the graphite is.',
  // Chips
  chipSize: 'Chip size.',
  chipCurl: 'How much the chip curves overall.',
  chipEat: 'How fast the slime eats chips.',
  pageModel: 'How the page turns, drawn and carrying what lies on it. Curl: the corner rolls up and over. Board: a stiff page swung over about the spine. Bend: a page lifted by its corner, bending in one arc as it swings over. Paper: a simulated sheet, a hand carrying its corner up over the spine. Watch it in Colliders.',
  pageLift: 'Paper only: how high the hand carries the corner, of the way to the spine. Lower keeps the page flatter, so what lies on it slides off sooner and nearer.',
  landH: 'How high a card, the note or a chip must rise before coming down again counts as a landing that pushes the slime.',
  chipBand: 'How close to the desk a chip must be to be eaten, and to count as touching it. Lower parts are eaten faster.',
  chipGold: 'Chip color, pale to deep gold.',
  chipShadow: 'How dark the chip\'s shadow is.',
  // Page style
  bg: 'The page background.',
  ink: 'The slime ink color.',
  opacity: 'Ink strength overall.',
  gain: 'How much ink a given amount of trail makes. Higher makes the whole network darker and fuller.',
  gamma: 'Ink contrast. Higher hides faint trails and keeps only strong veins.',
  soft: 'How blurred the ink is when drawn.',
  grain: 'The paper\'s own texture, and how unevenly it takes ink.',
  tint: 'How much of its color a closed card puts into the slime (an open card always puts in all of it).',
  hueMix: 'How far that color moves from the shared olive toward the card\'s open ink.',
  // Colors
  'tok.stock': 'The card box, and card faces without a film border.',
  'tok.film': 'Photo cards\' instant-film paper, front and back.',
  'tok.note': 'The sticky note.',
  'tok.noteStrip': 'The sticky note\'s darker adhesive strip.',
  'tok.text': 'Titles.',
  'tok.text2': 'Handwriting: the card box label and the sticky note.',
  'tok.body': 'Body text on card backs.',
  'tok.muted': 'Captions, labels and secondary text.',
  'tok.ink': 'The faint veins drawn on the card box.',
  'tok.inkDeep': 'Link text.',
  'tok.inkLine': 'Drawn lines: link underlines and the card box frame.',
  'card.ink': 'The color this card puts into the slime while it is open.',
};
