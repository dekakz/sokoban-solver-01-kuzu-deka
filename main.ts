// Sokoban solver: push-optimal, room by room.
//
// A level is a hallway with one to four small rooms off it. Boxes never
// leave their room (a box pushed into the hallway can never reach a goal),
// so each room is solved on its own with a push-optimal search and the
// rooms' solutions are concatenated; the push counts add up to the level's
// optimum. Inside a room the search is A* over pushes: a state is the
// boxes' squares plus the player's reachable region (named by its lowest
// square), the cost is pushes, and the estimate is the cheapest assignment
// of boxes to goals by grid distance. Two deadlocks are pruned: a box on a
// square from which no push can ever reach a goal, and a frozen 2x2 block
// of walls and boxes with a box off its goal. Neither prunes a solvable
// state, so the first solution found is push-optimal.
//
// Everything is budgeted by work (state counts), never by the clock, so
// two runs write the same bytes. No randomness, no clock reads.
//
// Local run: mkdir -p out && MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The most states one room search keeps before it gives up. */
const MAX_STATES = 400_000;
/** The most states the plain breadth-first fallback keeps. */
const BFS_STATES = 250_000;
/** The most states the whole-level fallback keeps. */
const WHOLE_STATES = 400_000;
/** The most expansions the move-based last-resort search makes. */
const MOVE_EXPANSIONS = 200_000;

const DIRS: ReadonlyArray<readonly [number, number, string, string]> = [
  [0, -1, 'u', 'U'],
  [0, 1, 'd', 'D'],
  [-1, 0, 'l', 'L'],
  [1, 0, 'r', 'R'],
];

interface Level {
  w: number;
  h: number;
  wall: Uint8Array;
  goals: number[];
  boxes: number[];
  player: number;
}

interface Room {
  squares: number[];
  boxes: number[];
  goals: number[];
  done: boolean;
}

/** A level in XSB text: # wall, space floor, . goal, $ box, * box on a goal, @ player, + player on a goal. */
function parseLevel(text: string): Level {
  const rows = text.split('\n').filter((r) => r.length > 0);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const wall = new Uint8Array(w * h).fill(1);
  const goals: number[] = [];
  const boxes: number[] = [];
  let player = -1;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x] as string;
      const i = y * w + x;
      if (ch === '#') continue;
      wall[i] = 0;
      if (ch === '.' || ch === '*' || ch === '+') goals.push(i);
      if (ch === '$' || ch === '*') boxes.push(i);
      if (ch === '@' || ch === '+') player = i;
    }
  });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) wall[y * w + x] = 1;
    }
  }
  boxes.sort((a, b) => a - b);
  goals.sort((a, b) => a - b);
  return { w, h, wall, goals, boxes, player };
}

/** The squares from which a box alone can be pushed onto some goal. */
function liveSquares(level: Level): Uint8Array {
  const { w, wall, goals } = level;
  const live = new Uint8Array(wall.length);
  const queue = [...goals];
  for (const g of goals) live[g] = 1;
  for (let qi = 0; qi < queue.length; qi++) {
    const x = queue[qi] as number;
    for (const [dx, dy] of DIRS) {
      const d = dy * w + dx;
      const y = x - d;
      if (!wall[y] && !wall[y - d] && !live[y]) {
        live[y] = 1;
        queue.push(y);
      }
    }
  }
  return live;
}

/**
 * The squares the player reaches from `from` with `occupied` in the way,
 * marked in `seen` with `stamp`; returns the lowest square reached.
 */
function reach(
  level: Level,
  occupied: Uint8Array,
  from: number,
  seen: Int32Array,
  stamp: number,
  stack: Int32Array,
): number {
  const { w, wall } = level;
  let low = from;
  let n = 0;
  stack[n++] = from;
  seen[from] = stamp;
  while (n > 0) {
    const p = stack[--n] as number;
    if (p < low) low = p;
    for (let k = 0; k < 4; k++) {
      const q = k === 0 ? p - w : k === 1 ? p + w : k === 2 ? p - 1 : p + 1;
      if (wall[q] === 0 && occupied[q] === 0 && seen[q] !== stamp) {
        seen[q] = stamp;
        stack[n++] = q;
      }
    }
  }
  return low;
}

