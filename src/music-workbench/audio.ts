export type Category = 'beat' | 'effect' | 'bass' | 'melody' | 'experimental' | 'animal' | 'custom' | 'theme';

export interface FxParams {
  lpf: number; hpf: number; volume: number; sidechain: number;
  reverb: number; delay: number; pitch: number; panSwing: number;
  compressor: number; flanger: number;
}

export const defaultFx = (): FxParams => ({
  lpf: 100, hpf: 0, volume: 100, sidechain: 0,
  reverb: 0, delay: 0, pitch: 0, panSwing: 0,
  compressor: 0, flanger: 0,
});

export interface SoundDef {
  id: string;
  name: string;
  category: Category;
  color: string;
  pattern: { note?: number | number[]; drum?: string; exp?: string }[];
  buffer?: AudioBuffer; // For recorded sounds
  assetUrl?: string;
  assetStart?: number;
  assetDuration?: number;
  assetRate?: number;
  loopMode?: 'fast' | 'full';
  playMode?: 'pattern' | 'buffer'; // New: 'pattern' for sequenced notes, 'buffer' for direct audio playback
}

export type AudioStyleId =
  | 'default'
  | 'club'
  | 'techno'
  | 'synthwave'
  | 'trap'
  | 'chiptune'
  | 'piano'
  | 'experimental';

export interface AudioStyle {
  id: AudioStyleId;
  name: string;
  accent: string;
}

export const AUDIO_STYLES: AudioStyle[] = [
  { id: 'default', name: 'Clean', accent: 'bg-slate-400' },
  { id: 'club', name: 'Club', accent: 'bg-emerald-500' },
  { id: 'techno', name: 'Techno', accent: 'bg-cyan-500' },
  { id: 'synthwave', name: 'Synthwave', accent: 'bg-pink-500' },
  { id: 'trap', name: 'Trap 808', accent: 'bg-violet-500' },
  { id: 'chiptune', name: 'Chiptune', accent: 'bg-cyan-500' },
  { id: 'piano', name: 'Piano', accent: 'bg-blue-400' },
  { id: 'experimental', name: 'Experimental', accent: 'bg-fuchsia-500' },
];

const DEFAULT_STYLE = AUDIO_STYLES[0];

const parsePattern = (str: string) => {
  return str.split('').map(char => {
    if (char === '.') return {};
    if (char === 'K') return { drum: 'kick' };
    if (char === 'S') return { drum: 'snare' };
    if (char === 'H') return { drum: 'hihat' };
    if (char === 'C') return { drum: 'clap' };
    
    if (char === 'X') return { exp: 'glitch' };
    if (char === 'Y') return { exp: 'laser' };
    if (char === 'Z') return { exp: 'animal' };
    if (char === 'W') return { exp: 'train' };

    const notes: Record<string, number> = {
      a: 48, b: 50, c: 52, d: 53, e: 55, f: 57, g: 59, h: 60,
      i: 62, j: 64, k: 65, l: 67, m: 69, n: 71, o: 72
    };
    if (notes[char]) return { note: notes[char] };
    return {};
  });
};

const sampleStep = () => ({ exp: 'sample' });

