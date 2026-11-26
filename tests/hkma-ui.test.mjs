/* Static checks for tracked text files. Run: node tests/hkma-ui.test.mjs */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { sortPatternRows } from '../js/rules.js';
import { drawTile } from '../js/tiles.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}\n    ${error.message.split('\n').join('\n    ')}`);
  }
}

const oldChar = String.fromCharCode(0x5E7A);

test('所有 tracked 檔案都不再有舊字', () => {
  const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
  const offenders = files.filter((name) => {
    try { return readFileSync(name, 'utf8').includes(oldChar); }
    catch { return false; }
  });
  assert.deepEqual(offenders, []);
});

const html = readFileSync('index.html', 'utf8');

test('玩法說明有三個分頁按鈕與三個面板', () => {
  for (const name of ['rules', 'patterns', 'payout']) {
    assert.match(html, new RegExp(`data-help-tab="${name}"`));
    assert.match(html, new RegExp(`id="helpTab${name[0].toUpperCase()}${name.slice(1)}"`));
  }
  assert.doesNotMatch(html, /id="helpFanTableBtn"/);
  assert.doesNotMatch(html, /前往番數表/);

  // Rooms ask before leaving on ESC. Informational panels are ✕-only on touch
  // devices, but PC ESC closes them; ESC during play opens 設定.
  assert.match(html, /id="exitConfirm"/);
  assert.match(html, /id="exitConfirmBack"[^>]*>返回主選單<\/button>/);
  const game = readFileSync('js/game.js', 'utf8');
  assert.match(game, /CLOSE_ONLY_WITH_X/);
  for (const id of ['helpPanel', 'settingsPanel', 'scorePanel', 'creditsPanel']) {
    assert.match(game, new RegExp(`CLOSE_ONLY_WITH_X[^\\n]*'${id}'`));
  }
  assert.match(game, /function handleEscape\(\)/);
  const escape = game.slice(game.indexOf('function handleEscape('), game.indexOf('/** Title screen shown'));
  assert.match(escape, /CLOSE_ONLY_WITH_X\.has\(top\.id\)[\s\S]*?!isTouchOnly\(\)[\s\S]*?closeModal\(top\.id\)/);
  assert.match(escape, /if \(!open\.length && game\.match\?\.active\) openModal\('settingsPanel'\);/);
  assert.match(game, /event\.key === 'Escape'[\s\S]{0,120}handleEscape\(\)/);
  assert.match(game, /function quitToMenu\([\s\S]*?closeModal\('exitConfirm'\)/);
  const backdrop = game.slice(game.indexOf("modal.addEventListener('pointerdown'"));
  assert.match(backdrop, /CLOSE_ONLY_WITH_X\.has\(modal\.id\)/);

  // 設定 opened from the menu must not offer 重來這局.
  assert.match(game, /function openSettingsPanel\(\)/);
  const settingsOpen = game.slice(
    game.indexOf('function openSettingsPanel('),
    game.indexOf('function closeTopModal('),
  );
  assert.match(settingsOpen, /restart\.hidden = !game\.match\?\.active/);
  assert.match(game, /el\('menuSettings'\)[^\n]*openSettingsPanel\(\)/);
  assert.match(game, /el\('settingsBtn'\)[^\n]*openSettingsPanel\(\)/);

  // A small greyed-out note explains iOS silent mode / slider limitations.
  assert.match(html, /id="settingsNote"/);
  const settingsNote = html.slice(html.indexOf('id="settingsNote"'), html.indexOf('class="settings-quit"'));
  assert.match(settingsNote, /靜音模式/);
  assert.match(settingsNote, /音量滑桿/);

  // The 十三么 牌王 rule in item 8 must not be bolded.
  const helpItems = html.slice(html.indexOf('<ol class="help-list">'), html.indexOf('</ol>', html.indexOf('<ol class="help-list">')));
  const itemEight = helpItems.split('<li>').filter((line) => line.includes('十三么') && line.includes('牌王'))[0] ?? '';
  assert.ok(itemEight.length > 0, 'item 8 not found');
  assert.doesNotMatch(itemEight, /<strong>/);
});

test('HUD 起糊與 AI 表情已接上', () => {
  const game = readFileSync('js/game.js', 'utf8');
  assert.doesNotMatch(html, /id="minFanCount"/);
  assert.match(game, /scoreMatchInfo/);
  assert.match(game, /ui\.scoreMatchInfo\.textContent =/);
  for (const name of [
    'AI_DISCARD_EMOJI_CHANCE', 'AI_WIN_EMOJI_CHANCE', 'DRAW_EMOJI_CHANCE',
    'MATCH_END_EMOJI_CHANCE', 'BIG_WIN_AI_EMOJI_CHANCE', 'AI_MELD_EMOJI_CHANCE',
  ]) {
    assert.match(game, new RegExp(name));
  }
  assert.match(game, /function aiEmoji\(/);
  assert.match(game, /function maybeAiEmoji\(/);
  assert.match(game, /function emitAiReactions\(/);
  assert.match(game, /function recordRoundResult\([\s\S]*?emitAiReactions\(\{/);
  assert.match(game, /function applyAiMeldClaim\([\s\S]*?maybeAiEmoji\(/);
  const emit = game.slice(
    game.indexOf('function emitAiReactions('),
    game.indexOf('function closeEmojiPanel()'),
  );
  assert.match(emit, /if \(game\.mode === 'multi' && !net\.isHost\) return;/);
  assert.match(emit, /if \(isAiSeat\(winner\)\)/);
  assert.match(emit, /if \(isAiSeat\(discarder\)\)/);
  assert.doesNotMatch(emit, /else if \(isAiSeat\(discarder\)\)/);
  assert.match(game, /net\.broadcast\(\{ t: 'emoji', seat, emoji \}\)/);

  // A human emoji (in the room or during play) may get a happy AI reply.
  assert.match(game, /HUMAN_EMOJI_AI_REPLY_CHANCE = 0\.3/);
  assert.match(game, /function maybeReplyToHumanEmoji\(/);
  const reply = game.slice(
    game.indexOf('function maybeReplyToHumanEmoji('),
    game.indexOf('function emitAiReactions('),
  );
  assert.match(reply, /game\.mode === 'multi' && !net\.isHost/);
  assert.match(reply, /maybeAiEmoji\(seat, HUMAN_EMOJI_AI_REPLY_CHANCE, \['😀', '👍'\]\)/);
  const send = game.slice(game.indexOf('function sendEmoji('), game.indexOf('function aiEmoji('));
  assert.match(send, /maybeReplyToHumanEmoji\(\);/);
  const inbox = game.slice(game.indexOf("net.on('emoji'"), game.indexOf("net.on('catch'"));
  assert.match(inbox, /net\.isHost && !isEmojiAiSeat\(msg\.seat\)\) maybeReplyToHumanEmoji\(\);/);
  // A guest must not show its own emoji twice when the host relays it back.
  assert.match(inbox, /if \(msg\.seat === game\.seat\) return;[\s\S]*?showEmojiBubble\(msg\.seat, msg\.emoji\)/);

  // Empty room seats are not AI, even if aiStates from a finished hand linger.
  assert.match(game, /function isEmojiAiSeat\(/);
  const emojiSeat = game.slice(
    game.indexOf('function isEmojiAiSeat('),
    game.indexOf('function showEmojiBubble('),
  );
  assert.match(emojiSeat, /player\.isEmpty \|\| !player\.isBot/);
  const emojiHelpers = game.slice(
    game.indexOf('function aiEmoji('),
    game.indexOf('function emitAiReactions('),
  );
  assert.match(emojiHelpers, /isEmojiAiSeat\(seat\)/);
  assert.match(reply, /isEmojiAiSeat\(seat\)/);
  const reopen = game.slice(
    game.indexOf('function reopenMultiRoomSettings('),
    game.indexOf('function addRematchVote('),
  );
  assert.match(reopen, /game\.aiStates = \{\}/);
  const backRoom = game.slice(
    game.indexOf("net.on('backToRoom'"),
    game.indexOf("net.on('start'"),
  );
  assert.match(backRoom, /game\.aiStates = \{\}/);

  // Bubbles from different seats are staggered instead of stacking.
  const bubble = game.slice(
    game.indexOf('function showEmojiBubble('),
    game.indexOf('function sendEmoji('),
  );
  assert.match(bubble, /bubble\.dataset\.seat/);
  assert.match(bubble, /querySelectorAll\('\.emoji-bubble'\)/);
  assert.match(bubble, /stagger/);

  // AI replies to a human emoji arrive about a second later, not instantly.
  assert.match(game, /HUMAN_EMOJI_REPLY_DELAY_MS = 1000/);
  assert.match(reply, /setTimeout\([\s\S]*?HUMAN_EMOJI_REPLY_DELAY_MS/);
});

test('槓後補牌前不能吃別人的牌', () => {
  const game = readFileSync('js/game.js', 'utf8');
  const build = game.slice(
    game.indexOf('function buildClaimActions('),
    game.indexOf('function robKong('),
  );
  // Actions stay visible but disabled until the 槓 replacement is fished.
  assert.match(build, /const claimBlocked = game\.kongChain > 0 \|\| game\.grabPending;/);
  assert.match(build, /disabled: claimBlocked/);
  assert.doesNotMatch(build, /return includePass \? \[/);
  const claim = game.slice(
    game.indexOf('function claimFromBox('),
    game.indexOf('function declareOpenMeldMulti('),
  );
  assert.match(claim, /!fresh \|\|/);
  assert.match(claim, /fresh\.disabled/);
  const reel = game.slice(
    game.indexOf('function finishReel('),
    game.indexOf('function resolveDraw('),
  );
  assert.match(reel, /renderClaimBoxes\(\);/);
});

test('玩法說明清單可多於六項且保留固定入口', () => {
  assert.match(html, /id="payoutTableTitle"/);
  assert.match(html, /id="patternsBody"/);
});

test('自訂牌型排在牌型表最底', () => {
  const rows = [
    { id: '人胡', fan: 10, category: '自訂牌型' },
    { id: '平糊', fan: 1 },
    { id: '花糊', fan: 3 },
    { id: '七對子', fan: 3, category: '自訂牌型' },
  ];
  assert.deepEqual(sortPatternRows(rows).map((r) => r.id),
    ['平糊', '花糊', '七對子', '人胡']);
});

test('牌圖版本已升級且沒有雙重立體疊圖', () => {
  const tiles = readFileSync('js/tiles.js', 'utf8');
  const css = readFileSync('css/style.css', 'utf8');
  assert.match(tiles, /TILE_ASSET_VERSION = 8;/);
  assert.doesNotMatch(tiles, /createLinearGradient\(-width \/ 2, -height \/ 2/);
  assert.doesNotMatch(css, /\.tile-img:not\(\.tile-fallback\)::before/);
  assert.equal(statSync('scripts/restyle_tiles.py').isFile(), true);
});

test('43 張牌圖都是 RGBA 120x181', () => {
  const files = readdirSync('assets/tiles/faces').filter((f) => f.endsWith('.png'));
  assert.equal(files.length, 43);
  for (const file of files) {
    const buf = readFileSync(`assets/tiles/faces/${file}`);
    assert.equal(buf.subarray(1, 4).toString(), 'PNG');
    assert.equal(buf.readUInt32BE(16), 120, file);
    assert.equal(buf.readUInt32BE(20), 181, file);
    assert.equal(buf[25], 6, `${file} must be RGBA`);
  }

  // Canvas tiles must keep the PNG's natural aspect, like DOM tiles do.
  const drawn = [];
  const ctx = {
    save() {}, translate() {}, restore() {},
    drawImage(...args) { drawn.push(args); },
  };
  const image = { complete: true, naturalWidth: 120, naturalHeight: 181 };
  drawTile(ctx, 'T1', 0, 0, 132, 176, { images: { T1: image } });
  assert.equal(drawn.length, 1);
  const [, dx, dy, dw, dh] = drawn[0];
  const expectedHeight = 176;
  const expectedWidth = 120 * expectedHeight / 181;
  assert.ok(Math.abs(dh - expectedHeight) < 1e-6, `drawImage height ${dh}`);
  assert.ok(Math.abs(dw - expectedWidth) < 1e-6, `drawImage width ${dw}`);
  assert.ok(Math.abs(dw / dh - 120 / 181) < 1e-6, 'drawImage must keep the PNG aspect');
  assert.ok(Math.abs(dx + dw / 2) < 1e-6 && Math.abs(dy + dh / 2) < 1e-6,
    'drawImage must centre the fitted tile');
});

test('iOS 語音鎖定與音樂恢復有防護', () => {
  const game = readFileSync('js/game.js', 'utf8');
  assert.match(game, /function speechEngineBusy\(\)/);
  assert.match(game, /const speechBusy = \(\) => speechActive;/);
  const unlockMusic = game.slice(
    game.indexOf('function unlockMusic('),
    game.indexOf('function setMainVolume('),
  );
  assert.match(unlockMusic, /if \(speechBusy\(\)\) return;/);
  assert.match(unlockMusic, /if \(game\.settings\.musicEnabled\) music\.start\(\);/);
  // Repeated taps must skip the audio/voice setup after the first gesture unlock.
  assert.match(game, /let gestureAudioUnlocked = false/);
  assert.match(unlockMusic, /if \(gestureAudioUnlocked\) return;/);
  const clickHandler = game.slice(
    game.indexOf("document.addEventListener('click', (event) => {"),
    game.indexOf("el('creditsBtn')"),
  );
  assert.match(clickHandler, /button && !button\.disabled && !speechBusy\(\)\) music\.click\(\);/);
  const unlock = game.slice(
    game.indexOf('function unlockSpeechEngine('),
    game.indexOf('function voiceStatus('),
  );
  assert.match(unlock, /speechUnlocked \|\| speechActive/);
  assert.doesNotMatch(unlock, /speechEngineBusy\(\)/);
  const resume = game.slice(
    game.indexOf('function resumeMusicAfterVoice('),
    game.indexOf('function scheduleMusicResumeAfterVoice('),
  );
  assert.match(resume, /speechEngineBusy\(\)/);
  assert.match(resume, /voiceResumeAttempts/);
  const watchdog = game.slice(
    game.indexOf('function armSpeechWatchdog('),
    game.indexOf('function finishVoiceUtterance('),
  );
  assert.match(watchdog, /speechEngineBusy\(\) && Date\.now\(\) < deadline/);
  assert.match(watchdog, /armSpeechWatchdog\(deadline\)/);
  assert.match(game, /armSpeechWatchdog\(Date\.now\(\) \+ watchdogMs\)/);
});

test('玩家版本與 cachebust 已更新', () => {
  const html = readFileSync('index.html', 'utf8');
  const game = readFileSync('js/game.js', 'utf8');
  const readme = readFileSync('README.md', 'utf8');
  const changelog = readFileSync('CHANGELOG.md', 'utf8');
  assert.match(html, /css\/style\.css\?v=1\.4\.118/);
  assert.match(html, /js\/game\.js\?v=1\.4\.118/);
  assert.match(game, /\.\/tiles\.js\?v=1\.4\.99/);
  assert.match(game, /\.\/rules\.js\?v=1\.4\.118/);
  assert.match(readme, /\?v=1\.4\.118/);
  assert.match(changelog, /^## 1\.4\.118/m);

  // 玩法說明: pinned close button and updated source notes.
  const css = readFileSync('css/style.css', 'utf8');
  assert.match(css, /#helpPanel \.modal-head \{[^}]*position: sticky/);
  assert.match(css, /#helpPanel \.modal-head \{[^}]*top: 0/);
  assert.doesNotMatch(html, /標示「自訂牌型」者為本遊戲保留的變體/);
  assert.doesNotMatch(html, /範例牌型由規則引擎產生並經測試驗證/);
  assert.match(html, /標準牌型番數以香港麻雀協會《香港麻雀總例》為準；標示「自訂牌型」者為本遊戲增加的變體，皆為一此沒有收錄香港麻雀協會《香港麻雀總例》的特殊牌型。由房主設定使用與否。/);
  const rulesSrc = readFileSync('js/rules.js', 'utf8');
  assert.doesNotMatch(rulesSrc, /香港麻雀協會《香港麻雀總例》沒有此番種/);

  // Host-only 自訂牌型 toggle and engine threading.
  assert.match(html, /id="customPatternsToggle"/);
  const switchSlice = html.slice(
    html.indexOf('id="customPatternsToggle"') - 120,
    html.indexOf('id="customPatternsToggle"') + 160,
  );
  assert.match(switchSlice, /switch-field/);
  assert.match(switchSlice, /class="switch"/);
  assert.match(html, /id="roomStartingMoney"[^>]*value="128"/);
  assert.match(html, /id="roomStartingMoneyText"[^>]*value="128"/);
  assert.match(game, /const DEFAULT_STARTING_MONEY = 128;/);
  assert.match(html, /\(由房主設定\)/);
  assert.match(game, /customPatternsToggle: el\('customPatternsToggle'\)/);
  const setup = game.slice(
    game.indexOf('function normalizeMatchSetup('),
    game.indexOf('function formatMoney('),
  );
  assert.match(setup, /customPatterns: source\.customPatterns === true/);
  const clone = game.slice(
    game.indexOf('function cloneMatch('),
    game.indexOf('function adoptMatch('),
  );
  assert.match(clone, /customPatterns: match\.customPatterns === true/);
  const helper = game.slice(
    game.indexOf('function customPatternsEnabled('),
    game.indexOf('function seatWinContext('),
  );
  assert.match(helper, /game\.match\?\.customPatterns \?\? game\.matchSetup\?\.customPatterns \?\? false/);
  const seatCtx = game.slice(
    game.indexOf('function seatWinContext('),
    game.indexOf('function kongStateFor('),
  );
  assert.match(seatCtx, /customPatterns: customPatternsEnabled\(\)/);
  const winCtx = game.slice(
    game.indexOf('function winContext('),
    game.indexOf('function openingWinContext('),
  );
  assert.match(winCtx, /customPatterns: customPatternsEnabled\(\)/);
  const current = game.slice(
    game.indexOf('function currentRoomMatchSetup('),
    game.indexOf('function updateRoomSettings('),
  );
  assert.match(current, /customPatterns: ui\.customPatternsToggle\?\.checked \?\? false/);
  assert.match(game, /ui\.customPatternsToggle\.checked = Boolean\(setup\.customPatterns\)/);
  assert.match(game, /ui\.customPatternsToggle\.disabled = !isHost/);
  assert.match(game, /ui\.customPatternsToggle\?\.addEventListener\('change', updateRoomSettings\)/);
  const aiWin = game.slice(
    game.indexOf('function commitAiWin('),
    game.indexOf('function commitWin('),
  );
  assert.match(aiWin, /game\.claimPriorities\.clear\(\)/);
  assert.match(aiWin, /game\.pendingKongs\.clear\(\)/);
  const table = game.slice(
    game.indexOf('function buildPatternTable('),
    game.indexOf('const PATTERN_ROWS'),
  );
  assert.match(table, /sortPatternRows\(\[\.\.\.PATTERN_ROWS, \.\.\.FLOWER_PATTERN_TABLE\]\)/);
  assert.doesNotMatch(table, /category !== '自訂牌型'/);

  // 1.4.113: no grace-block without a real 十三么 candidate, round line,
  // refocused HUD and 本局信息 panel.
  const priority = game.slice(
    game.indexOf('function priorityPending('),
    game.indexOf('function releaseClaimPriority('),
  );
  assert.match(priority, /state\.graceUntil > Date\.now\(\) && state\.candidates\.size > 0/);
  const round = game.slice(
    game.indexOf('function roundInfoText('),
    game.indexOf('function seatZeroWind('),
  );
  assert.match(round, /門風 \$\{/);
  assert.doesNotMatch(round, /圈/);
  assert.doesNotMatch(html, /id="seatWind"/);
  assert.doesNotMatch(html, /id="minFanCount"/);
  assert.match(html, /id="scoreBtn"[^>]*>本局信息<\/button>/);
  assert.match(html, /各家\(副露\)/);
  assert.match(html, /id="scoreMatchInfo"/);
  for (const label of ['圈子數', '起糊', '上限番數', '自訂牌型', '金額倍數', '每局時間']) {
    assert.match(html, new RegExp(label));
  }
  assert.match(game, /scoreMatchInfo: el\('scoreMatchInfo'\)/);

  // 1.4.114: kong rob window only when an opponent can actually rob, and the
  // 本局信息 panel keeps only the info row + a plain 計分 heading.
  assert.match(game, /function canRobKong\(/);
  const kong = game.slice(
    game.indexOf('function beginKongOpportunity('),
    game.indexOf('function finishKongOpportunity('),
  );
  assert.match(kong, /if \(!robPossible\) return;/);
  const kongBroadcast = game.slice(
    game.indexOf('function declareKong('),
    game.indexOf('function makeKongMeld('),
  );
  assert.match(kongBroadcast, /robPossible:/);
  const meldHandler = game.slice(
    game.indexOf("net.on('meld'"),
    game.indexOf("net.on('win'"),
  );
  assert.match(meldHandler, /robPossible: msg\.robPossible/);
  const scoreInfo = game.slice(
    game.indexOf('if (ui.scoreRoundInfo) {'),
    game.indexOf('renderStandings(ui.scoreStandings)'),
  );
  assert.doesNotMatch(scoreInfo, /roundInfoText\(\)/);
  assert.doesNotMatch(scoreInfo, /金額倍數/);
  assert.doesNotMatch(scoreInfo, /起糊/);
  assert.match(html, /id="roomHelpBtn"[^>]*>玩法說明<\/button>/);
  const roomBtnCss = readFileSync('css/style.css', 'utf8');
  assert.match(roomBtnCss, /#roomEmojiBtn, #roomHelpBtn \{/);
  assert.match(game, /roomHelpBtn: el\('roomHelpBtn'\)/);
  assert.match(game, /ui\.roomHelpBtn\?\.addEventListener\('click'/);
  assert.match(game, /switchHelpTab\('rules'\); openModal\('helpPanel'\)/);
  assert.match(readFileSync('css/style.css', 'utf8'), /\.score-round-info \{[^}]*color: #555/);
  assert.match(html, /<h3>計分<\/h3>/);
  const css114 = readFileSync('css/style.css', 'utf8');
  assert.match(css114, /\.score-match-info \{[^}]*color: #000/);

  // 1.4.117: AI-generated lucky cat as favicon and menu mascot, no incense.
  assert.match(html, /rel="icon" href="assets\/icons\/maneki-neko-gemini\.png"/);
  assert.match(html, /class="lucky-cat"/);
  assert.match(html, /src="assets\/icons\/maneki-neko-gemini\.png"/);
  assert.doesNotMatch(html, /id="incense"/);
  const css117 = readFileSync('css/style.css', 'utf8');
  assert.match(css117, /@keyframes lucky-cat-wave/);
  assert.match(css117, /\.lucky-cat img/);
  assert.match(css117, /#8c1d1d/);

  // 1.4.118: clearer lucky cat asset and cat on the LEFT of the menu title.
  const titleRow = html.slice(
    html.indexOf('class="menu-title-row"'),
    html.indexOf('</div>', html.indexOf('class="menu-title-row"')),
  );
  assert.ok(titleRow.indexOf('class="lucky-cat"') < titleRow.indexOf('class="menu-title"'));

  const restyle = readFileSync('scripts/restyle_tiles.py', 'utf8');
  assert.doesNotMatch(restyle, /add_shadow/);
  assert.doesNotMatch(restyle, /RECOLOUR_TOLERANCE/);
  assert.doesNotMatch(restyle, /FACE_TARGET/);
  const process = readFileSync('scripts/process_assets.py', 'utf8');
  assert.match(process, /120×181/);
});

console.log(`結果：${passed} 通過，${failed} 失敗`);
process.exitCode = failed ? 1 : 0;
