# Chicago Pedway 3D map: development

The live viewer is `../3d/index.html` (one self-contained page, ground image included; three.js r128 loads
from a CDN). `../3dMap.html` is the site page that embeds it. **Do not edit `3d/index.html` by hand: it is built.**

## One-time setup

1. Install [Python 3](https://www.python.org/downloads/) and [Node.js](https://nodejs.org/).
2. In a terminal, in this folder: `pip install -r requirements.txt`
3. In VS Code, install the **Live Server** extension (to preview pages locally).
4. Only to change the ground image: install [Inkscape](https://inkscape.org/) 1.x.

## Edit, build, preview

1. Edit **`bake/pre_bake.html`**. This is the source: all corridors, stairs, elevators, labels and UI.
2. Build (from this `3dmap-dev` folder, takes 2 to 3 minutes):

       python bake/build.py

   It prints a few statistics and ends with `wrote ../3d/index.html`.
3. Right-click `3dMap.html` (or `3d/index.html`) in VS Code and choose **Open with Live Server**.
4. Commit and push. GitHub Pages publishes the site.

If the build stops with an `AssertionError`, a piece of code the build patches was changed in
`pre_bake.html`; the message shows the text it was looking for.

### Ground image

The map on the ground plane is **`../Images/Background.svg`** (the visible layers of the page, as Inkscape
exports it). Whenever the SVG is newer, the build re-renders it to `bake/ground.webp` (4096 px wide,
lossless) and embeds that in `../3d/index.html`, so the ground also shows when the page is opened straight
from a file. Commit `bake/ground.webp`; then building only needs Inkscape after the SVG changes. To re-render
without a full build, run `python bake/background.py` (add `--force` to render even if unchanged), then
build to embed it. The whole SVG page is stretched over the ground, so keep its page size and the drawing's
position on the page as they are or it will no longer line up with the corridors. Street names are drawn on
top by the viewer (the **Street names** toggle).

## What the files are

| File | Purpose |
|---|---|
| `bake/pre_bake.html` | The source page. |
| `bake/build.py` | Runs everything below and writes `../3d/index.html`. |
| `bake/run.js` | Runs the source without a browser to record every corridor footprint, link and elevator. |
| `bake/bake.py` | Unions the footprints per level, so overlapping corridors share one floor and have no inner walls. |
| `bake/landings.py` | Adds a 4-wide landing at stair, escalator and ramp ends; holds the hand-placed Ogilvie connector. |
| `bake/square.py` | Squares off chamfered corners. |
| `bake/simplify.py` | Snaps near-horizontal, near-vertical and near-45° edges, merges small jogs. |
| `bake/background.py` | Renders `../Images/Background.svg` to `bake/ground.webp` with Inkscape (embedded by the build). |
| `bake/helpers.js` | Wall code (openings where stairs and ramps meet a corridor) injected into the page. |
| `bake/gen_mart.py`, `bake/mart_block.js` | The Merchandise Mart block, generated from the PDF's vector shapes. The block is already pasted into `pre_bake.html`. |
| `pdf/make_paths.py`, `pdf/svgx.py` | Optional: extract the PDF's vector shapes for tracing new areas. Needs poppler's `pdftocairo`. |

## Conventions in the source

- Coordinates are **map units**: the PDF page is 1204 x 1007 units (1 unit = 1.5575 PDF points).
- Levels: `2` sky, `1` elevated, `0` surface, `-0.25` sunken mezzanine (shown with surface), `-1`, `-2`, `-3`.
- `MIN_CORRIDOR_W = 4.0`: corridors narrower than this are widened.
- Corridors: `polyRoom(level, [[ring, hole...], ...])`, `line(level, width, [[x,y],...])`.
- Links: `new Stairs(x0,y0,levelA, x1,y1,levelB, width)`, same for `Escalator` and `Ramp`.
- Elevators: `new Elevator(x, y, low, high, w, d)` or `new Elevator(x, y, [stops...])`.
  `ELSTOPS` (just above `class Elevator`) overrides stops read from the PDF's elevator buttons.
- Doors: `mk('X', x, y, 0)` green, `mk('A', x, y, 0)` blue ADA.

## Working with Claude in VS Code

Install the Claude Code extension, open this repository, and ask for changes the same way as in the
web app. Point it at this README first so it uses `bake/pre_bake.html` and `python bake/build.py`.