export const AVAILABLE_SOUNDS: SoundDef[] = [
  // Beats
  { id: 'b1', name: 'House', category: 'beat', color: 'bg-red-500', pattern: parsePattern('K.H.S.H.K.H.S.H.') },
  { id: 'b2', name: 'Break', category: 'beat', color: 'bg-red-500', pattern: parsePattern('K...S..K..K.S...') },
  { id: 'b3', name: 'FourOn', category: 'beat', color: 'bg-red-500', pattern: parsePattern('K...K...K...K...') },
  { id: 'b4', name: 'Trap', category: 'beat', color: 'bg-red-500', pattern: parsePattern('K.....S.K.K...S.') },
  { id: 'b5', name: 'Dnb', category: 'beat', color: 'bg-red-500', pattern: parsePattern('K...S.....K.S...') },
  { id: 'b6', name: 'Indie Kit', category: 'beat', color: 'bg-red-500', pattern: parsePattern('K..HS...K.H.S.H.') },
  { id: 'b7', name: 'R&B Pocket', category: 'beat', color: 'bg-red-500', pattern: parsePattern('K...S.H...K.S.H.') },
  { id: 'b8', name: 'Latin Pop', category: 'beat', color: 'bg-red-500', pattern: parsePattern('K.H.S.HHK.H.S.HH') },
  { id: 'b9', name: 'Cinematic', category: 'beat', color: 'bg-red-500', pattern: parsePattern('K.......S...K...') },
  { id: 'b10', name: 'Neo Soul', category: 'beat', color: 'bg-red-500', pattern: parsePattern('K..H..S.H.K.S.H.') },
  { id: 'b11', name: 'EDM Drop', category: 'beat', color: 'bg-red-500', pattern: parsePattern('K.H.K.H.K.H.K.H.') },
  { id: 'b12', name: 'Hip Hop 90s', category: 'beat', color: 'bg-red-500', pattern: parsePattern('K...S..H.K..S.H.') },
  { id: 'b13', name: 'Drill Hats', category: 'beat', color: 'bg-red-500', pattern: parsePattern('K.HHS.HHK.HHS.HH') },
  { id: 'b14', name: 'Dubstep Half', category: 'beat', color: 'bg-red-500', pattern: parsePattern('K.......S...K...') },
  { id: 'b15', name: 'Afro R&B', category: 'beat', color: 'bg-red-500', pattern: parsePattern('K.H..HS.K.H.S.H.') },
  
  // Effects
  { id: 'e1', name: 'Shaker', category: 'effect', color: 'bg-orange-500', pattern: parsePattern('H.H.H.H.H.H.H.H.') },
  { id: 'e2', name: 'Offbeat', category: 'effect', color: 'bg-orange-500', pattern: parsePattern('..H...H...H...H.') },
  { id: 'e3', name: 'Fast', category: 'effect', color: 'bg-orange-500', pattern: parsePattern('HHHHHHHHHHHHHHHH') },
  { id: 'e4', name: 'Claps', category: 'effect', color: 'bg-orange-500', pattern: parsePattern('....C.......C...') },
  { id: 'e5', name: 'Syncopated', category: 'effect', color: 'bg-orange-500', pattern: parsePattern('.H..H.H...H...H.') },
  { id: 'e6', name: 'Tambourine', category: 'effect', color: 'bg-orange-500', pattern: parsePattern('H..HH..HH..HH..H') },
  { id: 'e7', name: 'Studio Hats', category: 'effect', color: 'bg-orange-500', pattern: parsePattern('..H.H...H.H...H.') },
  { id: 'e8', name: 'Air Clap', category: 'effect', color: 'bg-orange-500', pattern: parsePattern('....C...H...C...') },
  { id: 'e9', name: 'Pulse Hats', category: 'effect', color: 'bg-orange-500', pattern: parsePattern('H...H.H.H...H.H.') },
  { id: 'e10', name: 'R&B Snap', category: 'effect', color: 'bg-orange-500', pattern: parsePattern('..H.C...H...C...') },
  { id: 'e11', name: 'EDM Riser', category: 'effect', color: 'bg-orange-500', pattern: parsePattern('H.H.HHH.H.H.HHH.') },
  { id: 'e12', name: 'Hip Hop Hats', category: 'effect', color: 'bg-orange-500', pattern: parsePattern('H..HH.H..H.HH.H.') },
  { id: 'e13', name: 'Triplet Hats', category: 'effect', color: 'bg-orange-500', pattern: parsePattern('HH.HH.HH.HH.HH.H') },
  { id: 'e14', name: 'Dub Echo Hit', category: 'effect', color: 'bg-orange-500', pattern: parsePattern('....C.......H...') },
  { id: 'e15', name: 'Club Perc', category: 'effect', color: 'bg-orange-500', pattern: parsePattern('.H.HC.H..H.HC.H.') },

  // Bass
  { id: 's1', name: 'Bass 1', category: 'bass', color: 'bg-blue-500', pattern: parsePattern('a.....a.c...a...') },
  { id: 's2', name: 'Bass 2', category: 'bass', color: 'bg-blue-500', pattern: parsePattern('a.a.....c.e.....') },
  { id: 's3', name: 'Bass 3', category: 'bass', color: 'bg-blue-500', pattern: parsePattern('a.....e...c...a.') },
  { id: 's4', name: 'Bass 4', category: 'bass', color: 'bg-blue-500', pattern: parsePattern('a.c.e.a.........') },
  { id: 's5', name: 'Bass 5', category: 'bass', color: 'bg-blue-500', pattern: parsePattern('a.......a...c.e.') },
  { id: 's6', name: 'Sub Pulse', category: 'bass', color: 'bg-blue-500', pattern: parsePattern('a...a.c...e.c...') },
  { id: 's7', name: 'Funk Bass', category: 'bass', color: 'bg-blue-500', pattern: parsePattern('a.c.a.e.c.a.e...') },
  { id: 's8', name: 'Warm Root', category: 'bass', color: 'bg-blue-500', pattern: parsePattern('a.......c.......') },
  { id: 's9', name: 'Drive Bass', category: 'bass', color: 'bg-blue-500', pattern: parsePattern('a.a.c.a.e.c.a...') },
  { id: 's10', name: '808 Slide', category: 'bass', color: 'bg-blue-500', pattern: parsePattern('a...a.e...c.e...') },
  { id: 's11', name: 'Dub Wobble', category: 'bass', color: 'bg-blue-500', pattern: parsePattern('a.a.a...c.c.e...') },
  { id: 's12', name: 'EDM Saw Bass', category: 'bass', color: 'bg-blue-500', pattern: parsePattern('a.c.e.c.a.c.e.c.') },
  { id: 's13', name: 'Moog Soul', category: 'bass', color: 'bg-blue-500', pattern: parsePattern('a..c.a..e.c.a...') },
  { id: 's14', name: 'Boom Bap Sub', category: 'bass', color: 'bg-blue-500', pattern: parsePattern('a.......a.c...e.') },
  { id: 's15', name: 'Afro Bass', category: 'bass', color: 'bg-blue-500', pattern: parsePattern('a..c..a.e..c.a..') },
  { id: 's16', name: 'Legato Sub', category: 'bass', color: 'bg-blue-500', pattern: parsePattern('aaccddeeffeedcaa') },
  { id: 's17', name: 'Glide Bass', category: 'bass', color: 'bg-blue-500', pattern: parsePattern('aa..ccddeeffcc..') },
  { id: 's18', name: 'Liquid Bass', category: 'bass', color: 'bg-blue-500', pattern: parsePattern('aabbccddeeddccaa') },
  { id: 's19', name: 'R&B Legato', category: 'bass', color: 'bg-blue-500', pattern: parsePattern('a...ccddeeffeedd') },
  { id: 's20', name: 'Cine Legato', category: 'bass', color: 'bg-blue-500', pattern: parsePattern('aaacccggffeeddaa') },

  // Melody
  { id: 'm1', name: 'Chords', category: 'melody', color: 'bg-green-500', pattern: parsePattern('.h..j...l.......') },
  { id: 'm2', name: 'Arp 1', category: 'melody', color: 'bg-green-500', pattern: parsePattern('h.j.l.h.j.l.h.j.') },
  { id: 'm3', name: 'Arp 2', category: 'melody', color: 'bg-green-500', pattern: parsePattern('l.j.h.l.j.h.l.j.') },
  { id: 'm4', name: 'Riff', category: 'melody', color: 'bg-green-500', pattern: parsePattern('h...l...o.......') },
  { id: 'm5', name: 'Pluck', category: 'melody', color: 'bg-green-500', pattern: parsePattern('..h...j...l...o.') },
  { id: 'm6', name: 'Piano Comp', category: 'melody', color: 'bg-green-500', pattern: parsePattern('h...j.l...j.h...') },
  { id: 'm7', name: 'Synth Hook', category: 'melody', color: 'bg-green-500', pattern: parsePattern('h.j.l.o.l.j.h...') },
  { id: 'm8', name: 'Guitar Chop', category: 'melody', color: 'bg-green-500', pattern: parsePattern('h..h.j..l..j.h..') },
  { id: 'm9', name: 'Bell Motif', category: 'melody', color: 'bg-green-500', pattern: parsePattern('o...l.j...h.j.l.') },
  { id: 'm10', name: 'Rhodes Keys', category: 'melody', color: 'bg-green-500', pattern: parsePattern('h...j...l.j.h...') },
  { id: 'm11', name: 'EDM Pluck', category: 'melody', color: 'bg-green-500', pattern: parsePattern('h.j.l.o.h.j.l.o.') },
  { id: 'm12', name: 'Hip Hop Keys', category: 'melody', color: 'bg-green-500', pattern: parsePattern('h.....j...l.h...') },
  { id: 'm13', name: 'Drill Bells', category: 'melody', color: 'bg-green-500', pattern: parsePattern('o.l.j.o...l.j...') },
  { id: 'm14', name: 'Dub Stab', category: 'melody', color: 'bg-green-500', pattern: parsePattern('h.......l...j...') },
  { id: 'm15', name: 'Vocal Pad', category: 'melody', color: 'bg-green-500', pattern: parsePattern('h...h...l...l...') },

  // Experimental
  { id: 'x1', name: 'Glitch', category: 'experimental', color: 'bg-fuchsia-500', pattern: parsePattern('X.X...X.XX..X...') },
  { id: 'x2', name: 'Laser', category: 'experimental', color: 'bg-fuchsia-500', pattern: parsePattern('Y.......Y.......') },
  { id: 'x3', name: 'Animal', category: 'experimental', color: 'bg-fuchsia-500', pattern: parsePattern('Z...........Z...') },
  { id: 'x4', name: 'Train', category: 'experimental', color: 'bg-fuchsia-500', pattern: parsePattern('W.W.W.W.W.W.W.W.') },
  { id: 'x5', name: 'Tape Stop', category: 'experimental', color: 'bg-fuchsia-500', pattern: parsePattern('....Y.......Y...') },
  { id: 'x6', name: 'Digital Dust', category: 'experimental', color: 'bg-fuchsia-500', pattern: parsePattern('X...X.....X.X...') },
  { id: 'x7', name: 'Reverse Hit', category: 'experimental', color: 'bg-fuchsia-500', pattern: parsePattern('........W.......') },
  { id: 'x8', name: 'Bass Drop', category: 'experimental', color: 'bg-fuchsia-500', pattern: parsePattern('Y.......X.......') },
  { id: 'x9', name: 'Vinyl Fill', category: 'experimental', color: 'bg-fuchsia-500', pattern: parsePattern('X.....X.....X...') },
  { id: 'x10', name: 'Echo Throw', category: 'experimental', color: 'bg-fuchsia-500', pattern: parsePattern('....Y...Y.......') },

  // Animal Samples
  { id: 'a-mosquito-1', name: 'Mosquito Pin', category: 'animal', color: 'bg-lime-500', assetUrl: '/samples/animals/mosquito.mp3', assetStart: 0.12, assetDuration: 0.42, assetRate: 1.35, pattern: [sampleStep(), {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}] },
  { id: 'a-mosquito-2', name: 'Mosquito Orbit', category: 'animal', color: 'bg-lime-500', assetUrl: '/samples/animals/mosquito.mp3', assetStart: 1.1, assetDuration: 0.58, assetRate: 1.05, pattern: [{}, {}, sampleStep(), {}, {}, sampleStep(), {}, {}, {}, {}, sampleStep(), {}, {}, {}, {}, {}] },
  { id: 'a-mosquito-3', name: 'Mosquito Swarm', category: 'animal', color: 'bg-lime-500', assetUrl: '/samples/animals/mosquito.mp3', assetStart: 2.25, assetDuration: 0.48, assetRate: 1.55, pattern: [sampleStep(), {}, sampleStep(), {}, sampleStep(), {}, {}, {}, {}, {}, sampleStep(), {}, sampleStep(), {}, {}, {}] },
  { id: 'a-goat-1', name: 'Goat Bleat', category: 'animal', color: 'bg-stone-500', assetUrl: '/samples/animals/goat.mp3', assetStart: 0, assetDuration: 0.5, pattern: [{}, {}, {}, sampleStep(), {}, {}, {}, {}, {}, {}, {}, sampleStep(), {}, {}, {}, {}] },
  { id: 'a-goat-2', name: 'Goat Wobble', category: 'animal', color: 'bg-stone-500', assetUrl: '/samples/animals/goat.mp3', assetStart: 0.14, assetDuration: 0.72, assetRate: 0.76, pattern: [sampleStep(), {}, {}, {}, {}, sampleStep(), {}, {}, {}, {}, {}, {}, {}, {}, {}, {}] },
  { id: 'a-cat-1', name: 'Cat Meow', category: 'animal', color: 'bg-pink-500', assetUrl: '/samples/animals/cat.mp3', assetStart: 0, assetDuration: 0.52, pattern: [{}, {}, sampleStep(), {}, {}, {}, {}, {}, {}, {}, {}, {}, sampleStep(), {}, {}, {}] },
  { id: 'a-cat-2', name: 'Cat Chirp', category: 'animal', color: 'bg-pink-500', assetUrl: '/samples/animals/cat.mp3', assetStart: 0.08, assetDuration: 0.34, assetRate: 1.28, pattern: [sampleStep(), {}, {}, {}, {}, {}, {}, sampleStep(), {}, {}, {}, {}, {}, {}, {}, {}] },
  { id: 'a-dog-1', name: 'Dog Bark', category: 'animal', color: 'bg-amber-500', assetUrl: '/samples/animals/dog.mp3', assetStart: 0, assetDuration: 0.45, pattern: [sampleStep(), {}, {}, {}, {}, {}, {}, {}, {}, {}, sampleStep(), {}, {}, {}, {}, {}] },
  { id: 'a-dog-2', name: 'Dog Double', category: 'animal', color: 'bg-amber-500', assetUrl: '/samples/animals/dog.mp3', assetStart: 0.08, assetDuration: 0.28, assetRate: 1.15, pattern: [{}, {}, {}, {}, sampleStep(), sampleStep(), {}, {}, {}, {}, {}, {}, {}, {}, {}, {}] },

  // Theme (旋律组)
  { id: 't1', name: '前奏', category: 'theme', color: 'bg-yellow-500', pattern: parsePattern('a..c..e..g..a...') },
  { id: 't2', name: '主歌', category: 'theme', color: 'bg-yellow-500', pattern: parsePattern('a.c.e.g.a.c.e.a.') },
  { id: 't3', name: '副歌', category: 'theme', color: 'bg-yellow-500', pattern: parsePattern('c.e.g.c.e.g.c.e.') },
  { id: 't4', name: '间奏', category: 'theme', color: 'bg-yellow-500', pattern: parsePattern('g.e.c..a..c..e..') },
  { id: 't5', name: '尾奏', category: 'theme', color: 'bg-yellow-500', pattern: parsePattern('a.......a...a..a') },
  { id: 't6', name: '和声铺垫', category: 'theme', color: 'bg-yellow-500', pattern: parsePattern('h..h..h..h..h..h') },
  { id: 't7', name: '主旋律 A', category: 'theme', color: 'bg-yellow-500', pattern: parsePattern('h.j.l...o.l.j...') },
  { id: 't8', name: '主旋律 B', category: 'theme', color: 'bg-yellow-500', pattern: parsePattern('l.o.n.l.j.h.j...') },
  { id: 't9', name: '电影铺底', category: 'theme', color: 'bg-yellow-500', pattern: parsePattern('h.......l.......') },
  { id: 't10', name: '流行副歌', category: 'theme', color: 'bg-yellow-500', pattern: parsePattern('c.e.g.h.g.e.c...') },
  { id: 't11', name: 'R&B 主歌', category: 'theme', color: 'bg-yellow-500', pattern: parsePattern('h...j.l...h.j...') },
  { id: 't12', name: 'EDM Drop Hook', category: 'theme', color: 'bg-yellow-500', pattern: parsePattern('h.l.o.l.h.l.o.l.') },
  { id: 't13', name: 'Hip Hop Loop', category: 'theme', color: 'bg-yellow-500', pattern: parsePattern('h...l...j...h...') },
  { id: 't14', name: 'Dub Bass Hook', category: 'theme', color: 'bg-yellow-500', pattern: parsePattern('a.c.e...a.c.e...') },
  { id: 't15', name: 'Soul Chorus', category: 'theme', color: 'bg-yellow-500', pattern: parsePattern('h.j.l.h.o.l.j...') },
  { id: 't16', name: 'Club Lead', category: 'theme', color: 'bg-yellow-500', pattern: parsePattern('l.o.l.j.l.o.l.j.') },
  { id: 't17', name: '连奏主线 A', category: 'theme', color: 'bg-yellow-500', pattern: parsePattern('hhijjklmmlkjjihh') },
  { id: 't18', name: '连奏主线 B', category: 'theme', color: 'bg-yellow-500', pattern: parsePattern('hjjllnoonlljjh..') },
  { id: 't19', name: 'Neo Legato', category: 'theme', color: 'bg-yellow-500', pattern: parsePattern('hhiijjllmmlljjii') },
  { id: 't20', name: 'Dream Legato', category: 'theme', color: 'bg-yellow-500', pattern: parsePattern('h...jjlloooonllj') },
  { id: 't21', name: 'Club Legato', category: 'theme', color: 'bg-yellow-500', pattern: parsePattern('llnnoommljjllnno') },
];

