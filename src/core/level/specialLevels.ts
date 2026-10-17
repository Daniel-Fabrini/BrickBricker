import { getDifficulty } from '../../config/difficulty';
import { OBSTACLES, WORLD } from '../../config/tuning';
import { hashSeed } from '../rng';
import type { GameStyle } from '../types';
import type { BrickDef, GateDef, LevelDefinition, ObstacleDef, SliderDef, StaticDef } from './types';

/**
 * Hand-designed special levels. Maps are 12 characters wide:
 *   .  empty            1    standard brick
 *   2-5 resistant brick with that many hit points
 *   S  special brick (1 hp)   s  special brick (2 hp)
 *   X  steel block (indestructible)   #  maze wall
 *   G  gate cell (adjacent G cells on a row form one gate)
 * Sliders are declared separately by lane row.
 *
 * Special levels appear every tenth level. When the collection is exhausted it repeats with a
 * mirrored layout and tougher bricks, so the game stays infinite.
 */
export interface SpecialLevelDesign {
  id: string;
  style: GameStyle;
  map: string[];
  sliders?: { row: number; half?: 'left' | 'right'; speed?: number; phase?: number }[];
  gateTiming?: { openTime: number; closedTime: number };
}

export const SPECIAL_LEVELS: SpecialLevelDesign[] = [
  // ---------------------------------------------------------------- Classic
  {
    id: 'invader',
    style: 'classic',
    map: [
      '...1....1...',
      '....1..1....',
      '...222222...',
      '..21S22S12..',
      '.1111111111.',
      '.1.222222.1.',
      '.1.1....1.1.',
      '....11.11...',
    ],
  },
  {
    id: 'heart',
    style: 'classic',
    map: [
      '..333..333..',
      '.3222332223.',
      '.22S1221S22.',
      '.2111111112.',
      '..21111112..',
      '...211112...',
      '....2112....',
      '.....22.....',
    ],
  },
  {
    id: 'fortress',
    style: 'classic',
    map: [
      'XX11111111XX',
      'X2222222222X',
      'X2.3S33S3.2X',
      'X2.333333.2X',
      'X2........2X',
      'X2222..2222X',
      'XXX......XXX',
    ],
  },
  {
    id: 'checkerStorm',
    style: 'classic',
    map: [
      '3.3.3..3.3.3',
      '.2.2.22.2.2.',
      '1.1.S..S.1.1',
      '.2.2.22.2.2.',
      '3.3.3..3.3.3',
      '.1.1.11.1.1.',
      '2.2.s..s.2.2',
      '.1.1.11.1.1.',
    ],
  },
  {
    id: 'rainbow',
    style: 'classic',
    map: [
      '...555555...',
      '..44444444..',
      '.333....333.',
      '.22......22.',
      'S1........1S',
      '11........11',
      '1..........1',
    ],
  },
  {
    id: 'crown',
    style: 'classic',
    map: [
      '3....33....3',
      '33..3333..33',
      '333333333333',
      '2S22222222S2',
      '222222222222',
      '.1111111111.',
      '..X......X..',
    ],
  },
  {
    id: 'target',
    style: 'classic',
    map: [
      '444444444444',
      '4..........4',
      '4.33333333.4',
      '4.3......3.4',
      '4.3.2SS2.3.4',
      '4.3.2..2.3.4',
      '....2..2....',
    ],
  },
  {
    id: 'galaxy',
    style: 'classic',
    map: [
      '.22..33..22.',
      '.2S..33..S2.',
      '............',
      '33..1221..33',
      '33..1221..33',
      '............',
      '.44..22..44.',
      '.44..ss..44.',
    ],
  },
  // ---------------------------------------------------------------- Maze
  {
    id: 'gauntlet',
    style: 'maze',
    map: [
      '222222222222',
      '211111111112',
      '##1S1..1S1##',
      '............',
      '#.###..###.#',
      '#.#11..11#.#',
      '#.#11..11#.#',
      '#.#11..11#.#',
      '#.###..###.#',
      '............',
    ],
    sliders: [{ row: 11 }],
  },
  {
    id: 'vault',
    style: 'maze',
    map: [
      '22222..22222',
      '2##########2',
      '2#33333333#2',
      '2#3S2222S3#2',
      '2#33333333#2',
      '2##GG..GG##2',
      '............',
      '............',
      '.1111111111.',
    ],
  },
  {
    id: 'twinChambers',
    style: 'maze',
    map: [
      '333333333333',
      '3....##....3',
      '3.22.##.22.3',
      '3.2S.##.S2.3',
      '3.22.##.22.3',
      '3....##....3',
      '###..##..###',
      '............',
      '............',
      '2.2.2..2.2.2',
    ],
    sliders: [{ row: 12 }],
  },
  {
    id: 'zigzag',
    style: 'maze',
    map: [
      '444444444444',
      '............',
      '............',
      '33333333....',
      '########....',
      '............',
      '............',
      '....22222222',
      '....########',
      '............',
      '............',
      'S1111111....',
      '########....',
    ],
  },
  {
    id: 'clockwork',
    style: 'maze',
    map: [
      '333333333333',
      '3S22222222S3',
      '###......###',
      '............',
      '............',
      '..22....22..',
      '..2s....s2..',
      '............',
    ],
    sliders: [
      { row: 10, half: 'left', phase: 0 },
      { row: 10, half: 'right', phase: 0.5 },
    ],
  },
  {
    id: 'labyrinth',
    style: 'maze',
    map: [
      '333333333333',
      '#....##....#',
      '#.22.##.22.#',
      '#.22....22.#',
      '#.##GG..##.#',
      '#..........#',
      '###.2SS2.###',
      '............',
      '.1111..1111.',
    ],
  },
  {
    id: 'hive',
    style: 'maze',
    map: [
      '.2..2..2..2.',
      '#2##2##2##2#',
      '.3..3..3..3.',
      '............',
      '.S........S.',
      '#..##..##..#',
      '.2..2..2..2.',
      '.2..2..2..2.',
    ],
    sliders: [{ row: 11, speed: 55 }],
  },
  {
    id: 'citadel',
    style: 'maze',
    map: [
      '444444444444',
      '4##########4',
      '4#33333333#4',
      '4#3S5555S3#4',
      '4#33333333#4',
      '4###GG..###4',
      '4..........4',
      '............',
      '..########..',
      '............',
    ],
    sliders: [{ row: 12 }],
  },
];