/** Whether the box just pushed to `t` sits in a frozen 2x2 block of walls and boxes with a box off its goal. */
function frozenBlock(level: Level, occupied: Uint8Array, goal: Uint8Array, t: number): boolean {
  const { w, wall } = level;
  for (const a of [t, t - 1, t - w, t - w - 1]) {
    const b = a + 1;
    const c = a + w;
    const d = c + 1;
    if (!(wall[a] || occupied[a]) || !(wall[b] || occupied[b]) || !(wall[c] || occupied[c]) || !(wall[d] || occupied[d])) continue;
    if ((occupied[a] && !goal[a]) || (occupied[b] && !goal[b]) || (occupied[c] && !goal[c]) || (occupied[d] && !goal[d])) return true;
  }
  return false;
}

/** The shortest walk from `from` to `to` around walls and boxes, in lower LURD letters, or null when unreachable. */
function walkTo(level: Level, occupied: Uint8Array, from: number, to: number): string | null {
  const { w, wall } = level;
  if (from === to) return '';
  const prev = new Int32Array(wall.length).fill(-1);
  const how = new Array<string>(wall.length);
  const queue = [from];
  prev[from] = from;
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi] as number;
    if (p === to) break;
    for (const [dx, dy, letter] of DIRS) {
      const q = p + dy * w + dx;
      if (wall[q] || occupied[q] || prev[q] !== -1) continue;
      prev[q] = p;
      how[q] = letter;
      queue.push(q);
    }
  }
  if (prev[to] === -1) return null;
  let s = '';
  for (let p = to; p !== from; p = prev[p] as number) s = (how[p] as string) + s;
  return s;
}

/** The square the player stands on after `moves` (LURD, case aside) from `from` on a board `w` wide. */
function endOf(w: number, from: number, moves: string): number {
  let p = from;
  for (const ch of moves.toLowerCase()) p += ch === 'u' ? -w : ch === 'd' ? w : ch === 'l' ? -1 : 1;
  return p;
}

/** A state's key: the region's lowest square and the boxes' squares. */
function keyOf(boxes: number[], low: number): string {
  return String.fromCharCode(low, ...boxes);
}

/**
 * Grid distances from every goal to every square (ignoring boxes): dist[g][cell].
 * A box's pushes to a goal are at least this distance, so the cheapest
 * assignment of boxes to goals is an admissible estimate of pushes left.
 */
function goalDistances(level: Level): Int32Array[] {
  const { w, wall, goals } = level;
  const out: Int32Array[] = [];
  for (const g of goals) {
    const dist = new Int32Array(wall.length).fill(-1);
    const queue = [g];
    dist[g] = 0;
    for (let qi = 0; qi < queue.length; qi++) {
      const p = queue[qi] as number;
      for (const [dx, dy] of DIRS) {
        const q = p + dy * w + dx;
        if (wall[q] || dist[q] !== -1) continue;
        dist[q] = dist[p] + 1;
        queue.push(q);
      }
    }
    out.push(dist);
  }
  return out;
}

/** The cheapest assignment of boxes to goals by grid distance, or Infinity when no box can reach a goal. */
function estimate(boxes: number[], dist: Int32Array[]): number {
  const n = boxes.length;
  if (n === 0) return 0;
  if (n <= 6) {
    // Brute-force the assignment: n! permutations at most.
    const used = new Array<boolean>(n).fill(false);
    let best = Infinity;
    const rec = (i: number, cost: number): void => {
      if (cost >= best) return;
      if (i === n) {
        best = cost;
        return;
      }
      for (let j = 0; j < n; j++) {
        if (used[j]) continue;
        const d = (dist[j] as Int32Array)[boxes[i] as number] as number;
        if (d < 0) continue;
        used[j] = true;
        rec(i + 1, cost + d);
        used[j] = false;
      }
    };
    rec(0, 0);
    return best;
  }
  let sum = 0;
  for (const b of boxes) {
    let m = Infinity;
    for (const d of dist) {
      const v = d[b] as number;
      if (v >= 0 && v < m) m = v;
    }
    if (m === Infinity) return Infinity;
    sum += m;
  }
  return sum;
}