// 4x4 Keyboard notes mapping (MIDI notes)
export const KEYBOARD_NOTES = [
  [60, 61, 62, 63], // C4, C#4, D4, D#4
  [64, 65, 66, 67], // E4, F4, F#4, G4
  [68, 69, 70, 71], // G#4, A4, A#4, B4
  [72, 73, 74, 75], // C5, C#5, D5, D#5
];

function createReverbBuffer(ctx: AudioContext) {
  const length = ctx.sampleRate * 2.0;
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const channelData = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      channelData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.3));
    }
  }
  return buffer;
}

const assetBufferCache = new Map<string, AudioBuffer>();
const assetBufferPromises = new Map<string, Promise<AudioBuffer>>();

export class SlotChannel {
  input: GainNode;
  outGain: GainNode;

  lpf: BiquadFilterNode;
  hpf: BiquadFilterNode;
  comp: DynamicsCompressorNode;
  panner: StereoPannerNode;
  pannerLFO: OscillatorNode;
  pannerGain: GainNode;

  delay: DelayNode;
  delayFeedback: GainNode;
  delayMix: GainNode;

  reverbMix: GainNode;
  convolver: ConvolverNode;

  sidechainGain: GainNode;
  sidechainLFO: OscillatorNode;
  scDepth: GainNode;

  flangerDelay: DelayNode;
  flangerMix: GainNode;
  flangerLFO: OscillatorNode;

  pitchShift: number = 0;

