# Sokoban solver

[![make.fun](https://img.shields.io/badge/make.fun-bounty-blue)](https://make.fun)
[![Node](https://img.shields.io/badge/node-%3E%3D22-green)](https://nodejs.org)

Push-optimal Sokoban solver for the [make.fun](https://make.fun) bounty
**"Build the best Sokoban solver, 21 November 2026"**
(`sokoban-solver-01-run-20261121`).

## How it works

A generated level is a hallway with one to four small rooms off it, and a
box pushed out of a room into the hallway can never be pushed back — so the
rooms are independent problems and the level's push-optimum is the sum of
the rooms' optima. The solver:

1. cuts the dead squares of the player's (hallway) row out of the floor and
   takes each remaining component that holds boxes as a room;
2. solves each room with A\* over pushes — a state is the boxes' squares
   plus the player's reachable region (named by its lowest square), the
   cost is pushes, the estimate is the cheapest assignment of boxes to
   goals by grid distance — pruning dead squares and frozen 2×2 blocks;
3. concatenates the rooms' solutions, the player walking on from where
   the last room left it (every room order is tried, natural order first).

Fallbacks, in order: breadth-first push search, weighted A\* (still solves,
maybe not optimally), a plain A\* over moves. Everything is budgeted by
work (state counts), never by the clock, so two runs write the same bytes.

## Run

```sh
node main.ts            # reads /input/<id>/level.txt, writes /output/<id>/solution.txt
```

## Results (practice set, kit scorer)

| instance | boxes | pushes (P\*) | points |
|----------|-------|-------------|--------|
| i001 | 3 | 13 | 1000 |
| i002 | 4 | 16 | 1000 |
| i003 | 8 | 29 | 1000 |
| i004 | 12 | 47 | 1000 |
| i005 | 16 | 60 | 1000 |

**Score 1,000,000 / 1,000,000** in ~0.5 s for the whole set (limit 60 s).
The house baseline (plain-astar 1.0.0) scores 200,000 on the same set.
The solver also scores 1,000,000 on 8 freshly drawn sets from the kit's
generator (unseen rounds), each in under 0.6 s.

## License

MIT — see [LICENSE](LICENSE).