const VALID_ROW = /^[.1-5SsX#G]{12}$/;

/** Builds a playable level from a design. `cycle` > 0 mirrors the layout and toughens bricks. */
export function buildSpecialLevel(design: SpecialLevelDesign, levelNumber: number, cycle: number): LevelDefinition {
  const mirror = cycle % 2 === 1;
  const hpBoost = Math.min(2, cycle);
  const bricks: BrickDef[] = [];
  const statics: StaticDef[] = [];
  const obstacles: ObstacleDef[] = [];
  const rows = design.map.length;

  design.map.forEach((line, row) => {
    if (!VALID_ROW.test(line)) throw new Error(`Special level ${design.id} row ${row} is malformed: "${line}"`);
    let gateStart = -1;
    const flushGate = (endCol: number): void => {
      if (gateStart < 0) return;
      const timing = design.gateTiming ?? { openTime: OBSTACLES.gateOpenTime, closedTime: OBSTACLES.gateClosedTime };
      const w = endCol - gateStart;
      const startCol = mirror ? WORLD.gridCols - gateStart - w : gateStart;
      const gate: GateDef = { kind: 'gate', col: startCol, row, w, h: 1, ...timing, offset: ((row * 7 + gateStart) % 10) * 0.37 };
      obstacles.push(gate);
      gateStart = -1;
    };
    for (let i = 0; i < WORLD.gridCols; i++) {
      const ch = line[i] as string;
      const col = mirror ? WORLD.gridCols - 1 - i : i;
      if (ch === 'G') {
        if (gateStart < 0) gateStart = i;
        continue;
      }
      flushGate(i);
      if (ch === '.') continue;
      if (ch === '#') statics.push({ col, row, kind: 'wall' });
      else if (ch === 'X') statics.push({ col, row, kind: 'steel' });
      else if (ch === 'S') bricks.push({ col, row, kind: 'special', hp: 1 });
      else if (ch === 's') bricks.push({ col, row, kind: 'special', hp: 2 });
      else {
        const hp = Number(ch);
        if (hp === 1 && hpBoost === 0) bricks.push({ col, row, kind: 'standard', hp: 1 });
        else bricks.push({ col, row, kind: 'resistant', hp: Math.min(5, Math.max(2, hp + hpBoost)) });
      }
    }
    flushGate(WORLD.gridCols);
  });

  let laneRow = rows;
  for (const s of design.sliders ?? []) {
    const widthCells = 2;
    const w = widthCells * WORLD.cellW;
    let minX: number = OBSTACLES.sliderEndClearance;
    let maxX: number = WORLD.width - OBSTACLES.sliderEndClearance - w;
    let half = s.half;
    if (mirror && half) half = half === 'left' ? 'right' : 'left';
    if (half === 'left') maxX = WORLD.width / 2 - w - 4;
    if (half === 'right') minX = WORLD.width / 2 + 4;
    const slider: SliderDef = {
      kind: 'slider',
      row: s.row,
      widthCells,
      minX,
      maxX,
      speed: s.speed ?? 60,
      phase: s.phase ?? 0.25,
    };
    obstacles.push(slider);
    laneRow = Math.max(laneRow, s.row + 1);
  }

  const difficulty = getDifficulty(levelNumber, design.style);
  const seed = hashSeed('special', design.id, levelNumber);
  return {
    key: `${design.style}:${levelNumber}:special:${design.id}:${cycle}`,
    number: levelNumber,
    style: design.style,
    seed,
    special: design.id,
    rows: laneRow,
    bricks,
    statics,
    obstacles,
    ballSpeed: difficulty.ballSpeed,
    formation: `special:${design.id}`,
    template: design.style === 'maze' ? `special:${design.id}` : undefined,
    difficulty,
  };
}

export function specialDesignsFor(style: GameStyle): SpecialLevelDesign[] {
  return SPECIAL_LEVELS.filter((d) => d.style === style);
}