  constructor(ctx: AudioContext, masterOut: AudioNode) {
    this.input = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.lpf = ctx.createBiquadFilter(); this.lpf.type = 'lowpass'; this.lpf.frequency.value = 20000;
    this.hpf = ctx.createBiquadFilter(); this.hpf.type = 'highpass'; this.hpf.frequency.value = 10;
    
    // Flanger
    const flangerSplit = ctx.createGain();
    this.flangerDelay = ctx.createDelay(0.01); this.flangerDelay.delayTime.value = 0.003;
    this.flangerLFO = ctx.createOscillator(); this.flangerLFO.frequency.value = 0.5;
    const flangerDepth = ctx.createGain(); flangerDepth.gain.value = 0.002;
    this.flangerLFO.connect(flangerDepth);
    flangerDepth.connect(this.flangerDelay.delayTime);
    this.flangerMix = ctx.createGain(); this.flangerMix.gain.value = 0;
    this.flangerLFO.start();
    
    // Panner
    this.panner = ctx.createStereoPanner();
    this.pannerLFO = ctx.createOscillator(); this.pannerLFO.frequency.value = 0.5;
    this.pannerGain = ctx.createGain(); this.pannerGain.gain.value = 0;
    this.pannerLFO.connect(this.pannerGain);
    this.pannerGain.connect(this.panner.pan);
    this.pannerLFO.start();

    // Delay
    const delaySplit = ctx.createGain();
    this.delay = ctx.createDelay(1.0); this.delay.delayTime.value = 0.375;
    this.delayFeedback = ctx.createGain(); this.delayFeedback.gain.value = 0.4;
    this.delay.connect(this.delayFeedback); this.delayFeedback.connect(this.delay);
    this.delayMix = ctx.createGain(); this.delayMix.gain.value = 0;

    // Reverb
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = createReverbBuffer(ctx);
    this.reverbMix = ctx.createGain(); this.reverbMix.gain.value = 0;

    // Sidechain
    this.sidechainGain = ctx.createGain();
    this.sidechainLFO = ctx.createOscillator(); this.sidechainLFO.frequency.value = 2; // 120bpm -> 2Hz
    this.scDepth = ctx.createGain(); this.scDepth.gain.value = 0;
    this.sidechainLFO.connect(this.scDepth);
    this.scDepth.connect(this.sidechainGain.gain);
    this.sidechainLFO.start();

    this.outGain = ctx.createGain();

    // Routing
    this.input.connect(this.comp);
    this.comp.connect(this.lpf);
    this.lpf.connect(this.hpf);
    this.hpf.connect(flangerSplit);

    flangerSplit.connect(this.panner);
    flangerSplit.connect(this.flangerDelay);
    this.flangerDelay.connect(this.flangerMix);
    this.flangerMix.connect(this.panner);

    this.panner.connect(delaySplit);

    delaySplit.connect(this.sidechainGain);
    delaySplit.connect(this.delay);
    this.delay.connect(this.delayMix);
    this.delayMix.connect(this.sidechainGain);
    
    delaySplit.connect(this.convolver);
    this.convolver.connect(this.reverbMix);
    this.reverbMix.connect(this.sidechainGain);

    this.sidechainGain.connect(this.outGain);
    this.outGain.connect(masterOut);
  }

  connectOutput(node: AudioNode) {
    this.outGain.connect(node);
  }

  disconnectOutput(node: AudioNode) {
    this.outGain.disconnect(node);
  }

  applyParams(p: FxParams) {
    const time = this.outGain.context.currentTime;
    this.outGain.gain.setTargetAtTime(p.volume / 100, time, 0.05);

    const lpfFreq = 200 * Math.pow(100, p.lpf / 100); 
    this.lpf.frequency.setTargetAtTime(lpfFreq, time, 0.05);

    const hpfFreq = 10 * Math.pow(500, p.hpf / 100);
    this.hpf.frequency.setTargetAtTime(hpfFreq, time, 0.05);

    this.comp.threshold.setTargetAtTime(-50 * (p.compressor / 100), time, 0.05);
    this.comp.ratio.setTargetAtTime(1 + 19 * (p.compressor / 100), time, 0.05);

    this.flangerMix.gain.setTargetAtTime(p.flanger / 100, time, 0.05);
    this.pannerGain.gain.setTargetAtTime(p.panSwing / 100, time, 0.05);
    this.delayMix.gain.setTargetAtTime(p.delay / 100, time, 0.05);
    this.reverbMix.gain.setTargetAtTime(p.reverb / 100, time, 0.05);
    
    this.scDepth.gain.setTargetAtTime(p.sidechain / 100, time, 0.05);
    this.pitchShift = p.pitch;
  }
}

export class ProjectEngine {
  ctx: AudioContext;
  id: string;
  isPlaying = false;
  pendingStart = false;
  step = 0;
  style: AudioStyle = DEFAULT_STYLE;
  slots: (SoundDef | null)[] = new Array(7).fill(null);
  mutedSlots: boolean[] = new Array(7).fill(false);
  channels: SlotChannel[] = [];
  masterChannel: SlotChannel;

  constructor(id: string, ctx: AudioContext, masterOut: AudioNode) {
    this.id = id;
    this.ctx = ctx;
    this.masterChannel = new SlotChannel(this.ctx, masterOut);
    for (let i = 0; i < 7; i++) {
      this.channels.push(new SlotChannel(this.ctx, this.masterChannel.input));
    }
  }

  connectOutput(node: AudioNode) {
    this.masterChannel.connectOutput(node);
  }

  disconnectOutput(node: AudioNode) {
    this.masterChannel.disconnectOutput(node);
  }

  setFxParams(index: number, params: FxParams) {
    if (this.channels[index]) {
      this.channels[index].applyParams(params);
    }
  }

  setMasterFxParams(params: FxParams) {
    this.masterChannel.applyParams(params);
  }

  setSlots(newSlots: (SoundDef | null)[]) {
    this.slots = newSlots;
    newSlots.forEach((slot) => {
      if (slot?.assetUrl) {
        this.loadAssetBuffer(slot);
      }
    });
  }

  setMutedSlots(muted: boolean[]) {
    this.mutedSlots = muted;
  }

  setStyle(styleId: AudioStyleId) {
    this.style = AUDIO_STYLES.find(style => style.id === styleId) || DEFAULT_STYLE;
  }

  queueStart() {
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (this.isPlaying) return;
    this.pendingStart = true;
  }

  startSynced(step = 0) {
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.isPlaying = true;
    this.pendingStart = false;
    this.step = step;
  }

  play() {
    this.startSynced(0);
  }

  stop() {
    this.isPlaying = false;
    this.pendingStart = false;
  }

  scheduleStep(stepNumber: number, time: number) {
    if (!this.isPlaying) return;
    this.step = stepNumber;
    this.scheduleNote(stepNumber, time);
  }

  private scheduleNote(stepNumber: number, time: number) {
    this.step = stepNumber;
    this.slots.forEach((slot, index) => {
      if (!slot || this.mutedSlots[index]) return;

      // Handle buffer mode (direct audio playback)
      if (slot.playMode === 'buffer' && slot.buffer) {
        // Only play buffer on step 0 to avoid overlapping
        if (stepNumber === 0) {
          this.playBufferDirect(slot.buffer, time, index);
        }
        return;
      }

      // Handle pattern mode (traditional sequenced playback)
      const stepData = slot.pattern[stepNumber];
      if (!stepData) return;

      if (slot.assetUrl) {
        const buffer = this.getAssetBuffer(slot);
        if (buffer && (stepData.note || stepData.drum || stepData.exp)) {
          this.playAssetSample(slot, buffer, time, index);
        }
      } else if (slot.buffer) {
        this.playBuffer(slot.buffer, time, slot.loopMode || 'fast', index);
      } else if (stepData.drum) {
        this.playDrum(stepData.drum, time, index);
      } else if (stepData.note) {
        if (Array.isArray(stepData.note)) {
          stepData.note.forEach((note) => this.playSynth(note, slot.category, time, index));
        } else {
          this.playSynth(stepData.note, slot.category, time, index);
        }
      } else if (stepData.exp) {
        this.playExperimental(stepData.exp, time, index);
      }
    });

    const event = new CustomEvent('step', { detail: { projectId: this.id, step: stepNumber } });
    window.dispatchEvent(event);
  }

  private getAssetBuffer(slot: SoundDef) {
    if (!slot.assetUrl) return null;
    const cached = assetBufferCache.get(slot.assetUrl);
    if (cached) {
      slot.buffer = cached;
      return cached;
    }
    this.loadAssetBuffer(slot);
    return null;
  }

