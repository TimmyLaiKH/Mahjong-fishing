# 素材來源與授權

## 規則來源

- 番數名稱與番數以[香港麻雀協會《香港麻雀總例》](https://www.hkmahjong.org/rules)為唯一依據；中文全文可參考[《香港麻雀總例》Google Doc](https://docs.google.com/document/d/1TgdYpE_5Qiht_lBco3BqN_ijZJDRWugwzRzv946raq0/edit?usp=sharing)。此處不複製全文。
- `花么九` 沿用本遊戲既有名稱，在總例稱「花么」並計 4 番；`七對子`、`人胡`、`綠一色`、`藍一色` 為本遊戲保留的自訂牌型，不屬總例番種。
- 維基百科與麻將百科僅作次要背景參考，不取代總例。

## 牌面圖片

- 來源：[FluffyStuff / riichi-mahjong-tiles](https://github.com/FluffyStuff/riichi-mahjong-tiles)，`Export/Regular` 目錄。
- 授權：**CC0 1.0**（公有領域貢獻）。
- 處理方式：透明牌面疊加在 `Front.png` 上，再縮放為 120×160 的 `assets/tiles/faces/*.png`。原始下載檔保留在 `assets/tiles/raw/`，以便重新產生。
- 8 張花牌（春、夏、秋、冬、梅、蘭、菊、竹）改用 [DrCMWither/mahjong-tiles](https://github.com/DrCMWither/mahjong-tiles) 的 `tiles-tmp/1f.svg`–`8f.svg`，作者 **Lilia Chen May Wither**；artwork 延展自上述 FluffyStuff 牌面，並以 **CC0 1.0** 發布。原始 SVG 與預先柵格化的 PNG 存放於 `assets/tiles/raw/flowers/`，再由 `scripts/process_assets.py` 疊在上述 CC0 `Front.png` 底圖上並縮放為 120×160 的 `H1.png`–`H8.png`。
- 「蘭」牌 `H6.png` 的紅色字樣已由簡體「兰」修正為繁體「蘭」，並改用潦草毛筆風格：以 [Liu Jian Mao Cao](https://fonts.google.com/specimen/Liu+Jian+Mao+Cao)（SIL Open Font License 1.1）的草書「艹」與「兰」組合成繁體字。字形輪廓已轉成路徑內嵌於 `6f.svg`；其餘花牌 artwork 保持原樣。

> Tiles: FluffyStuff / Lilia Chen May Wither, CC0.

## 海底背景

- 來源：[Soleil à travers un paysage sous-marin de Bretagne (Ifremer 00378-48922 - 902)](https://commons.wikimedia.org/wiki/File:Soleil_%C3%A0_travers_un_paysage_sous-marin_de_Bretagne_%28Ifremer_00378-48922_-_902%29.jpg)，經 Wikimedia Commons。
- 攝影：**Olivier Dugornay / Ifremer**。
- 授權：**CC BY 4.0**（https://creativecommons.org/licenses/by/4.0/）。
- 處理方式：使用 1920px 縮圖，壓縮為 `assets/bg/underwater.jpg`（小於 400 KB）並在遊戲中加入暗色遮罩。

> Background: Olivier Dugornay / Ifremer, CC BY 4.0, via Wikimedia Commons.

## 背景音樂

五段 CC0 中國風器樂（保障商業使用、無需署名；仍列出來源以茲感謝）：

| 曲名 | 作者 | 來源 | 授權 |
| --- | --- | --- | --- |
| A ride through chinese valley（二胡、古箏、揚琴） | neolein | [Freesound #573972](https://freesound.org/s/573972/) | CC0 1.0 |
| blossom valley in paradise（揚琴、古箏） | neolein | [Freesound #521367](https://freesound.org/s/521367/) | CC0 1.0 |
| Ghuzheng Fantasie（古箏、氛圍音響） | neolein | [Freesound #541306](https://freesound.org/s/541306/) | CC0 1.0 |
| guzheng solo（古箏獨奏） | neolein | [Freesound #472707](https://freesound.org/s/472707/) | CC0 1.0 |
| Erhu Melodic Loop（二胡，80 BPM） | Ehved | [Freesound #565196](https://freesound.org/s/565196/) | CC0 1.0 |

- 授權條款：[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)。
- 處理方式：下載 Freesound 的 HQ MP3 預覽檔，原檔放置在 `assets/audio/`，由 `js/audio.js` 隨機播放；每首播完後切換到不同曲目。

## 打牌音效

- 來源：[Detective_Lemons – tiles fall on corkboard](https://freesound.org/s/785585/)，Freesound，原本為電影《mahjong cowboy》錄製的麻將牌碰撞聲。
- 授權：**CC0 1.0**（公有領域貢獻）。
- 處理方式：從 HQ MP3 預覽檔截取一次清晰的牌張撞擊，正規化音量並加上極短淡入淡出，輸出為 `assets/audio/mahjong-tile-strike.mp3`；按鈕點擊音仍由 WebAudio 合成。

## 次要規則參考

- 花牌、正花、一檯花、花糊與大花糊的番數及風位對應，參考[維基百科「香港麻雀番牌列表」](https://zh.wikipedia.org/wiki/%E9%A6%99%E6%B8%AF%E9%BA%BB%E9%9B%80%E8%83%A1%E7%89%8C%E5%88%97%E8%A1%A8)。
- 天胡的定義（開局補花後立即自摸、13 番例牌、不另計自摸／門前清）參考[維基百科「香港麻雀胡牌列表」](https://zh.wikipedia.org/zh-hant/%E9%A6%99%E6%B8%AF%E9%BA%BB%E9%9B%80%E8%83%A1%E7%89%8C%E5%88%97%E8%A1%A8)。

## 字型

- [Noto Sans TC](https://fonts.google.com/noto/specimen/Noto+Sans+TC)，透過 Google Fonts 載入，SIL Open Font License 1.1。
- 「蘭」花牌的潦草毛筆字形輪廓取自 [Liu Jian Mao Cao](https://fonts.google.com/specimen/Liu+Jian+Mao+Cao)，SIL Open Font License 1.1；字型檔不包含在專案內，只嵌入產生的向量輪廓。
- 若無法連線，會退回系統字型（PingFang TC / Microsoft JhengHei / system-ui）。

## 遊戲內標示

背景、牌面與音樂的授權文字及連結都顯示於遊戲的「資料來源」面板，可由右下角連結開啟。

完整字串：

```
Background: Olivier Dugornay / Ifremer, CC BY 4.0, via Wikimedia Commons. Tiles: FluffyStuff / Lilia Chen May Wither, CC0. Music: neolein / f-r-a-g-i-l-e / Ehved, CC0, via Freesound. SFX: Detective_Lemons, CC0, via Freesound.
```