/** A binary heap on [f, seq]: the smallest f first, the earliest inserted first on ties. */
class Heap {
  private a: Array<[number, number, number]> = [];
  get size(): number {
    return this.a.length;
  }
  push(f: number, seq: number, idx: number): void {
    const a = this.a;
    let i = a.length;
    a.push([f, seq, idx]);
    while (i > 0) {
      const p = (i - 1) >> 1;
      const pi = a[p] as [number, number, number];
      const ci = a[i] as [number, number, number];
      if (pi[0] < ci[0] || (pi[0] === ci[0] && pi[1] <= ci[1])) break;
      a[i] = pi;
      a[p] = ci;
      i = p;
    }
  }
  pop(): [number, number, number] {
    const a = this.a;
    const top = a[0] as [number, number, number];
    const last = a.pop() as [number, number, number];
    if (a.length > 0) {
      a[0] = last;
      for (let i = 0; ; ) {
        let c = 2 * i + 1;
        if (c >= a.length) break;
        if (c + 1 < a.length) {
          const l = a[c] as [number, number, number];
          const r = a[c + 1] as [number, number, number];
          if (r[0] < l[0] || (r[0] === l[0] && r[1] < l[1])) c++;
        }
        const ci = a[c] as [number, number, number];
        const ii = a[i] as [number, number, number];
        if (ci[0] > ii[0] || (ci[0] === ii[0] && ci[1] >= ii[1])) break;
        a[i] = ci;
        a[c] = ii;
        i = c;
      }
    }
    return top;
  }
}

interface SearchResult {
  pushes: number;
  moves: string;
}

/**
 * The push-optimal solution of `level`: {pushes, moves} (moves in LURD, a
 * lower letter a step, an upper one a push), or null when the search gives
 * up (or the level has no solution). A* over pushes with the assignment
 * estimate; `weight` 1 is optimal, above 1 trades optimality for speed.
 */
function solvePushAStar(level: Level, maxStates: number, weight: number): SearchResult | null {
  const { w, wall, goals } = level;
  const size = wall.length;
  const goal = new Uint8Array(size);
  for (const g of goals) goal[g] = 1;
  const live = liveSquares(level);
  const dist = goalDistances(level);
  const occupied = new Uint8Array(size);
  const seen = new Int32Array(size);
  const mark = new Int32Array(size);
  const stack = new Int32Array(size);
  let stamp = 0;
  const solved = (boxes: number[]): boolean => boxes.every((b) => goal[b]);
  if (level.boxes.some((b) => !live[b])) return null;

  const sBoxes: number[][] = [level.boxes];
  const sPlayer: number[] = [level.player];
  const sG: number[] = [0];
  const parent: number[] = [-1];
  const pushFrom: number[] = [-1];
  const pushTo: number[] = [-1];
  const best = new Map<string, number>();
  for (const b of level.boxes) occupied[b] = 1;
  const low0 = reach(level, occupied, level.player, seen, ++stamp, stack);
  for (const b of level.boxes) occupied[b] = 0;
  best.set(keyOf(level.boxes, low0), 0);
  const h0 = estimate(level.boxes, dist);
  if (h0 === Infinity) return null;
  const heap = new Heap();
  let seq = 0;
  heap.push(h0, seq++, 0);
  let found = solved(level.boxes) ? 0 : -1;

  while (heap.size > 0 && found < 0) {
    const [, , s] = heap.pop();
    const g = sG[s] as number;
    const boxes = sBoxes[s] as number[];
    const low = reach(level, (() => {
      for (const b of boxes) occupied[b] = 1;
      return occupied;
    })(), sPlayer[s] as number, seen, ++stamp, stack);
    // The key this state was filed under; skip it when a better route to the same state exists.
    if ((best.get(keyOf(boxes, low)) as number) < g) {
      for (const x of boxes) occupied[x] = 0;
      continue;
    }
    const here = stamp;
    for (let bi = 0; bi < boxes.length && found < 0; bi++) {
      const b = boxes[bi] as number;
      for (const [dx, dy, , letter] of DIRS) {
        const d = dy * w + dx;
        const t = b + d;
        if (seen[b - d] !== here || wall[t] || occupied[t] || !live[t]) continue;
        occupied[b] = 0;
        occupied[t] = 1;
        const frozen = frozenBlock(level, occupied, goal, t);
        let key = '';
        let h = Infinity;
        let next: number[] = [];
        let nlow = -1;
        if (!frozen) {
          next = boxes.slice();
          next[bi] = t;
          next.sort((x, y) => x - y);
          nlow = reach(level, occupied, b, mark, ++stamp, stack);
          key = keyOf(next, nlow);
          h = estimate(next, dist);
        }
        occupied[t] = 0;
        occupied[b] = 1;
        if (frozen || h === Infinity) continue;
        const ng = g + 1;
        const prev = best.get(key);
        if (prev !== undefined && prev <= ng) continue;
        if (sBoxes.length >= maxStates) {
          for (const x of boxes) occupied[x] = 0;
          return null;
        }
        best.set(key, ng);
        const idx = sBoxes.length;
        sBoxes.push(next);
        sPlayer.push(b);
        sG.push(ng);
        parent.push(s);
        pushFrom.push(b);
        pushTo.push(t);
        if (solved(next)) {
          found = idx;
          break;
        }
        heap.push(ng + weight * h, seq++, idx);
        void letter;
      }
    }
    for (const x of boxes) occupied[x] = 0;
  }
  if (found < 0) return null;
  const path: number[] = [];
  for (let s = found; s > 0; s = parent[s] as number) path.push(s);
  path.reverse();
  let moves = '';
  let player = level.player;
  let boxes = level.boxes;
  for (const s of path) {
    const from = pushFrom[s] as number;
    const to = pushTo[s] as number;
    const d = to - from;
    for (const b of boxes) occupied[b] = 1;
    const walk = walkTo(level, occupied, player, from - d);
    for (const b of boxes) occupied[b] = 0;
    if (walk === null) return null;
    moves += walk;
    moves += d === -w ? 'U' : d === w ? 'D' : d === -1 ? 'L' : 'R';
    player = from;
    boxes = sBoxes[s] as number[];
  }
  return { pushes: path.length, moves };
}