  private loadAssetBuffer(slot: SoundDef) {
    if (!slot.assetUrl || assetBufferCache.has(slot.assetUrl)) return;
    if (!assetBufferPromises.has(slot.assetUrl)) {
      const promise = fetch(slot.assetUrl)
        .then(response => {
          if (!response.ok) throw new Error(`Unable to load ${slot.assetUrl}`);
          return response.arrayBuffer();
        })
        .then(data => this.ctx.decodeAudioData(data))
        .then(buffer => {
          assetBufferCache.set(slot.assetUrl!, buffer);
          return buffer;
        })
        .catch(error => {
          console.warn(error);
          assetBufferPromises.delete(slot.assetUrl!);
          throw error;
        });
      assetBufferPromises.set(slot.assetUrl, promise);
    }
    assetBufferPromises.get(slot.assetUrl)?.then(buffer => {
      slot.buffer = buffer;
    }).catch(() => undefined);
  }

  private playBuffer(buffer: AudioBuffer, time: number, mode: 'fast' | 'full', channelIndex: number) {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    
    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(this.channels[channelIndex].input);

    const shift = this.channels[channelIndex].pitchShift;
    const rateMultiplier = Math.pow(2, shift / 12);
    source.playbackRate.value = rateMultiplier;

    if (mode === 'fast') {
      const duration = 0.15;
      gain.gain.setValueAtTime(1, time);
      gain.gain.linearRampToValueAtTime(0, time + duration);
      source.start(time, 0, duration * rateMultiplier);
    } else {
      const measureDuration = 2.0; 
      gain.gain.setValueAtTime(1, time);
      gain.gain.setValueAtTime(1, time + measureDuration - 0.05);
      gain.gain.linearRampToValueAtTime(0, time + measureDuration);
      source.start(time, 0, measureDuration * rateMultiplier); 
    }
  }

  private playAssetSample(slot: SoundDef, buffer: AudioBuffer, time: number, channelIndex: number) {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(this.channels[channelIndex].input);

    const shift = this.channels[channelIndex].pitchShift;
    const rateMultiplier = Math.pow(2, shift / 12) * (slot.assetRate ?? 1);
    const start = Math.max(0, Math.min(slot.assetStart ?? 0, Math.max(0, buffer.duration - 0.02)));
    const availableDuration = Math.max(0.02, buffer.duration - start);
    const duration = Math.min(slot.assetDuration ?? availableDuration, availableDuration);
    const playbackDuration = duration / rateMultiplier;

    source.playbackRate.value = rateMultiplier;
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(0.9, time + 0.012);
    gain.gain.setValueAtTime(0.9, Math.max(time + 0.013, time + playbackDuration - 0.025));
    gain.gain.exponentialRampToValueAtTime(0.001, time + playbackDuration);
    source.start(time, start, duration);
  }

  private playBufferDirect(buffer: AudioBuffer, time: number, channelIndex: number) {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    
    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(this.channels[channelIndex].input);

    const shift = this.channels[channelIndex].pitchShift;
    const rateMultiplier = Math.pow(2, shift / 12);
    source.playbackRate.value = rateMultiplier;

    // Play the entire buffer
    const duration = buffer.duration / rateMultiplier;
    gain.gain.setValueAtTime(1, time);
    gain.gain.setValueAtTime(1, time + duration - 0.05);
    gain.gain.linearRampToValueAtTime(0, time + duration);
    source.start(time, 0, duration);
  }

