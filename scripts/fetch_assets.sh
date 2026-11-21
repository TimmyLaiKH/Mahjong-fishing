#!/usr/bin/env bash
# Download every image asset used by Mahjong-fishing and generate the
# runtime-sized tile faces. Fails loudly on HTTP errors, empty files or
# files that are not actually images.
set -euo pipefail

cd "$(dirname "$0")/.."

BASE="https://raw.githubusercontent.com/FluffyStuff/riichi-mahjong-tiles/master/Export/Regular"
BG_URL="https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Soleil_%C3%A0_travers_un_paysage_sous-marin_de_Bretagne_%28Ifremer_00378-48922_-_902%29.jpg/1920px-Soleil_%C3%A0_travers_un_paysage_sous-marin_de_Bretagne_%28Ifremer_00378-48922_-_902%29.jpg"

TILE_NAMES=(
  Front Back Blank Ton Nan Shaa Pei Chun Hatsu Haku
  Man1 Man2 Man3 Man4 Man5 Man6 Man7 Man8 Man9
  Pin1 Pin2 Pin3 Pin4 Pin5 Pin6 Pin7 Pin8 Pin9
  Sou1 Sou2 Sou3 Sou4 Sou5 Sou6 Sou7 Sou8 Sou9
)

mkdir -p assets/tiles/raw assets/tiles/faces assets/bg

check_image() {
  local path="$1"
  if [[ ! -s "$path" ]]; then
    echo "ERROR: $path is empty" >&2
    exit 1
  fi
  local mime
  mime="$(file --brief --mime-type "$path")"
  case "$mime" in
    image/*) ;;
    *) echo "ERROR: $path is not an image (got $mime)" >&2; exit 1 ;;
  esac
  echo "  ok: $path ($mime, $(wc -c < "$path") bytes)"
}

echo "Downloading ${#TILE_NAMES[@]} tile PNGs..."
for n in "${TILE_NAMES[@]}"; do
  curl -fL --retry 2 --retry-delay 1 -o "assets/tiles/raw/$n.png" "$BASE/$n.png"
  check_image "assets/tiles/raw/$n.png"
done

echo "Downloading underwater background..."
curl -fL --retry 2 --retry-delay 1 -A "Mozilla/5.0" \
  -o assets/bg/underwater.source.jpg "$BG_URL"
check_image assets/bg/underwater.source.jpg

echo "Compositing tile faces and compressing background..."
python3 scripts/process_assets.py

check_image assets/tiles/faces/Back.png
check_image assets/tiles/faces/m1.png
check_image assets/bg/underwater.jpg

echo "All assets downloaded and processed."
