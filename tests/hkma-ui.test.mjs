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
  assert.match(html, /css\/style\.css\?v=1\.4\.159/);
  assert.match(html, /js\/game\.js\?v=1\.4\.159/);
  assert.match(game, /\.\/tiles\.js\?v=1\.4\.99/);
  assert.match(game, /\.\/rules\.js\?v=1\.4\.159/);
  assert.match(readme, /\?v=1\.4\.159/);
  assert.match(changelog, /^## 1\.4\.159/m);

  // 1.4.150: ink splash PNGs replace the flat dim overlay.
  const inkCss150 = readFileSync('css/style.css', 'utf8');
  assert.match(game, /assets\/icons\/ink-splash\.png/);
  assert.match(game, /function renderInkSplashes\(/);
  assert.match(inkCss150, /\.ink-splash/);
  // 1.4.152: cooldowns reset on every new hand, wider ink, no dim, who-inked toast.
  assert.match(game, /function resetAbilityState\(/);
  assert.match(game, /resetAbilityState\(\);/);
  assert.match(game, /對你潑墨/);
  const inkCss152 = readFileSync('css/style.css', 'utf8');
  assert.doesNotMatch(inkCss152.slice(inkCss152.indexOf('#inkOverlay, #ink-overlay'), inkCss152.indexOf('.ink-splash')), /rgba\(10,10,10,0\.28\)/);
  // 1.4.151: ink splashes more opaque, bigger, more numerous to close gaps.
  assert.match(inkCss150, /opacity: 1;/);
  // 1.4.153: 30 ink splashes, correct caster/victim toasts, 墨魚 rename.
  assert.match(game, /name: '墨魚'/);
  assert.match(game, /function showInkToast\(/);
  // 1.4.155: one full-sea ink PNG; per-device steal toasts; AI angry emoji.
  assert.match(game, /img\.style\.width = '68%'/);
  assert.match(game, /img\.style\.height = '60%'/);
  assert.doesNotMatch(game, /const spots = \[/);
  assert.match(game, /function showStealToast\(/);
  assert.match(game, /成功從/);
  assert.match(game, /偷到\$/);
  assert.match(game, /maybeAiEmoji\(monkeyVictim, 0\.5, \['😡'\]\)/);
  // 1.4.154: monkey steals from a random opponent, not a fixed first seat.
  const abilityClick154 = game.slice(game.indexOf('btn.addEventListener(\'click\''), game.indexOf('function openGiraffeTargetPicker('));
  assert.match(abilityClick154, /requestAbility\(myId, null\)/);
  assert.doesNotMatch(abilityClick154, /abilitySeats\(game\.seat\)\[0\]/);
  assert.doesNotMatch(game, /name: '魷魚'/);
  // 1.4.156: live money UI, skill button bottom-right, no multi restart, solo money snapshot, smaller ink.
  assert.match(game, /updateHUD\(\); \/\/ sync money UI after ability/);
  assert.match(game, /技能: \$\{label\}/);
  assert.doesNotMatch(html, /id="creditsBtn"/);
  assert.match(game, /soloMoneySnapshot/);
  assert.match(game, /if \(game\.mode === 'multi'\) return false; \/\/ no multiplayer restart vote/);
  assert.match(game, /style\.width = '68%'/);
  const inkCss156 = readFileSync('css/style.css', 'utf8');
  assert.match(inkCss156, /\.ability-buttons[^}]*bottom/);


  // 1.4.146: sparrow 百搭牌 (wildcard) integration.
  assert.match(game, /wildcardWaitTiles\(/);
  assert.match(game, /'WILD'/);
  assert.match(game, /百搭牌不能打出/);
  assert.match(readFileSync('CREDITS.md', 'utf8'), /wildcard\.png/);

  // 1.4.146 Task 3: passive abilities + settlement money adjustments.
  assert.match(game, /abilityState\[/);
  assert.match(game, /applyAbilityMoney\(/);
  assert.match(game, /bonusFanFor\(/);
  assert.match(game, /角色能力/);
  const claimBlock3 = game.slice(
    game.indexOf('function canDeclareMeld('),
    game.indexOf('function buildClaimActions('),
  );
  assert.match(claimBlock3, /'dragon'/);

  // 1.4.146 Task 4: active abilities + host arbitration messages.
  assert.match(game, /t:'ability'/);
  assert.match(game, /t:'abilityResult'/);
  assert.match(game, /actionId/);
  assert.match(game, /isFrozen\(/);
  assert.match(game, /inkUntil\[/);
  assert.match(game, /frozenUntil\[/);
  assert.match(game, /giraffeTarget/);
  const abilityHandler = game.slice(
    game.indexOf("net.on('abilityResult'"),
    game.indexOf("net.on('match'"),
  );
  assert.doesNotMatch(abilityHandler, /Math\.random\(\)/);

  // 1.4.146 Task 5: ability UI wiring.
  assert.match(html, /id="abilityButtons"/);
  assert.match(html, /id="giraffeTargetPicker"/);
  assert.match(html, /id="peekPanel"/);
  assert.match(html, /id="inkOverlay"/);
  assert.match(game, /ui\.abilityButtons/);
  assert.match(game, /ui\.giraffeTargetPicker/);
  assert.match(game, /ui\.peekPanel/);
  assert.match(game, /ui\.inkOverlay/);
  const abilityCss = readFileSync('css/style.css', 'utf8');
  assert.match(abilityCss, /#ink-overlay/);
  assert.match(abilityCss, /\.ability-btn/);
  // 1.4.149: the ink overlay CSS must target the REAL html id (#inkOverlay),
  // not the stale hyphenated (#ink-overlay) which never matched anything.
  assert.match(abilityCss, /#inkOverlay/);
  assert.doesNotMatch(abilityCss, /#ink-overlay \{[^}]*height:\s*\d+px/);

  // Final review: giraffe peeks the chosen target, and tiles are sent only
  // to the requester (never attached to the broadcast abilityResult).
  const giraffeFix = game.slice(
    game.indexOf("else if (canonical === 'giraffe')"),
    game.indexOf('  state.cooldowns = startCooldown', game.indexOf("else if (canonical === 'giraffe')")),
  );
  assert.match(giraffeFix, /game\.seat === giraffeTarget \? game : game\.aiStates/);
  assert.match(giraffeFix, /net\.sendToPeer\(/);
  assert.doesNotMatch(game, /notice\.tiles = game\.pendingPeek/);

  // 1.4.147: squid ink must initialise as an object (strict mode throws on
  // property writes to a number), and the broadcast must carry the opponents'
  // ink deadlines rather than checking the requester's own (never-set) value.
  assert.match(game, /inkUntil: \{\}/);
  assert.match(game, /frozenUntil: \{\}/);
  assert.match(game, /notice\.inkUntil = opponents\.map\(\(s\) => game\.inkUntil\[s\]\)/);

  // 1.4.148: guest abilities are arbitrated by the host so ink reaches all opponents.
  assert.match(game, /function requestAbility\(/);
  assert.match(game, /net\.sendToHost\(\{t:'ability'/);
  const applyAbility = game.slice(
    game.indexOf('function applyAbilityResult('),
    game.indexOf('function broadcastOrSend('),
  );
  assert.match(applyAbility, /startCooldown\(/);
  assert.match(applyAbility, /renderAbilityButtons\(\)/);

  // 1.4.157: chip-style skill button, no multi restart, money revert on restart, bankruptcy end.
  assert.match(game, /ability-btn chip/);
  assert.match(game, /restart\.hidden = game\.mode === 'multi'/);
  assert.match(game, /soloMoneySnapshot.*\n/);
  assert.match(game, /破產/);
  assert.match(game, /stealBankrupt/);

  // 1.4.158: ID(角色) format with ASCII brackets, rectangle chip, CD countdown.
  assert.match(game, /\$\{scoreSeatName\(casterSeat\)\}\(\$\{who\}\)對你潑墨/);
  assert.match(game, /\$\{scoreSeatName\(victimSeat\)\}資金為0或以下/);
  // 1.4.159: updated character art, turtle rename, clickable skill button, iOS pointer fix.
  assert.match(game, /name: '玄武'/);
  assert.match(game, /function updateAbilityCountdown\(/);
  assert.match(game, /updateAbilityCountdown\(\); \/\/ refresh cooldown countdown/);
  const abilityCss159 = readFileSync('css/style.css', 'utf8');
  assert.match(abilityCss159, /\.ability-buttons \{[^}]*pointer-events: none/);
  assert.match(abilityCss159, /\.ability-btn \{[^}]*pointer-events: auto/);
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

  // 1.4.119: one cat-on-boat + rod image prototype; boat drift affects hook base.
  assert.match(html, /id="helpBtn"/);
  const boatCode = game.slice(
    game.indexOf('function boatOffset('),
    game.indexOf('function hookPositionFor('),
  );
  assert.match(boatCode, /motionPhase\(\)/);
  assert.match(boatCode, /Math\.sin/);
  const hook = game.slice(
    game.indexOf('function hookPositionFor('),
    game.indexOf('function hookPosition('),
  );
  assert.match(hook, /boatOffset\(seat\)/);
  assert.match(hook, /Math\.max\(WATER_TOP,/);
  assert.match(game, /catBoatImage/);
  assert.match(game, /rodImage/);
  assert.match(game, /assets\/icons\/cat-on-boat\.png/);
  assert.match(game, /assets\/icons\/fishing-rod\.png/);
  assert.doesNotMatch(html, /id="incense"/);

  // 1.4.120: faster full-width boat drift resting on the waterline.
  const boatFn = game.slice(
    game.indexOf('function boatOffset('),
    game.indexOf('function hookPositionFor('),
  );
  assert.match(boatFn, /motionPhase\(\) \/ 2/);
  assert.match(boatFn, /view\.width \* 0\.42/);
  // 1.4.139: opponents are full transparent cat-on-boats, not small background icons.
  const ghostFn139 = game.slice(
    game.indexOf('function drawGhostRod('),
    game.indexOf('function renderGhostRods('),
  );
  assert.match(ghostFn139, /ghostCharacter = characterFor\(/);
  assert.match(ghostFn139, /rodImage/);
  assert.match(ghostFn139, /globalAlpha = 0\.3/);
  assert.match(ghostFn139, /boatOffset\(seat\)/);
  const drawFn139 = game.slice(
    game.indexOf('function draw(dt)'),
    game.indexOf('function gameLoop('),
  );
  assert.doesNotMatch(drawFn139, /drawPlayerAvatars\(\)/);

  // 1.4.121: rod handle anchored at the cat on the waterline, not sky-top.
  const rodDraw = game.slice(game.indexOf('function drawRod('), game.indexOf('function draw('));
  assert.match(rodDraw, /WATER_TOP/);
  assert.match(rodDraw, /visTipX/);
  assert.match(rodDraw, /Math\.PI \+ 0\.62/);

  // 1.4.122: fishing line attaches to the actual rendered rod tip.
  // 1.4.128: while waiting to cast, the line/hook preview swings with the rod.
  const rodDraw128 = game.slice(
    game.indexOf('function drawRod('),
    game.indexOf('function draw(dt)'),
  );
  assert.match(rodDraw128, /game\.aimPreviewLen/);
  assert.match(game, /AIM_PREVIEW_LEN = 80;/);
  assert.match(rodDraw128, /game\.state === S\.AWAIT_CAST/);
  // 1.4.138: ease the aim-preview length so the hook never teleports from the tip.
  assert.match(game, /aimPreviewLen: 0/);
  assert.match(game, /const aimTarget = game\.state === S\.AWAIT_CAST \? AIM_PREVIEW_LEN : 0;/);
  assert.match(game, /game\.aimPreviewLen \+= \(aimTarget - game\.aimPreviewLen\)/);
  // 1.4.133: line attaches to the rod tip; hook swings with the rod to aim.
  // 1.4.134: string+hook pendulum on their own clock, attached to the rod tip.
  assert.match(game, /motionSpeedFactor\(\)/);
  assert.match(game, /function motionPhase\(\)/);
  assert.match(game, /MOTION_RAMP_SECONDS = 60/);
  assert.match(game, /Math\.sin\(motionPhase\(\) \/ 1\.2\) \* 1\.4/);
  assert.doesNotMatch(game, /seconds \/ 1\.2 \* motionSpeedFactor/);
  assert.match(rodDraw128, /hookX = visTipX \+ Math\.sin\(pendulum\) \* previewLen/);
  assert.match(rodDraw128, /hookY = visTipY \+ Math\.cos\(pendulum\) \* previewLen/);
  assert.match(rodDraw128, /ctx\.moveTo\(visTipX, visTipY\)/);

  // 1.4.145: rod handle shifted toward the bottom-right of the character.
  assert.match(game, /ROD_GRIP_DX = /);
  assert.match(game, /ROD_GRIP_DY = /);
  assert.match(rodDraw128, /gripX = baseX \+ ROD_GRIP_DX/);
  assert.match(rodDraw128, /gripY = handleY \+ ROD_GRIP_DY/);
  assert.match(rodDraw128, /ctx\.translate\(gripX, gripY\)/);
  const ghostFn145 = game.slice(
    game.indexOf('function drawGhostRod('),
    game.indexOf('function renderGhostRods('),
  );
  assert.match(ghostFn145, /gripX = baseX \+ ROD_GRIP_DX/);
  assert.match(ghostFn145, /ctx\.translate\(gripX, gripY\)/);

  // 1.4.136: rod held still on the right; only line+hook swing from its tip.
  const rodDraw136 = game.slice(
    game.indexOf('function drawRod('),
    game.indexOf('function draw(dt)'),
  );
  assert.match(game, /ROD_HOLD_ANGLE = /);
  assert.match(rodDraw136, /ROD_HOLD_ANGLE/);
  assert.doesNotMatch(rodDraw136, /game\.rodAngle/);
  // 1.4.137: rod held higher; cast launches along the visible aim direction.
  assert.match(game, /ROD_HOLD_ANGLE = \(60 \* Math\.PI\) \/ 180/);
  assert.match(game, /function aimPendulum\(/);
  assert.match(rodDraw136, /const pendulum = aimPendulum\(\);/);
  const castFn137 = game.slice(
    game.indexOf('function startCast('),
    game.indexOf('function startCast(') + 1200,
  );
  assert.match(castFn137, /game\.rodAngle = aimPendulum\(\);/);
  // 1.4.131: hook glyph rotates to follow the fishing line / aim direction.
  assert.match(rodDraw128, /Math\.atan2\(hookY - visTipY, hookX - visTipX\)/);
  assert.match(rodDraw128, /ctx\.translate\(hookX, hookY\)/);
  assert.match(rodDraw128, /ctx\.rotate\(lineAngle - Math\.PI \/ 2\)/);
  // 1.4.142: all characters share one waterline level; room UI simplified.
  assert.doesNotMatch(game, /WATER_TOP \* 0\.55/);
  assert.doesNotMatch(html, /id="roomAvatars"/);
  assert.doesNotMatch(game, /roomAvatars: el\(/);
  assert.doesNotMatch(html, /id="roomHookSpeed"/);
  assert.match(game, /HOOK_SPEED_FIXED = 1/);
  const roomFn142 = game.slice(
    game.indexOf('function renderRoom('),
    game.indexOf('function copyRoomLink('),
  );
  assert.match(roomFn142, /button\.style\.background = AVATAR_COLORS\[/);
  assert.match(roomFn142, /Empty seats have no character icon/);
  const boatFn142 = game.slice(
    game.indexOf('function boatOffset('),
    game.indexOf('function hookPositionFor('),
  );
  assert.match(boatFn142, /motionPhase\(\)/);
  const rules142 = readFileSync('js/rules.js', 'utf8');
  assert.match(rules142, /萬眾一心/);
  assert.doesNotMatch(rules142, /一心一意/);

  // 1.4.140: twelve selectable characters; flyers live above the waterline.
  assert.match(game, /const CHARACTERS = \[/);
  assert.match(game, /assets\/characters\/\$\{def\.id\}\.png/);
  for (const id of ['bee', 'cat-boat', 'dragon', 'giraffe-boat', 'monkey-boat',
    'panda-raft', 'penguin-iceberg', 'phoenix', 'pig-boat', 'sparrow', 'squid', 'turtle']) {
    assert.ok(game.includes(`id: '${id}'`), `missing character ${id}`);
  }
  assert.match(game, /kind: 'fly'/);
  // 1.4.141: no ambient sky animals, and multiplayer start carries characters.
  assert.doesNotMatch(game, /function drawSkyFlyers\(/);
  assert.doesNotMatch(game, /drawSkyFlyers\(\);/);
  assert.match(game, /character: player\.character/);
  assert.match(game, /kind: 'boat'/);
  assert.match(game, /function characterFor\(/);
  assert.match(game, /function setPlayerCharacter\(/);
  assert.match(html, /id="roomCharacters"/);
  assert.match(game, /roomCharacters: el\('roomCharacters'\)/);
  const roomFn140 = game.slice(
    game.indexOf('function renderRoom('),
    game.indexOf('function copyRoomLink('),
  );
  assert.match(roomFn140, /room-player-character/);
  assert.match(roomFn140, /characterDef\(/);
  assert.match(ghostFn139, /ghostCharacter = characterFor\(/);



  const rodDraw122 = game.slice(
    game.indexOf('function drawRod('),
    game.indexOf('function draw(dt)'),
  );
  assert.match(rodDraw122, /lx = \(1180 - 323\) \* s/);
  assert.match(rodDraw122, /ly = \(54 - 727\) \* s/);
  assert.match(rodDraw122, /Math\.cos\(theta\) - ly \* Math\.sin\(theta\)/);

  // 1.4.123: visual line is ~80% of rod length and nearly perpendicular.
  const rodDraw123 = game.slice(
    game.indexOf('function drawRod('),
    game.indexOf('function draw(dt)'),
  );
  // 1.4.126: one hook — the drawn line and the catch point are the same.
  assert.match(rodDraw123, /ctx\.lineTo\(hookX, hookY\)/);
  assert.match(rodDraw123, /fillText\('🪝', 0, 0\)/);
  assert.doesNotMatch(rodDraw123, /visHookX/);
  assert.doesNotMatch(rodDraw123, /hitVisualEdge/);

  // 1.4.125: hook reverses at the sea floor / side edge instead of going off-screen.
  const maxLenFn = game.slice(
    game.indexOf('function maxHookLength('),
    game.indexOf('function swingLimit('),
  );
  assert.match(maxLenFn, /boatOffset\(seat\)/);
  const loopCast = game.slice(
    game.indexOf('function gameLoop('),
    game.indexOf('function broadcastSeaSnapshot('),
  );
  assert.match(loopCast, /hook\.hookY >= WORLD_H - TILE_H \/ 2/);
  assert.doesNotMatch(loopCast, /hitVisualEdge/);
  // 1.4.127: the hook can travel closer to the left/right screen edges.
  const hookFn = game.slice(
    game.indexOf('function hookPositionFor('),
    game.indexOf('function hookPosition()'),
  );
  assert.match(maxLenFn, /HOOK_EDGE_MARGIN/);
  assert.match(hookFn, /HOOK_EDGE_MARGIN/);
  assert.match(loopCast, /hook\.hookX <= HOOK_EDGE_MARGIN/);
  assert.doesNotMatch(hookFn, /Math\.max\(TILE_W \/ 2,/);


  // 1.4.143: slower motion, character PNG icons in score/副露, one-row menu tiles.
  assert.match(game, /return 1 \+ ramp \* 0\.5;/);
  assert.match(game, /meld-row-icon-img/);
  assert.match(game, /assets\/characters\/\$\{meldCharacter\.id\}\.png\?v=1\.4\.145/);
  assert.match(game, /score-seat-icon/);
  const css143 = readFileSync('css/style.css', 'utf8');
  assert.match(css143, /\.menu-tiles \{[^}]*flex-wrap: nowrap/);

  const restyle = readFileSync('scripts/restyle_tiles.py', 'utf8');
  assert.doesNotMatch(restyle, /add_shadow/);
  assert.doesNotMatch(restyle, /RECOLOUR_TOLERANCE/);
  assert.doesNotMatch(restyle, /FACE_TARGET/);
  const process = readFileSync('scripts/process_assets.py', 'utf8');
  assert.match(process, /120×181/);
});

console.log(`結果：${passed} 通過，${failed} 失敗`);
process.exitCode = failed ? 1 : 0;