/**
 * The plain breadth-first search over pushes (the generator's own shape):
 * states in order of pushes made, so the first solved state met is
 * push-optimal. Used when A* gives up.
 */
function solvePushBfs(level: Level, maxStates: number): SearchResult | null {
  const { w, wall, goals } = level;
  const size = wall.length;
  const goal = new Uint8Array(size);
  for (const g of goals) goal[g] = 1;
  const live = liveSquares(level);
  const occupied = new Uint8Array(size);
  const seen = new Int32Array(size);
  const mark = new Int32Array(size);
  const stack = new Int32Array(size);
  let stamp = 0;
  const solved = (boxes: number[]): boolean => boxes.every((b) => goal[b]);
  if (level.boxes.some((b) => !live[b])) return null;
  const sBoxes: number[][] = [level.boxes];
  const sPlayer: number[] = [level.player];
  const parent: number[] = [-1];
  const pushFrom: number[] = [-1];
  const pushTo: number[] = [-1];
  const index = new Map<string, number>();
  for (const b of level.boxes) occupied[b] = 1;
  index.set(keyOf(level.boxes, reach(level, occupied, level.player, seen, ++stamp, stack)), 0);
  for (const b of level.boxes) occupied[b] = 0;
  let found = solved(level.boxes) ? 0 : -1;
  for (let head = 0; found < 0 && head < sBoxes.length; head++) {
    const boxes = sBoxes[head] as number[];
    for (const b of boxes) occupied[b] = 1;
    reach(level, occupied, sPlayer[head] as number, seen, ++stamp, stack);
    const here = stamp;
    for (let bi = 0; bi < boxes.length && found < 0; bi++) {
      const b = boxes[bi] as number;
      for (const [dx, dy] of DIRS) {
        const d = dy * w + dx;
        const t = b + d;
        if (seen[b - d] !== here || wall[t] || occupied[t] || !live[t]) continue;
        occupied[b] = 0;
        occupied[t] = 1;
        const frozen = frozenBlock(level, occupied, goal, t);
        let key = '';
        let next: number[] = [];
        if (!frozen) {
          next = boxes.slice();
          next[bi] = t;
          next.sort((x, y) => x - y);
          key = keyOf(next, reach(level, occupied, b, mark, ++stamp, stack));
        }
        occupied[t] = 0;
        occupied[b] = 1;
        if (frozen || index.has(key)) continue;
        if (sBoxes.length >= maxStates) {
          for (const x of boxes) occupied[x] = 0;
          return null;
        }
        index.set(key, sBoxes.length);
        sBoxes.push(next);
        sPlayer.push(b);
        parent.push(head);
        pushFrom.push(b);
        pushTo.push(t);
        if (solved(next)) {
          found = sBoxes.length - 1;
          break;
        }
      }
    }
    for (const x of boxes) occupied[x] = 0;
  }
  if (found < 0) return null;
  const path: number[] = [];
  for (let s = found; s > 0; s = parent[s] as number) path.push(s);
  path.reverse();
  let moves = '';
  let player = level.player;
  let boxes = level.boxes;
  for (const s of path) {
    const from = pushFrom[s] as number;
    const to = pushTo[s] as number;
    const d = to - from;
    for (const b of boxes) occupied[b] = 1;
    const walk = walkTo(level, occupied, player, from - d);
    for (const b of boxes) occupied[b] = 0;
    if (walk === null) return null;
    moves += walk;
    moves += d === -w ? 'U' : d === w ? 'D' : d === -1 ? 'L' : 'R';
    player = from;
    boxes = sBoxes[s] as number[];
  }
  return { pushes: path.length, moves };
}

