export type GameEra = 'prehistory' | 'egypt' | 'castle' | 'pirates' | 'future';

export interface LevelConfig {
  id: GameEra;
  title: string;
  tmxFile: string;
  musicFile: string;
  tilesetImage: string;
  minPlayableX: number;
  bgColor: string;
}

export const LEVEL_CONFIGS: Record<GameEra, LevelConfig> = {
  prehistory: {
    id: 'prehistory',
    title: 'Prehistoria',
    tmxFile: '/assets/data/prehistory.tmx',
    musicFile: '/assets/audio/music/prehistoria.ogg',
    tilesetImage: '/assets/images/tiles/tileset_prehistory.png',
    minPlayableX: 1216,
    bgColor: '#ef6c5b',
  },
  egypt: {
    id: 'egypt',
    title: 'Egipto',
    tmxFile: '/assets/data/egypt.tmx',
    musicFile: '/assets/audio/music/andy.ogg',
    tilesetImage: '/assets/images/tiles/tileset_egypt.png',
    minPlayableX: 3648,
    bgColor: '#830f0d',
  },
  castle: {
    id: 'castle',
    title: 'Castillo Medieval',
    tmxFile: '/assets/data/castle.tmx',
    musicFile: '/assets/audio/music/castillo.ogg',
    tilesetImage: '/assets/images/tiles/tileset_castle.png',
    minPlayableX: 1216,
    bgColor: '#0a0a12',
  },
  pirates: {
    id: 'pirates',
    title: 'Barco Pirata',
    tmxFile: '/assets/data/pirates.tmx',
    musicFile: '/assets/audio/music/piratas.ogg',
    tilesetImage: '/assets/images/tiles/tileset_pirates.png',
    minPlayableX: 1216,
    bgColor: '#b5e8ff',
  },
  future: {
    id: 'future',
    title: 'El Futuro',
    tmxFile: '/assets/data/future.tmx',
    musicFile: '/assets/audio/music/futuro.ogg',
    tilesetImage: '/assets/images/tiles/tileset_future.png',
    minPlayableX: 3648,
    bgColor: '#1e1e2d',
  },
};

export interface TileProperties {
  pHard?: boolean;
  pPlatform?: boolean;
  pKilling?: boolean;
  pLadder?: boolean;
  pLadderEnd?: boolean;
}

export interface MapObject {
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  properties: Record<string, string>;
}

export interface TMXMap {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  tilesetName: string;
  tilesetImageSource: string;
  tileProps: Map<number, TileProperties>;
  tiles: Uint32Array;
  objects: MapObject[];
  properties: Record<string, string>;
}

export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
  originX: number;
  originY: number;
}

export interface AnimationDef {
  name: string;
  frames: number[];
  frameRate: number;
  loop: boolean;
}

export interface SpriteSheetInfo {
  imageKey: string;
  frameWidth: number;
  frameHeight: number;
  cols: number;
  rows: number;
  totalFrames: number;
  originX: number;
  originY: number;
}
