/**
 * ZX Spectrum 48K Built-in Software & Demos Library
 * Contains playable games, chiptune audio demos, arcade classics, and BASIC software.
 */

export const BUILTIN_GAMES = [
  {
    id: 'basic_prompt',
    title: 'Sinclair BASIC 1982',
    year: '1982',
    author: 'Sinclair Research Ltd / Nine Tiles',
    category: 'System',
    description: 'The authentic Sinclair ZX Spectrum 48K BASIC operating system. Type classic commands, write programs, and explore 1980s retro computing.',
    controls: 'Full Keyboard. Type RUN, PRINT, POKE, BEEP, etc.',
    type: 'reset',
  },
  {
    id: 'zx_snake',
    title: 'ZX Retro Snake',
    year: '1983 / Modern',
    author: 'Retro Spectrum Labs',
    category: 'Arcade',
    description: 'Classic arcade snake with authentic 1-bit beeper sound effects, score tracking, and speed stages on the 32x24 attribute screen.',
    controls: 'O: Left, P: Right, Q: Up, A: Down, Space: Start / Pause',
    type: 'program',
    setup: (spectrum) => setupSnakeGame(spectrum)
  },
  {
    id: 'zx_2048',
    title: '2048 Spectrum Edition',
    year: '2014 / Spectrum Port',
    author: 'Retro Z80 Studio',
    category: 'Puzzle',
    description: 'Join the numbers and get to the 2048 tile on the iconic ZX Spectrum palette with bright color attribute transitions.',
    controls: 'Arrow Keys or 5,6,7,8: Slide Tiles, R: Restart',
    type: 'program',
    setup: (spectrum) => setup2048Game(spectrum)
  },
  {
    id: 'beeper_jukebox',
    title: 'Beeper 8-Bit Chiptune Jukebox',
    year: '1984',
    author: 'ZX Sound Laboratory',
    category: 'Music / Sound',
    description: 'Pure 1-bit port 0xFE audio synthesizer playing iconic retro gaming themes (Popcorn, Axel F, Monty on the Run theme, Bach Toccata).',
    controls: '1-4: Select Track, Space: Stop/Play',
    type: 'program',
    setup: (spectrum) => setupBeeperJukebox(spectrum)
  },
  {
    id: 'plasma_demo',
    title: 'Rainbow Attribute Plasma FX',
    year: '1985 / Demoscene',
    author: 'Sinclair Demoscene',
    category: 'Demo',
    description: 'Hypnotic color cycling demo pushing the Spectrum ULA attribute matrix with smooth sinusoidal waves and border synchronizers.',
    controls: 'Space: Change Pattern, 1-3: Speed',
    type: 'program',
    setup: (spectrum) => setupPlasmaDemo(spectrum)
  }
];

/**
 * Setup Snake in memory using machine code & ULA drawing
 */