/** A push search that tries optimal A*, then breadth-first, then a greedy weighted A* that at least solves. */
function solvePush(level: Level): SearchResult | null {
  return (
    solvePushAStar(level, MAX_STATES, 1) ??
    solvePushBfs(level, BFS_STATES) ??
    solvePushAStar(level, MAX_STATES, 3)
  );
}

/**
 * The level's rooms: cut the dead squares of the player's row (the hallway:
 * a box there reaches no goal) out of the floor, and each part left that
 * holds a box is a room. Null when some part holds more or fewer boxes than
 * goals, or a box starts in the hallway: then the level is no set of rooms.
 */
function roomsOf(level: Level): Room[] | null {
  const { w, wall, goals, boxes, player } = level;
  const live = liveSquares(level);
  const row = Math.floor(player / w);
  const cut = new Uint8Array(wall.length);
  for (let i = row * w; i < (row + 1) * w; i++) if (!wall[i] && !live[i]) cut[i] = 1;
  if (boxes.some((b) => cut[b])) return null;
  const part = new Int32Array(wall.length).fill(-1);
  const rooms: Room[] = [];
  for (let s = 0; s < wall.length; s++) {
    if (wall[s] || cut[s] || part[s] >= 0) continue;
    const squares = [s];
    part[s] = rooms.length;
    for (let i = 0; i < squares.length; i++) {
      for (const [dx, dy] of DIRS) {
        const q = (squares[i] as number) + dy * w + dx;
        if (!wall[q] && !cut[q] && part[q] < 0) {
          part[q] = rooms.length;
          squares.push(q);
        }
      }
    }
    rooms.push({ squares, boxes: [], goals: [], done: false });
  }
  for (const b of boxes) (rooms[part[b] as number] as Room).boxes.push(b);
  for (const g of goals) if (part[g] >= 0) (rooms[part[g] as number] as Room).goals.push(g);
  if (goals.some((g) => part[g] < 0) || rooms.some((r) => r.boxes.length !== r.goals.length)) return null;
  return rooms.filter((r) => r.boxes.length > 0);
}

/** The level solved room by room in `order`: {pushes, moves}, or null when a room gives up. */
function solveByRooms(level: Level, rooms: Room[], order: number[]): SearchResult | null {
  let player = level.player;
  let pushes = 0;
  let moves = '';
  for (const oi of order) {
    const room = rooms[oi] as Room;
    const wall = level.wall.slice();
    for (const other of rooms) {
      if (other === room) continue;
      for (const b of other.done ? other.goals : other.boxes) wall[b] = 1;
    }
    const sub: Level = {
      w: level.w,
      h: level.h,
      wall,
      goals: room.goals.slice().sort((a, b) => a - b),
      boxes: room.boxes.slice().sort((a, b) => a - b),
      player,
    };
    const solved = solvePush(sub);
    if (solved === null) return null;
    pushes += solved.pushes;
    moves += solved.moves;
    player = endOf(level.w, player, solved.moves);
    room.done = true;
  }
  return { pushes, moves };
}

