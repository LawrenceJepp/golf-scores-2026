// Shared course data + scoring rules. Loaded by the browser (window.GW) and by the API (require).
(function (root) {
  'use strict';

  const PLAYERS = ['Lawrence', 'Sam', 'Joe', 'George', 'Hammy', 'Alex', 'Grail', 'Jacob', 'Max', 'Ben'];

  // Yellow tees, taken from the club scorecards.
  const COURSES = {
    day1: {
      key: 'day1', day: 'Day 1', name: 'Kings Course', format: 'Individual nett stroke play',
      tee: 'Yellow', cr: 72.0, slope: 132,
      yards: [360, 421, 362, 131, 422, 523, 540, 179, 367, 357, 400, 209, 402, 342, 309, 537, 108, 536],
      par:   [4, 4, 4, 3, 4, 5, 5, 3, 4, 4, 4, 3, 4, 4, 4, 5, 3, 5],
      si:    [15, 5, 13, 17, 1, 11, 3, 9, 7, 10, 12, 6, 2, 14, 16, 4, 18, 8],
    },
    day2: {
      key: 'day2', day: 'Day 2', name: 'Earls Course', format: 'Bonus Better Ball',
      tee: 'Yellow', cr: 72.3, slope: 127,
      yards: [405, 184, 384, 611, 409, 498, 396, 128, 406, 564, 143, 404, 142, 338, 350, 437, 344, 531],
      par:   [4, 3, 4, 5, 4, 5, 4, 3, 4, 5, 3, 4, 3, 4, 4, 4, 4, 5],
      si:    [7, 15, 5, 3, 9, 11, 1, 17, 13, 10, 12, 2, 18, 6, 16, 4, 14, 8],
    },
  };

  const DAY1_GROUPS = [
    ['George', 'Hammy', 'Ben'],
    ['Lawrence', 'Max', 'Alex'],
    ['Sam', 'Joe', 'Jacob', 'Grail'],
  ];

  // Day 2 groups by team slot (A1 = Team A player 1, etc.)
  const DAY2_SLOTS = [
    ['A1', 'B1', 'C1'],
    ['A2', 'D1', 'E1'],
    ['B2', 'C2', 'D2', 'E2'],
  ];

  // Course Handicap tables: [upper bound of Handicap Index range, Course Handicap].
  // Plus handicaps are stored as negative numbers (+2.1 => -2.1).
  const CH_TABLES = {
    // Kings Course, Men's Yellow (CR 72.0, Slope 132)
    day1: [
      [-4.8, -6], [-3.9, -5], [-3.0, -4], [-2.2, -3], [-1.3, -2], [-0.5, -1], [0.4, 0],
      [1.2, 1], [2.1, 2], [2.9, 3], [3.8, 4], [4.7, 5], [5.5, 6], [6.4, 7], [7.2, 8], [8.1, 9],
      [8.9, 10], [9.8, 11], [10.7, 12], [11.5, 13], [12.4, 14], [13.2, 15], [14.1, 16], [14.9, 17],
      [15.8, 18], [16.6, 19], [17.5, 20], [18.4, 21], [19.2, 22], [20.1, 23], [20.9, 24], [21.8, 25],
      [22.6, 26], [23.5, 27], [24.3, 28], [25.2, 29], [26.1, 30], [26.9, 31], [27.8, 32], [28.6, 33],
      [29.5, 34], [30.3, 35], [31.2, 36], [32.1, 37], [32.9, 38], [33.8, 39], [34.6, 40], [35.5, 41],
      [36.3, 42], [37.2, 43], [38.0, 44], [38.9, 45], [39.8, 46], [40.6, 47], [41.5, 48], [42.3, 49],
      [43.2, 50], [44.0, 51], [44.9, 52], [45.7, 53], [46.6, 54], [47.5, 55], [48.3, 56], [49.2, 57],
      [50.0, 58], [50.9, 59], [51.7, 60], [52.6, 61], [53.5, 62], [54.0, 63],
    ],
    // Earls Course, Men's Yellow (CR 72.3, Slope 127)
    day2: [
      [-4.3, -5], [-3.4, -4], [-2.5, -3], [-1.7, -2], [-0.8, -1], [0.1, 0],
      [1.0, 1], [1.9, 2], [2.8, 3], [3.7, 4], [4.6, 5], [5.5, 6], [6.4, 7], [7.2, 8], [8.1, 9],
      [9.0, 10], [9.9, 11], [10.8, 12], [11.7, 13], [12.6, 14], [13.5, 15], [14.4, 16], [15.3, 17],
      [16.1, 18], [17.0, 19], [17.9, 20], [18.8, 21], [19.7, 22], [20.6, 23], [21.5, 24], [22.4, 25],
      [23.3, 26], [24.2, 27], [25.0, 28], [25.9, 29], [26.8, 30], [27.7, 31], [28.6, 32], [29.5, 33],
      [30.4, 34], [31.3, 35], [32.2, 36], [33.0, 37], [33.9, 38], [34.8, 39], [35.7, 40], [36.6, 41],
      [37.5, 42], [38.4, 43], [39.3, 44], [40.2, 45], [41.1, 46], [41.9, 47], [42.8, 48], [43.7, 49],
      [44.6, 50], [45.5, 51], [46.4, 52], [47.3, 53], [48.2, 54], [49.1, 55], [50.0, 56], [50.8, 57],
      [51.7, 58], [52.6, 59], [53.5, 60], [54.0, 61],
    ],
  };

  function courseHandicap(day, hi) {
    if (hi == null || isNaN(hi)) return null;
    const t = Math.round(hi * 10);
    const table = CH_TABLES[day];
    for (const [max, ch] of table) if (t <= Math.round(max * 10)) return ch;
    return table[table.length - 1][1];
  }

  // Strokes received on a hole of the given stroke index (negative = plus handicap gives shots back from SI 18).
  function shotsReceived(ch, si) {
    if (ch == null) return 0;
    if (ch >= 0) return Math.floor(ch / 18) + (si <= ch % 18 ? 1 : 0);
    const p = -ch;
    return -(Math.floor(p / 18) + (si > 18 - (p % 18) ? 1 : 0));
  }

  function stablefordPoints(strokes, par, shots) {
    if (strokes == null) return null;
    return Math.max(0, par + shots - strokes + 2);
  }

  function emptyState() {
    const sc = () => Object.fromEntries(PLAYERS.map((p) => [p, Array(18).fill(null)]));
    return {
      handicaps: {},
      scores: { day1: sc(), day2: sc() },
      complete: { day1: [false, false, false], day2: [false, false, false] },
      teams: null,
    };
  }

  const GW = { PLAYERS, COURSES, DAY1_GROUPS, DAY2_SLOTS, CH_TABLES, courseHandicap, shotsReceived, stablefordPoints, emptyState };
  if (typeof module !== 'undefined' && module.exports) module.exports = GW;
  else root.GW = GW;
})(typeof window !== 'undefined' ? window : globalThis);