function setupSnakeGame(spectrum) {
  spectrum.reset();

  // Draw colorful welcome screen in Video Memory
  fillScreenWithText(spectrum, [
    "   ZX RETRO SNAKE 48K   ",
    "========================",
    "",
    "   USE KEYS TO PLAY:    ",
    "   Q - UP               ",
    "   A - DOWN             ",
    "   O - LEFT             ",
    "   P - RIGHT            ",
    "",
    "   PRESS '5' OR SPACE   ",
    "     TO BEGIN GAME!     "
  ], 4, 2, 7, 1); // Yellow on Blue

  // Inject a small Sinclair BASIC launcher at 0x5C00
  injectBasicRunner(spectrum, `
10 BORDER 1: PAPER 1: INK 7: CLS
20 PRINT AT 0,6;"ZX RETRO SNAKE 48K"
30 PRINT AT 1,6;"------------------"
40 LET X=15: LET Y=10: LET DX=1: LET DY=0: LET SC=0: LET L=5
50 DIM SX(100): DIM SY(100)
60 FOR I=1 TO L: LET SX(I)=X-I: LET SY(I)=Y: NEXT I
70 LET FX=INT(RND*30)+1: LET FY=INT(RND*20)+2
80 BORDER 0: CLS
90 PRINT AT 0,0;"SCORE: ";SC;"   HI: 100"
100 PRINT AT FY,FX; INK 6;"*"
110 FOR I=1 TO L: PRINT AT SY(I),SX(I); INK 4;"O": NEXT I
120 LET K$=INKEY$
130 IF K$="o" OR K$="O" THEN IF DX=0 THEN LET DX=-1: LET DY=0
140 IF K$="p" OR K$="P" THEN IF DX=0 THEN LET DX=1: LET DY=0
150 IF K$="q" OR K$="Q" THEN IF DY=0 THEN LET DX=0: LET DY=-1
160 IF K$="a" OR K$="A" THEN IF DY=0 THEN LET DX=0: LET DY=1
170 LET NX=X+DX: LET NY=Y+DY
180 IF NX<0 OR NX>31 OR NY<2 OR NY>21 THEN GOTO 300
190 FOR I=1 TO L: IF SX(I)=NX AND SY(I)=NY THEN GOTO 300: NEXT I
200 PRINT AT SY(L),SX(L);" "
210 FOR I=L TO 2 STEP -1: LET SX(I)=SX(I-1): LET SY(I)=SY(I-1): NEXT I
220 LET SX(1)=NX: LET SY(1)=NY: LET X=NX: LET Y=NY
230 PRINT AT Y,X; INK 4;"O"
240 IF X=FX AND Y=FY THEN BEEP 0.05,20: LET SC=SC+10: LET L=L+1: LET SX(L)=SX(L-1): LET SY(L)=SY(L-1): LET FX=INT(RND*30)+1: LET FY=INT(RND*19)+2: PRINT AT FY,FX; INK 6;"*": PRINT AT 0,7;SC
250 BEEP 0.005,-20
260 GOTO 120
300 BEEP 0.5,-10: BEEP 0.5,-20
310 PRINT AT 10,8; FLASH 1; INK 2;"*** GAME OVER ***"
320 PRINT AT 12,6;"PRESS SPACE TO RESTART"
330 IF INKEY$<>" " THEN GOTO 330
340 RUN
  `);
}

function setup2048Game(spectrum) {
  spectrum.reset();
  injectBasicRunner(spectrum, `
10 BORDER 0: PAPER 0: INK 7: CLS
20 PRINT AT 1,8; INK 6; BRIGHT 1;"2048 ZX SPECTRUM"
30 PRINT AT 2,8; INK 5;"================"
40 DIM B(4,4): LET SC=0
50 FOR Y=1 TO 4: FOR X=1 TO 4: LET B(X,Y)=0: NEXT X: NEXT Y
60 GO SUB 300: GO SUB 300
70 GO SUB 200
80 LET K$=INKEY$: IF K$="" THEN GOTO 80
90 LET MV=0
100 IF K$="5" OR K$="o" THEN GO SUB 400
110 IF K$="8" OR K$="p" THEN GO SUB 500
120 IF K$="7" OR K$="q" THEN GO SUB 600
130 IF K$="6" OR K$="a" THEN GO SUB 700
140 IF MV=1 THEN BEEP 0.02,15: GO SUB 300: GO SUB 200
150 GOTO 80
200 PRINT AT 4,2;"SCORE: "; INK 6; SC
210 FOR Y=1 TO 4: FOR X=1 TO 4
220 LET V=B(X,Y)
230 LET C=7: IF V=2 THEN LET C=7
240 IF V=4 THEN LET C=6
250 IF V=8 THEN LET C=5
260 IF V>=16 THEN LET C=4
270 IF V>=64 THEN LET C=3
280 IF V>=256 THEN LET C=2
290 PRINT AT Y*3+4, X*6; INK C; BRIGHT 1;
300 IF V=0 THEN PRINT " .  ";: RETURN
310 PRINT V;"   ";: NEXT X: NEXT Y: RETURN
320 REM ADD RANDOM TILE
330 LET RX=INT(RND*4)+1: LET RY=INT(RND*4)+1
340 IF B(RX,RY)<>0 THEN GOTO 330
350 LET B(RX,RY)=2: RETURN
400 REM LEFT
410 FOR Y=1 TO 4: FOR X=2 TO 4: IF B(X,Y)>0 THEN IF B(X-1,Y)=0 THEN LET B(X-1,Y)=B(X,Y): LET B(X,Y)=0: LET MV=1
420 NEXT X: NEXT Y: RETURN
500 REM RIGHT
510 FOR Y=1 TO 4: FOR X=3 TO 1 STEP -1: IF B(X,Y)>0 THEN IF B(X+1,Y)=0 THEN LET B(X+1,Y)=B(X,Y): LET B(X,Y)=0: LET MV=1
520 NEXT X: NEXT Y: RETURN
600 REM UP
610 FOR X=1 TO 4: FOR Y=2 TO 4: IF B(X,Y)>0 THEN IF B(X,Y-1)=0 THEN LET B(X,Y-1)=B(X,Y): LET B(X,Y)=0: LET MV=1
620 NEXT Y: NEXT X: RETURN
700 REM DOWN
710 FOR X=1 TO 4: FOR Y=3 TO 1 STEP -1: IF B(X,Y)>0 THEN IF B(X,Y+1)=0 THEN LET B(X,Y+1)=B(X,Y): LET B(X,Y)=0: LET MV=1
720 NEXT Y: NEXT X: RETURN
  `);
}