  private makeNoise(duration: number) {
    const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private connectFiltered(source: AudioNode, time: number, channelIndex: number, gainValue: number, duration: number, filterType: BiquadFilterType, frequency: number, q = 1) {
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(frequency, time);
    filter.Q.setValueAtTime(q, time);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.channels[channelIndex].input);
    gain.gain.setValueAtTime(gainValue, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    return { gain, filter };
  }

  private playStyledExperimental(type: string, time: number, channelIndex: number) {
    const ctx = this.ctx;
    const styleId = this.style.id;
    const shift = this.channels[channelIndex].pitchShift;
    const rateMultiplier = Math.pow(2, shift / 12);

    if (styleId === 'chiptune') {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime((type === 'laser' ? 1760 : 660) * rateMultiplier, time);
      osc.frequency.setValueAtTime((type === 'glitch' ? 2349 : 880) * rateMultiplier, time + 0.035);
      this.connectFiltered(osc, time, channelIndex, 0.18, 0.08, 'highpass', 1300, 1.2);
      osc.start(time);
      osc.stop(time + 0.08);
      return;
    }

    if (styleId === 'techno') {
      const carrier = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const modGain = ctx.createGain();
      carrier.type = 'square';
      carrier.frequency.setValueAtTime((type === 'train' ? 140 : 520) * rateMultiplier, time);
      mod.type = 'sawtooth';
      mod.frequency.setValueAtTime(24, time);
      modGain.gain.setValueAtTime(type === 'glitch' ? 420 : 240, time);
      mod.connect(modGain);
      modGain.connect(carrier.frequency);
      this.connectFiltered(carrier, time, channelIndex, 0.26, 0.16, 'bandpass', 1500, 7);
      carrier.start(time);
      mod.start(time);
      carrier.stop(time + 0.16);
      mod.stop(time + 0.16);
      return;
    }

    if (styleId === 'synthwave') {
      const sweep = ctx.createOscillator();
      sweep.type = 'sawtooth';
      sweep.frequency.setValueAtTime((type === 'laser' ? 980 : 420) * rateMultiplier, time);
      sweep.frequency.exponentialRampToValueAtTime(120 * rateMultiplier, time + 0.32);
      const { filter } = this.connectFiltered(sweep, time, channelIndex, 0.2, 0.34, 'lowpass', 3600, 2);
      filter.frequency.exponentialRampToValueAtTime(900, time + 0.3);
      sweep.start(time);
      sweep.stop(time + 0.34);
      return;
    }

    if (styleId === 'piano') {
      const body = ctx.createOscillator();
      const sparkle = ctx.createOscillator();
      const mix = ctx.createGain();
      const root = type === 'laser' ? 988 : type === 'train' ? 196 : 523;
      body.type = 'triangle';
      sparkle.type = 'sine';
      body.frequency.setValueAtTime(root * rateMultiplier, time);
      sparkle.frequency.setValueAtTime(root * 2.01 * rateMultiplier, time);
      body.connect(mix);
      sparkle.connect(mix);
      const { filter } = this.connectFiltered(mix, time, channelIndex, 0.18, 0.42, 'lowpass', 4200, 1.1);
      filter.frequency.exponentialRampToValueAtTime(1200, time + 0.36);
      body.start(time);
      sparkle.start(time);
      body.stop(time + 0.42);
      sparkle.stop(time + 0.18);
      return;
    }

    if (styleId === 'experimental') {
      const root = type === 'laser' ? 880 : type === 'train' ? 110 : 330;
      const carrier = ctx.createOscillator();
      const harmony = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const modGain = ctx.createGain();
      carrier.type = 'square';
      harmony.type = 'triangle';
      carrier.frequency.setValueAtTime(root * rateMultiplier, time);
      harmony.frequency.setValueAtTime(root * 1.5 * rateMultiplier, time);
      mod.type = 'sine';
      mod.frequency.setValueAtTime(type === 'glitch' ? 37 : 13, time);
      modGain.gain.setValueAtTime(140, time);
      mod.connect(modGain);
      modGain.connect(carrier.frequency);
      const mix = ctx.createGain();
      carrier.connect(mix);
      harmony.connect(mix);
      this.connectFiltered(mix, time, channelIndex, 0.2, 0.22, 'bandpass', type === 'train' ? 520 : 2100, 6);
      carrier.start(time);
      harmony.start(time);
      mod.start(time);
      carrier.stop(time + 0.22);
      harmony.stop(time + 0.22);
      mod.stop(time + 0.22);
      return;
    }

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime((type === 'laser' ? 1200 : 300) * rateMultiplier, time);
    osc.frequency.exponentialRampToValueAtTime(80 * rateMultiplier, time + 0.16);
    this.connectFiltered(osc, time, channelIndex, 0.26, 0.18, 'highpass', styleId === 'trap' ? 1600 : 900, 1);
    osc.start(time);
    osc.stop(time + 0.18);
  }

  private playStyledDrum(type: string, time: number, channelIndex: number) {
    const ctx = this.ctx;
    const styleId = this.style.id;

    if (styleId === 'trap') {
      if (type === 'kick') {
        const sub = ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(92, time);
        sub.frequency.exponentialRampToValueAtTime(38, time + 0.72);
        const { gain } = this.connectFiltered(sub, time, channelIndex, 0.95, 0.85, 'lowpass', 260, 0.7);
        gain.gain.setValueAtTime(0.74, time + 0.22);
        sub.start(time);
        sub.stop(time + 0.85);
      } else {
        const noise = ctx.createBufferSource();
        noise.buffer = this.makeNoise(type === 'hihat' ? 0.028 : 0.14);
        this.connectFiltered(noise, time, channelIndex, type === 'hihat' ? 0.22 : 0.42, type === 'hihat' ? 0.028 : 0.14, 'highpass', type === 'hihat' ? 10500 : 2200, 2.2);
        noise.start(time);
      }
      return;
    }

    if (styleId === 'chiptune') {
      const osc = ctx.createOscillator();
      osc.type = type === 'kick' ? 'triangle' : 'square';
      osc.frequency.setValueAtTime(type === 'kick' ? 132 : type === 'snare' ? 520 : 4200, time);
      osc.frequency.exponentialRampToValueAtTime(type === 'kick' ? 62 : 180, time + 0.055);
      this.connectFiltered(osc, time, channelIndex, type === 'kick' ? 0.48 : 0.16, type === 'kick' ? 0.14 : 0.045, 'highpass', type === 'kick' ? 90 : 1200, 0.8);
      osc.start(time);
      osc.stop(time + (type === 'kick' ? 0.14 : 0.045));
      return;
    }

    if (styleId === 'techno') {
      if (type === 'kick') {
        const kick = ctx.createOscillator();
        kick.type = 'triangle';
        kick.frequency.setValueAtTime(165, time);
        kick.frequency.exponentialRampToValueAtTime(44, time + 0.28);
        this.connectFiltered(kick, time, channelIndex, 0.95, 0.32, 'lowpass', 620, 1.2);
        kick.start(time);
        kick.stop(time + 0.32);
      } else {
        const noise = ctx.createBufferSource();
        noise.buffer = this.makeNoise(type === 'hihat' ? 0.038 : 0.13);
        this.connectFiltered(noise, time, channelIndex, type === 'hihat' ? 0.25 : 0.44, type === 'hihat' ? 0.038 : 0.13, 'bandpass', type === 'hihat' ? 8500 : 1800, 3.5);
        noise.start(time);
      }
      return;
    }

    if (styleId === 'synthwave') {
      if (type === 'kick') {
        const kick = ctx.createOscillator();
        kick.type = 'sine';
        kick.frequency.setValueAtTime(120, time);
        kick.frequency.exponentialRampToValueAtTime(48, time + 0.38);
        this.connectFiltered(kick, time, channelIndex, 0.74, 0.46, 'lowpass', 420, 0.9);
        kick.start(time);
        kick.stop(time + 0.46);
      } else {
        const noise = ctx.createBufferSource();
        noise.buffer = this.makeNoise(type === 'hihat' ? 0.08 : 0.2);
        this.connectFiltered(noise, time, channelIndex, type === 'hihat' ? 0.16 : 0.34, type === 'hihat' ? 0.08 : 0.2, 'highpass', type === 'hihat' ? 6200 : 1500, 1.3);
        noise.start(time);
      }
      return;
    }

    if (styleId === 'piano') {
      if (type === 'kick') {
        const thump = ctx.createOscillator();
        thump.type = 'sine';
        thump.frequency.setValueAtTime(108, time);
        thump.frequency.exponentialRampToValueAtTime(44, time + 0.24);
        this.connectFiltered(thump, time, channelIndex, 0.62, 0.34, 'lowpass', 520, 0.8);
        thump.start(time);
        thump.stop(time + 0.34);
      } else {
        const knock = ctx.createOscillator();
        const noise = ctx.createBufferSource();
        const mix = ctx.createGain();
        knock.type = 'triangle';
        knock.frequency.setValueAtTime(type === 'hihat' ? 1760 : 740, time);
        noise.buffer = this.makeNoise(type === 'hihat' ? 0.035 : 0.09);
        knock.connect(mix);
        noise.connect(mix);
        this.connectFiltered(mix, time, channelIndex, type === 'hihat' ? 0.11 : 0.24, type === 'hihat' ? 0.05 : 0.14, 'bandpass', type === 'hihat' ? 5200 : 1200, 2.4);
        knock.start(time);
        noise.start(time);
        knock.stop(time + 0.12);
      }
      return;
    }

    if (styleId === 'experimental') {
      const hit = ctx.createOscillator();
      const bell = ctx.createOscillator();
      const mix = ctx.createGain();
      hit.type = type === 'kick' ? 'sine' : 'square';
      bell.type = 'triangle';
      hit.frequency.setValueAtTime(type === 'kick' ? 88 : 310, time);
      bell.frequency.setValueAtTime(type === 'hihat' ? 2400 : 465, time);
      hit.connect(mix);
      bell.connect(mix);
      this.connectFiltered(mix, time, channelIndex, type === 'kick' ? 0.5 : 0.22, type === 'kick' ? 0.36 : 0.16, 'bandpass', type === 'kick' ? 260 : 1700, 5);
      hit.start(time);
      bell.start(time);
      hit.stop(time + 0.36);
      bell.stop(time + 0.16);
      return;
    }

    if (type === 'kick') {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(155, time);
      osc.frequency.exponentialRampToValueAtTime(42, time + 0.35);
      this.connectFiltered(osc, time, channelIndex, 0.95, 0.42, 'lowpass', 520, 1);
      osc.start(time);
      osc.stop(time + 0.42);
    } else {
      const noise = ctx.createBufferSource();
      noise.buffer = this.makeNoise(type === 'hihat' ? 0.045 : 0.18);
      this.connectFiltered(noise, time, channelIndex, type === 'hihat' ? 0.24 : 0.48, type === 'hihat' ? 0.045 : 0.18, 'highpass', type === 'hihat' ? 7600 : 1600, 1.5);
      noise.start(time);
    }
  }

  private playStyledSynth(midiNote: number, category: string, time: number, channelIndex: number) {
    const ctx = this.ctx;
    const styleId = this.style.id;
    const shift = this.channels[channelIndex].pitchShift;
    const baseFreq = 440 * Math.pow(2, (midiNote + shift - 69) / 12);
    const isBass = category === 'bass';
    const freq = isBass ? baseFreq / 2 : baseFreq;

    if (styleId === 'trap' && isBass) {
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(freq, time);
      sub.frequency.exponentialRampToValueAtTime(Math.max(28, freq * 0.72), time + 0.2);
      const { gain } = this.connectFiltered(sub, time, channelIndex, 0.8, 0.8, 'lowpass', 240, 0.8);
      gain.gain.setValueAtTime(0.66, time + 0.25);
      sub.start(time);
      sub.stop(time + 0.8);
      return;
    }

    if (styleId === 'chiptune') {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq * (isBass ? 1 : 2), time);
      this.connectFiltered(osc, time, channelIndex, isBass ? 0.3 : 0.16, isBass ? 0.14 : 0.09, 'highpass', isBass ? 120 : 900, 0.9);
      osc.start(time);
      osc.stop(time + (isBass ? 0.14 : 0.09));
      return;
    }

    if (styleId === 'techno') {
      const fm = ctx.createOscillator();
      const carrier = ctx.createOscillator();
      const fmGain = ctx.createGain();
      carrier.type = isBass ? 'sawtooth' : 'square';
      carrier.frequency.setValueAtTime(freq, time);
      fm.type = 'sine';
      fm.frequency.setValueAtTime(freq * (isBass ? 1.5 : 3.01), time);
      fmGain.gain.setValueAtTime(isBass ? 120 : 180, time);
      fm.connect(fmGain);
      fmGain.connect(carrier.frequency);
      this.connectFiltered(carrier, time, channelIndex, isBass ? 0.42 : 0.24, isBass ? 0.22 : 0.16, 'bandpass', isBass ? 700 : 1700, 6);
      fm.start(time);
      carrier.start(time);
      fm.stop(time + (isBass ? 0.22 : 0.16));
      carrier.stop(time + (isBass ? 0.22 : 0.16));
      return;
    }

    if (styleId === 'synthwave') {
      const main = ctx.createOscillator();
      const detuned = ctx.createOscillator();
      const octave = ctx.createOscillator();
      const mix = ctx.createGain();
      [main, detuned, octave].forEach((source, index) => {
        source.type = 'sawtooth';
        source.frequency.setValueAtTime(freq * (index === 2 && !isBass ? 2 : 1), time);
        source.detune.setValueAtTime([-14, 14, 3][index], time);
        source.connect(mix);
        source.start(time);
        source.stop(time + (isBass ? 0.42 : 0.9));
      });
      const { filter } = this.connectFiltered(mix, time, channelIndex, isBass ? 0.42 : 0.2, isBass ? 0.42 : 0.9, 'lowpass', isBass ? 760 : 3400, 1.1);
      filter.frequency.exponentialRampToValueAtTime(isBass ? 360 : 1400, time + (isBass ? 0.36 : 0.82));
      return;
    }

    if (styleId === 'piano') {
      const hammer = ctx.createOscillator();
      const tone = ctx.createOscillator();
      const overtone = ctx.createOscillator();
      const mix = ctx.createGain();
      hammer.type = 'triangle';
      tone.type = 'sine';
      overtone.type = 'triangle';
      hammer.frequency.setValueAtTime(freq * (isBass ? 2 : 1.01), time);
      tone.frequency.setValueAtTime(freq, time);
      overtone.frequency.setValueAtTime(freq * (isBass ? 1.5 : 2.01), time);
      hammer.connect(mix);
      tone.connect(mix);
      overtone.connect(mix);
      const duration = isBass ? 0.72 : 1.1;
      const { filter, gain } = this.connectFiltered(mix, time, channelIndex, isBass ? 0.32 : 0.18, duration, 'lowpass', isBass ? 1400 : 5200, 1);
      gain.gain.setValueAtTime(isBass ? 0.22 : 0.12, time + 0.08);
      filter.frequency.exponentialRampToValueAtTime(isBass ? 420 : 1600, time + duration * 0.75);
      [hammer, tone, overtone].forEach(source => {
        source.start(time);
        source.stop(time + duration);
      });
      return;
    }

    if (styleId === 'experimental') {
      const carrier = ctx.createOscillator();
      const harmony = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const modGain = ctx.createGain();
      const mix = ctx.createGain();
      carrier.type = 'square';
      harmony.type = 'triangle';
      carrier.frequency.setValueAtTime(freq, time);
      harmony.frequency.setValueAtTime(freq * (isBass ? 0.75 : 1.5), time);
      mod.type = 'sine';
      mod.frequency.setValueAtTime(isBass ? 11 : 19, time);
      modGain.gain.setValueAtTime(isBass ? 90 : 150, time);
      mod.connect(modGain);
      modGain.connect(carrier.frequency);
      carrier.connect(mix);
      harmony.connect(mix);
      this.connectFiltered(mix, time, channelIndex, isBass ? 0.34 : 0.18, isBass ? 0.34 : 0.28, 'bandpass', isBass ? 520 : 1800, 4.5);
      carrier.start(time);
      harmony.start(time);
      mod.start(time);
      carrier.stop(time + (isBass ? 0.34 : 0.28));
      harmony.stop(time + (isBass ? 0.34 : 0.28));
      mod.stop(time + (isBass ? 0.34 : 0.28));
      return;
    }

    if (styleId === 'club') {
      const detuned = ctx.createOscillator();
      const main = ctx.createOscillator();
      const mix = ctx.createGain();
      main.type = isBass ? 'square' : 'sawtooth';
      detuned.type = 'sawtooth';
      main.frequency.setValueAtTime(freq, time);
      detuned.frequency.setValueAtTime(freq, time);
      main.detune.setValueAtTime(-9, time);
      detuned.detune.setValueAtTime(9, time);
      main.connect(mix);
      detuned.connect(mix);
      this.connectFiltered(mix, time, channelIndex, isBass ? 0.42 : 0.2, isBass ? 0.28 : 0.32, 'lowpass', isBass ? 900 : 3600, 1.2);
      main.start(time);
      detuned.start(time);
      main.stop(time + (isBass ? 0.28 : 0.32));
      detuned.stop(time + (isBass ? 0.28 : 0.32));
    }
  }

