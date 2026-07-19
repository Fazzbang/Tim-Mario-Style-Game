// Level definitions for Tim's Platformer.
// Coordinates are in world pixels. Canvas is 360x640; groundY is the top of the ground strip.
// pits: gaps in the ground (falling in = lose a life). platforms: floating solid rectangles.
// enemies: patrol back and forth between patrolMin/patrolMax at their spawn y.

const GROUND_Y = 600;
const GROUND_H = 40;

const LEVELS = [
  {
    name: "Level 1 - Green Hills",
    width: 2400,
    groundY: GROUND_Y,
    groundH: GROUND_H,
    playerStart: { x: 40, y: GROUND_Y - 48 },
    pits: [
      { x: 520, w: 90 },
      { x: 1180, w: 100 },
      { x: 1850, w: 90 },
    ],
    platforms: [
      { x: 300, y: GROUND_Y - 110, w: 110, h: 20 },
      { x: 640, y: GROUND_Y - 90, w: 90, h: 20 },
      { x: 820, y: GROUND_Y - 170, w: 90, h: 20 },
      { x: 980, y: GROUND_Y - 90, w: 120, h: 20 },
      { x: 1350, y: GROUND_Y - 130, w: 100, h: 20 },
      { x: 1550, y: GROUND_Y - 200, w: 90, h: 20 },
      { x: 1980, y: GROUND_Y - 110, w: 110, h: 20 },
      { x: 2150, y: GROUND_Y - 190, w: 100, h: 20 },
    ],
    enemies: [
      { x: 380, y: GROUND_Y - 28, min: 320, max: 480 },
      { x: 900, y: GROUND_Y - 28, min: 700, max: 1050 },
      { x: 1420, y: GROUND_Y - 28, min: 1300, max: 1550 },
      { x: 2000, y: GROUND_Y - 28, min: 1950, max: 2200 },
    ],
    goalX: 2320,
  },
  {
    name: "Level 2 - Rocky Ridge",
    width: 3000,
    groundY: GROUND_Y,
    groundH: GROUND_H,
    playerStart: { x: 40, y: GROUND_Y - 48 },
    pits: [
      { x: 300, w: 80 },
      { x: 650, w: 110 },
      { x: 1200, w: 90 },
      { x: 1650, w: 120 },
      { x: 2250, w: 100 },
      { x: 2600, w: 90 },
    ],
    platforms: [
      { x: 150, y: GROUND_Y - 100, w: 100, h: 20 },
      { x: 480, y: GROUND_Y - 150, w: 90, h: 20 },
      { x: 780, y: GROUND_Y - 90, w: 100, h: 20 },
      { x: 950, y: GROUND_Y - 190, w: 90, h: 20 },
      { x: 1120, y: GROUND_Y - 260, w: 90, h: 20 },
      { x: 1400, y: GROUND_Y - 120, w: 120, h: 20 },
      { x: 1600, y: GROUND_Y - 220, w: 90, h: 20 },
      { x: 1850, y: GROUND_Y - 130, w: 100, h: 20 },
      { x: 2050, y: GROUND_Y - 90, w: 90, h: 20 },
      { x: 2350, y: GROUND_Y - 170, w: 100, h: 20 },
      { x: 2550, y: GROUND_Y - 240, w: 90, h: 20 },
      { x: 2780, y: GROUND_Y - 120, w: 110, h: 20 },
    ],
    enemies: [
      { x: 220, y: GROUND_Y - 28, min: 150, max: 280 },
      { x: 820, y: GROUND_Y - 28, min: 780, max: 980 },
      { x: 1450, y: GROUND_Y - 28, min: 1400, max: 1600 },
      { x: 1900, y: GROUND_Y - 28, min: 1850, max: 2050 },
      { x: 2400, y: GROUND_Y - 28, min: 2350, max: 2550 },
      { x: 2820, y: GROUND_Y - 28, min: 2780, max: 2950 },
    ],
    goalX: 2920,
  },
];