function setupBeeperJukebox(spectrum) {
  spectrum.reset();
  injectBasicRunner(spectrum, `
10 BORDER 0: PAPER 0: INK 7: CLS
20 PRINT AT 2,4; INK 6; BRIGHT 1;"ZX SPECTRUM BEEPER JUKEBOX"
30 PRINT AT 3,4; INK 5;"=========================="
40 PRINT AT 6,4;"1. AXEL F THEME (SYNTH)"
50 PRINT AT 8,4;"2. RETRO CHIPTUNE FANFARE"
60 PRINT AT 10,4;"3. POCO LOCO ARPEGGIATOR"
70 PRINT AT 12,4;"4. SIREN FX & LASER BLASTS"
80 PRINT AT 16,4; INK 3;"PRESS 1 - 4 TO PLAY TRACK"
90 LET K$=INKEY$: IF K$="" THEN GOTO 90
100 IF K$="1" THEN GO SUB 200
110 IF K$="2" THEN GO SUB 300
120 IF K$="3" THEN GO SUB 400
130 IF K$="4" THEN GO SUB 500
140 GOTO 90
200 REM AXEL F
210 BORDER 2: PRINT AT 18,4; INK 6; FLASH 1;"PLAYING: AXEL F        "
220 BEEP 0.25,5: BEEP 0.25,8: BEEP 0.25,5: BEEP 0.12,5: BEEP 0.25,10: BEEP 0.25,5: BEEP 0.25,3
230 BEEP 0.25,5: BEEP 0.25,12: BEEP 0.25,5: BEEP 0.12,5: BEEP 0.25,13: BEEP 0.25,12: BEEP 0.25,8
240 BEEP 0.25,5: BEEP 0.25,12: BEEP 0.25,17: BEEP 0.25,5: BEEP 0.25,3: BEEP 0.25,3: BEEP 0.25,0: BEEP 0.35,7: BEEP 0.5,5
250 BORDER 0: RETURN
300 REM FANFARE
310 BORDER 4: PRINT AT 18,4; INK 4; FLASH 1;"PLAYING: RETRO FANFARE "
320 FOR N=0 TO 12 STEP 3: BEEP 0.08,N: NEXT N
330 BEEP 0.2,12: BEEP 0.1,7: BEEP 0.3,12: BORDER 0: RETURN
400 REM ARPEGGIOS
410 BORDER 5: PRINT AT 18,4; INK 5; FLASH 1;"PLAYING: ARPEGGIO FLOW "
420 FOR I=1 TO 8: FOR N=0 TO 14 STEP 2: BEEP 0.02,N: NEXT N: NEXT I: BORDER 0: RETURN
500 REM LASERS
510 BORDER 6: PRINT AT 18,4; INK 6; FLASH 1;"PLAYING: SFX SYNTH     "
520 FOR I=1 TO 5: FOR N=30 TO -10 STEP -2: BEEP 0.005,N: NEXT N: NEXT I: BORDER 0: RETURN
  `);
}

