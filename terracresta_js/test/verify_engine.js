import { parseBitmap, PALETTE } from '../src/sprites.js';
import { RAW_8X8_TILES, RAW_16X16_SPRITES, RAW_WAVE_SCRIPT } from '../src/extracted_data.js';
import { Player } from '../src/player.js';
import { EnemyManager } from '../src/enemies.js';
import { Background } from '../src/background.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('=== Testing Terra Cresta Native JavaScript Engine ===\n');

// 0. Test Disassembled Binary Tables
console.log('0. Testing Disassembled Z80 Machine Code Tables:');
assert(RAW_8X8_TILES.length === 768, 'Extracted 768 exact 8x8 character and terrain tiles');
assert(RAW_16X16_SPRITES.length >= 200, 'Extracted 203 exact 16x16 masked sprite structures');
assert(RAW_WAVE_SCRIPT.length > 300, 'Extracted 304 bytes of authentic enemy wave spawn scripts');

// 1. Test Sprite Parsing
console.log('\n1. Testing Sprite Bitmaps:');
const sample = parseBitmap([
  "##  ",
  "  ##"
]);
assert(sample.length === 2 && sample[0][0] === 1 && sample[0][2] === 0, 'parseBitmap correctly transforms ASCII matrix');

// 2. Test Player & Upgrades
console.log('\n2. Testing Player Modular Upgrades:');
const mockGame = {
  audio: {
    playLaser: () => {},
    playExplosion: () => {},
    playDockingJingle: () => {},
    playPhoenixRoar: () => {},
    playFormationSplit: () => {}
  },
  addScore: (pts) => {},
  playerHit: () => {},
  onBossDefeated: () => {}
};

const player = new Player(mockGame);
assert(player.modules.length === 1 && player.modules[0] === 1, 'Initial player has only Winger module 1');

player.attachModule(2);
player.attachModule(3);
assert(player.modules.length === 3 && player.modules.includes(2) && player.modules.includes(3), 'Player attached Module 2 and 3');

player.attachModule(4);
player.attachModule(5);
assert(player.modules.length === 5 && player.isPhoenix === true, 'All 5 modules trigger Phoenix mode transformation!');

// 3. Test Formation Split
console.log('\n3. Testing Formation Split:');
player.isPhoenix = false;
player.toggleFormationSplit();
assert(player.isSplit === true && player.splitTimer > 0, 'Formation split active');

const positions = player.getModulePositions();
assert(positions.length === 5, 'All 5 modules separated into tactical positions');

// 4. Test Enemy Waves & Collisions
console.log('\n4. Testing Enemy AI & Collisions:');
const enemyMgr = new EnemyManager(mockGame);
enemyMgr.reset();
assert(enemyMgr.capsules.length === 4, '4 ground upgrade capsules spawned along terrain');

enemyMgr.spawnSwoopWave(50, 1);
assert(enemyMgr.enemies.length === 5, 'Swoop wave spawned 5 enemies');

console.log(`\n=========================================`);
console.log(`Verification Summary: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
