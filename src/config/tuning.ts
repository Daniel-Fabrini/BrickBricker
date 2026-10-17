/**
 * Centralised gameplay tuning. Every gameplay number lives here (or in difficulty.ts) so balancing
 * never requires hunting through rendering or UI code. All distances are in world units; the world
 * is a fixed 360 x 600 portrait playfield that the renderer scales to the device.
 */

export const WORLD = {
  width: 360,
  height: 600,
  /** Brick grid. Cells are 30 x 15 world units; 12 columns span the whole field width. */
  gridCols: 12,
  gridMaxRows: 20,
  cellW: 30,
  cellH: 15,
  /** Free space above the first grid row so the ball can travel behind bricks. */
  gridTop: 36,
} as const;

export const PADDLE = {
  width: 64,
  height: 12,
  /** Paddle centre line. Space below it is left free for the player's finger. */
  y: 548,
  /** Exponential follow rate (1/s). Higher feels more direct. */
  response: 42,
  /** Slower, steadier follow rate used by the "tolerant control" accessibility option. */
  tolerantResponse: 20,
  /** Hard cap on paddle speed so it can never teleport through a ball. */
  maxSpeed: 3400,
} as const;

export const INPUT = {
  /** Control assistance: fraction of the touch width at each edge that already maps to the wall. */
  edgeMargin: 0.07,
  tolerantEdgeMargin: 0.14,
  /** Movements smaller than this (world units) are ignored when tolerant control is on (tremor filter). */
  tolerantDeadZone: 1.6,
  /** Relative drag mode sensitivity multipliers. */
  relativeSensitivity: 1.25,
  tolerantRelativeSensitivity: 1.6,
} as const;

export const BALL = {
  radius: 6,
  /** Maximum rebound angle from vertical when the ball hits the very edge of the paddle. */
  maxBounceAngleDeg: 62,
  /** Centre hits are nudged at least this far from vertical so rallies never become static. */
  minPaddleAngleDeg: 3,
  /** Minimum |vy| / speed after any bounce (~18 degrees above horizontal). */
  minVerticalRatio: 0.32,
  /** Hard ceiling for ball speed, including the inactivity boost. */
  absoluteMaxSpeed: 560,
  /** Performance and readability cap for simultaneous balls. */
  maxBalls: 8,
  /** Seconds the ball rests on the paddle before launching automatically. */
  serveDelay: 1.1,
  /** Launch angle range (degrees from vertical). */
  serveMinAngleDeg: 8,
  serveMaxAngleDeg: 24,
  /** Maximum distance a ball travels per collision sub-step (prevents tunnelling). */
  maxSubstepDistance: 3,
  /** Seconds without touching the paddle or damaging a brick before a ball's angle is gently nudged. */
  stallTimeout: 10,
  stallNudgeMinDeg: 9,
  stallNudgeMaxDeg: 22,
  /** Continuous deep overlap (seconds) after which a ball is relocated to free space. */
  stuckRescueTime: 0.3,
} as const;

export const SPEED = {
  /** Seconds without destroying a brick before the ball starts to speed up. */
  inactivityDelay: 8,
  /** Multiplier gained per second once the inactivity delay has elapsed. */
  boostRate: 0.025,
  /** Maximum inactivity multiplier. */
  maxBoost: 1.3,
  /** Multiplier lost per second after a brick is destroyed (smooth return to level speed). */
  recoveryRate: 0.12,
} as const;

export const SCORING = {
  standardBase: 10,
  /** Resistant bricks are worth this much per maximum hit point when destroyed. */
  resistantBasePerHp: 10,
  specialBase: 25,
  /** Flat points for a hit that damages but does not destroy (never multiplied by combos). */
  damageHitPoints: 2,
  /** Level multiplier: 1 + perLevel * (level - 1), capped. */
  levelBonusPerLevel: 0.05,
  levelBonusMax: 3,
  /** Combo window (seconds). Each destruction refreshes it. */
  comboWindow: 3,
  /** Every `comboStep` chained destructions add `comboStepMultiplier` to the multiplier. */
  comboStep: 5,
  comboStepMultiplier: 0.5,
  comboMaxMultiplier: 4,
  /** Burst: destructions within this window of at least `burstMin - 1` others earn a bonus. */
  burstWindow: 0.35,
  burstMin: 3,
  burstPointsPerBrick: 15,
  /** Bonus for every brick destroyed by Explosion or Piercing. */
  powerKillBonus: 5,
  /** Level clear bonus = perLevel * level. */
  levelClearBonusPerLevel: 100,
  /** Extra Life caught at the life cap converts into points instead. */
  extraLifeAtCapPoints: 500,
  /** Catching a power with a full inventory awards a few points (the power is not stored). */
  inventoryFullPoints: 50,
} as const;

export const POWERS = {
  /** Probability that a destroyed special brick releases a collectible. */
  dropChance: 0.85,
  /** Weighted distribution. Extra Life is intentionally much rarer. */
  weights: { multiball: 34, piercing: 30, explosion: 30, extraLife: 6 },
  collectibleFallSpeed: 150,
  collectibleWidth: 26,
  collectibleHeight: 14,
  inventorySlots: 2,
  maxCollectiblesOnField: 4,
  maxExtraLifeDropsPerLevel: 1,
  multiball: {
    newBallsPerSource: 2,
    maxSourceBalls: 3,
    spreadDeg: 24,
  },
  piercing: {
    duration: 7,
    maxDuration: 14,
  },
  explosion: {
    maxCharges: 2,
    innerRadius: 36,
    outerRadius: 56,
    innerDamage: 2,
    outerDamage: 1,
  },
} as const;

export const LIVES = {
  highScoreStart: 5,
  highScoreMax: 9,
} as const;

export const PROGRESSION = {
  checkpointInterval: 5,
  specialLevelInterval: 10,
} as const;

export const OBSTACLES = {
  sliderHeight: 10,
  sliderMinSpeed: 45,
  sliderMaxSpeed: 75,
  /** Clearance kept between a slider and the field walls at the ends of its travel. */
  sliderEndClearance: 26,
  gateOpenTime: 2.8,
  gateClosedTime: 2.0,
  /** Gates flash for this long before closing. */
  gateWarnTime: 0.7,
} as const;

export const SIM = {
  /** Fixed simulation step (seconds). */
  fixedStep: 1 / 120,
  /** Frame deltas above this are clamped (e.g. after the app resumes). */
  maxFrameDelta: 0.1,
} as const;

export const SAVE = {
  /** Autosave interval during active play (seconds of real time). */
  autosaveInterval: 4,
} as const;
