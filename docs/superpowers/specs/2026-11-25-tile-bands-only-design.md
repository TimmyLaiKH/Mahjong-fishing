# Tile faces: bands only design

**Status:** Approved by the human partner from the side-by-side preview on 2026-11-25.

## Intent

The 1.4.97 tile faces had two baked extras: the approved green/grey edge layers, and a soft
black drop shadow plus a face recolour toward `#DFDFDC`. The human partner reported that
several faces (蘭/H6, 菊/H7, 六筒/p6, 南/S, 一索/s1) looked dimmer than the original artwork and
said: `we just need to add the two smooth edge layers on top`.

The approved preview was column **C · 連調色都移除（原牌面亮度）**: rebuild each tile from the
raw CC0 face with only the rounded green band, rounded grey band, and rounded outer clip. No
baked shadow and no face recolour.

## Goals

- Keep the two smooth green/grey edge layers and rounded corners from 1.4.97.
- Restore the original face brightness by removing the face recolour loop.
- Remove the baked drop shadow entirely; the existing CSS `drop-shadow` and canvas `shadow`
  remain as separation from the sea and other tiles.
- Keep every runtime PNG generated reproducibly from `assets/tiles/raw/` by
  `scripts/process_assets.py` calling `scripts/restyle_tiles.py`.

## Non-goals

- No change to tile IDs, names, image paths, help tabs, fan table, scoring, settlement, audio,
  storage keys, networking, or gameplay constants.
- No new artwork and no use of the mahjongwiki images; that page remains only the original
  visual reference.
- No push, deploy, or live-site contact as part of this change.

## Constraints

- All player-facing text stays Traditional Chinese.
- `assets/tiles/raw/` stays untouched.
- There are 43 runtime PNGs (34 regular, 8 flowers, 1 back).
- The back tile keeps its ivory top band (`(223,223,220)`), darker green side band
  `(26,125,26)`, and original green body.
- Bake no shadow inside the PNG. Keep `FAN_CAP = Infinity` and add no localStorage key.
- Bump `TILE_ASSET_VERSION` from 7 to 8 and the app/cachebust from 1.4.97 to 1.4.98 so players
  do not keep the darker cached faces.
- Required suites: static `8 通過，0 失敗`, rules `64 通過，0 失敗`, payout `12 通過，0 失敗`,
  net `2 通過，0 失敗`; syntax checks and `git diff --check` clean.

## Approaches

1. **Keep current PNGs** — rejected: the reported dimming remains.
2. **Remove only the baked shadow** (preview column B) — rejected: the face recolour still
   shifts near-white faces.
3. **Remove shadow and face recolour** (preview column C) — approved: preserves the two edge
   layers and rounded corners while returning each face to its original brightness.

## Decisions

- Delete `add_shadow()` and its constants; `restyle()` and `restyle_back()` return the clipped
  banded tile directly.
- Delete the face recolour loop and `FACE_TARGET` / `RECOLOUR_TOLERANCE`. Set `BACK_TOP` to the
  explicit ivory tuple `(223,223,220)` so the back tile keeps its approved top layer.
- With the shadow padding gone, runtime faces become **120×181 RGBA** (120×160 source plus a
  9 px green band and a 12 px grey band). Update static tests, docs, and the cachebusts to match.
- `drawTile()` already fits each PNG by its natural aspect; only the test stub dimensions need
  updating, not the drawing code.
- Record the release locally as 1.4.98 in `CHANGELOG.md`, `README.md`, `AGENTS.md`, and
  `CREDITS.md`; do not push or deploy without explicit permission.
