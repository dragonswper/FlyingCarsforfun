// Original offline training setups. Metres, seconds and metres/second match
// the shared simulation; guides never participate in collisions.
import {C} from '../constants.js';
const shot = (id, name, car, ball, velocity = [0, 0, 0], extra = {}) => ({
  id,
  name,
  car,
  ball,
  velocity,
  objective: 'goal',
  limit: 18,
  par: 8,
  tip: 'Strike through the centre of the ball toward the orange goal.',
  ...extra,
});
export const ACADEMY_PACKS = Object.freeze(
  [
    {
      id: 'striker',
      name: 'First touch',
      level: 'FOUNDATIONS',
      description:
        'Line up your approach and finish four progressively wider shots.',
      drills: [
        shot(
          'straight',
          'Straight finish',
          [0, -24],
          [0, C.ballRestHeight, -6],
        ),
        shot('left', 'Left channel', [-20, -20], [-12, C.ballRestHeight, 6]),
        shot('right', 'Right channel', [20, -16], [11, C.ballRestHeight, 10]),
        shot(
          'cross',
          'Rolling cross',
          [-16, 0],
          [18, C.ballRestHeight, 25],
          [-8, 0, 0],
          {
            par: 10,
            limit: 22,
            tip: 'Meet the cross side-on and redirect it toward goal.',
          },
        ),
      ],
    },
    {
      id: 'aerial',
      name: 'Flight school',
      level: 'INTERMEDIATE',
      description: 'Jump, pitch back and boost into a clean aerial touch.',
      drills: [
        shot('pop', 'Low pop', [0, -20], [0, 3, -1], [0, 5, 0], {
          objective: 'aerial',
          minHeight: 2.5,
          par: 4,
          limit: 12,
        }),
        shot('rise', 'Rising ball', [0, -24], [0, 5, -5], [0, 10, 4], {
          objective: 'aerial',
          minHeight: 4,
          par: 5,
          limit: 14,
        }),
        shot('offset', 'Offset intercept', [-13, -23], [0, 7, -2], [2, 2, 3], {
          objective: 'aerial',
          minHeight: 4,
          par: 6,
          limit: 16,
        }),
        shot('high', 'High intercept', [0, -28], [0, 12, -4], [0, 1, 0], {
          objective: 'aerial',
          minHeight: 7,
          par: 6,
          limit: 16,
        }),
      ].map((d) => ({
        ...d,
        tip: 'Jump, lean back and boost. Make contact above the marked height; a goal is optional.',
      })),
    },
    {
      id: 'keeper',
      name: 'Last line',
      level: 'INTERMEDIATE',
      description:
        'Read four incoming shots and clear them away from your goal.',
      drills: [
        shot('centre', 'Central save', [0, -46], [0, 2, -22], [0, 0, -15]),
        shot('near', 'Near post', [-5, -45], [-6, 2, -20], [0, 1, -17]),
        shot('far', 'Far post', [0, -45], [10, 3, -18], [-3, 2, -17]),
        shot('lob', 'Lobbed save', [0, -46], [0, 7, -22], [0, 4, -13]),
      ].map((d) => ({
        ...d,
        objective: 'save',
        yaw: 0,
        par: 3,
        limit: 9,
        tip: 'Hold the goal side, meet the incoming shot and send it back upfield.',
      })),
    },
    {
      id: 'wall',
      name: 'Wall reads',
      level: 'ADVANCED',
      description: 'Follow the rebound and meet the ball off the side wall.',
      drills: [
        shot('left-read', 'Left bounce', [-22, -15], [-30, 3, 2], [-12, 1, 6], {
          objective: 'touch',
          par: 5,
        }),
        shot('right-read', 'Right bounce', [22, -15], [30, 3, 2], [12, 1, 6], {
          objective: 'touch',
          par: 5,
        }),
        shot(
          'high-read',
          'High rebound',
          [-21, -8],
          [-32, 7, 14],
          [-14, 2, -2],
          {objective: 'aerial', minHeight: 3, par: 6},
        ),
        shot('backboard', 'Backboard read', [0, 14], [0, 8, 39], [3, 7, 12], {
          objective: 'aerial',
          minHeight: 3,
          par: 7,
        }),
      ].map((d) => ({
        ...d,
        tip: 'Watch the path guide. Chase the rebound, then jump or drive up the wall to meet it.',
      })),
    },
    {
      id: 'redirect',
      name: 'Redirects',
      level: 'ADVANCED',
      description:
        'Turn a moving ball into a finish without stopping it first.',
      drills: [
        shot('square', 'Square pass', [0, 4], [-24, 2, 24], [10, 0, 0], {
          par: 7,
          limit: 20,
        }),
        shot('diagonal', 'Diagonal pass', [12, 0], [-13, 2, 16], [7, 0, 4], {
          par: 8,
          limit: 20,
        }),
        shot('bounce', 'Bouncing finish', [-10, 3], [0, 5, 20], [0, -4, 3], {
          par: 8,
          limit: 20,
        }),
        shot(
          'long',
          'Long-range finish',
          [0, -36],
          [0, C.ballRestHeight, -20],
          [0, 0, 0],
          {par: 12, limit: 25},
        ),
      ],
    },
    {
      id: 'control',
      name: 'Car control',
      level: 'FOUNDATIONS',
      description:
        'Drive precise routes, then recover from an upside-down landing.',
      drills: [
        shot(
          'slalom',
          'Slalom',
          [0, -30],
          [25, C.ballRestHeight, 0],
          [0, 0, 0],
          {
            objective: 'route',
            checkpoints: [
              [-9, 1, -15],
              [9, 1, 0],
              [-9, 1, 15],
              [0, 1, 30],
            ],
            limit: 40,
            par: 19,
          },
        ),
        shot(
          'sprint',
          'Boost line',
          [0, -38],
          [26, C.ballRestHeight, 0],
          [0, 0, 0],
          {
            objective: 'route',
            checkpoints: [
              [0, 1, -18],
              [0, 1, 2],
              [0, 1, 26],
            ],
            limit: 24,
            par: 9,
          },
        ),
        shot(
          'turn',
          'Cut and recover',
          [-18, -30],
          [27, C.ballRestHeight, 0],
          [0, 0, 0],
          {
            objective: 'route',
            checkpoints: [
              [-18, 1, -5],
              [10, 1, 8],
              [0, 1, -15],
            ],
            limit: 40,
            par: 19,
          },
        ),
        shot(
          'recover',
          'Roof recovery',
          [0, -10],
          [24, C.ballRestHeight, 0],
          [0, 0, 0],
          {
            objective: 'recover',
            height: 4,
            upsideDown: true,
            limit: 12,
            par: 3,
            tip: 'Use Jump to right the car. Land wheels-down and hold that landing for half a second.',
          },
        ),
      ].map((d) => ({
        ...d,
        tip:
          d.tip ===
          'Strike through the centre of the ball toward the orange goal.'
            ? 'Drive through the illuminated gates in order. Use powerslide to tighten the turn.'
            : d.tip,
      })),
    },
  ].map((p) =>
    Object.freeze({
      ...p,
      drills: Object.freeze(
        p.drills.map((d) => Object.freeze({...d, key: p.id + '/' + d.id})),
      ),
    }),
  ),
);
export const ACADEMY_DRILLS = Object.freeze(
  ACADEMY_PACKS.flatMap((p) => p.drills),
);
export const MEDAL_NAMES = ['—', 'BRONZE', 'SILVER', 'GOLD'];
