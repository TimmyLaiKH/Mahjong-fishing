# Tile Faces: Bands Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the 43 runtime tile faces with only the approved smooth green/grey edge layers and rounded corners, removing the baked shadow and face recolour that dimmed several faces.

**Architecture:** `scripts/restyle_tiles.py` remains the single image transform called by `scripts/process_assets.py`; it takes each raw CC0 face, adds the two bands, clips the rounded corner, and now returns that body directly. Static tests update to the new 120×181 RGBA output and version bump; browser verification confirms the faces look like approved preview column C.

**Tech Stack:** Python 3.13 + Pillow 11.3 at `/home/timmy/miniconda3/bin/python3`, Node static test harness, static HTML/CSS/JS, ImageMagick only for the earlier throwaway preview (not needed here).

**Spec:** `docs/superpowers/specs/2026-11-25-tile-bands-only-design.md`

## Global Constraints

- All player-facing text stays Traditional Chinese; no bottom `釣魚` button.
- Keep the two smooth green/grey edge layers and rounded corners from 1.4.97.
- Remove all baked shadow from PNGs; keep CSS `drop-shadow` and canvas `shadow`.
- Remove face recolour; restore original raw face brightness.
- Raw sources under `assets/tiles/raw/` stay untouched; 43 runtime PNGs regenerate from them.
- Runtime PNG output is 120×181 RGBA (120×160 base + 9 px green band + 12 px grey band).
- Back tile keeps ivory top `(223,223,220)`, dark green side `(26,125,26)`, original green body.
- Bump `TILE_ASSET_VERSION` 7 → 8 and app/cachebust 1.4.97 → 1.4.98.
- `rules.js` import cachebust stays `1.4.97`; `audio.js` and `net.js` versions stay unchanged.
- Do not change scoring, settlement, storage keys, networking, audio, or gameplay constants.
- `FAN_CAP` stays `Infinity`; no new localStorage key.
- Keep `drawTile()` aspect fitting; only update test stub image dimensions.
- Required suites: static `8 通過，0 失敗`, rules `64 通過，0 失敗`, payout `12 通過，0 失敗`, net `2 通過，0 失敗`; syntax checks and `git diff --check` clean.
- No push, deploy, or live-site contact without explicit permission.

## Review Focus

- Dimmed faces: Task 1 removes and statically asserts the absence of `FACE_TARGET` / `RECOLOUR_TOLERANCE`; browser check confirms original brightness.
- Shadow bleeding into face edges: Task 1 removes and statically asserts the absence of `add_shadow`; browser check confirms no dark halo.
- Non-uniform stretch from new dimensions: Task 1's static test stubs a 120×181 image and asserts `drawTile()` fits it into 132×176 with aspect `120/181`, height 176, centered.
- Stale cached darker faces: Task 2's static test pins `TILE_ASSET_VERSION = 8`, `index.html` CSS/game `1.4.98`, tiles import `1.4.98`, and `CHANGELOG.md` `## 1.4.98`.
- Documentation drift: Task 2 updates `README.md`, `AGENTS.md`, `CREDITS.md`, and `scripts/process_assets.py` descriptions from shadow/144×205/1.4.97 to bands-only/120×181/1.4.98.

---

### Task 1: Regenerate bands-only tile faces

**Files:**
- Modify: `scripts/restyle_tiles.py`
- Modify: `scripts/process_assets.py:2-9,80`
- Modify: `tests/hkma-ui.test.mjs:75-103,105-116`
- Regenerate: `assets/tiles/faces/*.png` (43 files)

**Interfaces:**
- Consumes: raw tile images in `assets/tiles/raw/` with 120×160 RGBA PNG output from `process_assets.py`.
- Produces: `restyle(im) -> PIL.Image` and `restyle_back(im) -> PIL.Image`, both RGBA 120×181 with bands only; no shadow, no recolour.

- [ ] **Step 1: Write the failing static tests**

In `tests/hkma-ui.test.mjs`:
- Rename the asset test to check `decodePngHeader()` returns width `120` and height `181`.
- Change the `drawTile()` image stub to `{ complete: true, naturalWidth: 120, naturalHeight: 181 }`.
- Assert `drawWidth / drawHeight === 120 / 181`, `drawHeight === 176`, `drawWidth === 120 * 176 / 181`, and the image is centered at `-drawWidth / 2`, `-drawHeight / 2`.
- In the existing version/static test, assert `scripts/restyle_tiles.py` does not contain `add_shadow`, `RECOLOUR_TOLERANCE`, or `FACE_TARGET`, and that `scripts/process_assets.py` mentions `120×181`.

- [ ] **Step 2: Run tests to verify RED**

Run: `/home/timmy/.local/node/bin/node tests/hkma-ui.test.mjs`
Expected: FAIL because live headers are 144×205 and the script still contains shadow/recolour symbols.

- [ ] **Step 3: Remove shadow and recolour from `scripts/restyle_tiles.py`**