  private playExperimental(type: string, time: number, channelIndex: number) {
    const ctx = this.ctx;
    if (this.style.id !== 'default') {
      this.playStyledExperimental(type, time, channelIndex);
      return;
    }
    const gain = ctx.createGain();
    gain.connect(this.channels[channelIndex].input);
    const shift = this.channels[channelIndex].pitchShift;
    const rateMultiplier = Math.pow(2, shift / 12);
    
    if (type === 'glitch') {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime((Math.random() * 800 + 200) * rateMultiplier, time);
      osc.frequency.setValueAtTime((Math.random() * 800 + 200) * rateMultiplier, time + 0.05);
      osc.connect(gain);
      gain.gain.setValueAtTime(0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
      osc.start(time);
      osc.stop(time + 0.1);
    } else if (type === 'laser') {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1000 * rateMultiplier, time);
      osc.frequency.exponentialRampToValueAtTime(100 * rateMultiplier, time + 0.2);
      osc.connect(gain);
      gain.gain.setValueAtTime(0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
      osc.start(time);
      osc.stop(time + 0.2);
    } else if (type === 'animal') {
      const osc = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const modGain = ctx.createGain();
      mod.type = 'sine';
      mod.frequency.value = 5 * rateMultiplier;
      mod.connect(modGain);
      modGain.gain.value = 100 * rateMultiplier;
      modGain.connect(osc.frequency);
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400 * rateMultiplier, time);
      osc.frequency.linearRampToValueAtTime(300 * rateMultiplier, time + 0.3);
      osc.connect(gain);
      gain.gain.setValueAtTime(0.3, time);
      gain.gain.linearRampToValueAtTime(0.01, time + 0.3);
      osc.start(time);
      mod.start(time);
      osc.stop(time + 0.3);
      mod.stop(time + 0.3);
    } else if (type === 'train') {
      const bufferSize = ctx.sampleRate * 0.1; 
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800 * rateMultiplier, time);
      filter.frequency.linearRampToValueAtTime(400 * rateMultiplier, time + 0.1);
      noise.connect(filter);
      filter.connect(gain);
      gain.gain.setValueAtTime(0.4, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
      noise.playbackRate.value = rateMultiplier;
      noise.start(time);
    }
  }

