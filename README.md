# Minefield 3D

A browser-based 3D Minesweeper made with Three.js.

## Run

Build once:

```bash
npm install
npm run build
```

Then either open the file directly:

```text
index.html
```

or run a local server:

```bash
npm run start
```

Then open `http://localhost:8000`.

## Controls

- `Click Game Area`: lock pointer (FPS mode)
- `W/A/S/D`: move
- `Shift`: sprint
- `Space`: jump
- `Left Click`: reveal cell
- `Right Click`: place/remove flag
- `L`: retry pointer lock
- `F`: toggle reveal/flag mode
- `N`: start a new game
- `C`: toggle chat
- `Touch`: tap cell to reveal / flag mode tap to place flag

## Features

- FPS-style 3D minefield interaction
- Beginner / Intermediate / Expert difficulty
- First-click safety (first cell + neighbors are mine-free)
- Flood reveal for zero-adjacent cells
- Win/loss state, timer, mines-left counter
- Linked portal cells with transition effect
- HUD + local mission chat overlay