/** Every ordering of n rooms, the natural order first. */
function ordersOf(n: number): number[][] {
  const base = Array.from({ length: n }, (_, i) => i);
  if (n <= 1) return [base];
  const out: number[][] = [base.slice()];
  const rec = (prefix: number[], rest: number[]): void => {
    if (rest.length === 0) {
      if (prefix.join() !== base.join()) out.push(prefix.slice());
      return;
    }
    for (let i = 0; i < rest.length; i++) {
      const next = rest.slice();
      const [v] = next.splice(i, 1);
      rec([...prefix, v as number], next);
    }
  };
  rec([], base);
  return out;
}

/**
 * A plain A* over moves (a step costs 1, the estimate is each box's grid
 * distance to its nearest goal, summed): the last resort, which minimises
 * moves rather than pushes and so rarely scores full points, but solves
 * levels the push searches give up on.
 */
function solveMoves(level: Level): SearchResult | null {
  const { w, wall, goals } = level;
  const size = wall.length;
  const goal = new Uint8Array(size);
  for (const g of goals) goal[g] = 1;
  const dist = (b: number): number =>
    Math.min(...goals.map((g) => Math.abs((g % w) - (b % w)) + Math.abs(Math.floor(g / w) - Math.floor(b / w))));
  const est = (bs: number[]): number => bs.reduce((a, b) => a + dist(b), 0);
  const key = (p: number, bs: number[]): string => String.fromCharCode(p, ...bs);
  const sp: number[] = [level.player];
  const sb: number[][] = [level.boxes];
  const sg: number[] = [0];
  const parent: number[] = [-1];
  const step: string[] = [''];
  const best = new Map<string, number>([[key(level.player, level.boxes), 0]]);
  const heap = new Heap();
  let seq = 0;
  heap.push(est(level.boxes), seq++, 0);
  let expanded = 0;
  let found = level.boxes.every((b) => goal[b]) ? 0 : -1;
  while (heap.size > 0 && found < 0 && expanded < MOVE_EXPANSIONS) {
    const [, , s] = heap.pop();
    const g = sg[s] as number;
    const bs = sb[s] as number[];
    if ((best.get(key(sp[s] as number, bs)) as number) < g) continue;
    if (bs.every((b) => goal[b])) {
      found = s;
      break;
    }
    expanded++;
    const p = sp[s] as number;
    for (const [dx, dy, letter] of DIRS) {
      const d = dy * w + dx;
      const q = p + d;
      if (wall[q]) continue;
      let nb = bs;
      let move = letter;
      const at = bs.indexOf(q);
      if (at >= 0) {
        if (wall[q + d] || bs.includes(q + d)) continue;
        nb = bs.slice();
        nb[at] = q + d;
        nb.sort((a, b) => a - b);
        move = letter.toUpperCase();
      }
      const k = key(q, nb);
      const seenG = best.get(k);
      if (seenG !== undefined && seenG <= g + 1) continue;
      const t = sp.length;
      sp.push(q);
      sb.push(nb);
      sg.push(g + 1);
      parent.push(s);
      step.push(move);
      best.set(k, t);
      heap.push(g + 1 + est(nb), seq++, t);
    }
  }
  if (found < 0) return null;
  let moves = '';
  let pushes = 0;
  for (let t = found; t > 0; t = parent[t] as number) {
    const s = step[t] as string;
    moves = s + moves;
    if (s === s.toUpperCase()) pushes++;
  }
  return { pushes, moves };
}

/** Solve one level: rooms first (every order), then the whole level, then moves. */
function solveLevel(level: Level): string {
  const rooms = roomsOf(level);
  if (rooms !== null) {
    for (const order of ordersOf(rooms.length)) {
      for (const r of rooms) r.done = false;
      const solved = solveByRooms(level, rooms, order);
      if (solved !== null) return solved.moves;
    }
  }
  const whole = solvePush(level) ?? solveMoves(level);
  return whole === null ? '' : whole.moves;
}

for (const id of readdirSync(I).sort()) {
  let moves = '';
  try {
    moves = solveLevel(parseLevel(readFileSync(join(I, id, 'level.txt'), 'utf8')));
  } catch {
    moves = '';
  }
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'solution.txt'), `${moves}\n`);
}