- Remove `ImageFilter` from the Pillow imports.
- Delete `FACE_TARGET` and `RECOLOUR_TOLERANCE`; set `BACK_TOP = (223, 223, 220)` explicitly.
- Delete `SHADOW_OFFSET`, `SHADOW_BLUR`, `SHADOW_OPACITY`, and the whole `add_shadow()` function.
- In `restyle()`, delete the face recolour loop that walks pixels and calls `recolour()`; after `clip_rounded(out, rad)` return `out` directly.
- In `restyle_back()`, return `out` directly after `clip_rounded(out, rad)`.
- Update the module docstring to state bands-only output at 120×181 with no baked shadow.

- [ ] **Step 4: Update regeneration docs in `scripts/process_assets.py`**

Change lines 2-9 and the comment at line 80 from shadow/144×205 wording to “two smooth edge layers, no baked shadow, 120×181 output”. Do not change the call sites at lines 82-84.

- [ ] **Step 5: Regenerate all runtime faces**

Run: `/home/timmy/miniconda3/bin/python3 scripts/process_assets.py`
Expected: all 43 PNGs under `assets/tiles/faces/` regenerate at 120×181 RGBA; raw sources unchanged.

- [ ] **Step 6: Run tests to verify GREEN**

Run:
```sh
/home/timmy/.local/node/bin/node tests/hkma-ui.test.mjs
/home/timmy/.local/node/bin/node tests/rules.test.mjs
/home/timmy/.local/node/bin/node tests/payout.test.mjs
/home/timmy/.local/node/bin/node tests/net.test.mjs
```
Expected: `8 通過，0 失敗`, `64 通過，0 失敗`, `12 通過，0 失敗`, `2 通過，0 失敗`.

- [ ] **Step 7: Commit**

```bash
git add scripts/restyle_tiles.py scripts/process_assets.py tests/hkma-ui.test.mjs assets/tiles/faces
git commit -m "移除牌圖陰影與面色重調，只保留平滑邊層"
```

### Task 2: Release 1.4.98 and verify in the game

**Files:**
- Modify: `js/tiles.js:102`
- Modify: `js/game.js:9`
- Modify: `index.html:12,345`
- Modify: `README.md:3,36,50,71`
- Modify: `CHANGELOG.md:5`
- Modify: `AGENTS.md:52,81,465-468,511`
- Modify: `CREDITS.md:13-14`
- Test: `tests/hkma-ui.test.mjs:105-116`

**Interfaces:**
- Consumes: 120×181 RGBA faces and `TILE_ASSET_VERSION = 7` from Task 1's starting tree.
- Produces: `TILE_ASSET_VERSION = 8`, app/cachebust `1.4.98`, and documentation describing bands-only faces.

- [ ] **Step 1: Write the failing version tests**

In `tests/hkma-ui.test.mjs`, change the version test assertions to require `TILE_ASSET_VERSION = 8`, `js/game.js` tiles import `./tiles.js?v=1.4.98`, `index.html` CSS and game `?v=1.4.98`, and `CHANGELOG.md` `## 1.4.98`; keep the rules import assertion at `1.4.97`.

- [ ] **Step 2: Run tests to verify RED**

Run: `/home/timmy/.local/node/bin/node tests/hkma-ui.test.mjs`
Expected: FAIL on version/cachebust assertions.

- [ ] **Step 3: Bump versions and docs**

- `js/tiles.js:102`: `TILE_ASSET_VERSION = 8`.
- `js/game.js:9`: `./tiles.js?v=1.4.98`; leave line 17 rules at `1.4.97`.
- `index.html:12,345`: CSS and game `?v=1.4.98`.
- `README.md`: top play-link version and tile description to 1.4.98 / 120×181 / bands only.
- `CHANGELOG.md`: new top `## 1.4.98` entry describing the C preview, no shadow/recolour, and no push/deploy claim.
- `AGENTS.md`: update cachebust, repository-map test description, asset section, and any 144×205/shadow wording to 120×181 / bands only.
- `CREDITS.md`: update tile-face description to 120×181 RGBA with bands baked by `scripts/restyle_tiles.py`.

- [ ] **Step 4: Run tests to verify GREEN**

Run the same four suites as Task 1 plus:
```sh
node --check js/rules.js
node --check js/payout.js
node --check js/game.js
node --check js/net.js
git diff --check
```
Expected: all suites green and no syntax/diff errors.

- [ ] **Step 5: Browser check in the game**

Start a local server from the worktree, open `index.html?test=1&v=1.4.98-browser`, and confirm: no console errors or 404s, the five previously dim faces (H6, H7, p6, S, s1) match preview column C, and tile sizing is unchanged relative to the hand. Do not push or contact the live site.

- [ ] **Step 6: Commit**

```bash
git add js/tiles.js js/game.js index.html README.md CHANGELOG.md AGENTS.md CREDITS.md tests/hkma-ui.test.mjs
git commit -m "發布 1.4.98：牌圖只保留平滑邊層"
```