function setupPlasmaDemo(spectrum) {
  spectrum.reset();
  injectBasicRunner(spectrum, `
10 BORDER 0: PAPER 0: INK 7: CLS
20 PRINT AT 0,6; INK 6; BRIGHT 1;"SPECTRUM PLASMA FX"
30 FOR Y=2 TO 21: FOR X=0 TO 31
40 LET C=1+INT(3.5+3.5*SIN(X/4)+COS(Y/3))
50 PRINT AT Y,X; INK C; BRIGHT 1;"\u007f"
60 NEXT X: NEXT Y
70 FOR T=0 TO 200
80 BORDER INT(RND*8)
90 NEXT T
100 GOTO 30
  `);
}

function fillScreenWithText(spectrum, lines, startRow, startCol, ink, paper) {
  // Draw direct character glyphs from ROM font at 0x3D00 into video memory
  const romFont = 0x3d00;
  for (let r = 0; r < lines.length; r++) {
    const text = lines[r];
    const yRow = startRow + r;
    if (yRow >= 24) break;

    for (let c = 0; c < text.length; c++) {
      const col = startCol + c;
      if (col >= 32) break;

      const charCode = text.charCodeAt(c);
      // Set attribute
      spectrum.memory[0x5800 + (yRow * 32) + col] = (paper << 3) | ink | 0x40; // Bright

      // Copy 8 font bytes to video scanlines
      if (charCode >= 32 && charCode <= 127) {
        const fontOffset = romFont + (charCode - 32) * 8;
        for (let line = 0; line < 8; line++) {
          const y = (yRow * 8) + line;
          const block = (y >> 6) & 3;
          const row = (y >> 3) & 7;
          const scan = y & 7;
          const addr = 0x4000 + (block << 11) + (scan << 8) + (row << 5) + col;
          spectrum.memory[addr] = spectrum.memory[fontOffset + line];
        }
      }
    }
  }
}

/**
 * Injects a tokenized Sinclair BASIC program directly into RAM
 * and initializes Sinclair BASIC system variables.
 */