  private playDrum(type: string, time: number, channelIndex: number) {
    const ctx = this.ctx;
    if (this.style.id !== 'default') {
      this.playStyledDrum(type, time, channelIndex);
      return;
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(this.channels[channelIndex].input);

    if (type === 'kick') {
      osc.frequency.setValueAtTime(150, time);
      osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
      gain.gain.setValueAtTime(1, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
      osc.start(time);
      osc.stop(time + 0.5);
    } else if (type === 'snare') {
      const bufferSize = ctx.sampleRate * 0.2; 
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = buffer;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.value = 1000;
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(gain);
      gain.gain.setValueAtTime(0.5, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
      noiseSource.start(time);
    } else if (type === 'hihat') {
      const bufferSize = ctx.sampleRate * 0.05; 
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = buffer;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.value = 7000;
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(gain);
      gain.gain.setValueAtTime(0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
      noiseSource.start(time);
    } else if (type === 'clap') {
      const bufferSize = ctx.sampleRate * 0.15; 
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = buffer;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 1500;
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(gain);
      gain.gain.setValueAtTime(0.4, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
      noiseSource.start(time);
    }
  }

  private playSynth(midiNote: number, category: string, time: number, channelIndex: number) {
    const ctx = this.ctx;
    if (this.style.id !== 'default') {
      this.playStyledSynth(midiNote, category, time, channelIndex);
      return;
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.channels[channelIndex].input);

    const shift = this.channels[channelIndex].pitchShift;
    const freq = 440 * Math.pow(2, (midiNote + shift - 69) / 12);
    
    if (category === 'bass') {
      osc.type = 'square';
      osc.frequency.value = freq / 2; 
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(200, time);
      filter.frequency.exponentialRampToValueAtTime(800, time + 0.1);
      gain.gain.setValueAtTime(0.5, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2000, time);
      gain.gain.setValueAtTime(0.2, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
    }

    osc.start(time);
    osc.stop(time + 0.3);
  }
}

export class GlobalEngineManager {
  ctx: AudioContext | null = null;
  projects: Map<string, ProjectEngine> = new Map();
  captureDestination: MediaStreamAudioDestinationNode | null = null;
  bpm = 120;
  step = 0;
  nextNoteTime = 0;
  lookahead = 25;
  scheduleAheadTime = 0.1;
  clockInterval: ReturnType<typeof setInterval> | null = null;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
        latencyHint: 'interactive',
      });
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  getProject(id: string): ProjectEngine {
    this.init();
    if (!this.projects.has(id)) {
      const p = new ProjectEngine(id, this.ctx!, this.ctx!.destination);
      if (this.captureDestination) p.connectOutput(this.captureDestination);
      this.projects.set(id, p);
    }
    return this.projects.get(id)!;
  }

  startCaptureStream(): MediaStream {
    this.init();
    this.captureDestination = this.ctx!.createMediaStreamDestination();
    this.projects.forEach(project => project.connectOutput(this.captureDestination!));
    return this.captureDestination.stream;
  }

  stopCaptureStream() {
    if (!this.captureDestination) return;
    const destination = this.captureDestination;
    this.projects.forEach(project => {
      try {
        project.disconnectOutput(destination);
      } catch {
        // The project may have been created after capture stopped.
      }
    });
    this.captureDestination = null;
  }

  get isClockRunning() {
    return this.clockInterval !== null;
  }

  startProject(id: string): 'started' | 'queued' {
    const project = this.getProject(id);
    if (!this.isClockRunning) {
      project.startSynced(0);
      this.step = 0;
      this.nextNoteTime = this.ctx!.currentTime + 0.05;
      this.startClock();
      this.dispatchProjectStart(project);
      return 'started';
    }

    project.queueStart();
    return 'queued';
  }

  stopProject(id: string) {
    const project = this.getProject(id);
    project.stop();
  }

  stopAllProjects() {
    this.projects.forEach(project => project.stop());
    if (this.clockInterval !== null) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
    this.step = 0;
    this.nextNoteTime = 0;
  }

  private startClock() {
    if (this.clockInterval !== null) return;
    this.clockInterval = setInterval(() => this.scheduler(), this.lookahead);
  }

  private nextStep() {
    const secondsPerBeat = 60 / this.bpm;
    this.nextNoteTime += 0.25 * secondsPerBeat;
    this.step = (this.step + 1) % 16;
  }

  private activatePendingAtMeasureStart() {
    if (this.step !== 0) return;
    this.projects.forEach(project => {
      if (!project.pendingStart) return;
      project.startSynced(0);
      this.dispatchProjectStart(project);
    });
  }

  private scheduler() {
    if (!this.ctx) return;
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this.activatePendingAtMeasureStart();
      this.projects.forEach(project => {
        project.scheduleStep(this.step, this.nextNoteTime);
      });
      this.nextStep();
    }
  }

  private dispatchProjectStart(project: ProjectEngine) {
    const event = new CustomEvent('project-start', {
      detail: { projectId: project.id, step: project.step },
    });
    window.dispatchEvent(event);
  }

  async processBuffer(buffer: AudioBuffer): Promise<AudioBuffer> {
    this.init();
    const ctx = this.ctx!;
    const bpm = this.detectBPM(buffer);
    const targetBPM = 120;
    const ratio = targetBPM / bpm;
    
    const offset = this.findFirstBeat(buffer);
    const stretched = this.applyWSOLA(buffer, ratio, offset);
    return this.clipToMeasure(stretched, 2.0);
  }

  private detectBPM(buffer: AudioBuffer): number {
    const data = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    
    const partSize = sampleRate / 2; // 0.5s chunks
    const peaks = [];
    
    let max = 0;
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) > max) max = Math.abs(data[i]);
    }
    
    const threshold = max * 0.7;
    for (let i = 0; i < data.length; i += partSize) {
      let partMax = 0;
      let partPeakIdx = -1;
      for (let j = i; j < i + partSize && j < data.length; j++) {
        if (Math.abs(data[j]) > partMax) {
          partMax = Math.abs(data[j]);
          partPeakIdx = j;
        }
      }
      if (partMax > threshold) {
        peaks.push(partPeakIdx);
      }
    }
    
    if (peaks.length < 2) return 120; // fallback
    
    const intervals = [];
    for (let i = 1; i < peaks.length; i++) {
      intervals.push(peaks[i] - peaks[i-1]);
    }
    
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    let bpm = 60 / (avgInterval / sampleRate);
    
    while (bpm < 70) bpm *= 2;
    while (bpm > 180) bpm /= 2;
    
    return Math.round(bpm);
  }

  private findFirstBeat(buffer: AudioBuffer): number {
    const data = buffer.getChannelData(0);
    const threshold = 0.15;
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) > threshold) return i;
    }
    return 0;
  }

  private applyWSOLA(buffer: AudioBuffer, ratio: number, startOffset: number): AudioBuffer {
    const ctx = this.ctx!;
    const sampleRate = buffer.sampleRate;
    const inputData = buffer.getChannelData(0);
    
    const windowSize = Math.floor(sampleRate * 0.05); // 50ms
    const hopOut = Math.floor(windowSize / 2);
    const hopIn = Math.floor(hopOut / ratio);
    
    const outputLength = Math.floor(buffer.length * ratio);
    const outputData = new Float32Array(outputLength);
    const fadeOut = new Float32Array(windowSize);
    for(let i=0; i<windowSize; i++) fadeOut[i] = 0.5 * (1 + Math.cos(Math.PI * i / windowSize));
    const fadeIn = new Float32Array(windowSize);
    for(let i=0; i<windowSize; i++) fadeIn[i] = 1 - fadeOut[i];

    let outPos = 0;
    let inPos = startOffset;

    while (outPos + windowSize < outputLength && inPos + windowSize < inputData.length) {
      for (let i = 0; i < windowSize; i++) {
        const val = inputData[inPos + i];
        outputData[outPos + i] += val * fadeIn[i];
      }
      outPos += hopOut;
      inPos += hopIn;
    }

    const newBuffer = ctx.createBuffer(buffer.numberOfChannels, outputLength, sampleRate);
    newBuffer.copyToChannel(outputData, 0);
    return newBuffer;
  }

  private clipToMeasure(buffer: AudioBuffer, seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const frameCount = Math.floor(seconds * buffer.sampleRate);
    const clipped = ctx.createBuffer(buffer.numberOfChannels, frameCount, buffer.sampleRate);
    
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      const data = buffer.getChannelData(i);
      const newData = clipped.getChannelData(i);
      for (let j = 0; j < frameCount; j++) {
        if (j < data.length) {
          newData[j] = data[j];
        } else {
          const fadeLen = Math.floor(buffer.sampleRate * 0.01); // 10ms
          if (j > frameCount - fadeLen) {
            const alpha = (frameCount - j) / fadeLen;
            newData[j] *= alpha;
          }
        }
      }
    }
    return clipped;
  }
}

export const engineManager = new GlobalEngineManager();