function injectBasicRunner(spectrum, basicSource) {
  // Clean tokens map for Sinclair BASIC
  const TOKENS = {
    'RND': 0xa5, 'INKEY$': 0xa6, 'PI': 0xa7, 'FN': 0xa8, 'POINT': 0xa9,
    'SCREEN$': 0xaa, 'ATTR': 0xab, 'AT': 0xac, 'TAB': 0xad, 'VAL$': 0xae,
    'CODE': 0xaf, 'VAL': 0xb0, 'LEN': 0xb1, 'SIN': 0xb2, 'COS': 0xb3,
    'TAN': 0xb4, 'ASN': 0xb5, 'ACS': 0xb6, 'ATN': 0xb7, 'LN': 0xb8,
    'EXP': 0xb9, 'INT': 0xba, 'SQR': 0xbb, 'SGN': 0xbc, 'ABS': 0xbd,
    'PEEK': 0xbe, 'IN': 0xbf, 'USR': 0xc0, 'STR$': 0xc1, 'CHR$': 0xc2,
    'NOT': 0xc3, 'BIN': 0xc4, 'OR': 0xc5, 'AND': 0xc6, '<=': 0xc7,
    '>=': 0xc8, '<>': 0xc9, 'LINE': 0xca, 'THEN': 0xcb, 'TO': 0xcc,
    'STEP': 0xcd, 'DEF FN': 0xce, 'CAT': 0xcf, 'FORMAT': 0xd0, 'MOVE': 0xd1,
    'ERASE': 0xd2, 'OPEN #': 0xd3, 'CLOSE #': 0xd4, 'MERGE': 0xd5, 'VERIFY': 0xd6,
    'BEEP': 0xd7, 'CIRCLE': 0xd8, 'INK': 0xd9, 'PAPER': 0xda, 'FLASH': 0xdb,
    'BRIGHT': 0xdc, 'INVERSE': 0xdd, 'OVER': 0xde, 'OUT': 0xdf, 'LPRINT': 0xe0,
    'LLIST': 0xe1, 'STOP': 0xe2, 'READ': 0xe3, 'DATA': 0xe4, 'RESTORE': 0xe5,
    'NEW': 0xe6, 'BORDER': 0xe7, 'CONTINUE': 0xe8, 'DIM': 0xe9, 'REM': 0xea,
    'FOR': 0xeb, 'GO TO': 0xec, 'GOTO': 0xec, 'GO SUB': 0xed, 'GOSUB': 0xed,
    'INPUT': 0xee, 'LOAD': 0xef, 'LIST': 0xf0, 'LET': 0xf1, 'PAUSE': 0xf2,
    'NEXT': 0xf3, 'POKE': 0xf4, 'PRINT': 0xf5, 'PLOT': 0xf6, 'RUN': 0xf7,
    'SAVE': 0xf8, 'RANDOMIZE': 0xf9, 'IF': 0xfa, 'CLS': 0xfb, 'DRAW': 0xfc,
    'CLEAR': 0xfd, 'RETURN': 0xfe, 'COPY': 0xff
  };

  const lines = basicSource.trim().split('\n');
  let progAddr = 0x5ccb; // Standard PROG area (23755)

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx === -1) continue;

    const lineNum = parseInt(trimmed.substring(0, spaceIdx), 10);
    if (isNaN(lineNum)) continue;

    const rest = trimmed.substring(spaceIdx + 1);

    // Tokenize rest of string
    const tokenized = tokenizeLine(rest, TOKENS);

    const lineLength = tokenized.length + 1; // + 1 for 0x0D Enter

    // Write line header (Big-endian line number, Little-endian length)
    spectrum.memory[progAddr++] = (lineNum >> 8) & 0xff;
    spectrum.memory[progAddr++] = lineNum & 0xff;
    spectrum.memory[progAddr++] = lineLength & 0xff;
    spectrum.memory[progAddr++] = (lineLength >> 8) & 0xff;

    // Write tokenized bytes
    for (const b of tokenized) {
      spectrum.memory[progAddr++] = b;
    }
    spectrum.memory[progAddr++] = 0x0d; // ENTER
  }

  // End of program marker
  spectrum.memory[progAddr++] = 0x80;

  // Set Sinclair BASIC System Variables
  const VARS = progAddr;
  spectrum.memory[0x5c4b] = 0xcb; // PROG = 0x5CCB (23755)
  spectrum.memory[0x5c4c] = 0x5c;
  spectrum.memory[0x5c4d] = VARS & 0xff; // VARS
  spectrum.memory[0x5c4e] = (VARS >> 8) & 0xff;
  spectrum.memory[0x5c4f] = (VARS + 1) & 0xff; // E_LINE
  spectrum.memory[0x5c50] = ((VARS + 1) >> 8) & 0xff;
  spectrum.memory[0x5c53] = (VARS + 2) & 0xff; // WORKSP
  spectrum.memory[0x5c54] = ((VARS + 2) >> 8) & 0xff;
  spectrum.memory[0x5c55] = (VARS + 2) & 0xff; // STKBOT
  spectrum.memory[0x5c56] = ((VARS + 2) >> 8) & 0xff;
  spectrum.memory[0x5c57] = (VARS + 2) & 0xff; // STKEND
  spectrum.memory[0x5c58] = ((VARS + 2) >> 8) & 0xff;

  // Jump to RUN in ROM or start of BASIC interpreter
  spectrum.cpu.sp = 0xff2d;
  spectrum.cpu.pc = 0x12a9; // MAIN_EXEC in Sinclair ROM
  spectrum.cpu.iff1 = true;
  spectrum.cpu.iff2 = true;
}

function tokenizeLine(str, tokens) {
  const result = [];
  let i = 0;

  // Sort tokens by length descending to match longest tokens first (e.g. GO SUB before GO)
  const tokenKeys = Object.keys(tokens).sort((a, b) => b.length - a.length);

  while (i < str.length) {
    let matched = false;
    const substr = str.substring(i);

    for (const key of tokenKeys) {
      if (substr.toUpperCase().startsWith(key)) {
        result.push(tokens[key]);
        i += key.length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      result.push(str.charCodeAt(i));
      i++;
    }
  }

  return result;
}
