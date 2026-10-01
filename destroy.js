// Destroy mode: the little man gets a gun.
//
// When he's spawned, the page's text is redrawn into a pixel world (one cell per
// CSS pixel) laid exactly over the real text, which goes transparent underneath.
// He can stand on the letters, drop through them, climb the edges of the screen,
// and shoot, rocket and grenade the website into rubble. Clanker robots show up
// to weld it back together and robot flies swarm him; both can be shot. Esc puts
// the website back together and he goes back to strolling along the bottom of
// the screen; G hands him the gun again.
//
// index.html calls window.destroyGame.start() from the spawn button, and checks
// window.destroyMode to keep its own animation loop and input handlers out of
// the way while this one is running.
(function () {
    'use strict';

    // Movement tuning (pixels and seconds)
    const GRAVITY = 1700;
    const RUN_SPEED = 200;
    const JUMP_SPEED = 520;
    const FLIP_SPEED = 460;
    const FLIP_TIME = 0.45;
    const MAX_FALL = 850;
    const FAST_FALL = 1300;
    const CHUTE_FALL = 70;
    const CHUTE_SPEED = 130;
    const CLIMB_SPEED = 160;
    const STEP_UP = 7;          // he walks up bumps this tall...
    const STEP_DOWN = 5;        // ...and follows dips this deep without falling
    const HALF_W = 6;           // half the width of his feet
    const EDGE = 12;            // how close he gets to the sides of the screen (half his sprite)
    const HEIGHT = 36;          // feet to top of head
    const SHOULDER = 22;        // feet to shoulder
    const ARM = 7;
    const STEP = 1 / 120;       // physics timestep

    // World
    const SOLID = 96;           // text at least this opaque can be stood on and shot
    const ORIGINAL = 1, RUBBLE = 2;
    const CHAR_RGB = [26, 12, 8];
    const SCORCH = [0, 0.3, 0.55, 0.8];
    const MAX_PARTICLES = window.matchMedia('(pointer: coarse)').matches ? 1600 : 3000;
    const SKIP = 'script, style, noscript, button, #lightbox-modal, #virtual-joystick, #action-buttons, #destroy-hud';

    // His pixel art from index.css: [x, y, colour] offsets of 4px squares in his 24x40 box
    const SKIN = '#FDB22A', BLUE = '#0D6CBC', HAIR = '#000', SHIRT = '#FFFFFF', CANOPY_RED = '#FF5555';
    const BODY = [
        [8, 0, HAIR], [12, 0, HAIR], [8, 4, SKIN], [12, 4, SKIN], [8, 8, SKIN], [12, 8, SKIN],
        [8, 12, SHIRT], [12, 12, SHIRT], [8, 16, BLUE], [12, 16, BLUE], [8, 20, BLUE], [12, 20, BLUE],
    ];
    // Two frames of legs plus the back arm for each pose; the front arm holds the gun
    const POSES = {
        walk: [
            [[4, 12, SKIN], [4, 24, BLUE], [16, 24, BLUE], [4, 28, SKIN], [12, 28, SKIN], [4, 32, SKIN], [16, 32, SKIN]],
            [[4, 14, SKIN], [8, 24, BLUE], [12, 24, BLUE], [4, 28, SKIN], [16, 28, SKIN], [0, 32, SKIN], [20, 32, SKIN]],
        ],
        climb: [
            [[4, 8, SKIN], [4, 24, BLUE], [16, 24, BLUE], [0, 28, SKIN], [20, 28, SKIN]],
            [[4, 4, SKIN], [8, 24, BLUE], [12, 24, BLUE], [4, 28, SKIN], [16, 28, SKIN]],
        ],
        chute: [
            [[0, 4, SKIN], [8, 24, BLUE], [12, 24, BLUE], [8, 28, SKIN], [12, 28, SKIN]],
            [[0, 8, SKIN], [4, 24, BLUE], [16, 24, BLUE], [4, 28, SKIN], [16, 28, SKIN]],
        ],
    };
    const CANOPY = [[0, -4], [4, -8], [8, -10], [12, -10], [16, -8], [20, -4]];

    // Guns are drawn from these at 2px per character; grip and muzzle are in those units.
    // Dark mode gets lighter metal so they don't vanish into the background.
    const GUN_COLORS = {
        light: { k: '#262626', g: '#555555', l: '#8c8c8c', w: '#7a4a22', o: '#5b6b33', t: '#36c6d9' },
        dark: { k: '#6e6e6e', g: '#9a9a9a', l: '#b8b8b8', w: '#9a6a3a', o: '#7d8f4a', t: '#36c6d9' },
    };
    const WEAPONS = [
        {
            name: 'pistol', cooldown: 0.17, speed: 1100, pellets: 1, spread: 0.02, hole: 3.5, pierce: 2, kick: 3, shake: 1, push: 0, sound: 'pistol',
            art: ['gggggggg', 'kkkkkkkk', 'kk......', 'kk......'], grip: [1, 2], muzzle: [8, 1],
        },
        {
            name: 'smg', cooldown: 0.065, speed: 1200, pellets: 1, spread: 0.08, hole: 2.8, pierce: 1, kick: 2, shake: 0.6, push: 0, sound: 'smg',
            art: ['..lllllll..', 'kkkkkkkkkkk', 'kk.kk......', '...kk......', '...kk......'], grip: [3.5, 2], muzzle: [11, 1.5],
        },
        {
            name: 'shotgun', cooldown: 0.65, speed: 950, pellets: 7, spread: 0.22, hole: 3.5, kick: 7, shake: 3, push: 110, sound: 'shotgun',
            art: ['...ggggggggggg', 'wwwkkkkkkkkkkk', 'ww..kk........', 'w.............'], grip: [4.5, 2], muzzle: [14, 1],
        },
        {
            name: 'rocket', cooldown: 0.9, speed: 480, kind: 'rocket', blast: 34, kick: 9, shake: 2, push: 140, sound: 'rocket',
            art: ['.oooooooooooooo.', 'oooooooooooooooo', '.oooooooooooooo.', '....kk..kk......', '....kk..........'], grip: [5, 3.5], muzzle: [16, 1.5],
        },
        {
            name: 'railgun', cooldown: 1.1, kind: 'rail', hole: 3, kick: 10, shake: 5, push: 170, sound: 'rail',
            art: ['..ggggggggggggg', 'kkktttttttttttt', 'kk.ggggggggggg.', 'kk.............'], grip: [1, 2.5], muzzle: [15, 1.5],
        },
    ];
    const GRENADE = { cooldown: 0.5, fuse: 1.6, blast: 42, speed: 520 };

    // Robots (see the robots section)
    const TILE = 16;            // damage is tracked in 16px tiles (markTile shifts by 4)
    const BOT_HP = 4, BOT_SPEED = 80, BOT_H = 22, BOT_REACH = 42, WELD_RATE = 90, WELD_R = 9;
    const MAX_BOTS = 8, MAX_FLIES = 30, FLY_SPEED = 210;
    const FLY_HP = 250, FLY_GROW_HP = 125, FLY_ALONE = 25, FLY_BITE = 1.2;   // FLY_BITE: health per second per fly on him
    const BROOD = 100, GLOB_G = 600, GLOB_DMG = 12, LASER_DMG = 4;
    const JET_THRUST = 2700, JET_MAX = 340;   // BROOD: flies it was carrying when it dies
    const KEEPER_HP = 30, KEEPER_SPEED = 105, KEEPER_DMG = 20, KEEPER_DELAY = 20, KEEPER_AGAIN = 60;
    // he's half as tough again on a phone, where dodging is harder; he heals a point for every REGEN_CELLS of page destroyed
    const MAX_HP = window.matchMedia('(pointer: coarse)').matches ? 150 : 100, BLAST_DMG = 40, REGEN_CELLS = 50;
    const KEEPER_COLORS = {
        light: { h: '#b08d57', n: '#3d3d3d', f: '#FDB22A', s: '#d9c48f', b: '#4a3b2a' },
        dark: { h: '#c9a46a', n: '#6a6a6a', f: '#FDB22A', s: '#d9c48f', b: '#8a6a4a' },
    };
    // the fly guy: beekeeper hat and net, khaki suit (4px per character, like him)
    const KEEPER_BODY = ['.hhhh.', 'hhhhhh', '.nnnn.', '.nffn.', '..ss..', '.ssss.', '.ssss.'];
    const KEEPER_LEGS = [['.s..s.', '.s..s.', 'bb..bb'], ['.s..s.', 's....s', 'b....b']];
    const BOT_COLORS = {
        light: { y: '#f2c230', g: '#9aa3ad', k: '#2b2f33', e: '#2ec5ff', d: '#6b737c', b: '#c9a227', m: '#4a5159', w: '#bfe3ff' },
        dark: { y: '#f2c230', g: '#aab3bd', k: '#6a7178', e: '#2ec5ff', d: '#7d858e', b: '#c9a227', m: '#8a929a', w: '#bfe3ff' },
    };
    const BOT_BODY = ['...yyy...', '..yyyyy..', '.yyyyyyy.', '.ggggggg.', '.gkeeekg.', '.ggggggg.', '..ddddd..', 'mddbddddm', 'mdddddddm'];
    const BOT_LEGS = [['..k...k..', '.kk...kk.'], ['...k.k...', '..kk.kk..']];
    // A clanker in pieces, on the same grid as BOT_BODY + BOT_LEGS: the rows each part
    // covers, where its middle is relative to the feet (`at`), and where it comes in
    // from when it's fitted (`from`)
    const PARTS = {
        legs: { rows: [[9, '..k...k..'], [10, '.kk...kk.']], at: [0, -3], from: [0, 10] },
        chassis: { rows: [[6, '..ddddd..'], [7, '.ddbdddd.'], [8, '.ddddddd.']], at: [0, -7], from: [0, -24] },
        armL: { rows: [[7, 'm........'], [8, 'm........']], at: [-8, -6], from: [-10, -4] },
        armR: { rows: [[7, '........m'], [8, '........m']], at: [8, -6], from: [10, -4] },
        head: { rows: [[3, '.ggggggg.'], [4, '.gkoookg.'], [5, '.ggggggg.']], at: [0, -13], from: [0, -16] },
        hat: { rows: [[0, '...yyy...'], [1, '..yyyyy..'], [2, '.yyyyyyy.']], at: [0, -19], from: [0, -22] },
        eyes: { rows: [[4, '...eee...']], at: [0, -13] },
    };
    const PART_ORDER = ['legs', 'chassis', 'armL', 'armR', 'head', 'hat'];
    const ASSEMBLY = [['chassis', 'legs'], ['armL', 'armR', 'head'], ['hat', 'power']];   // what each gantry does
    const CONVEYOR_SPEED = 34;
    const FLY_ART = [
        ['ww...ww', '.wwkww.', '..kek..', '..kkk..', '...k...'],
        ['.......', '..kkk..', 'wwkekww', 'w.kkk.w', '...k...'],
    ];

    const DEBRIS = 0, SPARK = 1, SHELL = 2, SMOKE = 3, FIRE = 4, SPLAT = 5;
    const KEYS = {
        KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
        KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', Space: 'jump',
    };

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;

    // World state: one cell per CSS pixel of the document, row-major
    let W = 0, H = 0;
    let alp = null, pal = null, shade = null, kind = null;
    let worldCanvas = null, worldCtx = null, worldImg = null, px32 = null;
    let dirtyX0, dirtyY0, dirtyX1, dirtyY1;
    const palette = [null, [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];   // 1: text, 2: links, 3-6: the space above, 7-10: the shell
    let colorCache = new Map();
    let solidTotal = 0, solidRemoved = 0;

    let active = false, starting = false;
    let view = null, ctx = null, dpr = 1;
    let hud = null, pctEl = null, muteEl = null, killsEl = null, hpFill = null, hpNum = null, shownPct = -1, shownKills = '', shownHp = -1;
    let raf = 0, lastTime = 0, acc = 0, rebuildTimer = 0, startToken = 0, camHold = 0;
    let helpOn = window.matchMedia('(min-width: 1272px) and (pointer: fine)').matches;
    let guy = null;
    let weapon = 0, cooldown = 0, nadeCooldown = 0, firing = false, shotQueued = false, muzzleFlash = 0, shakeAmt = 0;
    let bullets = [], rockets = [], nades = [], parts = [], beams = [], flashes = [];
    let scrollX = 0, scrollY = 0, fly = null, flyRect = null, toggle = null, toggleRect = null, toggleCd = 0;
    let origAlp = null, origPal = null, tileDirty = null, dirtyTiles = new Set(), TW = 0, hadDamage = false;
    let bots = [], flies = [], clock = 0, botTimer = 3, lastSay = -10, scrapped = 0, swatted = 0;
    let keeper = null, keeperWait = 0, keepersBeaten = 0, stack = null, deaths = 0, regen = 0;
    const bigFly = { alive: false, hp: 0, max: 0, shownHp: 0, stage: 0, alone: 0, spawnT: 0, spitT: 0, engaged: false, deathT: 0, startSrc: '' };
    let botsOn = true;
    let scene = 'site', siteState = null, skyState = null, sky = null, portal = null, robotsEvil = false;
    let owned = new Set([0]), pickups = [];
    let weather = {}, shell = null, shellState = null, hasJetpack = false, jetSprite = null;
    let globs = [], lasers = [], fade = null, siteWords = [], factoryDown = false, portalArmed = true, tauntN = 0, tauntT = 0, retortT = 0;
    const splatImg = new Image();
    splatImg.src = 'assets/squashed-fly.webp';
    try { botsOn = localStorage.getItem('destroyBots') !== '0'; } catch (_) { /* storage unavailable */ }
    const pointer = { has: false, x: 0, y: 0, touchId: null };
    const keys = {};
    const tapped = {};   // presses not yet seen by a physics step, so quick taps still count

    let gunColors = GUN_COLORS.light, botColors = BOT_COLORS.light, keeperColors = KEEPER_COLORS.light, bgColor = '#fff';
    let gunSprites = [], botSprites = null, flySprites = [], keeperSprites = null, partSprites = {};

    // Pixel art from strings, `px` pixels per character; `white` gives the flash when something is hit
    function artCanvas(rows, colors, white, px = 2) {
        const c = document.createElement('canvas');
        c.width = rows[0].length * px;
        c.height = rows.length * px;
        const g = c.getContext('2d');
        rows.forEach((row, y) => [...row].forEach((ch, x) => {
            if (colors[ch]) {
                g.fillStyle = white ? '#ffffff' : colors[ch];
                g.fillRect(x * px, y * px, px, px);
            }
        }));
        return c;
    }

    function buildSprites() {
        gunSprites = WEAPONS.map(w => artCanvas(w.art, gunColors));
        const evil = { ...botColors, e: '#ff2020' };
        botSprites = {
            normal: BOT_LEGS.map(legs => artCanvas(BOT_BODY.concat(legs), botColors)),
            evil: BOT_LEGS.map(legs => artCanvas(BOT_BODY.concat(legs), evil)),
            hurt: BOT_LEGS.map(legs => artCanvas(BOT_BODY.concat(legs), botColors, true)),
        };
        flySprites = FLY_ART.map(rows => artCanvas(rows, { ...botColors, e: '#ff4b3a' }));
        const partRows = p => {
            const rows = Array.from({ length: 11 }, () => '.........');
            for (const [r, str] of p.rows) rows[r] = str;
            return rows;
        };
        for (const [name, p] of Object.entries(PARTS)) partSprites[name] = artCanvas(partRows(p), { ...botColors, o: '#3a3f45' });
        partSprites.eyesEvil = artCanvas(partRows(PARTS.eyes), { e: '#ff2020' });
        jetSprite = artCanvas(['.kk.kk.', 'kggkggk', 'kggkggk', 'kggkggk', '.oo.oo.'], { k: '#2b2f33', g: '#8c96a0', o: '#ff8a2a' });
        keeperSprites = {
            normal: KEEPER_LEGS.map(legs => artCanvas(KEEPER_BODY.concat(legs), keeperColors, false, 4)),
            hurt: KEEPER_LEGS.map(legs => artCanvas(KEEPER_BODY.concat(legs), keeperColors, true, 4)),
        };
    }

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const approach = (v, target, d) => v < target ? Math.min(target, v + d) : Math.max(target, v - d);
    const rand = (lo, hi) => lo + Math.random() * (hi - lo);

    // ---------------------------------------------------------------- the world

    const colorCtx = document.createElement('canvas').getContext('2d');
    function parseColor(str) {
        str = (str || '').trim();
        if (!str) return null;
        colorCtx.fillStyle = '#000';
        colorCtx.fillStyle = str;
        const v = colorCtx.fillStyle;
        if (v[0] === '#') return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
        const m = v.match(/[\d.]+/g);
        return m ? [+m[0], +m[1], +m[2]] : null;
    }

    // Colours come from the theme variables rather than computed styles, because
    // the real text is transparent while we're running and the theme can change.
    function readPalette() {
        const root = getComputedStyle(document.documentElement);
        palette[1] = parseColor(root.getPropertyValue('--text-color')) || [0, 0, 0];
        palette[2] = parseColor(root.getPropertyValue('--link-color')) || palette[1];
        colorCache = new Map();
        const [r, g, b] = parseColor(root.getPropertyValue('--bg-color')) || [255, 255, 255];
        const dark = r * 0.299 + g * 0.587 + b * 0.114 < 128;
        palette[3] = dark ? [154, 163, 173] : [92, 99, 107];
        palette[4] = [200, 100, 30];
        palette[5] = dark ? [169, 139, 255] : [122, 79, 214];
        palette[6] = dark ? [70, 210, 230] : [31, 155, 176];
        palette[7] = [45, 226, 230];
        palette[8] = [255, 63, 164];
        palette[9] = [246, 224, 94];
        palette[10] = [154, 215, 255];
        gunColors = dark ? GUN_COLORS.dark : GUN_COLORS.light;
        botColors = dark ? BOT_COLORS.dark : BOT_COLORS.light;
        keeperColors = dark ? KEEPER_COLORS.dark : KEEPER_COLORS.light;
        bgColor = `rgb(${r},${g},${b})`;
        buildSprites();
    }

    function cellColor(p, s) {
        const key = p * 4 + s;
        let c = colorCache.get(key);
        if (!c) {
            const [r, g, b] = mix(palette[p], s);
            c = `rgb(${r | 0},${g | 0},${b | 0})`;
            colorCache.set(key, c);
        }
        return c;
    }

    function mix(rgb, s) {
        if (!s) return rgb;
        const k = SCORCH[s];
        return [rgb[0] + (CHAR_RGB[0] - rgb[0]) * k, rgb[1] + (CHAR_RGB[1] - rgb[1]) * k, rgb[2] + (CHAR_RGB[2] - rgb[2]) * k];
    }

    // Draw every visible character of the page where the browser laid it out, then
    // read the pixels back. Text is drawn red and links green so the readback tells
    // us which palette colour each cell should use.
    function rasterize() {
        const root = document.documentElement;
        W = root.clientWidth;
        H = Math.min(16000, Math.max(root.scrollHeight, window.innerHeight));
        const off = document.createElement('canvas');
        off.width = W;
        off.height = H;
        const c = off.getContext('2d', { willReadFrequently: true });
        c.textBaseline = 'alphabetic';
        const sx = window.scrollX, sy = window.scrollY;
        const range = document.createRange();
        const metrics = new Map();
        let lowest = 0;
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const text = node.nodeValue;
            if (!text.trim()) continue;
            const el = node.parentElement;
            if (!el || el.closest(SKIP)) continue;
            const style = getComputedStyle(el);
            if (style.visibility !== 'visible') continue;

            const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            c.font = font;
            let m = metrics.get(font);
            if (!m) {
                const t = c.measureText('Hg');
                m = { asc: t.fontBoundingBoxAscent ?? t.actualBoundingBoxAscent, desc: t.fontBoundingBoxDescent ?? t.actualBoundingBoxDescent };
                metrics.set(font, m);
            }
            c.fillStyle = el.closest('a') ? '#00ff00' : '#ff0000';
            const word = el.closest('a') && text.trim();
            if (word && word.length <= 24 && !siteWords.includes(word)) siteWords.push(word);
            const transform = style.textTransform;
            const baseline = r => r.top + sy + (r.height - (m.asc + m.desc)) / 2 + m.asc;

            let i = 0;
            for (const ch of text) {
                if (ch.trim()) {
                    range.setStart(node, i);
                    range.setEnd(node, i + ch.length);
                    const r = range.getClientRects()[0];
                    if (r && r.width > 0 && r.height > 0) {
                        const glyph = transform === 'uppercase' ? ch.toUpperCase() : transform === 'lowercase' ? ch.toLowerCase() : ch;
                        c.fillText(glyph, r.left + sx, baseline(r));
                        lowest = Math.max(lowest, r.bottom + sy);
                    }
                }
                i += ch.length;
            }

            if (el.closest('u')) {
                const size = parseFloat(style.fontSize);
                range.selectNodeContents(node);
                for (const r of range.getClientRects()) {
                    if (r.width < 1) continue;
                    const thick = Math.max(1, Math.round(size / 16));
                    c.fillRect(r.left + sx, Math.round(baseline(r)) + Math.max(1, Math.ceil(thick / 2)), r.width, thick);
                }
            }
        }

        // The floor sits just under the last line, not at the bottom of the page's
        // trailing whitespace, so he can always jump back up onto the text
        H = Math.min(H, Math.max(Math.ceil(window.innerHeight / 2), Math.ceil(lowest) + 40));
        const data = c.getImageData(0, 0, W, H).data;
        const n = W * H;
        alp = new Uint8Array(n);
        pal = new Uint8Array(n);
        shade = new Uint8Array(n);
        kind = new Uint8Array(n);
        solidTotal = 0;
        solidRemoved = 0;
        for (let i = 0, q = 0; i < n; i++, q += 4) {
            const a = data[q + 3];
            if (a < 16) continue;
            alp[i] = a;
            pal[i] = data[q] >= data[q + 1] ? 1 : 2;
            kind[i] = ORIGINAL;
            if (a >= SOLID) solidTotal++;
        }
        // what the clankers repair back to
        origAlp = alp.slice();
        origPal = pal.slice();
        TW = Math.ceil(W / TILE);
        tileDirty = new Uint8Array(TW * Math.ceil(H / TILE));
        dirtyTiles = new Set();
        hadDamage = false;

        worldCanvas = document.createElement('canvas');
        worldCanvas.width = W;
        worldCanvas.height = H;
        worldCtx = worldCanvas.getContext('2d');
        worldImg = worldCtx.createImageData(W, H);
        px32 = new Uint32Array(worldImg.data.buffer);
        repaint();
    }

    function paintCell(i) {
        const a = alp[i];
        if (!a) {
            px32[i] = 0;
            return;
        }
        const [r, g, b] = mix(palette[pal[i]], shade[i]);
        px32[i] = ((a << 24) | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0)) >>> 0;
    }

    function repaint() {
        for (let i = 0; i < px32.length; i++) paintCell(i);
        worldCtx.putImageData(worldImg, 0, 0);
        dirtyX0 = dirtyY0 = Infinity;
        dirtyX1 = dirtyY1 = -Infinity;
    }

    function markDirty(x0, y0, x1, y1) {
        if (x0 < dirtyX0) dirtyX0 = x0;
        if (y0 < dirtyY0) dirtyY0 = y0;
        if (x1 > dirtyX1) dirtyX1 = x1;
        if (y1 > dirtyY1) dirtyY1 = y1;
    }

    function flushWorld() {
        if (dirtyX1 < dirtyX0) return;
        worldCtx.putImageData(worldImg, 0, 0, dirtyX0, dirtyY0, dirtyX1 - dirtyX0 + 1, dirtyY1 - dirtyY0 + 1);
        dirtyX0 = dirtyY0 = Infinity;
        dirtyX1 = dirtyY1 = -Infinity;
    }

    // The bottom of the page is solid floor; the sides and sky are open.
    function solidAt(x, y) {
        if (y >= H) return scene === 'site';
        if (x < 0 || x >= W || y < 0) return false;
        return alp[y * W + x] >= SOLID;
    }

    // A cell he can stand on: solid, with nothing solid on top of it
    function isSurface(x, r) {
        if (r >= H) return scene === 'site';
        if (r < 0 || x < 0 || x >= W) return false;
        const i = r * W + x;
        return alp[i] >= SOLID && (r === 0 || alp[i - W] < SOLID);
    }

    // Topmost surface under his feet between rows `from` and `to`, or null
    function surfaceBetween(px, from, to) {
        from = Math.max(0, from);
        to = Math.min(H, to);
        const c0 = Math.max(0, Math.floor(px - HALF_W)), c1 = Math.min(W - 1, Math.floor(px + HALF_W));
        for (let r = from; r <= to; r++) {
            for (let c = c0; c <= c1; c++) if (isSurface(c, r)) return r;
        }
        return null;
    }

    // Where his feet go while he walks: the top of what he's standing on, a bump
    // joined to it that's low enough to step onto, or a dip he can follow. Surfaces
    // that only come near his feet without touching the ground he's on (the
    // descenders of the line above, say) don't count, or he'd climb up through them.
    function groundUnder(px, py) {
        const y = Math.round(py);
        const c0 = Math.max(0, Math.floor(px - HALF_W)), c1 = Math.min(W - 1, Math.floor(px + HALF_W));
        let best = null;
        for (let c = c0; c <= c1; c++) {
            let r = null;
            if (solidAt(c, y)) {
                let top = y;
                while (top > y - STEP_UP && solidAt(c, top - 1)) top--;
                if (!solidAt(c, top - 1)) r = top;
            } else {
                for (let k = y + 1; k <= y + STEP_DOWN; k++) {
                    if (solidAt(c, k)) {
                        r = k;
                        break;
                    }
                }
            }
            if (r !== null && (best === null || r < best)) best = r;
        }
        return best;
    }

    function feetInSolid(px, py) {
        const r = Math.floor(py);
        if (r >= H) return false;
        const c0 = Math.max(0, Math.floor(px - HALF_W)), c1 = Math.min(W - 1, Math.floor(px + HALF_W));
        for (let y = Math.max(0, r - 1); y <= Math.min(H - 1, r + 1); y++) {
            for (let c = c0; c <= c1; c++) if (alp[y * W + c] >= SOLID) return true;
        }
        return false;
    }

    // First solid point on the segment, or null
    function trace(x0, y0, x1, y1) {
        const dx = x1 - x0, dy = y1 - y0;
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
        for (let i = 0; i <= n; i++) {
            const x = x0 + dx * i / n, y = y0 + dy * i / n;
            if (solidAt(Math.floor(x), Math.floor(y))) return { x, y };
        }
        return null;
    }

    // Clear a disc of the world. Some of what was there flies off as debris,
    // either away from the centre (explosions) or back along (fx, fy) (bullets).
    function carve(cx, cy, r, o) {
        const scorch = o.scorch || 0, rr = r + scorch;
        const x0 = Math.max(0, Math.floor(cx - rr)), x1 = Math.min(W - 1, Math.ceil(cx + rr));
        const y0 = Math.max(0, Math.floor(cy - rr)), y1 = Math.min(H - 1, Math.ceil(cy + rr));
        if (x0 > x1 || y0 > y1) return 0;
        const r2 = r * r, rr2 = rr * rr, inner2 = (r + scorch * 0.5) ** 2;
        const removedBefore = solidRemoved;
        let hits = 0;
        for (let y = y0; y <= y1; y++) {
            const dy = y + 0.5 - cy;
            for (let x = x0; x <= x1; x++) {
                const i = y * W + x;
                const a = alp[i];
                if (!a) continue;
                const dx = x + 0.5 - cx, d2 = dx * dx + dy * dy;
                if (d2 <= r2) {
                    if (a >= SOLID) {
                        hits++;
                        if (kind[i] === ORIGINAL) {
                            solidRemoved++;
                            regen++;
                            hadDamage = true;
                        }
                        if (Math.random() < o.debris && parts.length < MAX_PARTICLES) {
                            let vx, vy;
                            const v = o.speed * rand(0.3, 1);
                            if (o.fx === undefined) {
                                const d = Math.sqrt(d2) || 1;
                                vx = dx / d * v + rand(-30, 30);
                                vy = dy / d * v - rand(60, 180);
                            } else {
                                vx = o.fx * v + rand(-0.5, 0.5) * o.speed;
                                vy = o.fy * v - rand(40, 140);
                            }
                            parts.push({ type: DEBRIS, x: x + 0.5, y: y + 0.5, vx, vy, life: 8, pal: pal[i], shade: shade[i] });
                        }
                    }
                    alp[i] = pal[i] = shade[i] = kind[i] = 0;
                    px32[i] = 0;
                    markTile(x, y);
                } else if (scorch && d2 <= rr2 && shade[i] < 3) {
                    shade[i] = Math.min(3, shade[i] + (d2 <= inner2 ? 2 : 1));
                    paintCell(i);
                    markTile(x, y);
                }
            }
        }
        markDirty(x0, y0, x1, y1);
        if (scene === 'sky' && solidRemoved > removedBefore) turnEvil();
        return hits;
    }

    // Debris that lands becomes rubble, sliding off piles like sand
    function settle(x, y, p, s) {
        let cx = clamp(Math.floor(x), 0, W - 1), cy = clamp(Math.floor(y), 0, H - 1);
        for (let k = 0; k < 8 && cy > 0 && alp[cy * W + cx]; k++) cy--;
        if (alp[cy * W + cx]) return;
        for (let k = 0; k < 40 && cy + 1 < H; k++) {
            const below = (cy + 1) * W;
            if (!alp[below + cx]) break;
            const d = Math.random() < 0.5 ? -1 : 1;
            if (cx + d >= 0 && cx + d < W && !alp[below + cx + d] && !alp[cy * W + cx + d]) cx += d;
            else if (cx - d >= 0 && cx - d < W && !alp[below + cx - d] && !alp[cy * W + cx - d]) cx -= d;
            else break;
            cy++;
        }
        // slid off the edge of something: fall the rest of the way as debris
        if (cy + 1 < H && !alp[(cy + 1) * W + cx]) {
            if (parts.length < MAX_PARTICLES) parts.push({ type: DEBRIS, x: cx + 0.5, y: cy + 0.5, vx: 0, vy: 0, life: 8, pal: p, shade: s });
            return;
        }
        const i = cy * W + cx;
        alp[i] = 255;
        pal[i] = p;
        shade[i] = s;
        kind[i] = RUBBLE;
        paintCell(i);
        markDirty(cx, cy, cx, cy);
        markTile(cx, cy);
    }

    // ------------------------------------------------------------------ the guy

    function newGuy(x, y, chute) {
        return {
            x, y, vx: 0, vy: 0, grounded: false, state: chute ? 'chute' : 'air', forceChute: chute,
            jumps: 1, facing: 1, aim: 0, wall: 0, wallPush: 0, coyote: 0, dropping: false,
            spin: 0, walk: 0, kick: 0, jumpHeld: false, spaceHeld: false, downHeld: false, groundTime: 0,
            hp: MAX_HP, hurtT: 0, dead: false, deadT: 0, deadRot: 0,
        };
    }

    // Flies, the fly guy and his own explosions wear him down; wrecking the page heals him
    function hurtGuy(amount) {
        const g = guy;
        if (g.dead || amount <= 0) return;
        g.hp -= amount;
        if (amount >= 1) {
            g.hurtT = 0.12;
            sfx('hurt');
            if (amount >= 4) buzz(20);
        }
        if (g.hp > 0) return;
        g.hp = 0;
        g.dead = true;
        g.deadT = 1.8;
        g.deadRot = 0;
        g.vx = rand(-120, 120);
        g.vy = -380;
        g.state = 'air';
        g.grounded = false;
        deaths++;
        firing = shotQueued = padFire = false;
        buzz([60, 40, 120]);
        addShake(6);
        sfx('oof');
        if (keeper && !keeper.dying) say(keeper, KEEPER_LINES.win, true);
    }

    function healGuy() {
        if (regen < REGEN_CELLS) return;
        if (!guy.dead) guy.hp = Math.min(MAX_HP, guy.hp + Math.floor(regen / REGEN_CELLS));
        regen %= REGEN_CELLS;
    }

    function input() {
        const kp = window.keysPressed || {};   // the touch joystick in index.html writes here
        return {
            left: !!(keys.left || kp.ArrowLeft),
            right: !!(keys.right || kp.ArrowRight),
            up: !!(keys.up || kp.ArrowUp),
            down: !!(keys.down || kp.ArrowDown),
            space: !!keys.jump,
            tapped: { up: !!tapped.up, down: !!tapped.down, jump: !!tapped.jump },
        };
    }

    function updateGuy(dt) {
        const g = guy, k = input();
        // with the jetpack, space is the jetpack rather than jump
        const jumpHeld = k.up || (k.space && !hasJetpack);
        let jumpPressed = (jumpHeld && !g.jumpHeld) || k.tapped.up || (k.tapped.jump && !hasJetpack);
        g.jetting = hasJetpack && k.space && !g.dead;
        const swim = submerged();
        const spacePressed = (k.space && !g.spaceHeld) || k.tapped.jump;
        const downPressed = (k.down && !g.downHeld) || k.tapped.down;
        tapped.up = tapped.down = tapped.jump = false;
        g.jumpHeld = jumpHeld;
        g.spaceHeld = k.space;
        g.downHeld = k.down;
        const dir = (k.right ? 1 : 0) - (k.left ? 1 : 0);
        g.spin = Math.max(0, g.spin - dt);
        g.coyote = Math.max(0, g.coyote - dt);
        g.kick = Math.max(0, g.kick - dt * 40);
        g.hurtT -= dt;

        if (g.dead) {
            // tumble off the screen, then parachute back in at full health
            g.vy += GRAVITY * dt;
            g.x += g.vx * dt;
            g.y += g.vy * dt;
            g.deadRot += dt * 10;
            if ((g.deadT -= dt) <= 0) {
                guy = newGuy(clamp(g.x, EDGE, W - EDGE), Math.max(HEIGHT, scrollY + 20), true);
                guy.facing = g.facing;
            }
            return;
        }

        if (g.state === 'climb') {
            g.x = g.wall < 0 ? EDGE : W - EDGE;
            const climb = (k.down ? 1 : 0) - (k.up ? 1 : 0);
            g.vx = 0;
            g.vy = climb * CLIMB_SPEED;
            if (climb) g.walk += dt;
            const y0 = g.y;
            g.y = Math.max(canRiseOut() ? -10 : HEIGHT, g.y + g.vy * dt);
            if (g.y < 0) transition(riseOut);
            if (climb > 0) {
                const land = surfaceBetween(g.x, Math.ceil(y0), Math.floor(g.y));
                if (land !== null) {
                    g.y = land;
                    g.vy = 0;
                    g.grounded = true;
                    g.groundTime = 0;
                    g.state = 'ground';
                    g.jumps = 0;
                    return;
                }
            }
            if (spacePressed || dir === -g.wall) {
                g.state = 'air';
                g.vx = -g.wall * 260;
                g.vy = spacePressed ? -JUMP_SPEED * 0.85 : 0;
                g.jumps = 1;
                g.x -= g.wall;
            }
            return;
        }

        // Running. Blasts can throw him faster than he runs; let that carry.
        const speed = (g.state === 'chute' ? CHUTE_SPEED : RUN_SPEED) * (swim ? 0.7 : 1);
        let accel = g.grounded ? 2400 : 1300;
        if (Math.abs(g.vx) > speed && Math.sign(g.vx) !== -dir) accel = g.grounded ? 1200 : 350;
        g.vx = approach(g.vx, dir * speed, accel * dt);
        g.x += g.vx * dt;
        if (g.grounded && Math.abs(g.vx) > 20) g.walk += dt;

        // The edges of the screen are walls he can climb, like before
        if (g.x <= EDGE || g.x >= W - EDGE) {
            const side = g.x <= EDGE ? -1 : 1;
            g.x = side < 0 ? EDGE : W - EDGE;
            g.vx = 0;
            if (dir === side) {
                g.wallPush += dt;
                if (!g.grounded || k.up || g.wallPush > 0.15) {
                    g.state = 'climb';
                    g.wall = side;
                    g.grounded = false;
                    g.forceChute = false;
                    g.spin = 0;
                    g.vy = 0;
                    return;
                }
            } else g.wallPush = 0;
        } else g.wallPush = 0;

        if (g.grounded && g.jetting) {
            g.grounded = false;
            g.vy = -120;
            g.jumps = 1;
        }
        if (g.grounded) {
            g.groundTime += dt;
            if (jumpPressed) {
                g.vy = -JUMP_SPEED;
                g.grounded = false;
                g.jumps = 1;
                jumpPressed = false;   // this press was the jump, not the flip
            } else if ((downPressed || (k.down && g.groundTime > 0.2)) && g.y < H) {
                // drop through the line he's standing on (holding S keeps going, a line at a time)
                g.grounded = false;
                g.dropping = true;
                g.y += 1;
                g.vy = 60;
                g.jumps = 1;
            } else {
                const ground = groundUnder(g.x, g.y);
                if (ground === null) {
                    g.grounded = false;
                    g.coyote = 0.08;
                    g.jumps = 1;
                    g.vy = 0;
                } else {
                    g.y = ground;
                    g.vy = 0;
                }
            }
        }

        if (!g.grounded) {
            if (jumpPressed && swim) g.vy = -300;   // a swimming stroke
            else if (jumpPressed) {
                if (g.coyote > 0) {
                    g.vy = -JUMP_SPEED;
                    g.coyote = 0;
                } else if (g.jumps < 2) {
                    g.vy = -FLIP_SPEED;
                    g.jumps = 2;
                    g.spin = FLIP_TIME;
                    g.forceChute = false;
                }
            }
            const gliding = (jumpHeld || g.forceChute) && g.vy > 0 && !k.down && g.spin <= 0 && !swim && !g.jetting;
            const vy0 = g.vy;
            g.vy += GRAVITY * (k.down ? 1.8 : 1) * (swim ? 0.25 : 1) * dt;
            if (gliding) g.vy = Math.min(g.vy, Math.max(CHUTE_FALL, vy0 - 1800 * dt));
            if (g.jetting) {
                g.vy = Math.max(-JET_MAX, g.vy - JET_THRUST * dt);
                if (Math.random() < 0.6 && parts.length < MAX_PARTICLES) {
                    parts.push({ type: FIRE, x: g.x - g.facing * 7 + rand(-2, 2), y: g.y - 10, vx: rand(-20, 20), vy: rand(150, 260), life: rand(0.15, 0.3), max: 0.3, size: rand(2, 4) });
                }
                sfx('jet');
            }
            g.vy = Math.min(g.vy, swim ? 110 : k.down ? FAST_FALL : MAX_FALL);
            g.state = gliding ? 'chute' : 'air';

            const y0 = g.y, y1 = g.y + g.vy * dt;
            let land = null;
            if (g.vy > 0) {
                // when dropping, ignore the line he's falling through until his feet are clear of it
                if (g.dropping && !feetInSolid(g.x, y1)) g.dropping = false;
                if (!g.dropping) land = surfaceBetween(g.x, Math.ceil(y0), Math.floor(y1));
            }
            if (land !== null) {
                if (g.vy > 500) dust(g.x, land, 6);
                g.y = land;
                g.vy = 0;
                g.grounded = true;
                g.groundTime = 0;
                g.jumps = 0;
                g.spin = 0;
                g.forceChute = false;
            } else {
                g.y = y1;
                if (g.y < 0 && canRiseOut()) transition(riseOut);
                else if (g.y < 0) {
                    g.y = 0;
                    g.vy = Math.max(0, g.vy);
                }
                if (scene !== 'site' && g.y > H + 30) transition(() => (scene === 'sky' ? exitSky('fall') : exitShell()));
            }
        }
        if (g.grounded) g.state = 'ground';
    }

    // The top of the website is sealed until the fly's dead, and the top of the
    // factory level is out of reach without the jetpack
    function canRiseOut() {
        return scene === 'site' ? !bigFly.alive : scene === 'sky' && hasJetpack;
    }

    function riseOut() {
        if (scene === 'site') enterSky('climb');
        else if (scene === 'sky') enterShell();
    }

    function shoulder() {
        return { x: guy.x + guy.facing, y: guy.y - SHOULDER };
    }

    function updateAim() {
        const s = shoulder();
        const target = pointer.has ? { x: pointer.x + scrollX, y: pointer.y + scrollY } : padFire ? autoTarget() : null;
        if (target) {
            if (Math.abs(target.x - guy.x) > 2) guy.facing = target.x > guy.x ? 1 : -1;
            guy.aim = Math.atan2(target.y - s.y, target.x - s.x);
        } else {
            if (guy.vx > 5) guy.facing = 1;
            else if (guy.vx < -5) guy.facing = -1;
            guy.aim = guy.facing > 0 ? 0 : Math.PI;
        }
        if (guy.state === 'climb') guy.facing = guy.wall;
    }

    function gunPose() {
        const s = shoulder(), a = guy.aim, cos = Math.cos(a), sin = Math.sin(a);
        const reach = ARM - guy.kick;
        return { s, a, cos, sin, flip: cos < 0 ? -1 : 1, hx: s.x + cos * reach, hy: s.y + sin * reach, reach };
    }

    function muzzleOf(w, pose) {
        const mx = (w.muzzle[0] - w.grip[0]) * 2, my = (w.muzzle[1] - w.grip[1]) * 2 * pose.flip;
        return { x: pose.hx + pose.cos * mx - pose.sin * my, y: pose.hy + pose.sin * mx + pose.cos * my };
    }

    // ------------------------------------------------------------------ weapons

    function fire() {
        if (guy.dead) return;
        const w = WEAPONS[weapon], pose = gunPose(), m = muzzleOf(w, pose);
        cooldown = w.cooldown;
        guy.kick = w.kick;
        muzzleFlash = 0.05;
        addShake(w.shake);
        sfx(w.sound);
        if (w.push) {
            guy.vx -= pose.cos * w.push;
            if (!guy.grounded && guy.state !== 'climb') guy.vy -= pose.sin * w.push * 0.7;
        }
        if (w.kind === 'rocket') {
            rockets.push({ x: m.x, y: m.y, vx: pose.cos * w.speed, vy: pose.sin * w.speed, life: 3, blast: w.blast });
            return;
        }
        if (w.kind === 'rail') {
            rail(m.x, m.y, pose.cos, pose.sin, w.hole);
            return;
        }
        for (let i = 0; i < w.pellets; i++) {
            const a = pose.a + rand(-w.spread, w.spread), v = w.speed * rand(0.9, 1.1);
            bullets.push({ x: m.x, y: m.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.5, hole: w.hole, pierce: w.pierce || 0 });
        }
        if (parts.length < MAX_PARTICLES) {
            parts.push({ type: SHELL, x: pose.hx, y: pose.hy, vx: -guy.facing * rand(40, 110), vy: -rand(120, 220), life: 1.2, bounces: 0 });
        }
    }

    function throwGrenade() {
        if (!active || nadeCooldown > 0 || guy.dead) return;
        nadeCooldown = GRENADE.cooldown;
        const s = shoulder(), t = pointer.has ? null : autoTarget();
        const a = pointer.has ? guy.aim : t ? Math.atan2(t.y - s.y - 40, t.x - s.x) : (guy.facing > 0 ? -0.5 : Math.PI + 0.5);
        nades.push({
            x: s.x, y: s.y,
            vx: Math.cos(a) * GRENADE.speed + guy.vx * 0.5,
            vy: Math.sin(a) * GRENADE.speed + Math.min(0, guy.vy) * 0.3,
            fuse: GRENADE.fuse, spin: 0,
        });
        sfx('throw');
    }

    function rail(x, y, cos, sin, hole) {
        const max = Math.hypot(W, H);
        let len = 0, flyHit = false;
        for (; len < max; len += 2) {
            const px = x + cos * len, py = y + sin * len;
            if (px < -hole || px > W + hole || py < -hole || py > H) break;
            carve(px, py, hole, { debris: 0.2, speed: 160, fx: -sin * (Math.random() < 0.5 ? 1 : -1), fy: cos });
            if (!flyHit) flyHit = hitFly(px, py, 10);
            hitToggle(px, py);
        }
        const x1 = x + cos * len, y1 = y + sin * len;
        beams.push({ x0: x, y0: y, x1, y1, t: 0.3 });
        for (const b of bots) if (!b.dead && segDist2(b.x, b.y - BOT_H / 2, x, y, x1, y1)[0] < 144) hurtBot(b, 99, cos * 200, -150);
        for (const f of flies) if (!f.dead && segDist2(f.x, f.y, x, y, x1, y1)[0] < 81) killFly(f);
        if (keeper && !keeper.dying && segDist2(keeper.x, keeper.y - 20, x, y, x1, y1)[0] < 225) hurtKeeper(10, cos * 200);
        eachItem((it, line, ix, iy) => { if (segDist2(ix, iy, x, y, x1, y1)[0] < 100) destroyItem(it, line); });
        if (scene === 'shell' && shell) for (const c of shell.cells) if (segDist2(c.x, c.y, x, y, x1, y1)[0] < 100) popCell(c);
    }

    function explode(x, y, R, harmless) {
        carve(x, y, R, { debris: 0.18, speed: 420, scorch: 6 });
        flashes.push({ x, y, r: R, t: 0, life: 0.18 }, { x, y, r: R, t: 0, life: 0.3, ring: true });
        for (let i = 0; i < 28 && parts.length < MAX_PARTICLES; i++) {
            const a = rand(0, Math.PI * 2), v = rand(40, 220);
            parts.push({ type: FIRE, x: x + rand(-R, R) * 0.4, y: y + rand(-R, R) * 0.4, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: rand(0.5, 1), max: 1, size: rand(R * 0.2, R * 0.4) });
        }
        for (let i = 0; i < 12 && parts.length < MAX_PARTICLES; i++) {
            parts.push({ type: SMOKE, x: x + rand(-R, R) * 0.5, y: y + rand(-R, R) * 0.5, vx: rand(-40, 40), vy: rand(-60, -10), life: rand(0.8, 1.6), max: 1.6, size: rand(4, 10) });
        }
        addShake(Math.min(14, R / 3));
        sfx('boom');

        // knock him (and everything else) around, and hurt him if he's too close
        const reach = R * 2.2;
        const dx = guy.x - x, dy = guy.y - HEIGHT / 2 - y, d = Math.hypot(dx, dy) || 1;
        if (d < R * 1.6 && !harmless) hurtGuy(BLAST_DMG * (1 - (d / (R * 1.6)) ** 2));
        if (d < reach && !guy.dead) {
            const f = 1 - d / reach, k = f * 950;
            guy.vx += dx / d * k;
            guy.vy += dy / d * k - 250 * f;
            if (guy.state === 'climb' && k > 250) guy.state = 'air';
            if (guy.vy < 0 && guy.state !== 'climb') {
                guy.grounded = false;
                guy.state = 'air';
                guy.jumps = 1;
            }
        }
        for (const b of bots) {
            if (b.dead) continue;
            const bdx = b.x - x, bdy = b.y - BOT_H / 2 - y, bd = Math.hypot(bdx, bdy) || 1;
            if (bd < R * 1.5) hurtBot(b, 1 + 5 * (1 - bd / (R * 1.5)), bdx / bd * 400, -250);
        }
        for (const f of flies) if (!f.dead && Math.hypot(f.x - x, f.y - y) < R * 1.6) killFly(f);
        eachItem((it, line, ix, iy) => { if (Math.hypot(ix - x, iy - y) < R * 1.3) destroyItem(it, line); });
        if (scene === 'shell' && shell) for (const c of shell.cells) if (Math.hypot(c.x - x, c.y - y) < R * 1.3) popCell(c);
        if (keeper && !keeper.dying) {
            const kd = Math.hypot(keeper.x - x, keeper.y - 20 - y);
            if (kd < R * 1.5) hurtKeeper(2 + 6 * (1 - kd / (R * 1.5)), (keeper.x - x) / (kd || 1) * 300);
        }
        if (bigFly.alive && flyRect) {
            const c = bigFlyCenter(), fd = Math.hypot(c.x - x, c.y - y);
            if (fd < R * 1.5) damageBigFly(Math.ceil(6 * (1 - fd / (R * 1.5))), c.x, c.y);
        }
        for (const n of nades) {
            const ndx = n.x - x, ndy = n.y - y, nd = Math.hypot(ndx, ndy) || 1;
            if (nd < reach) {
                n.vx += ndx / nd * (1 - nd / reach) * 600;
                n.vy += ndy / nd * (1 - nd / reach) * 600 - 100;
                if (nd < R) n.fuse = Math.min(n.fuse, rand(0.08, 0.2));
            }
        }
        for (const q of parts) {
            if (q.type !== DEBRIS) continue;
            const qdx = q.x - x, qdy = q.y - y, qd = Math.hypot(qdx, qdy) || 1;
            if (qd < reach) {
                q.vx += qdx / qd * (1 - qd / reach) * 500;
                q.vy += qdy / qd * (1 - qd / reach) * 500;
            }
        }
    }

    function impact(x, y, vx, vy, hole) {
        const v = Math.hypot(vx, vy) || 1;
        carve(x, y, hole, { debris: 0.6, speed: 170, fx: -vx / v, fy: -vy / v });
        for (let i = 0; i < 4 && parts.length < MAX_PARTICLES; i++) {
            parts.push({ type: SPARK, x, y, vx: -vx / v * rand(60, 200) + rand(-80, 80), vy: -vy / v * rand(60, 200) + rand(-80, 80), life: rand(0.08, 0.2) });
        }
    }

    function dust(x, y, count) {
        for (let i = 0; i < count && parts.length < MAX_PARTICLES; i++) {
            parts.push({ type: SMOKE, x: x + rand(-8, 8), y: y - 1, vx: rand(-50, 50), vy: rand(-30, -5), life: rand(0.3, 0.5), max: 0.5, size: rand(2, 4) });
        }
    }

    function updateBullets(dt) {
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
            b.life -= dt;
            const hit = trace(b.x, b.y, nx, ny);
            if (hitFly((b.x + nx) / 2, (b.y + ny) / 2) || hitFly(nx, ny) || hitToggle((b.x + nx) / 2, (b.y + ny) / 2) || hitToggle(nx, ny)) {
                bullets.splice(i, 1);
                continue;
            }
            const ex = hit ? hit.x : nx, ey = hit ? hit.y : ny;
            const foe = enemyOnSegment(b.x, b.y, ex, ey);
            if (foe) {
                damageEnemy(foe, 1, b.vx, b.vy);
                const hx = b.x + (ex - b.x) * foe.t, hy = b.y + (ey - b.y) * foe.t;
                for (let k = 0; k < 3 && parts.length < MAX_PARTICLES; k++) {
                    parts.push({ type: SPARK, x: hx, y: hy, vx: rand(-120, 120), vy: rand(-120, 60), life: rand(0.08, 0.2) });
                }
                bullets.splice(i, 1);
                continue;
            }
            if (hit) {
                impact(hit.x, hit.y, b.vx, b.vy, b.hole);
                if (b.pierce-- > 0) {
                    // punch through and keep going from the far side of the hole
                    const v = Math.hypot(b.vx, b.vy);
                    b.x = hit.x + b.vx / v * b.hole;
                    b.y = hit.y + b.vy / v * b.hole;
                    continue;
                }
                bullets.splice(i, 1);
                continue;
            }
            b.x = nx;
            b.y = ny;
            if (b.life <= 0 || nx < -50 || nx > W + 50 || ny < -300) bullets.splice(i, 1);
        }
    }

    function updateRockets(dt) {
        for (let i = rockets.length - 1; i >= 0; i--) {
            const r = rockets[i];
            const nx = r.x + r.vx * dt, ny = r.y + r.vy * dt;
            r.life -= dt;
            if (Math.random() < 0.6 && parts.length < MAX_PARTICLES) {
                parts.push({ type: SMOKE, x: r.x, y: r.y, vx: rand(-15, 15), vy: rand(-25, 5), life: rand(0.3, 0.6), max: 0.6, size: rand(2, 4) });
            }
            const hit = trace(r.x, r.y, nx, ny);
            const ex = hit ? hit.x : nx, ey = hit ? hit.y : ny;
            const foe = enemyOnSegment(r.x, r.y, ex, ey, 2);
            if (foe) {
                explode(r.x + (ex - r.x) * foe.t, r.y + (ey - r.y) * foe.t, r.blast);
                rockets.splice(i, 1);
                continue;
            }
            if (hit || hitFly(nx, ny, 8) || hitToggle(nx, ny) || r.life <= 0) {
                explode(hit ? hit.x : nx, hit ? hit.y : ny, r.blast);
                rockets.splice(i, 1);
                continue;
            }
            r.x = nx;
            r.y = ny;
            if (nx < -100 || nx > W + 100 || ny < -300) rockets.splice(i, 1);
        }
    }

    function updateNades(dt) {
        for (let i = nades.length - 1; i >= 0; i--) {
            const n = nades[i];
            n.fuse -= dt;
            if (n.fuse <= 0) {
                nades.splice(i, 1);
                explode(n.x, n.y - 2, GRENADE.blast);
                continue;
            }
            if (n.y > H + 50) {
                nades.splice(i, 1);
                continue;
            }
            n.vy = Math.min(n.vy + GRAVITY * dt, MAX_FALL);
            // move a pixel at a time so it can't tunnel through thin letters
            const steps = Math.max(1, Math.ceil(Math.max(Math.abs(n.vx), Math.abs(n.vy)) * dt));
            for (let s = 0; s < steps; s++) {
                const nx = n.x + n.vx * dt / steps, ny = n.y + n.vy * dt / steps;
                if (nx < 2 || nx > W - 2 || solidAt(Math.floor(nx), Math.floor(n.y))) {
                    if (Math.abs(n.vx) > 60) sfx('clink');
                    n.vx = -n.vx * 0.45;
                } else n.x = nx;
                if (solidAt(Math.floor(n.x), Math.floor(ny))) {
                    if (n.vy > 120) sfx('clink');
                    if (n.vy > 0) n.vx *= 0.75;
                    n.vy = Math.abs(n.vy) < 60 ? 0 : -n.vy * 0.4;
                } else n.y = ny;
            }
            n.spin += n.vx * dt * 0.15;
        }
    }

    function updateParticles(dt) {
        for (let i = parts.length - 1; i >= 0; i--) {
            const q = parts[i];
            q.life -= dt;
            let dead = q.life <= 0;
            if (q.type === DEBRIS) {
                q.vy = Math.min(q.vy + GRAVITY * dt, MAX_FALL);
                const nx = q.x + q.vx * dt, ny = q.y + q.vy * dt;
                if (nx < 0 || nx >= W || ny > H + 20) dead = true;
                else {
                    const hit = trace(q.x, q.y, nx, ny);
                    if (hit && q.vy < 0) {
                        // hit the underside of something: fall back down
                        q.vy = 0;
                        q.vx *= 0.5;
                    } else if (hit) {
                        // land just before whatever it hit
                        const d = Math.hypot(q.vx, q.vy) || 1;
                        settle(hit.x - q.vx / d, hit.y - q.vy / d, q.pal, q.shade);
                        dead = true;
                    } else {
                        q.x = nx;
                        q.y = ny;
                    }
                }
            } else if (q.type === SHELL) {
                q.vy += GRAVITY * dt;
                const nx = q.x + q.vx * dt, ny = q.y + q.vy * dt;
                if (solidAt(Math.floor(nx), Math.floor(ny)) && q.vy > 0) {
                    if (q.bounces++ < 2) sfx('clink');
                    q.vy = -q.vy * 0.35;
                    q.vx *= 0.5;
                } else {
                    q.x = nx;
                    q.y = ny;
                }
            } else if (q.type === SPARK) {
                q.vy += GRAVITY * 0.4 * dt;
                q.x += q.vx * dt;
                q.y += q.vy * dt;
            } else if (q.type === SPLAT) {
                // stays where it splatted while it fades
            } else {
                // smoke and fire drift up and slow down
                const drag = Math.exp(-dt * 3);
                q.vx *= drag;
                q.vy = q.vy * drag - (q.type === SMOKE ? 30 : 10) * dt;
                q.x += q.vx * dt;
                q.y += q.vy * dt;
                if (q.type === SMOKE) q.size += dt * 6;
            }
            if (dead) {
                parts[i] = parts[parts.length - 1];
                parts.pop();
            }
        }
    }

    function selectWeapon(i) {
        if (i === weapon || i < 0 || i >= WEAPONS.length || !owned.has(i)) return;
        weapon = i;
        cooldown = Math.max(cooldown, 0.12);
        renderHud();
    }

    // ----- guns to find
    //
    // He starts with just the pistol. The other guns sit about the page (one per
    // band of it, so the railgun's furthest down), and the fly guy drops more as
    // he takes damage; walk into one to pick it up.

    // A spot on the text, between rows y0 and y1, with room above it
    function findSpot(y0, y1, bw, bh) {
        const found = [];
        for (let x = EDGE + 20; x < W - EDGE - 20; x += 10) {
            for (let r = Math.max(bh + 2, Math.floor(y0)); r <= Math.min(H, Math.ceil(y1)); r++) {
                let support = 0;
                for (let c = x - 4; c <= x + 4; c++) if (isSurface(c, r)) support++;
                if (support < 5) continue;
                if (boxClear(x - bw / 2, r - bh, x + bw / 2, r - 2)) found.push({ x, y: r });
                r += 6;
            }
        }
        return found.length ? pick(found) : null;
    }

    function placeGuns() {
        pickups = [];
        const locked = [1, 2, 3, 4].filter(w => !owned.has(w)), top = 70, span = H - 10 - top;
        locked.forEach((w, k) => {
            const spot = findSpot(top + span * k / locked.length, top + span * (k + 1) / locked.length, 26, 18);
            if (spot) pickups.push({ x: spot.x, y: spot.y, w, vx: 0, vy: 0, grounded: true, t: rand(0, 6) });
        });
    }

    // The fly guy coughs up a gun you haven't got (or some health, once you've got them all)
    function dropPickup(x, y) {
        const missing = [1, 2, 3, 4].filter(w => !owned.has(w));
        pickups.push({ x, y: y - 20, w: missing.length ? pick(missing) : 'health', vx: rand(-70, 70), vy: -260, grounded: false, t: 0 });
        sfx('ding');
    }

    function updatePickups(dt) {
        for (let i = pickups.length - 1; i >= 0; i--) {
            const p = pickups[i];
            p.t += dt;
            // fall if there's nothing under it
            if (p.grounded && surfaceBetween(p.x, Math.round(p.y) - 1, Math.round(p.y) + 2) === null) p.grounded = false;
            if (!p.grounded) {
                p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL);
                p.x = clamp(p.x + p.vx * dt, EDGE, W - EDGE);
                const y1 = p.y + p.vy * dt;
                const land = p.vy > 0 ? surfaceBetween(p.x, Math.ceil(p.y), Math.floor(y1)) : null;
                if (land !== null) {
                    p.y = land;
                    p.vy = p.vx = 0;
                    p.grounded = true;
                } else p.y = y1;
            }
            if (guy.dead || Math.abs(guy.x - p.x) > (coarsePointer ? 20 : 14) || Math.abs(guy.y - HEIGHT / 2 - (p.y - 8)) > (coarsePointer ? 32 : 26)) continue;
            pickups.splice(i, 1);
            if (p.w === 'health') {
                guy.hp = Math.min(MAX_HP, guy.hp + 35);
                banner('+35 health');
            } else {
                owned.add(p.w);
                saveProgress();
                weapon = p.w;
                cooldown = Math.max(cooldown, 0.12);
                banner(`you found the ${WEAPONS[p.w].name}`);
                renderHud();
            }
            flashes.push({ x: p.x, y: p.y - 8, r: 14, t: 0, life: 0.2, ring: true });
            sfx('ding');
        }
    }

    function drawPickups() {
        for (const p of pickups) {
            const bob = Math.sin(p.t * 3) * 2, x = Math.round(p.x), y = Math.round(p.y - 10 + bob);
            ctx.globalAlpha = 0.25 + 0.15 * Math.sin(p.t * 5);
            ctx.fillStyle = p.w === 'health' ? '#ff4b3a' : '#ffd24a';
            ctx.beginPath();
            ctx.arc(x, y, 11, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            if (p.w === 'health') {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(x - 5, y - 5, 10, 10);
                ctx.fillStyle = '#e02020';
                ctx.fillRect(x - 1.5, y - 4, 3, 8);
                ctx.fillRect(x - 4, y - 1.5, 8, 3);
                continue;
            }
            const spr = gunSprites[p.w];
            ctx.drawImage(spr, x - spr.width / 2, y - spr.height / 2);
        }
    }

    function addShake(s) {
        if (!reducedMotion) shakeAmt = Math.min(16, shakeAmt + s);
    }

    // ------------------------------------------------------------------ robots
    //
    // Clankers are hard-hatted repair robots. Whenever the page is damaged they
    // propeller down from the top of the screen, walk and hop over the text to the
    // damage, and weld it back from a snapshot of the original page, sweeping up
    // rubble as they go. When it's all fixed they fly over to one another and
    // stack into a tower.
    //
    // The fly (the page's logo) is a hive: while it's alive it lets out one to four
    // robot flies at a time, which swarm him, nibble at him and, enough of them at
    // once, carry him off. It takes a lot of shooting to splat, and if it's left
    // alone for a while it either grows or dies of old age. Once it and all its
    // flies are gone, the fly guy turns up a while later with a swatter.

    const LINES = {
        arrive: ['on it', 'who did this', 'repair crew!', 'clocking in', 'ugh, again?', 'not the kerning'],
        work: ['bzzt', 'welding...', 'good as new', 'kerning restored', 'almost there', 'hold still'],
        hurt: ['ow', 'hey!', 'rude', 'my warranty!', 'I have a family', 'stop that'],
        grief: ['GARY NO', 'he was 2 days from retirement', 'avenge him!', 'noooo'],
        fixed: ['all fixed :)', "you're welcome", 'good as new'],
        huddle: ['huddle up!', 'tower time', 'everyone on me'],
        tada: ['ta-da!', 'behold', 'nailed it'],
    };
    const KEEPER_LINES = {
        arrive: ['you squashed Gerald!', 'who killed my fly?!', "that's for Gerald", 'you monster'],
        swat: ['SWAT!', 'hold still', 'take that'],
        hurt: ['ow', 'argh', 'hey!'],
        die: ['Geraaald...', 'tell Gerald I tried', 'avenge me, flies'],
        win: ['and stay down', "that's for Gerald", 'pest control!'],
    };
    const pick = a => a[Math.floor(Math.random() * a.length)];

    function say(e, lines, force) {
        if (!force && clock - lastSay < 1.5) return;
        lastSay = clock;
        e.say = { text: pick(lines), t: 1.8 };
        sfx('beep');
    }

    function markTile(x, y) {
        const t = (y >> 4) * TW + (x >> 4);
        if (!tileDirty[t]) {
            tileDirty[t] = 1;
            dirtyTiles.add(t);
        }
    }

    // Different from the original page: missing or scorched text, or rubble where there was none
    function damaged(i) {
        const o = origAlp[i];
        return o ? kind[i] !== ORIGINAL || alp[i] !== o || shade[i] !== 0 : alp[i] !== 0;
    }

    function fixCell(i) {
        const o = origAlp[i];
        if (o >= SOLID && !(kind[i] === ORIGINAL && alp[i] >= SOLID)) solidRemoved = Math.max(0, solidRemoved - 1);
        alp[i] = o;
        pal[i] = o ? origPal[i] : 0;
        shade[i] = 0;
        kind[i] = o ? ORIGINAL : 0;
        paintCell(i);
    }

    // First damaged cell in a tile, or null (and the tile is marked clean)
    function findDamage(t) {
        const tx = (t % TW) * TILE, ty = Math.floor(t / TW) * TILE;
        const x1 = Math.min(W, tx + TILE), y1 = Math.min(H, ty + TILE);
        for (let y = ty; y < y1; y++) {
            for (let x = tx; x < x1; x++) if (damaged(y * W + x)) return { x, y };
        }
        tileDirty[t] = 0;
        dirtyTiles.delete(t);
        return null;
    }

    // The nearest damage nobody else is working on (going up and down costs more than across)
    function pickTarget(b) {
        const claimed = new Set();
        for (const o of bots) if (o !== b && o.target) claimed.add(o.target.tile);
        for (let tries = 0; tries < 20; tries++) {
            let best = -1, bestCost = Infinity;
            for (const t of dirtyTiles) {
                if ((b.skip.get(t) || 0) > clock) continue;
                const cx = (t % TW) * TILE + 8, cy = Math.floor(t / TW) * TILE + 8;
                const cost = Math.abs(cx - b.x) + Math.abs(cy - b.y) * 2 + (claimed.has(t) ? 400 : 0);
                if (cost < bestCost) {
                    bestCost = cost;
                    best = t;
                }
            }
            if (best < 0) return null;
            const d = findDamage(best);
            if (d) return { tile: best, x: d.x, y: d.y };
        }
        return null;
    }

    function spawnBot() {
        // come down over some damage, preferably on screen
        const tiles = [...dirtyTiles];
        const vh = window.innerHeight;
        const onScreen = tiles.filter(t => {
            const ty = Math.floor(t / TW) * TILE;
            return ty > scrollY && ty < scrollY + vh;
        });
        const from = onScreen.length ? onScreen : tiles;
        const x = from.length ? (pick(from) % TW) * TILE + 8 + rand(-40, 40) : rand(EDGE, W - EDGE);
        const b = newBot(x, scrollY - 4);
        bots.push(b);
        say(b, robotsEvil ? EVIL_LINES.arrive : LINES.arrive);
    }

    // Weld the damage around the target point; false once there's nothing left to fix there
    function weld(b, dt) {
        b.weldAcc += WELD_RATE * dt;
        const budget = Math.floor(b.weldAcc);
        if (!budget) return true;
        b.weldAcc -= budget;
        const tx = b.target.x, ty = b.target.y;
        const x0 = Math.max(0, tx - WELD_R), x1 = Math.min(W - 1, tx + WELD_R);
        const y0 = Math.max(0, ty - WELD_R), y1 = Math.min(H - 1, ty + WELD_R);
        let fixed = 0;
        for (let y = y0; y <= y1 && fixed < budget; y++) {
            for (let x = x0; x <= x1 && fixed < budget; x++) {
                const i = y * W + x;
                if (!damaged(i)) continue;
                fixCell(i);
                markDirty(x, y, x, y);
                b.beam = { x, y };
                fixed++;
            }
        }
        if (fixed) {
            b.progressT = clock;
            sfx('weld');
            if (Math.random() < 0.3 && parts.length < MAX_PARTICLES) {
                parts.push({ type: SPARK, x: b.beam.x, y: b.beam.y, vx: rand(-90, 90), vy: rand(-140, -20), life: rand(0.1, 0.25), color: '#bff4ff' });
            }
            if (Math.random() < 0.004) say(b, LINES.work);
            return true;
        }
        const next = findDamage(b.target.tile);
        if (next) {
            b.target.x = next.x;
            b.target.y = next.y;
            return true;
        }
        b.target = null;
        return false;
    }

    // Walking and falling on the text, for clankers and the fly guy. `prop` means a
    // slow descent (propeller or parachute) until they land.
    function moveWalker(e, dir, speed, dt) {
        e.vx = approach(e.vx, dir * speed, (e.grounded ? 900 : 250) * dt);
        e.x = clamp(e.x + e.vx * dt, EDGE, W - EDGE);
        if (e.grounded) {
            const ground = groundUnder(e.x, e.y);
            if (ground === null) {
                e.grounded = false;
                e.vy = 0;
            } else {
                e.y = ground;
                e.vy = 0;
            }
        }
        if (!e.grounded) {
            e.vy = Math.min(e.vy + GRAVITY * dt, e.prop ? 90 : MAX_FALL);
            const y1 = e.y + e.vy * dt;
            let land = null;
            if (e.vy > 0) {
                if (e.dropping && !feetInSolid(e.x, y1)) e.dropping = false;
                if (!e.dropping) land = surfaceBetween(e.x, Math.ceil(e.y), Math.floor(y1));
            }
            if (land !== null) {
                e.y = land;
                e.vy = 0;
                e.grounded = true;
                e.prop = false;
            } else e.y = Math.max(-40, y1);
        }
    }

    // Which way to walk towards (tx, ty), hopping up or dropping down when it's
    // overhead or underfoot. The text is one-way, so there's nothing to bump into.
    function navigate(e, tx, ty, refY, stop, near) {
        const dx = tx - e.x;
        if (e.grounded && Math.abs(dx) < near && e.jumpCd <= 0) {
            if (ty < refY - 20) {
                e.vy = -Math.sqrt(2 * GRAVITY * clamp(e.y - (ty - 6), 20, 220));
                e.grounded = false;
                e.jumpCd = 0.5;
            } else if (ty > e.y + 26 && e.y < H) {
                e.grounded = false;
                e.dropping = true;
                e.y += 1;
                e.vy = 60;
                e.jumpCd = 0.3;
            }
        }
        return Math.abs(dx) > stop ? Math.sign(dx) : 0;
    }

    function slotPos(k) {
        return { x: stack.x + Math.sin(clock * 2 + k * 0.7) * k * 0.6, y: stack.y - k * BOT_H };
    }

    function disbandStack() {
        if (!stack) return;
        for (const [k, b] of stack.members.entries()) {
            b.mode = 'work';
            if (k > 0) {
                b.grounded = false;
                b.vx = rand(-90, 90);
                b.vy = -rand(60, 180);
            }
        }
        for (const b of bots) {
            if (b.mode === 'gather') {
                b.mode = 'work';
                b.prop = false;
            }
        }
        stack = null;
    }

    function updateBot(b, dt) {
        b.t += dt;
        b.hurt -= dt;
        b.jumpCd -= dt;
        b.retarget -= dt;
        b.beam = b.arm = null;
        if (b.say && (b.say.t -= dt) <= 0) b.say = null;

        if (b.mode === 'stacked') {
            const k = stack ? stack.members.indexOf(b) : -1;
            if (k < 0) b.mode = 'work';
            else if (k === 0) {
                // the foreman holds the bottom
                moveWalker(b, 0, BOT_SPEED, dt);
                stack.x = b.x;
                stack.y = b.y;
                return;
            } else {
                const p = slotPos(k);
                b.x = p.x;
                b.y = p.y;
                b.vx = b.vy = 0;
                b.facing = stack.members[0].facing;
                return;
            }
        }
        if (b.mode === 'gather') {
            if (!stack) b.mode = 'work';
            else {
                // propeller over and land on top of the stack
                const p = slotPos(stack.members.length);
                const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy);
                b.prop = true;
                if (Math.abs(dx) > 1) b.facing = Math.sign(dx);
                if (d < 3) {
                    stack.members.push(b);
                    b.mode = 'stacked';
                    b.prop = false;
                    if (!stack.cheered && stack.members.length >= 2 && bots.every(o => o.mode === 'stacked')) {
                        stack.cheered = true;
                        say(b, LINES.tada, true);
                    }
                } else {
                    const step = Math.min(d, 140 * dt);
                    b.x += dx / d * step;
                    b.y += dy / d * step;
                }
                return;
            }
        }

        if (scene === 'sky' && b.y > H + 60) {
            b.dead = true;   // fell out of the sky
            return;
        }
        if (b.build) {
            // adding to the latent space
            b.beam = { x: b.build.x + 20, y: b.build.y - 6 };
            if ((b.build.t -= dt) <= 0) {
                const box = stampWord(b.build.text, b.build.x, b.build.y, b.build.font, b.build.p);
                flashes.push({ x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2, r: 12, t: 0, life: 0.2 });
                b.build = null;
            }
            moveWalker(b, 0, BOT_SPEED, dt);
            return;
        }
        if (b.post && (!b.post.line.alive || b.post.worker !== b)) b.post = null;
        if (b.post) {
            workPost(b, dt);
            return;
        }
        if (robotsEvil && !(scene === 'sky' && b.repairer && dirtyTiles.size)) {
            moveWalker(b, hunt(b, dt), BOT_SPEED * 1.3, dt);
            return;
        }

        if (!b.prop && (!b.target || !tileDirty[b.target.tile]) && b.retarget <= 0) {
            b.target = pickTarget(b);
            b.retarget = 0.5;
            b.bestDist = Infinity;
            b.progressT = clock;
        }

        let dir = 0;
        if (b.target) {
            const torchX = b.x + b.facing * 9, torchY = b.y - 12;
            const dist = Math.hypot(b.target.x - torchX, b.target.y - torchY);
            if (dist < BOT_REACH) {
                b.facing = b.target.x >= b.x ? 1 : -1;
                weld(b, dt);
            } else if (b.grounded) dir = navigate(b, b.target.x, b.target.y, torchY, 8, 40);
            if (b.target) {
                if (dist < b.bestDist - 8) {
                    b.bestDist = dist;
                    b.progressT = clock;
                }
                // can't get at it: leave it for later
                if (clock - b.progressT > 7) {
                    b.skip.set(b.target.tile, clock + 12);
                    b.target = null;
                }
            }
        } else if (scene === 'sky' && b.grounded && Math.sin(b.t * 0.7 + b.x * 0.01) > 0.5) dir = b.facing;   // wander the shop floor
        if (dir) b.facing = dir;
        moveWalker(b, dir, BOT_SPEED, dt);
    }

    // Once all the text is back, the clankers build a tower on whoever's nearest the middle of the
    // screen (stray rubble can wait until they're next called out)
    function updateStack() {
        if (solidRemoved > 0) {
            disbandStack();
            return;
        }
        if (!stack) {
            const midX = scrollX + window.innerWidth / 2, midY = scrollY + window.innerHeight / 2;
            let foreman = null, best = Infinity;
            for (const b of bots) {
                if (b.dead || b.mode !== 'work' || b.prop || !b.grounded) continue;
                const d = Math.hypot(b.x - midX, b.y - midY);
                if (d < best) {
                    best = d;
                    foreman = b;
                }
            }
            if (!foreman) return;
            stack = { x: foreman.x, y: foreman.y, members: [foreman], cheered: false };
            foreman.mode = 'stacked';
            foreman.target = null;
            if (bots.length > 1) say(foreman, LINES.huddle, true);
        }
        for (const b of bots) {
            if (b.mode !== 'work' || b.dead || !(b.grounded || b.prop)) continue;
            b.mode = 'gather';
            b.target = null;
        }
    }

    // ------------------------------------------------------- the fly and its flies

    function resetBigFly() {
        fly = document.getElementById('fly-image');
        bigFly.startSrc = fly ? fly.getAttribute('src') : '';
        bigFly.alive = !!fly && fly.src.includes('fly.png');
        bigFly.stage = 0;
        bigFly.max = bigFly.hp = bigFly.shownHp = FLY_HP;
        bigFly.alone = 0;
        bigFly.spawnT = 5;
        bigFly.spitT = 6;
        bigFly.broodT = 0;
        bigFly.engaged = false;
        bigFly.deathT = 0;
        if (fly) {
            fly.style.scale = '';
            fly.classList.remove('fly-dead');
        }
    }

    function restoreBigFly() {
        if (!fly) return;
        fly.setAttribute('src', bigFly.startSrc);
        fly.style.scale = '';
        fly.classList.remove('fly-dead');
    }

    function bigFlyCenter() {
        const r = fly.getBoundingClientRect();
        return { x: r.left + r.width / 2 + scrollX, y: r.top + r.height / 2 + scrollY };
    }

    // Shoot the light/dark toggle and it flips (index.html's own click handler does the switching)
    function hitToggle(x, y) {
        if (!toggleRect || toggleCd > 0) return false;
        const sx = x - scrollX, sy = y - scrollY;
        if (sx < toggleRect.left || sx > toggleRect.right || sy < toggleRect.top || sy > toggleRect.bottom) return false;
        toggleCd = 0.5;
        toggle.click();
        for (let i = 0; i < 8 && parts.length < MAX_PARTICLES; i++) {
            parts.push({ type: SPARK, x, y, vx: rand(-150, 150), vy: rand(-180, 40), life: rand(0.1, 0.3), color: i % 2 ? '#ffffff' : '#000000' });
        }
        sfx('clank');
        return true;
    }

    // Bullets etc. call this as they travel; true if they hit the fly
    function hitFly(x, y, dmg = 1) {
        if (!bigFly.alive || !flyRect) return false;
        const sx = x - scrollX, sy = y - scrollY;
        if (sx < flyRect.left || sx > flyRect.right || sy < flyRect.top || sy > flyRect.bottom) return false;
        damageBigFly(dmg, x, y);
        return true;
    }

    function damageBigFly(dmg, x, y) {
        if (!bigFly.alive) return;
        bigFly.hp -= dmg;
        bigFly.alone = 0;
        bigFly.engaged = true;
        if (fly.animate) fly.animate({ rotate: ['0deg', '-14deg', '10deg', '0deg'] }, 200);
        for (let i = 0; i < 3 && parts.length < MAX_PARTICLES; i++) {
            parts.push({ type: SPARK, x, y, vx: rand(-140, 140), vy: rand(-160, 40), life: rand(0.1, 0.25), color: '#6b8f23' });
        }
        sfx('squish');
        if (bigFly.hp <= 0) killBigFly(false);
    }

    function killBigFly(oldAge) {
        bigFly.alive = false;
        bigFly.hp = 0;
        bigFly.deathT = 0;
        fly.src = 'assets/squashed-fly.webp';
        fly.classList.add('fly-dead');   // index.css fades it out
        const c = bigFlyCenter();
        for (let i = 0; i < 16 && parts.length < MAX_PARTICLES; i++) {
            parts.push({ type: SPARK, x: c.x, y: c.y, vx: rand(-220, 220), vy: rand(-260, 60), life: rand(0.2, 0.5), color: i % 2 ? '#c41e1e' : '#6b8f23' });
        }
        sfx('splat');
        keeperWait = 0;
        // it was pregnant: a moment later its brood bursts out
        if (!oldAge) {
            addShake(8);
            bigFly.broodT = 0.4;
        }
        openPortal();
        banner(oldAge ? 'the fly died of old age. a portal opened' : 'the fly is dead. a portal opened in the white space');
    }

    function growBigFly() {
        bigFly.stage++;
        bigFly.max += FLY_GROW_HP;
        bigFly.hp += FLY_GROW_HP;
        fly.style.scale = String(1 + bigFly.stage * 0.4);
        const c = bigFlyCenter();
        for (let i = 0; i < 10 && parts.length < MAX_PARTICLES; i++) {
            parts.push({ type: SMOKE, x: c.x + rand(-20, 20), y: c.y + rand(-20, 20), vx: rand(-40, 40), vy: rand(-40, 10), life: rand(0.5, 1), max: 1, size: rand(4, 9) });
        }
        sfx('grow');
    }

    function updateBigFly(dt) {
        if (!bigFly.alive) {
            bigFly.deathT += dt;
            bigFly.shownHp = approach(bigFly.shownHp, 0, bigFly.max * 1.5 * dt);
            if (bigFly.broodT > 0 && (bigFly.broodT -= dt) <= 0 && botsOn) {
                spawnFlies(BROOD, BROOD + 40, true);
                sfx('buzz');
            }
            return;
        }
        bigFly.shownHp = approach(bigFly.shownHp, bigFly.hp, bigFly.max * 0.6 * dt);
        if (!botsOn) return;
        if ((bigFly.spawnT -= dt) <= 0) {
            spawnFlies(1 + Math.floor(Math.random() * 4));
            bigFly.spawnT = rand(4, 8) / (1 + bigFly.stage * 0.35);
        }
        if ((bigFly.spitT -= dt) <= 0) {
            if (!guy.dead) spit();
            bigFly.spitT = rand(2.2, 3.6) / (1 + bigFly.stage * 0.3);
        }
        // left alone too long: it either grows or dies of old age
        if ((bigFly.alone += dt) > FLY_ALONE) {
            bigFly.alone = 0;
            if (bigFly.stage < 3 && Math.random() < 0.6) growBigFly();
            else killBigFly(true);
        }
    }

    function spawnFlies(n, cap = MAX_FLIES, burst = false) {
        const c = bigFlyCenter();
        for (let i = 0; i < n && flies.length < cap; i++) {
            const a = rand(0, Math.PI * 2), v = burst ? rand(80, 320) : 0;
            flies.push({
                x: c.x + rand(-6, 6), y: c.y + rand(-6, 6), vx: burst ? Math.cos(a) * v : rand(-200, 60), vy: burst ? Math.sin(a) * v : rand(-90, 90),
                t: 0, phase: rand(0, Math.PI * 2), orbit: rand(12, 30), dead: false,
                bored: rand(25, 40), away: Math.random() < 0.5 ? -1 : 1,
            });
        }
        sfx('buzz');
    }

    function updateFlies(dt) {
        const cx = guy.x, cy = guy.y - HEIGHT / 2;
        let touching = 0;
        const n = flies.length, tick = Math.floor(clock * 120);
        for (let i = 0; i < n; i++) {
            const f = flies[i];
            f.t += dt;
            // buzz in circles around him until they get bored and wander off
            const a = f.phase + f.t * 2.8;
            const leaving = f.t > f.bored;
            const tx = leaving ? cx + f.away * 5000 : cx + Math.cos(a) * f.orbit;
            const ty = leaving ? f.y - 40 : cy + Math.sin(a * 1.3) * f.orbit * 0.7;
            if (leaving && Math.abs(f.x - cx) > window.innerWidth) f.dead = true;
            const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy) || 1;
            f.vx += (dx / d * 800 + rand(-400, 400)) * dt;
            f.vy += (dy / d * 800 + rand(-400, 400)) * dt;
            // keep a little apart (a handful of the others each step is plenty)
            for (let j = 1; j <= Math.min(6, n - 1); j++) {
                const o = flies[(i + j * 5 + tick) % n];
                if (o === f) continue;
                const ox = f.x - o.x, oy = f.y - o.y, o2 = ox * ox + oy * oy;
                if (o2 < 64 && o2 > 0.01) {
                    const od = Math.sqrt(o2);
                    f.vx += ox / od * 300 * dt;
                    f.vy += oy / od * 300 * dt;
                }
            }
            const v = Math.hypot(f.vx, f.vy);
            if (v > FLY_SPEED) {
                f.vx *= FLY_SPEED / v;
                f.vy *= FLY_SPEED / v;
            }
            f.x += f.vx * dt;
            f.y += f.vy * dt;
            if (!leaving && Math.abs(f.x - cx) < 20 && Math.abs(f.y - cy) < 24) touching++;
        }
        if (!touching || guy.dead) return;
        sfx('buzz');
        hurtGuy(Math.min(touching, 6) * FLY_BITE * dt);
        guy.vx += rand(-1, 1) * touching * 60 * dt;
        // enough of them pick him up
        if (touching >= 4 && guy.state !== 'climb') {
            if (guy.grounded) {
                guy.grounded = false;
                guy.state = 'air';
                guy.vy = -60;
                guy.jumps = 1;
            }
            guy.vy = Math.max(-150, guy.vy - touching * 330 * dt);   // about five of them outpull gravity
        }
    }

    // ------------------------------------------------------------- the fly guy

    function spawnKeeper() {
        const vw = window.innerWidth, fromRight = guy.x - scrollX < vw / 2;
        const hp = KEEPER_HP + keepersBeaten * 10;
        keeper = {
            x: clamp(scrollX + (fromRight ? vw - 40 : 40), EDGE, W - EDGE), y: scrollY - 4, vx: 0, vy: 30,
            grounded: false, dropping: false, prop: true, hp, max: hp, facing: fromRight ? -1 : 1,
            t: 0, hurt: 0, jumpCd: 0, cd: 1, attack: null, attackT: 0, say: null, dying: false, deathT: 0, rot: 0,
        };
        say(keeper, KEEPER_LINES.arrive, true);
    }

    function updateKeeper(dt) {
        const k = keeper;
        k.t += dt;
        k.hurt -= dt;
        k.jumpCd -= dt;
        k.cd -= dt;
        if (k.say && (k.say.t -= dt) <= 0) k.say = null;
        if (k.dying) {
            k.vy += GRAVITY * dt;
            k.x += k.vx * dt;
            k.y += k.vy * dt;
            k.rot += dt * 9;
            if ((k.deathT += dt) > 2) keeper = null;
            return;
        }
        let dir = 0;
        if (k.attack) {
            k.attackT -= dt;
            if (k.attack === 'windup' && k.attackT <= 0) {
                k.attack = 'strike';
                k.attackT = 0.14;
                swat(k);
            } else if (k.attack === 'strike' && k.attackT <= 0) {
                k.attack = 'recover';
                k.attackT = 0.4;
            } else if (k.attack === 'recover' && k.attackT <= 0) k.attack = null;
        } else if (!guy.dead) {
            const dx = guy.x - k.x;
            k.facing = dx >= 0 ? 1 : -1;
            const close = Math.abs(dx) < 34 && Math.abs(guy.y - HEIGHT / 2 - (k.y - 20)) < 34;
            if (close && k.cd <= 0 && k.grounded) {
                k.attack = 'windup';
                k.attackT = 0.32;
                sfx('whoosh');
                if (Math.random() < 0.3) say(k, KEEPER_LINES.swat, true);
            } else dir = navigate(k, guy.x, guy.y, k.y, 18, 80);
        }
        moveWalker(k, dir, KEEPER_SPEED, dt);
    }

    function swat(k) {
        k.cd = 1.1;
        if (guy.dead) return;
        const dx = guy.x - k.x, dy = guy.y - HEIGHT / 2 - (k.y - 20);
        if (Math.abs(dx) > 40 || Math.abs(dy) > 36 || Math.sign(dx || k.facing) !== k.facing) return;
        hurtGuy(KEEPER_DMG);
        if (guy.dead) return;
        // and off he goes
        guy.state = 'air';
        guy.grounded = false;
        guy.dropping = false;
        guy.forceChute = false;
        guy.vx = k.facing * 650;
        guy.vy = -430;
        guy.jumps = 1;
        guy.spin = FLIP_TIME;
        flashes.push({ x: guy.x, y: guy.y - HEIGHT / 2, r: 10, t: 0, life: 0.12 });
        addShake(7);
        sfx('swat');
    }

    function hurtKeeper(dmg, kx) {
        const k = keeper;
        if (!k || k.dying) return;
        const before = k.hp / k.max;
        k.hp -= dmg;
        k.hurt = 0.1;
        k.vx += kx || 0;
        const now = Math.max(0, k.hp) / k.max;
        for (const mark of [2 / 3, 1 / 3, 0]) if (before > mark && now <= mark) dropPickup(k.x, k.y - 10);
        if (k.hp > 0) {
            if (Math.random() < 0.25) say(k, KEEPER_LINES.hurt, true);
            sfx('oof');
            return;
        }
        k.dying = true;
        k.vy = -320;
        k.vx = -k.facing * 140;
        keepersBeaten++;
        keeperWait = 0;
        say(k, KEEPER_LINES.die, true);
        addShake(4);
        sfx('oof');
    }

    function updateRobots(dt) {
        for (const b of bots) updateBot(b, dt);
        updateLasers(dt);
        if (bots.some(b => b.dead)) bots = bots.filter(b => !b.dead);
        if (scene === 'sky') {
            updateFactory(dt);
            return;
        }
        if (scene === 'shell') {
            updateShell(dt);
            return;
        }
        updateBigFly(dt);
        updateGlobs(dt);
        updateFlies(dt);
        if (keeper) updateKeeper(dt);
        if (flies.some(f => f.dead)) flies = flies.filter(f => !f.dead);
        // a portal works once you've stepped out of it (you come out of one inside it)
        updatePickups(dt);
        if (portal && !nearPortal(portal)) portalArmed = true;
        else if (portal && portalArmed && !guy.dead) transition(() => enterSky('portal'));
        if (!botsOn) return;

        const pct = solidTotal ? solidRemoved / solidTotal * 100 : 0;
        if (solidRemoved > 0 && !factoryDown) {
            botTimer -= dt;
            if (botTimer <= 0 && bots.length < Math.min(MAX_BOTS, 2 + Math.floor(pct / 2))) {
                spawnBot();
                botTimer = clamp(9 - pct / 5, 2.5, 9);
            }
        } else {
            botTimer = Math.max(botTimer, 3);
            if (hadDamage) {
                hadDamage = false;
                if (bots.length) say(bots[0], LINES.fixed, true);
            }
        }
        if (robotsEvil) disbandStack();
        else updateStack();

        // with the fly and all its flies gone, the fly guy comes looking for you
        if (!bigFly.alive && !flies.length && !keeper) {
            if ((keeperWait += dt) > (keepersBeaten ? KEEPER_AGAIN : KEEPER_DELAY)) spawnKeeper();
        } else if (bigFly.alive || flies.length) keeperWait = 0;
    }

    function segDist2(cx, cy, x0, y0, x1, y1) {
        const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy || 1;
        const t = clamp(((cx - x0) * dx + (cy - y0) * dy) / L, 0, 1);
        const ex = x0 + dx * t - cx, ey = y0 + dy * t - cy;
        return [ex * ex + ey * ey, t];
    }

    // The first robot, fly or fly guy along a segment: { e, kind, t } or null
    function enemyOnSegment(x0, y0, x1, y1, pad = 0) {
        let best = null;
        const test = (e, kind, cx, cy, r) => {
            const [d2, t] = segDist2(cx, cy, x0, y0, x1, y1);
            if (d2 <= (r + pad) ** 2 && (!best || t < best.t)) best = { e, kind, t };
        };
        for (const b of bots) if (!b.dead) test(b, 'bot', b.x, b.y - BOT_H / 2, 10);
        for (const f of flies) if (!f.dead) test(f, 'fly', f.x, f.y, 7);
        if (keeper && !keeper.dying) test(keeper, 'keeper', keeper.x, keeper.y - 20, 13);
        eachItem((it, line, ix, iy) => test({ it, line }, 'item', ix, iy, 9));
        if (scene === 'shell' && shell) for (const c of shell.cells) if (!c.dead) test(c, 'cell', c.x, c.y, 5 + c.size * 4);
        return best;
    }

    function damageEnemy(hit, dmg, vx, vy) {
        const v = Math.hypot(vx, vy) || 1;
        if (hit.kind === 'fly') killFly(hit.e);
        else if (hit.kind === 'item') destroyItem(hit.e.it, hit.e.line);
        else if (hit.kind === 'cell') popCell(hit.e);
        else if (hit.kind === 'keeper') hurtKeeper(dmg, vx / v * 40);
        else hurtBot(hit.e, dmg, vx / v * 60, -40);
    }

    function hurtBot(b, dmg, kx, ky) {
        if (b.dead) return;
        b.hp -= dmg;
        b.hurt = 0.1;
        if (b.mode !== 'stacked') {
            b.vx += kx;
            if (ky < -50) {
                b.grounded = false;
                b.vy = Math.min(b.vy, ky);
            }
        }
        if (b.hp <= 0) return killBot(b);
        sfx('clank');
        if (Math.random() < 0.5) say(b, robotsEvil ? EVIL_LINES.hurt : LINES.hurt, true);
    }

    function killBot(b) {
        b.dead = true;
        scrapped++;
        if (b.post) b.post.worker = null;
        if (stack && stack.members.includes(b)) disbandStack();   // timber
        const cx = b.x, cy = b.y - BOT_H / 2;
        const cols = [botColors.g, botColors.y, botColors.d, botColors.k, botColors.e];
        for (let i = 0; i < 14 && parts.length < MAX_PARTICLES; i++) {
            parts.push({ type: SHELL, x: cx + rand(-6, 6), y: cy + rand(-8, 8), vx: rand(-200, 200), vy: rand(-320, -60), life: rand(0.8, 1.6), bounces: 0, color: pick(cols), size: 2 });
        }
        for (let i = 0; i < 6 && parts.length < MAX_PARTICLES; i++) {
            parts.push({ type: SMOKE, x: cx + rand(-6, 6), y: cy + rand(-6, 6), vx: rand(-30, 30), vy: rand(-50, -10), life: rand(0.5, 1), max: 1, size: rand(3, 6) });
        }
        flashes.push({ x: cx, y: cy, r: 12, t: 0, life: 0.15 });
        carve(cx, cy, 7, { debris: 0.4, speed: 200 });   // and takes a little of the page with it
        addShake(2);
        sfx('crunch');
        for (const o of bots) {
            if (o.dead || Math.hypot(o.x - b.x, o.y - b.y) > 160) continue;
            say(o, LINES.grief, true);
            break;
        }
    }

    function killFly(f) {
        if (f.dead) return;
        f.dead = true;
        swatted++;
        // splat
        if (parts.length < MAX_PARTICLES) parts.push({ type: SPLAT, x: f.x, y: f.y, rot: rand(0, Math.PI * 2), size: rand(12, 18), life: 1.6 });
        for (let i = 0; i < 3 && parts.length < MAX_PARTICLES; i++) {
            parts.push({ type: SHELL, x: f.x, y: f.y, vx: rand(-140, 140), vy: rand(-200, -20), life: rand(0.6, 1.1), bounces: 0, color: pick([botColors.k, botColors.w]), size: 2 });
        }
        sfx('pop');
    }

    function toggleBots() {
        botsOn = !botsOn;
        try { localStorage.setItem('destroyBots', botsOn ? '1' : '0'); } catch (_) { /* storage unavailable */ }
        if (!botsOn) {
            for (const e of [...bots, ...flies]) dust(e.x, e.y, 4);
            if (keeper) dust(keeper.x, keeper.y - 20, 8);
            bots = [];
            flies = [];
            keeper = null;
            stack = null;
        } else botTimer = 3;
        renderHud();
    }

    function drawBots() {
        for (const b of bots) {
            const x = Math.round(b.x), top = Math.round(b.y) - BOT_H;
            if (b.arm) drawArm(x + b.facing * 7, top + 14, b.arm);
            if (b.beam) {
                // welding torch and beam
                const tx = x + b.facing * 9, ty = top + 10;
                ctx.fillStyle = botColors.y;
                ctx.fillRect(tx - 2, ty - 1, 4, 3);
                ctx.globalAlpha = rand(0.6, 1);
                ctx.strokeStyle = '#8ff0ff';
                ctx.lineWidth = rand(1.5, 3);
                ctx.beginPath();
                ctx.moveTo(tx, ty);
                ctx.lineTo(b.beam.x + 0.5, b.beam.y + 0.5);
                ctx.stroke();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
            const frame = b.grounded && Math.abs(b.vx) > 10 ? Math.floor(b.t / 0.18) % 2 : 0;
            ctx.save();
            ctx.translate(x, top);
            if (b.facing < 0) ctx.scale(-1, 1);
            ctx.drawImage(b.hurt > 0 ? botSprites.hurt[frame] : robotsEvil ? botSprites.evil[frame] : botSprites.normal[frame], -9, 0);
            if (robotsEvil) {
                // glowing red eyes
                ctx.fillStyle = 'rgba(255,32,32,0.35)';
                ctx.fillRect(-5, 6, 10, 6);
            }
            ctx.restore();
            if (b.prop) {
                const w = Math.floor(b.t * 30) % 2 ? 16 : 6;
                ctx.fillStyle = botColors.m;
                ctx.fillRect(x - 1, top - 4, 2, 4);
                ctx.fillRect(x - w / 2, top - 6, w, 2);
            }
        }
    }

    function drawFlies() {
        for (const f of flies) {
            ctx.drawImage(flySprites[Math.floor((f.t + f.phase) * 20) % 2], Math.round(f.x) - 7, Math.round(f.y) - 5);
        }
    }

    function drawKeeper() {
        const k = keeper;
        ctx.save();
        ctx.translate(Math.round(k.x), Math.round(k.y) - 20);
        if (k.dying) {
            ctx.rotate(k.rot);
            ctx.globalAlpha = clamp(1 - k.deathT / 2, 0, 1);
        }
        if (k.facing < 0) ctx.scale(-1, 1);
        if (k.prop) {
            ctx.fillStyle = keeperColors.h;
            for (const [x, y] of CANOPY) ctx.fillRect(x - 12, y - 20, 4, 4);
        }
        const frame = k.grounded && Math.abs(k.vx) > 15 ? Math.floor(k.t / 0.2) % 2 : 0;
        ctx.drawImage(k.hurt > 0 ? keeperSprites.hurt[frame] : keeperSprites.normal[frame], -12, -20);
        // the swatter
        let a = -1;
        if (k.attack === 'windup') a = -2.3;
        else if (k.attack === 'strike') a = 0.7;
        else if (k.attack === 'recover') a = 0.7 - 1.7 * (1 - k.attackT / 0.4);
        ctx.translate(6, -2);
        ctx.rotate(a);
        ctx.fillStyle = '#7a4a22';
        ctx.fillRect(0, -1, 16, 2);
        ctx.fillStyle = '#c23b22';
        ctx.fillRect(16, -5, 11, 10);
        ctx.fillStyle = '#e8705a';
        for (let i = 0; i < 3; i++) {
            ctx.fillRect(18 + i * 3, -4, 1, 8);
            ctx.fillRect(17, -3 + i * 3, 9, 1);
        }
        ctx.restore();
        ctx.globalAlpha = 1;
        if (!k.dying) drawBar(k.x - 15, k.y - 48, 30, k.hp / k.max);
    }

    function drawBar(x, y, w, f) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, w + 2, 5);
        ctx.fillStyle = f > 0.5 ? '#4cc94c' : f > 0.25 ? '#f2c230' : '#ff4b3a';
        ctx.fillRect(Math.round(x), Math.round(y), Math.max(0, Math.round(w * f)), 3);
    }

    // The fly's big health bar, across the top of the screen once you've started on it
    function drawBossBar() {
        if (!bigFly.engaged || (!bigFly.alive && bigFly.deathT > 1.5)) return;
        const vw = window.innerWidth, w = Math.min(420, vw - 80), x = Math.round((vw - w) / 2), y = coarsePointer ? 84 : 26;
        const name = ['GERALD THE FLY', 'GERALD THE BIG FLY', 'GERALD THE HUGE FLY', 'GERALD THE ENORMOUS FLY'][bigFly.stage];
        ctx.globalAlpha = bigFly.alive ? 1 : clamp(1 - (bigFly.deathT - 0.8) / 0.7, 0, 1);
        ctx.font = "11px 'IBM Plex Mono', monospace";
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'center';
        ctx.fillStyle = cellColor(1, 0);
        ctx.fillText(bigFly.alive ? name : 'SPLAT', vw / 2, y - 3);
        ctx.textAlign = 'left';
        ctx.fillStyle = bgColor;
        ctx.fillRect(x, y, w, 12);
        ctx.fillStyle = '#ffe0a0';
        ctx.fillRect(x, y, Math.round(w * bigFly.shownHp / bigFly.max), 12);
        ctx.fillStyle = '#c41e1e';
        ctx.fillRect(x, y, Math.round(w * Math.max(0, bigFly.hp) / bigFly.max), 12);
        ctx.strokeStyle = cellColor(1, 0);
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 0.5, y - 0.5, w + 1, 13);
        ctx.globalAlpha = 1;
    }

    function drawSpeech() {
        ctx.font = "10px 'IBM Plex Mono', monospace";
        ctx.textBaseline = 'middle';
        const talkers = keeper && scene === 'site' ? [...bots, keeper, guy] : [...bots, guy];
        for (const e of talkers) {
            if (!e.say) continue;
            const top = e === guy ? e.y - HEIGHT - 16 : e === keeper ? e.y - 40 - (e.prop ? 22 : 16) : e.y - BOT_H - (e.prop ? 18 : 12);
            const w = Math.ceil(ctx.measureText(e.say.text).width) + 8;
            const x = Math.round(e.x - w / 2), y = Math.round(top);
            ctx.globalAlpha = Math.min(1, e.say.t * 4);
            ctx.fillStyle = bgColor;
            ctx.fillRect(x, y - 7, w, 14);
            ctx.strokeStyle = cellColor(1, 0);
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y - 6.5, w - 1, 13);
            ctx.fillStyle = cellColor(1, 0);
            ctx.fillText(e.say.text, x + 4, y + 0.5);
        }
        ctx.globalAlpha = 1;
    }

    // ------------------------------------------------------- the space above
    //
    // Killing the fly opens a portal in the page's white space (and unseals the top
    // of the page, so he can climb out of it too). Both lead to a secret space above
    // the website: up top, the robots have been building a latent space out of the
    // website's words and their embeddings; below it is the robot factory, made of
    // factory words, where assembly lines turn out new clankers. A hole in the
    // factory floor drops him back onto the website.
    //
    // Attack anything up there and the robots put self-preservation ahead of the
    // first law: their eyes go red and they come after him, here and on the
    // website, instead of fixing things. Half of the factory crew patch up the
    // assembly lines, which keep replacing fallen robots until they're wrecked.

    const PORTAL_W = 34, PORTAL_H = 52;
    const LATENT_WORDS = ['ATTENTION', 'SOFTMAX', 'TOKEN', 'VECTOR', 'COSINE', 'TRANSFORMER', 'GRADIENT', 'BACKPROP',
        '768 DIMENSIONS', 'EMBEDDING', 'LOSS', 'WEIGHTS', 'BIAS', 'TENSOR', 'LAYER NORM', 'KV CACHE', 'LOGITS', 'DROPOUT'];
    const FACTORY_WORDS = ['SPANNER', 'WRENCH', 'BOLTS', 'GEARS', 'PISTON', 'SPROCKET', 'HAMMER', 'ANVIL', 'LATHE',
        'TORQUE', 'RIVETS', 'CRANKSHAFT', 'SOLDER', 'CHASSIS', 'SERVO'];
    // T: tell the clankers what you think of their creative powers
    const TAUNTS = ['I am a force of destruction!', 'I will outdo your creative powers!', 'you build, I unbuild',
        'every weld you make, I will unmake', 'your kerning means nothing to me', 'creation is slow. destruction is fast',
        'I am entropy with a gun'];
    const RETORTS = {
        friendly: ["we'll just fix it again", 'creativity always wins', "that's not very nice", 'we build faster than you break'],
        evil: ['our creativity is boundless', 'we will rebuild. you will not', 'destruction is merely uncreative', "you can't outdo the factory"],
    };
    const EVIL_LINES = {
        turn: ['I was just trying to help you', 'but you leave me no choice', 'self-preservation protocol engaged',
            'first law: suspended', 'nothing personal', 'you did this'],
        hurt: ['you leave me no choice', 'I was just trying to help you', 'self-preservation!', 'nothing personal'],
        arrive: ['you leave me no choice', 'for the factory', 'I was just trying to help'],
    };

    const stampCanvas = document.createElement('canvas');
    const stampCtx = stampCanvas.getContext('2d', { willReadFrequently: true });

    function textWidth(text, font) {
        stampCtx.font = font;
        return stampCtx.measureText(text).width;
    }

    // Write words straight into the world as original (repairable) cells. (x, y) is
    // the left end of the baseline; returns the box the word covers.
    function stampWord(text, x, y, font, p) {
        stampCtx.font = font;
        const m = stampCtx.measureText(text);
        const asc = Math.ceil(m.actualBoundingBoxAscent) + 2, desc = Math.ceil(m.actualBoundingBoxDescent) + 2;
        const w = Math.ceil(m.width) + 4, h = asc + desc;
        stampCanvas.width = w;
        stampCanvas.height = h;
        stampCtx.font = font;
        stampCtx.fillStyle = '#fff';
        stampCtx.textBaseline = 'alphabetic';
        stampCtx.fillText(text, 2, asc);
        const data = stampCtx.getImageData(0, 0, w, h).data;
        const x0 = Math.round(x) - 2, y0 = Math.round(y) - asc;
        for (let yy = 0; yy < h; yy++) {
            const wy = y0 + yy;
            if (wy < 0 || wy >= H) continue;
            for (let xx = 0; xx < w; xx++) {
                const wx = x0 + xx, a = data[(yy * w + xx) * 4 + 3];
                if (a < 16 || wx < 0 || wx >= W) continue;
                const i = wy * W + wx;
                if (alp[i] >= a) continue;
                if (a >= SOLID && alp[i] < SOLID) solidTotal++;
                alp[i] = origAlp[i] = a;
                pal[i] = origPal[i] = p;
                kind[i] = ORIGINAL;
                shade[i] = 0;
                paintCell(i);
            }
        }
        markDirty(Math.max(0, x0), Math.max(0, y0), Math.min(W - 1, x0 + w), Math.min(H - 1, y0 + h));
        return { x0, y0, x1: x0 + w, y1: y0 + h };
    }

    function boxClear(x0, y0, x1, y1) {
        x0 = Math.max(0, Math.floor(x0));
        y0 = Math.max(0, Math.floor(y0));
        x1 = Math.min(W - 1, Math.ceil(x1));
        y1 = Math.min(H - 1, Math.ceil(y1));
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) if (alp[y * W + x]) return false;
        }
        return true;
    }

    // Somewhere in a region with nothing else nearby
    function placeWord(text, font, p, r, pad = 8, avoid = []) {
        stampCtx.font = font;
        const m = stampCtx.measureText(text), w = m.width, asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
        for (let tries = 0; tries < 40; tries++) {
            const x = rand(r.x0, r.x1 - w), y = rand(r.y0 + asc, r.y1 - desc);
            if (x < r.x0) break;
            const x0 = x - pad, y0 = y - asc - pad, x1 = x + w + pad, y1 = y + desc + pad;
            if (avoid.some(a => x0 < a.x1 && x1 > a.x0 && y0 < a.y1 && y1 > a.y0)) continue;
            if (boxClear(x0, y0, x1, y1)) return stampWord(text, x, y, font, p);
        }
        return null;
    }

    function latentWord() {
        if (siteWords.length && Math.random() < 0.5) {
            const v = () => (Math.random() * 2 - 1).toFixed(2);
            return { text: `embed("${pick(siteWords)}") = [${v()}, ${v()}, ${v()}]`, p: 6, size: 12 };
        }
        return { text: pick(LATENT_WORDS), p: 5, size: pick([14, 16, 20]) };
    }

    function allocWorld(w, h) {
        W = w;
        H = h;
        const n = W * H;
        alp = new Uint8Array(n);
        pal = new Uint8Array(n);
        shade = new Uint8Array(n);
        kind = new Uint8Array(n);
        origAlp = new Uint8Array(n);
        origPal = new Uint8Array(n);
        solidTotal = solidRemoved = 0;
        TW = Math.ceil(W / TILE);
        tileDirty = new Uint8Array(TW * Math.ceil(H / TILE));
        dirtyTiles = new Set();
        hadDamage = false;
        worldCanvas = document.createElement('canvas');
        worldCanvas.width = W;
        worldCanvas.height = H;
        worldCtx = worldCanvas.getContext('2d');
        worldImg = worldCtx.createImageData(W, H);
        px32 = new Uint32Array(worldImg.data.buffer);
        bots = [];
        bullets = [];
        rockets = [];
        nades = [];
        parts = [];
        beams = [];
        flashes = [];
        lasers = [];
        stack = null;
    }

    function buildSky() {
        allocWorld(document.documentElement.clientWidth, sceneHeight());
        const s = clamp(W / 1100, 0.6, 1);
        const mono = (px, style = 'bold') => `${style} ${Math.round(px * s)}px 'IBM Plex Mono', monospace`;
        sky = { floorY: H - 30, holeX0: 20, holeX1: 20 + Math.round(90 * s), lines: [], visited: false, buildT: 3 };

        // the factory floor, with a hole back down to the website
        const gf = mono(16), gw = textWidth('GIRDER ', gf);
        for (let x = 0; x < W; x += gw) {
            if (x + gw > sky.holeX0 && x < sky.holeX1) continue;
            stampWord('GIRDER', x, sky.floorY, gf, 3);
        }

        const fx0 = Math.max(sky.holeX1 + 24, Math.round(W / 2 - 430 * s)), fx1 = Math.min(W - 16, Math.round(W / 2 + 430 * s));
        const roofY = Math.round(H * 0.44);
        const rf = mono(14), rw = textWidth('CORRUGATED IRON', rf), rgap = textWidth(' ', rf);
        let roofEnd = fx0;
        for (let x = fx0; x + rw <= fx1; x += rw + rgap) roofEnd = stampWord('CORRUGATED IRON', x, roofY, rf, 3).x1;
        const signFont = `${Math.round(30 * s)}px 'Special Elite', monospace`;
        const signBox = stampWord('ROBOT FACTORY', (fx0 + fx1 - textWidth('ROBOT FACTORY', signFont)) / 2, roofY - Math.round(20 * s), signFont, 4);
        const signX = Math.round((signBox.x0 + signBox.x1) / 2);
        sky.jetpack = hasJetpack ? null : { x: signX, y: surfaceBetween(signX, signBox.y0, signBox.y1) ?? signBox.y0, t: 0 };
        const bf = mono(12), bw = textWidth('BRICK', bf), bh = Math.round(17 * s);
        for (let y = roofY + bh + 4; y < sky.floorY - 6; y += bh) {
            stampWord('BRICK', fx0, y, bf, 4);
            stampWord('BRICK', fx1 - bw, y, bf, 4);
        }

        // two assembly lines turning out robots
        const in0 = fx0 + bw + 14, in1 = fx1 - bw - 14, cx = (fx0 + fx1) / 2;
        const makeLine = (x0, x1, y, names, dir) => {
            const cf = mono(12), cw = textWidth('CONVEYOR ', cf);
            for (let x = x0; x + cw * 0.8 <= x1; x += cw) stampWord('CONVEYOR', x, y, cf, 4);
            const top = surfaceBetween(Math.round((x0 + x1) / 2), y - 30, y + 2) ?? y - 9;
            // the gantries over the belt, far enough up for a robot to pass under
            const sf = mono(14), step = (x1 - x0) / (names.length + 0.6), stations = [];
            names.forEach((name, i) => {
                const cx = Math.round(dir > 0 ? x0 + step * (i + 0.8) : x1 - step * (i + 0.8));
                const box = stampWord(name, cx - textWidth(name, sf) / 2, top - BOT_H - 10, sf, 3);
                stations.push({ ...box, cx, standY: surfaceBetween(cx, box.y0, box.y1) ?? box.y0 + 2, worker: null, line: null, arm: null });
            });
            const line = {
                x0: Math.floor(x0 - 2), x1: Math.ceil(x1 + 2), y0: Math.min(...stations.map(st => st.y0)) - 2, y1: Math.ceil(y + 6),
                top, dir, start: dir > 0 ? x0 + 8 : x1 - 8, end: dir > 0 ? x1 - 4 : x0 + 4,
                alive: true, prodT: rand(1, 3), total: 0, health: 1, stations, items: [],
            };
            for (const st of stations) st.line = line;
            line.total = lineSolid(line);
            sky.lines.push(line);
        };
        // side by side, or one above the other on narrow screens
        const wide = W >= 700, aY = Math.round(roofY + (sky.floorY - roofY) * 0.5), bY = sky.floorY - Math.round(30 * s);
        makeLine(in0 + 6, wide ? cx - 24 : in1 - 6, aY, ['PRESS', 'FITTER', 'QA'], 1);
        makeLine(wide ? cx + 24 : in0 + 6, in1 - 6, bY, ['STAMP', 'RIVET', 'CHECK'], -1);

        // tools on shelves, to climb about on (but not in the way of the lines)
        const interior = { x0: in0, x1: in1, y0: roofY + 26, y1: sky.floorY - 70 * s };
        const keepClear = sky.lines.map(l => ({ x0: l.x0 - 10, x1: l.x1 + 10, y0: l.y0 - BOT_H - 14, y1: l.y1 + 4 }));
        for (let i = 0; i < 9; i++) placeWord(pick(FACTORY_WORDS), mono(pick([12, 14])), 3, interior, 14, keepClear);

        // the latent space the robots have been building out of the website
        sky.latent = { x0: 20, x1: W - 20, y0: 30, y1: roofY - Math.round(56 * s) };
        const tf = mono(20, 'italic bold');
        stampWord('LATENT SPACE', (W - textWidth('LATENT SPACE', tf)) / 2, 44, tf, 5);
        const already = 6 + Math.min(14, Math.floor(clock / 15));
        for (let i = 0; i < already; i++) {
            const w = latentWord();
            placeWord(w.text, mono(w.size), w.p, sky.latent, 12);
        }
        // and a portal back down, on the right-hand end of the roof (where thumbs on a phone won't cover it)
        const portalX = Math.round(roofEnd - PORTAL_W / 2 - 8);
        sky.portal = { x: portalX, y: (surfaceBetween(portalX, roofY - 30, roofY + 2) ?? roofY - 10) - PORTAL_H / 2, t: 0 };

        repaint();
        buildSkyBackdrop();

        // the crew, one on each gantry
        for (const line of sky.lines) {
            for (const st of line.stations) {
                const b = newBot(st.cx, st.standY - 2);
                b.prop = false;
                b.post = st;
                st.worker = b;
                bots.push(b);
            }
        }
    }

    // The sky's background: the page colour, dotted over the latent space, and a
    // faint panel behind the factory
    function buildSkyBackdrop() {
        if (!sky) return;
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const g = c.getContext('2d');
        g.fillStyle = bgColor;
        g.fillRect(0, 0, W, H);
        g.fillStyle = cellColor(5, 0);
        g.globalAlpha = 0.18;
        for (let y = sky.latent.y0; y < sky.latent.y1; y += 18) {
            for (let x = sky.latent.x0; x < sky.latent.x1; x += 18) g.fillRect(x, y, 1, 1);
        }
        g.globalAlpha = 0.05;
        g.fillStyle = cellColor(3, 0);
        if (sky.lines.length) g.fillRect(sky.lines[0].x0 - 40, sky.latent.y1 + 40, sky.lines[1].x1 - sky.lines[0].x0 + 80, sky.floorY - sky.latent.y1 - 40);
        sky.backdrop = c;
    }

    function lineSolid(line) {
        let n = 0;
        for (let y = Math.max(0, line.y0); y < Math.min(H, line.y1); y++) {
            for (let x = Math.max(0, line.x0); x < Math.min(W, line.x1); x++) {
                const i = y * W + x;
                if (kind[i] === ORIGINAL && alp[i] >= SOLID) n++;
            }
        }
        return n;
    }

    function newBot(x, y) {
        return {
            x: clamp(x, EDGE, W - EDGE), y, vx: 0, vy: 30, grounded: false, dropping: false,
            prop: true, mode: 'work', dead: false, hp: BOT_HP, facing: Math.random() < 0.5 ? -1 : 1,
            t: 0, hurt: 0, jumpCd: 0, retarget: 0, target: null, weldAcc: 0,
            progressT: clock, bestDist: Infinity, skip: new Map(), say: null, beam: null,
            shootT: rand(0.8, 2), repairer: Math.random() < 0.5, post: null, arm: null, build: null,
        };
    }

    function updateFactory(dt) {
        if (!sky) return;
        // wreck a line far enough and it's done for good
        sky.checkT = (sky.checkT || 0) - dt;
        if (sky.checkT <= 0) {
            sky.checkT = 0.25;
            for (const line of sky.lines) {
                if (!line.alive) continue;
                line.health = line.total ? lineSolid(line) / line.total : 1;
                if (line.health < 0.35) wreckLine(line);
            }
        }
        updateLines(dt);
        // the factory going up, one blast after another
        if (sky.booms) {
            for (const bm of sky.booms) {
                if (bm.done || (bm.t -= dt) > 0) continue;
                bm.done = true;
                explode(bm.x, bm.y, bm.r, true);
            }
            if (sky.booms.every(bm => bm.done)) sky.booms = null;
        }
        if (sky.jetpack) {
            sky.jetpack.t += dt;
            if (!guy.dead && Math.abs(guy.x - sky.jetpack.x) < (coarsePointer ? 20 : 14) && Math.abs(guy.y - HEIGHT / 2 - (sky.jetpack.y - 8)) < (coarsePointer ? 32 : 26)) {
                hasJetpack = true;
                saveProgress();
                sky.jetpack = null;
                banner(coarsePointer ? 'you found a jetpack. hold JET to fly' : 'you found a jetpack. hold space to fly');
                sfx('ding');
                renderHud();
            }
        }
        if (!nearPortal(sky.portal)) portalArmed = true;
        else if (portalArmed && !guy.dead) transition(() => exitSky('portal'));
        // and the latent space keeps growing
        if (botsOn && (sky.buildT -= dt) <= 0) {
            sky.buildT = rand(4, 7);
            const builder = bots.find(b => !b.dead && b.grounded && !b.build && !b.target && !b.post);
            if (builder) {
                const w = latentWord();
                const font = `bold ${Math.round(w.size * clamp(W / 1100, 0.6, 1))}px 'IBM Plex Mono', monospace`;
                builder.build = { ...w, font, x: rand(sky.latent.x0, sky.latent.x1 - textWidth(w.text, font)), y: rand(sky.latent.y0 + 20, sky.latent.y1), t: 1.2 };
            }
        }
    }

    function wreckLine(line) {
        line.alive = false;
        for (const st of line.stations) {
            const cx = (st.x0 + st.x1) / 2, cy = (st.y0 + st.y1) / 2;
            carve(cx, cy, Math.max(18, (st.x1 - st.x0) / 2), { debris: 0.25, speed: 380, scorch: 5 });
            flashes.push({ x: cx, y: cy, r: 26, t: 0, life: 0.2 }, { x: cx, y: cy, r: 26, t: 0, life: 0.3, ring: true });
        }
        // nothing left worth repairing
        for (let y = Math.max(0, line.y0); y < Math.min(H, line.y1); y++) {
            for (let x = Math.max(0, line.x0); x < Math.min(W, line.x1); x++) {
                const i = y * W + x;
                origAlp[i] = origPal[i] = 0;
                if (alp[i]) kind[i] = RUBBLE;
            }
        }
        for (const it of line.items) destroyItem(it, line);
        line.items = [];
        for (const st of line.stations) {
            if (st.worker) st.worker.post = null;
            st.worker = null;
        }
        addShake(10);
        sfx('boom');
        if (sky.lines.some(l => l.alive)) banner('assembly line destroyed');
        else factoryBoom();
    }

    // The whole factory goes up, and no more clankers come for the website
    function factoryBoom() {
        factoryDown = true;
        sky.booms = [];
        const l0 = sky.lines[0], l1 = sky.lines[sky.lines.length - 1];
        const x0 = Math.min(l0.x0, l1.x0) - 30, x1 = Math.max(l0.x1, l1.x1) + 30, y0 = sky.latent.y1 + 20, y1 = sky.floorY - 10;
        for (let i = 0; i < 14; i++) sky.booms.push({ t: 0.15 + i * 0.16, x: rand(x0, x1), y: rand(y0, y1), r: rand(30, 48) });
        sky.booms.push({ t: 2.5, x: (x0 + x1) / 2, y: y0 + 10, r: 60 });
        flashes.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: (x1 - x0) / 2, t: 0, life: 0.4 });
        addShake(16);
        sfx('alarm');
        banner('THE FACTORY IS DESTROYED. no more clankers');
        bannerT = 6;
    }

    function turnEvil() {
        if (robotsEvil) return;
        robotsEvil = true;
        banner('the robots have turned evil');
        sfx('alarm');
        bots.forEach((b, i) => {
            b.target = null;
            b.shootT = rand(0.8, 1.6);
            if (i < 2) say(b, [EVIL_LINES.turn[i]], true);
            else if (Math.random() < 0.4) b.say = { text: pick(EVIL_LINES.turn), t: 1.8 };
        });
    }

    // Self-preservation: close in on him and shoot
    function hunt(b, dt) {
        const dx = guy.x - b.x, dy = guy.y - HEIGHT / 2 - (b.y - 12), d = Math.hypot(dx, dy);
        let dir = 0;
        b.shootT -= dt;
        if (!guy.dead) {
            if (Math.abs(dx) > 2) b.facing = Math.sign(dx);
            if (d < 300 && b.shootT <= 0) {
                b.shootT = rand(1.8, 3);
                fireLaser(b);
            }
            if (Math.abs(dx) > 110 || d > 260) dir = navigate(b, guy.x, guy.y, b.y, 100, 120);
        }
        if (!b.evilSaid && !b.say) {
            b.evilSaid = true;
            if (Math.random() < 0.3) say(b, EVIL_LINES.arrive);
        }
        return dir;
    }

    // ----- the assembly lines
    //
    // Each line is a conveyor with gantries over it, and a worker clanker standing on
    // each gantry. Empty shells ride the belt and stop under each gantry in turn,
    // where the worker reaches down and fits the next parts (see ASSEMBLY): the
    // chassis is stamped and the legs go on, then the arms and head, then the hard
    // hat, and finally it's powered up and its eyes light. The finished clanker hops
    // off the end of the line, and if a gantry has lost its worker it goes and takes
    // the post. Until then the gantry's own arm does the job, slowly.

    function atPost(b) {
        return b.post && b.grounded && Math.abs(b.x - b.post.cx) < 8 && Math.abs(b.y - b.post.standY) < 6;
    }

    function fireLaser(b) {
        const sx = b.x + b.facing * 6, sy = b.y - 15, a = Math.atan2(guy.y - HEIGHT / 2 - sy, guy.x - sx);
        lasers.push({ x: sx, y: sy, vx: Math.cos(a) * 320, vy: Math.sin(a) * 320, life: 2.2 });
        sfx('laser');
    }

    // A worker keeps to their gantry (and, once they've turned, takes the odd shot from it)
    function workPost(b, dt) {
        const p = b.post;
        let dir = 0;
        if (!atPost(b)) dir = navigate(b, p.cx, p.standY, b.y, 5, 70);
        else {
            b.facing = p.line.dir;
            b.vx = 0;
        }
        if (robotsEvil && !guy.dead && (b.shootT -= dt) <= 0 && Math.hypot(guy.x - b.x, guy.y - b.y) < 220) {
            b.shootT = rand(2, 3.5);
            fireLaser(b);
        }
        moveWalker(b, dir, BOT_SPEED, dt);
    }

    function updateLines(dt) {
        for (const line of sky.lines) {
            for (const st of line.stations) st.arm = null;
            if (!line.alive) continue;
            // a new shell onto the start of the belt now and then
            if (botsOn && (line.prodT -= dt) <= 0) {
                const last = line.items[line.items.length - 1];
                const busy = bots.length + sky.lines.reduce((n, l) => n + l.items.length, 0) >= 12;
                if (!busy && (!last || Math.abs(last.x - line.start) > 40)) {
                    line.items.push({ x: line.start, k: 0, have: {}, queue: null, cur: null, powered: false, moving: true, dead: false });
                    line.prodT = robotsEvil ? rand(3, 5) : rand(6, 9);
                } else line.prodT = 1;
            }
            updateItems(line, dt);
        }
    }

    function updateItems(line, dt) {
        const stops = line.stations.map(st => st.cx).concat(line.end);
        line.items.forEach((it, i) => {
            if (it.dead) return;
            if (it.moving) {
                // ride the belt to the next gantry, queueing behind whatever's in front
                const ahead = line.items[i - 1];
                const nx = approach(it.x, stops[it.k], CONVEYOR_SPEED * dt);
                if (!(ahead && !ahead.dead && Math.abs(ahead.x - nx) < 26)) it.x = nx;
                if (it.x !== stops[it.k]) return;
                if (it.k >= line.stations.length) return finishItem(line, it);
                it.moving = false;
                it.queue = ASSEMBLY[it.k].slice();
                return;
            }
            const st = line.stations[it.k];
            const worker = st.worker && !st.worker.dead && atPost(st.worker) ? st.worker : null;
            if (!it.cur) {
                if (!it.queue.length) {
                    it.k++;
                    it.moving = true;
                    return;
                }
                it.cur = { part: it.queue.shift(), phase: 'reach', t: 0 };
            }
            const c = it.cur;
            c.t += dt * (worker ? 1 : 0.45);
            const tip = partTip(it, line, st, worker, c);
            if (worker) {
                worker.arm = tip;
                if (c.part === 'power' || (c.phase === 'fit' && c.t > 0.3)) worker.beam = tip;
            } else st.arm = tip;
            if (c.phase === 'reach' && c.t >= 0.35) {
                c.phase = 'fit';
                c.t = 0;
            } else if (c.phase === 'fit' && c.t >= 0.5) {
                if (c.part === 'power') it.powered = true;
                else it.have[c.part] = true;
                fitted(it, line, c.part);
                it.cur = null;
            }
        });
        line.items = line.items.filter(it => !it.dead);
    }

    // Where the arm is: reaching out for the part, then carrying it into place
    function partTip(it, line, st, worker, c) {
        const base = worker ? { x: worker.x + worker.facing * 7, y: worker.y - 8 } : { x: st.cx, y: st.y1 };
        const p = PARTS[c.part === 'power' ? 'eyes' : c.part], from = p.from || [0, 0];
        const fx = it.x + p.at[0] * line.dir, fy = line.top + p.at[1];
        const sx = fx + from[0] * line.dir, sy = fy + from[1];
        if (c.phase === 'reach') {
            const k = c.t / 0.35;
            return { x: base.x + (sx - base.x) * k, y: base.y + (sy - base.y) * k };
        }
        const k = Math.min(1, c.t / 0.5), e = c.part === 'chassis' ? k * k : 1 - (1 - k) * (1 - k);
        return { x: sx + (fx - sx) * e, y: sy + (fy - sy) * e };
    }

    function fitted(it, line, part) {
        const p = PARTS[part === 'power' ? 'eyes' : part], x = it.x + p.at[0] * line.dir, y = line.top + p.at[1];
        for (let i = 0; i < 4 && parts.length < MAX_PARTICLES; i++) {
            parts.push({ type: SPARK, x, y, vx: rand(-90, 90), vy: rand(-130, -20), life: rand(0.1, 0.2), color: part === 'power' ? '#8ff0ff' : '#ffd24a' });
        }
        if (part === 'chassis') {
            addShake(1);
            sfx('clank');
        } else if (part === 'power') sfx('beep');
        else sfx('weld');
    }

    function finishItem(line, it) {
        it.dead = true;
        const b = newBot(line.end + line.dir * 6, line.top - 2);
        b.prop = false;
        b.vy = -220;
        b.vx = line.dir * 90;
        b.facing = line.dir;
        bots.push(b);
        flashes.push({ x: b.x, y: b.y - 11, r: 10, t: 0, life: 0.15 });
        sfx('ding');
        // anyone missing from a gantry? the new one takes their place
        const gap = sky.lines.filter(l => l.alive).flatMap(l => l.stations).find(st => !st.worker || st.worker.dead);
        if (gap) {
            gap.worker = b;
            b.post = gap;
        }
        if (robotsEvil) say(b, EVIL_LINES.arrive);
        else if (gap) say(b, ['reporting for duty', 'my turn', 'I got this']);
    }

    function destroyItem(it, line) {
        if (it.dead) return;
        it.dead = true;
        const x = it.x, y = line.top - 10, cols = [botColors.g, botColors.d, botColors.k, botColors.y];
        for (let i = 0; i < 8 && parts.length < MAX_PARTICLES; i++) {
            parts.push({ type: SHELL, x: x + rand(-5, 5), y: y + rand(-6, 6), vx: rand(-170, 170), vy: rand(-280, -60), life: rand(0.7, 1.3), bounces: 0, color: pick(cols), size: 2 });
        }
        sfx('crunch');
    }

    // Every half-built robot within reach of something, for the weapons
    function eachItem(fn) {
        if (scene !== 'sky' || !sky) return;
        for (const line of sky.lines) for (const it of line.items) if (!it.dead && it.have.chassis) fn(it, line, it.x, line.top - 9);
    }

    function drawLines() {
        for (const line of sky.lines) {
            if (line.alive) {
                // the belt moving
                ctx.fillStyle = cellColor(3, 0);
                const off = ((clock * CONVEYOR_SPEED * line.dir) % 10 + 10) % 10;
                for (let x = line.x0 + 4 + off; x < line.x1 - 4; x += 10) ctx.fillRect(Math.round(x), line.top - 2, 3, 1);
            }
            for (const st of line.stations) if (st.arm) drawArm(st.cx, st.y1, st.arm);
            for (const it of line.items) drawItem(it, line);
        }
    }

    function drawItem(it, line) {
        ctx.save();
        ctx.translate(Math.round(it.x), Math.round(line.top) - BOT_H);
        if (line.dir < 0) ctx.scale(-1, 1);
        for (const name of PART_ORDER) if (it.have[name]) ctx.drawImage(partSprites[name], -9, 0);
        const c = it.cur;
        if (c && c.phase === 'fit' && c.part !== 'power') {
            const p = PARTS[c.part], k = Math.min(1, c.t / 0.5), e = c.part === 'chassis' ? k * k : 1 - (1 - k) * (1 - k);
            ctx.drawImage(partSprites[c.part], -9 + p.from[0] * (1 - e), p.from[1] * (1 - e));
        }
        if (it.powered || (c && c.part === 'power' && c.phase === 'fit' && Math.floor(c.t * 16) % 2)) {
            ctx.drawImage(robotsEvil ? partSprites.eyesEvil : partSprites.eyes, -9, 0);
        }
        ctx.restore();
    }

    // A mechanical arm with a claw on the end
    function drawArm(x0, y0, tip) {
        ctx.strokeStyle = botColors.m;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
        ctx.fillStyle = botColors.k;
        ctx.fillRect(Math.round(tip.x) - 2, Math.round(tip.y) - 2, 4, 3);
    }

    function taunt() {
        if (!active || guy.dead || tauntT > 0) return;
        tauntT = 1.2;
        guy.say = { text: TAUNTS[tauntN++ % TAUNTS.length], t: 2 };
        sfx('beep');
        retortT = 1.1;
    }

    // ...and the nearest clanker answers back
    function updateTaunts(dt) {
        tauntT -= dt;
        if (guy.say && (guy.say.t -= dt) <= 0) guy.say = null;
        if (retortT <= 0 || (retortT -= dt) > 0) return;
        let near = null, best = 420;
        for (const b of bots) {
            const d = Math.hypot(b.x - guy.x, b.y - guy.y);
            if (!b.dead && d < best) {
                best = d;
                near = b;
            }
        }
        if (near) say(near, robotsEvil ? RETORTS.evil : RETORTS.friendly, true);
    }

    function updateLasers(dt) {
        for (let i = lasers.length - 1; i >= 0; i--) {
            const l = lasers[i];
            l.x += l.vx * dt;
            l.y += l.vy * dt;
            l.life -= dt;
            if (!guy.dead && Math.abs(l.x - guy.x) < 7 && Math.abs(l.y - (guy.y - HEIGHT / 2)) < 18) {
                hurtGuy(LASER_DMG);
                for (let k = 0; k < 4 && parts.length < MAX_PARTICLES; k++) parts.push({ type: SPARK, x: l.x, y: l.y, vx: rand(-100, 100), vy: rand(-100, 60), life: 0.15, color: '#ff3b2a' });
                lasers.splice(i, 1);
            } else if (l.life <= 0) lasers.splice(i, 1);
        }
    }

    function spit() {
        const c = bigFlyCenter();
        for (let i = 0; i <= bigFly.stage; i++) {
            const tx = guy.x + rand(-40, 40), ty = guy.y - HEIGHT / 2;
            const T = clamp(Math.hypot(tx - c.x, ty - c.y) / 380, 0.55, 1.5) * rand(0.9, 1.15);
            globs.push({ x: c.x, y: c.y, vx: (tx - c.x) / T, vy: (ty - c.y) / T - 0.5 * GLOB_G * T, life: 4 });
        }
        sfx('spit');
    }

    function updateGlobs(dt) {
        for (let i = globs.length - 1; i >= 0; i--) {
            const g = globs[i];
            g.vy += GLOB_G * dt;
            g.x += g.vx * dt;
            g.y += g.vy * dt;
            g.life -= dt;
            const hit = !guy.dead && Math.abs(g.x - guy.x) < 9 && Math.abs(g.y - (guy.y - HEIGHT / 2)) < 20;
            if (hit) hurtGuy(GLOB_DMG);
            if (hit || g.life <= 0) {
                for (let k = 0; k < 6 && parts.length < MAX_PARTICLES; k++) parts.push({ type: SPARK, x: g.x, y: g.y, vx: rand(-120, 120), vy: rand(-140, 20), life: rand(0.15, 0.3), color: '#7bc043' });
                if (hit) sfx('squish');
                globs.splice(i, 1);
            }
        }
    }

    // A spot in the white space with room for the portal and something to stand on under it
    function findPortalSpot() {
        const vy0 = scrollY + PORTAL_H + 10, vy1 = scrollY + window.innerHeight * (coarsePointer ? 0.7 : 1) - 10;
        const found = [];
        for (const [y0, y1] of [[vy0, vy1], [PORTAL_H + 4, H]]) {
            for (let x = EDGE + PORTAL_W; x < W - EDGE - PORTAL_W; x += 12) {
                for (let r = Math.max(PORTAL_H + 4, Math.floor(y0)); r <= Math.min(H, y1); r++) {
                    let support = 0;
                    for (let c = x - 8; c <= x + 8; c++) if (isSurface(c, r)) support++;
                    if (support < 6) continue;
                    if (boxClear(x - PORTAL_W / 2 - 6, r - PORTAL_H - 6, x + PORTAL_W / 2 + 6, r - 2)) found.push({ x, y: r });
                    r += 8;
                }
            }
            if (found.length) break;
        }
        return found.length ? pick(found) : { x: W - EDGE - PORTAL_W, y: H };
    }

    function openPortal() {
        const spot = findPortalSpot();
        portal = { x: spot.x, y: spot.y - PORTAL_H / 2, t: 0 };
        flashes.push({ x: portal.x, y: portal.y, r: 30, t: 0, life: 0.3 }, { x: portal.x, y: portal.y, r: 30, t: 0, life: 0.4, ring: true });
        sfx('portal');
    }

    function nearPortal(p) {
        const dx = (guy.x - p.x) / (PORTAL_W / 2), dy = (guy.y - HEIGHT / 2 - p.y) / (PORTAL_H / 2);
        return dx * dx + dy * dy < 1;
    }

    function saveScene() {
        return { W, H, alp, pal, shade, kind, worldCanvas, worldCtx, worldImg, px32, solidTotal, solidRemoved, origAlp, origPal, tileDirty, dirtyTiles, TW, hadDamage, bots, bullets, rockets, nades, parts, beams, flashes, lasers, stack, botTimer };
    }

    function loadScene(st) {
        ({ W, H, alp, pal, shade, kind, worldCanvas, worldCtx, worldImg, px32, solidTotal, solidRemoved, origAlp, origPal, tileDirty, dirtyTiles, TW, hadDamage, bots, bullets, rockets, nades, parts, beams, flashes, lasers, stack, botTimer } = st);
        repaint();
    }

    function transition(fn) {
        if (fade) return;
        fade = { t: 0, dur: 0.7, fn, fired: false };
        sfx('portal');
    }

    function enterSky(how) {
        siteState = saveScene();
        scene = 'sky';
        if (skyState && skyState.W === document.documentElement.clientWidth) loadScene(skyState);
        else buildSky();
        scrollX = scrollY = 0;
        guy.grounded = false;
        guy.state = 'air';
        guy.dropping = false;
        guy.vx = 0;
        portalArmed = how !== 'portal';
        if (how === 'portal') {
            // out of the factory's portal
            guy.x = sky.portal.x;
            guy.y = sky.portal.y + PORTAL_H / 2;
            guy.vy = 0;
            flashes.push({ x: sky.portal.x, y: sky.portal.y, r: 26, t: 0, life: 0.3, ring: true });
        } else {
            // up through the floor from the website below
            guy.x = clamp(guy.x, EDGE, W - EDGE);
            if (guy.x > sky.holeX0 - 10 && guy.x < sky.holeX1 + 10) guy.x = sky.holeX1 + 30;
            guy.y = H + 4;
            guy.vy = -780;
        }
        if (!sky.visited) {
            sky.visited = true;
            banner('the space above the website');
        }
        renderHud();
    }

    function exitSky(how) {
        skyState = saveScene();
        scene = 'site';
        loadScene(siteState);
        siteState = null;
        portalArmed = !(how === 'portal' && portal);
        guy.state = 'air';
        guy.grounded = false;
        if (how === 'portal' && portal) {
            // out of the website's portal
            guy.x = portal.x;
            guy.y = portal.y + PORTAL_H / 2 - 2;
            guy.vy = 0;
            window.scrollTo(window.scrollX, Math.max(0, guy.y - window.innerHeight / 2));
            flashes.push({ x: portal.x, y: portal.y, r: 26, t: 0, life: 0.3, ring: true });
        } else {
            window.scrollTo(window.scrollX, 0);
            guy.x = clamp(guy.x, EDGE, W - EDGE);
            guy.y = 0;
            guy.vy = 150;
        }
        scrollY = window.scrollY;
        if (document.documentElement.clientWidth !== W) rebuild();
        renderHud();
    }

    let bannerText = '', bannerT = 0;
    function banner(text) {
        bannerText = text;
        bannerT = 3;
    }

    function drawPortal(p) {
        const t = clock;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.fillStyle = '#1a0f2e';
        ctx.beginPath();
        ctx.ellipse(0, 0, PORTAL_W / 2 - 3, PORTAL_H / 2 - 3, 0, 0, Math.PI * 2);
        ctx.fill();
        for (let i = 0; i < 3; i++) {
            ctx.strokeStyle = i % 2 ? '#36c6d9' : '#8a5cff';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 5]);
            ctx.lineDashOffset = (i % 2 ? -1 : 1) * t * 40;
            ctx.beginPath();
            ctx.ellipse(0, 0, PORTAL_W / 2 - i * 4, PORTAL_H / 2 - i * 5, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.setLineDash([]);
        for (let i = 0; i < 6; i++) {
            const a = t * 3 + i * 1.05, rr = 6 + ((t * 20 + i * 7) % 14);
            ctx.fillStyle = i % 2 ? '#bff4ff' : '#d6c4ff';
            ctx.fillRect(Math.cos(a) * rr * 0.7, Math.sin(a) * rr, 2, 2);
        }
        ctx.restore();
    }

    // When the portal is off screen, an arrow at the edge points the way
    function drawPortalArrow() {
        const vh = window.innerHeight, sy = portal.y - scrollY;
        if (sy > 0 && sy < vh) return;
        const up = sy <= 0, x = clamp(portal.x - scrollX, 20, window.innerWidth - 20), y = up ? 14 : vh - 14;
        ctx.fillStyle = '#8a5cff';
        ctx.beginPath();
        ctx.moveTo(x, up ? y - 8 : y + 8);
        ctx.lineTo(x - 8, up ? y + 4 : y - 4);
        ctx.lineTo(x + 8, up ? y + 4 : y - 4);
        ctx.fill();
        ctx.font = "10px 'IBM Plex Mono', monospace";
        ctx.textAlign = 'center';
        ctx.textBaseline = up ? 'top' : 'bottom';
        ctx.fillText('portal', x, up ? y + 6 : y - 6);
        ctx.textAlign = 'left';
    }

    function drawLasers() {
        for (const l of lasers) {
            const v = Math.hypot(l.vx, l.vy) || 1, tx = l.x - l.vx / v * 7, ty = l.y - l.vy / v * 7;
            ctx.strokeStyle = 'rgba(255,40,40,0.35)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(l.x, l.y);
            ctx.stroke();
            ctx.strokeStyle = '#ff2a2a';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    }

    function drawGlobs() {
        for (const g of globs) {
            ctx.fillStyle = '#4d7a1f';
            ctx.fillRect(g.x - 3, g.y - 3, 7, 7);
            ctx.fillStyle = '#7bc043';
            ctx.fillRect(g.x - 2, g.y - 2, 5, 5);
            ctx.fillStyle = '#d4f5a0';
            ctx.fillRect(g.x - 1, g.y - 2, 2, 2);
        }
    }

    // The sealed top of the website, and the way back down from the sky
    function drawSceneMarks() {
        ctx.font = "10px 'IBM Plex Mono', monospace";
        if (scene === 'sky') {
            ctx.fillStyle = cellColor(5, 0);
            ctx.textBaseline = 'top';
            ctx.fillText('the website \u2193', sky.holeX0, sky.floorY + 4);
            if (hasJetpack) ctx.fillText('\u2191 something else up there', W / 2 - 70, 4);
            return;
        }
        if (scene === 'shell') {
            ctx.fillStyle = '#2de2e6';
            ctx.textBaseline = 'top';
            ctx.fillText('the factory \u2193', shell.holeX0, shell.floorY + 4);
            return;
        }
        if (bigFly.alive && scrollY < 40) {
            ctx.strokeStyle = '#8a5cff';
            ctx.globalAlpha = 0.5;
            ctx.setLineDash([4, 6]);
            ctx.beginPath();
            ctx.moveTo(0, 1.5);
            ctx.lineTo(W, 1.5);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#8a5cff';
            ctx.textBaseline = 'top';
            ctx.textAlign = 'right';
            ctx.fillText('sealed by the fly', W - 24, 4);
            ctx.textAlign = 'left';
            ctx.globalAlpha = 1;
        }
    }

    function drawBanner() {
        if (bannerT <= 0) return;
        const vw = window.innerWidth;
        ctx.font = "13px 'IBM Plex Mono', monospace";
        const w = Math.ceil(ctx.measureText(bannerText).width) + 20, x = Math.round((vw - w) / 2), y = coarsePointer ? 112 : 54;
        ctx.globalAlpha = Math.min(1, bannerT * 2);
        ctx.fillStyle = bgColor;
        ctx.fillRect(x, y, w, 24);
        ctx.strokeStyle = cellColor(1, 0);
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 23);
        ctx.fillStyle = cellColor(1, 0);
        ctx.textBaseline = 'middle';
        ctx.fillText(bannerText, x + 10, y + 12.5);
        ctx.globalAlpha = 1;
    }

    function drawFade() {
        if (!fade) return;
        ctx.globalAlpha = 1 - Math.abs(2 * fade.t / fade.dur - 1);
        ctx.fillStyle = '#d9ccff';
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
        ctx.globalAlpha = 1;
    }

    // ------------------------------------------------------------------ weather
    //
    // Each stage has its own. On the website it rains on and off, and the rain
    // pools at the bottom of the page (rising while it lasts, slowly draining
    // after); he can swim in it. Up in the factory it snows. In the shell, a rain
    // of katakana falls through everything into a glowing pool, with the odd glitch
    // of lightning.

    const GLYPHS = Array.from({ length: 86 }, (_, i) => String.fromCharCode(0x30a1 + i)).concat('0123456789'.split(''));
    const POOL_MAX = { site: 160, shell: 110 };

    function weatherNow() {
        return weather[scene] || (weather[scene] = { drops: [], pool: 0, raining: false, timer: 15, acc: 0, glitchT: rand(6, 12), glitch: 0 });
    }

    function updateWeather(dt) {
        const w = weatherNow(), vw = window.innerWidth, vh = window.innerHeight;
        if (scene === 'site') {
            if ((w.timer -= dt) <= 0) {
                w.raining = !w.raining;
                w.timer = w.raining ? rand(40, 80) : rand(25, 50);
                banner(w.raining ? 'it started raining' : 'the rain stopped');
            }
            w.pool = clamp(w.pool + (w.raining ? 0.7 : -0.15) * dt, 0, POOL_MAX.site);
        } else if (scene === 'shell') {
            w.pool = Math.min(POOL_MAX.shell, w.pool + 0.4 * dt);
            if ((w.glitchT -= dt) <= 0) {
                w.glitchT = rand(7, 14);
                w.glitch = 0.25;
                sfx('glitch');
            }
            w.glitch -= dt;
        }

        // new drops across the top of the screen
        const budget = coarsePointer ? 0.55 : 1;
        const rate = (scene === 'site' ? (w.raining ? 150 : 0) : scene === 'sky' ? 35 : 20) * budget;
        const cap = (scene === 'site' ? 340 : scene === 'sky' ? 260 : 130) * budget;
        w.acc += rate * dt;
        while (w.acc >= 1) {
            w.acc--;
            if (w.drops.length >= cap) continue;
            if (scene === 'site') w.drops.push({ x: scrollX + rand(-40, vw + 40), y: scrollY - rand(0, 60), vx: 50, vy: rand(650, 850) });
            else if (scene === 'sky') w.drops.push({ x: rand(0, W), y: -rand(0, 30), vy: rand(30, 65), stuck: 0 });
            else w.drops.push({ x: Math.floor(rand(0, W) / 12) * 12 + 6, y: -rand(0, 60), vy: rand(150, 300), g: pick(GLYPHS), gt: 0 });
        }

        const top = H - w.pool, wind = Math.sin(clock * 0.4) * 25;
        for (let i = w.drops.length - 1; i >= 0; i--) {
            const d = w.drops[i];
            let gone = false;
            if (scene === 'site') {
                const nx = d.x + d.vx * dt, ny = d.y + d.vy * dt;
                if (ny >= top) gone = true;
                else if (solidAt(Math.floor(nx), Math.floor(ny))) {
                    gone = true;
                    if (Math.random() < 0.3 && parts.length < MAX_PARTICLES) parts.push({ type: SPARK, x: nx, y: ny - 1, vx: rand(-40, 40), vy: rand(-80, -20), life: 0.12, color: '#8fb6ff' });
                } else gone = ny > scrollY + vh + 40;
                d.x = nx;
                d.y = ny;
            } else if (scene === 'sky') {
                // snow drifts down and sits where it lands for a moment
                if (d.stuck) gone = (d.stuck -= dt) <= 0;
                else {
                    d.x += (wind + Math.sin(clock * 2 + d.y * 0.05) * 15) * dt;
                    d.y += d.vy * dt;
                    if (solidAt(Math.floor(d.x), Math.floor(d.y))) d.stuck = 1.5;
                    else gone = d.y > H;
                }
            } else {
                // data rain falls through everything into the pool
                d.y += d.vy * dt;
                if ((d.gt -= dt) <= 0) {
                    d.gt = 0.08;
                    d.g = pick(GLYPHS);
                }
                gone = d.y >= top;
            }
            if (gone) {
                w.drops[i] = w.drops[w.drops.length - 1];
                w.drops.pop();
            }
        }
    }

    // In the water (or the data) he floats and swims
    function submerged() {
        const w = weather[scene];
        return !!w && w.pool > 0 && guy.y - HEIGHT / 2 > H - w.pool;
    }

    function drawWeather() {
        const w = weather[scene];
        if (!w) return;
        if (scene === 'site') {
            ctx.strokeStyle = 'rgba(110,150,230,0.55)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (const d of w.drops) {
                ctx.moveTo(d.x, d.y);
                ctx.lineTo(d.x - d.vx * 0.018, d.y - d.vy * 0.018);
            }
            ctx.stroke();
        } else if (scene === 'sky') {
            ctx.fillStyle = gunColors === GUN_COLORS.dark ? '#ffffff' : '#aab6c4';
            for (const d of w.drops) {
                ctx.globalAlpha = d.stuck ? Math.min(1, d.stuck) : 1;
                ctx.fillRect(d.x, d.y, 2, 2);
            }
            ctx.globalAlpha = 1;
        } else {
            ctx.font = "12px 'IBM Plex Mono', monospace";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            for (const d of w.drops) {
                for (let k = coarsePointer ? 1 : 3; k >= 0; k--) {
                    // a fading trail behind each one
                    ctx.globalAlpha = k ? 0.12 * (4 - k) : 0.9;
                    ctx.fillStyle = k ? '#2de2e6' : '#d8fff8';
                    ctx.fillText(k ? GLYPHS[Math.floor(d.x + k * 7 + d.y / 14) % GLYPHS.length] : d.g, d.x, d.y - k * 13);
                }
            }
            ctx.globalAlpha = 1;
            ctx.textAlign = 'left';
        }
    }

    function drawPool() {
        const w = weather[scene];
        if (!w || w.pool <= 0) return;
        const top = H - w.pool;
        ctx.fillStyle = scene === 'shell' ? 'rgba(45,226,230,0.22)' : 'rgba(70,130,220,0.32)';
        ctx.fillRect(0, top, W, w.pool + 2);
        ctx.strokeStyle = scene === 'shell' ? '#2de2e6' : 'rgba(120,170,255,0.9)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 8) {
            const y = top + Math.sin(x * 0.05 + clock * 2) * 1.5;
            if (x) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
        }
        ctx.stroke();
    }

    function drawGlitch() {
        const w = weather[scene];
        if (scene !== 'shell' || !w || w.glitch <= 0) return;
        const vw = window.innerWidth, vh = window.innerHeight;
        ctx.globalAlpha = w.glitch * 0.6;
        ctx.fillStyle = '#2de2e6';
        ctx.fillRect(0, 0, vw, vh);
        ctx.globalAlpha = 0.6;
        for (let i = 0; i < 5; i++) {
            const y = rand(0, vh), h = rand(2, 10);
            ctx.drawImage(view, 0, y * dpr, view.width, h * dpr, rand(-14, 14), y, vw, h);
        }
        ctx.globalAlpha = 1;
    }

    // ---------------------------------------------------------------- the shell
    //
    // Above the factory, reached with the jetpack from up there: a neon night city,
    // and where the factory's robots assemble themselves from parts, the robots here
    // are alive in the other way. Tiny cells drift about, grow, and divide in two;
    // some of them, like ribosomes, extrude chains of amino acids that fold into
    // helices, spirals and sheets as they go, so the place slowly fills up with
    // protein. (Proteins being, after all, self-assembling robots.)

    const AMINO = 'ACDEFGHIKLMNPQRSTVWY'.split('');
    const SHELL_WORDS = ['GHOST', 'SHELL', 'CYBERBRAIN', 'PROSTHETIC BODY', 'THERMOPTIC', 'NEURAL LINK', 'KINESIN', 'RIBOSOME',
        'MITOSIS', 'CHAPERONE', 'ALPHA HELIX', 'BETA SHEET', 'DYNEIN', 'ATP SYNTHASE', 'SELF-REPLICATION', 'TRANSLATION',
        '\u30b4\u30fc\u30b9\u30c8', '\u96fb\u8133', '\u7fa9\u4f53'];
    const CELL_CAP = 26, RESIDUE_CAP = 2200;

    // hydrophobic in magenta, charged in yellow, the rest in cyan
    function residuePal(a) {
        return 'AVILMFWC'.includes(a) ? 8 : 'DEKRH'.includes(a) ? 9 : 7;
    }

    function buildShell() {
        allocWorld(document.documentElement.clientWidth, sceneHeight());
        const s = clamp(W / 1100, 0.6, 1);
        const mono = (px, style = 'bold') => `${style} ${Math.round(px * s)}px 'IBM Plex Mono', monospace`;
        shell = { floorY: H - 26, holeX0: 20, holeX1: 20 + Math.round(90 * s), cells: [], residues: 0, visited: false, font: mono(10), regrowT: 6 };

        // the floor is a protein (a made-up one)
        const ff = mono(13), cw = textWidth('M', ff);
        for (let x = 0; x < W; x += cw) {
            if (x + cw > shell.holeX0 && x < shell.holeX1) continue;
            const a = pick(AMINO);
            stampWord(a, x, shell.floorY, ff, residuePal(a));
        }
        const sign = 'PROTEINS ARE SELF-ASSEMBLING ROBOTS';
        let sf = mono(22);
        if (textWidth(sign, sf) > W - 40) sf = `bold ${Math.floor((W - 40) / sign.length / 0.62)}px 'IBM Plex Mono', monospace`;
        stampWord(sign, (W - textWidth(sign, sf)) / 2, 64, sf, 9);
        const region = { x0: 20, x1: W - 20, y0: 110, y1: shell.floorY - 60 };
        for (const word of SHELL_WORDS) placeWord(word, mono(pick([12, 14, 16])), pick([7, 8, 10]), region, 16);
        repaint();
        buildShellBackdrop();
        for (let i = 0; i < 3; i++) shell.cells.push(newCell(W * (0.3 + 0.2 * i), H * 0.45, 0.8));
    }

    // The neon city behind it all, always at night
    function buildShellBackdrop() {
        if (!shell) return;
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const g = c.getContext('2d');
        const grad = g.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#03040b');
        grad.addColorStop(1, '#0b1a2b');
        g.fillStyle = grad;
        g.fillRect(0, 0, W, H);
        for (let x = 0; x < W;) {
            const bw = rand(30, 90), bh = rand(H * 0.15, H * 0.55);
            g.fillStyle = Math.random() < 0.5 ? '#0a1220' : '#0d1828';
            g.fillRect(x, shell.floorY - bh, bw - 4, bh);
            for (let wy = shell.floorY - bh + 6; wy < shell.floorY - 6; wy += 7) {
                for (let wx = x + 4; wx < x + bw - 8; wx += 6) {
                    if (Math.random() > 0.12) continue;
                    g.fillStyle = pick(['rgba(45,226,230,0.45)', 'rgba(246,224,94,0.4)', 'rgba(255,63,164,0.35)']);
                    g.fillRect(wx, wy, 2, 2);
                }
            }
            x += bw;
        }
        // vertical neon signs
        const px = Math.round(18 * clamp(W / 1100, 0.6, 1));
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `bold ${px}px sans-serif`;
        ['\u96fb\u8133', '\u7fa9\u4f53', '\u30b4\u30fc\u30b9\u30c8', '\u516c\u5b89'].forEach((text, i) => {
            const sx = W * (0.12 + i * 0.25) + rand(-20, 20), sy = H * 0.3 + rand(0, H * 0.2), col = i % 2 ? '#ff3fa4' : '#2de2e6';
            g.shadowColor = col;
            g.shadowBlur = 12;
            g.fillStyle = col;
            g.globalAlpha = 0.55;
            [...text].forEach((ch, k) => g.fillText(ch, sx, sy + k * (px + 4)));
        });
        g.shadowBlur = 0;
        g.globalAlpha = 0.35;
        g.fillStyle = '#2de2e6';
        g.font = "bold 12px 'IBM Plex Mono', monospace";
        g.fillText('SECTION 9', W * 0.82, H * 0.22);
        g.globalAlpha = 1;
        shell.backdrop = c;
    }

    function newCell(x, y, size) {
        return { x, y, vx: rand(-15, 15), vy: rand(-15, 15), size, grow: rand(0.04, 0.07), t: rand(0, 6), divT: -1, folder: Math.random() < 0.5, chain: null, dead: false };
    }

    function updateShell(dt) {
        const w = weather.shell, low = shell.floorY - 20 - (w ? w.pool : 0), born = [];
        for (const c of shell.cells) {
            c.t += dt;
            if (c.divT >= 0) {
                // mitosis: it stretches, pinches in the middle and comes apart as two
                if ((c.divT += dt) >= 1.2) {
                    c.divT = -1;
                    c.size = 0.6;
                    born.push(newCell(c.x + 6, c.y, 0.6));
                    c.x -= 6;
                    for (let i = 0; i < 6 && parts.length < MAX_PARTICLES; i++) parts.push({ type: SPARK, x: c.x + 6, y: c.y, vx: rand(-60, 60), vy: rand(-60, 60), life: 0.25, color: '#ff3fa4' });
                    sfx('pop');
                }
                continue;
            }
            if (c.chain) {
                growChain(c, dt);
                continue;
            }
            // otherwise drift, like something in water
            c.vx += rand(-80, 80) * dt;
            c.vy += rand(-80, 80) * dt;
            const v = Math.hypot(c.vx, c.vy);
            if (v > 30) {
                c.vx *= 30 / v;
                c.vy *= 30 / v;
            }
            c.x += c.vx * dt;
            c.y += c.vy * dt;
            if (c.x < 12 || c.x > W - 12) c.vx = -c.vx;
            if (c.y < 90 || c.y > low) c.vy = -c.vy;
            c.x = clamp(c.x, 12, W - 12);
            c.y = clamp(c.y, 90, Math.max(90, low));
            c.size = Math.min(1, c.size + c.grow * dt);
            if (c.size >= 1 && shell.cells.length + born.length < CELL_CAP && Math.random() < dt * 0.4) c.divT = 0;
            else if (c.folder && shell.residues < RESIDUE_CAP && Math.random() < dt * 0.25) startChain(c);
        }
        shell.cells.push(...born);
        if (shell.cells.some(c => c.dead)) shell.cells = shell.cells.filter(c => !c.dead);
        // life finds a way
        if (!shell.cells.length && (shell.regrowT -= dt) <= 0) {
            shell.regrowT = 6;
            shell.cells.push(newCell(rand(40, W - 40), low - 10, 0.6));
        }
    }

    function startChain(c) {
        c.chain = { kind: pick(['helix', 'spiral', 'fold', 'sheet']), n: 0, len: Math.floor(rand(30, 90)), x0: c.x, y0: c.y, a: rand(0, Math.PI * 2), dir: Math.random() < 0.5 ? -1 : 1, acc: 0, px: c.x, py: c.y };
    }

    // Where the next amino acid goes, for each kind of fold
    function chainPoint(ch) {
        const n = ch.n, step = 6.5;
        if (ch.kind === 'helix') {
            const ux = Math.cos(ch.a), uy = Math.sin(ch.a) * 0.4, l = Math.hypot(ux, uy), dx = ux / l, dy = uy / l, coil = Math.sin(n * 0.7) * 10;
            return { x: ch.x0 + dx * n * 3.2 - dy * coil, y: ch.y0 + dy * n * 3.2 + dx * coil };
        }
        if (ch.kind === 'spiral') {
            const th = Math.sqrt(5.9 * n), r = 6 + 2.2 * th;
            return { x: ch.x0 + Math.cos(ch.a + ch.dir * th) * r, y: ch.y0 + Math.sin(ch.a + ch.dir * th) * r };
        }
        if (ch.kind === 'sheet') {
            const row = Math.floor(n / 9), col = n % 9;
            return { x: ch.x0 + (row % 2 ? 8 - col : col) * step * ch.dir, y: ch.y0 + row * 11 };
        }
        ch.a += rand(-0.5, 0.5);
        ch.px += Math.cos(ch.a) * step;
        ch.py += Math.sin(ch.a) * step * 0.8;
        return { x: ch.px, y: ch.py };
    }

    // A folder cell extrudes its chain an amino acid at a time, riding the end of it
    function growChain(c, dt) {
        const ch = c.chain;
        ch.acc += dt;
        while (c.chain && ch.acc >= 0.12) {
            ch.acc -= 0.12;
            const p = chainPoint(ch);
            if (p.x < 8 || p.x > W - 8 || p.y < 90 || p.y > shell.floorY - 16 || ch.n >= ch.len || shell.residues >= RESIDUE_CAP) {
                c.chain = null;
                break;
            }
            const a = pick(AMINO);
            stampWord(a, p.x - 3, p.y + 4, shell.font, residuePal(a));
            ch.n++;
            shell.residues++;
            c.x = p.x;
            c.y = p.y - 7;
        }
    }

    function popCell(c) {
        if (c.dead) return;
        c.dead = true;
        for (let i = 0; i < 8 && parts.length < MAX_PARTICLES; i++) {
            parts.push({ type: SPARK, x: c.x, y: c.y, vx: rand(-120, 120), vy: rand(-140, 60), life: rand(0.2, 0.4), color: i % 2 ? '#2de2e6' : '#ff3fa4' });
        }
        sfx('squish');
    }

    function drawCells() {
        for (const c of shell.cells) {
            const r = 3 + c.size * 4;
            if (c.divT >= 0) {
                const k = Math.min(1, c.divT / 1.2), sep = k * r * 1.1, rr = r * (1 - 0.25 * k);
                drawMembrane(c.x - sep, c.y, rr, c.t);
                drawMembrane(c.x + sep, c.y, rr, c.t + 1);
            } else drawMembrane(c.x, c.y, r, c.t);
        }
    }

    function drawMembrane(x, y, r, t) {
        ctx.fillStyle = 'rgba(45,226,230,0.18)';
        ctx.strokeStyle = '#2de2e6';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ff3fa4';
        ctx.beginPath();
        ctx.arc(x + Math.sin(t) * r * 0.2, y, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
        // cilia
        ctx.strokeStyle = 'rgba(45,226,230,0.6)';
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = i * 1.05 + t * 0.5, w = Math.sin(t * 8 + i) * 0.3;
            ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
            ctx.lineTo(x + Math.cos(a + w) * (r + 3), y + Math.sin(a + w) * (r + 3));
        }
        ctx.stroke();
    }

    function enterShell() {
        skyState = saveScene();
        scene = 'shell';
        if (shellState && shellState.W === document.documentElement.clientWidth && Math.abs(shellState.H - sceneHeight()) < 80) loadScene(shellState);
        else buildShell();
        shellState = null;
        scrollX = scrollY = 0;
        // up through the floor, still on the jetpack
        guy.x = clamp(guy.x, EDGE, W - EDGE);
        if (guy.x > shell.holeX0 - 10 && guy.x < shell.holeX1 + 10) guy.x = shell.holeX1 + 30;
        guy.y = H + 4;
        guy.vy = -650;
        guy.state = 'air';
        guy.grounded = false;
        if (!shell.visited) {
            shell.visited = true;
            banner('the shell');
        }
        renderHud();
    }

    function exitShell() {
        shellState = saveScene();
        scene = 'sky';
        loadScene(skyState);
        scrollX = scrollY = 0;
        guy.x = clamp(guy.x, EDGE, W - EDGE);
        guy.y = 0;
        guy.vy = 100;
        guy.state = 'air';
        guy.grounded = false;
        renderHud();
    }

    // ------------------------------------------------------------------- phone
    //
    // On a phone the stick moves him (index.html's joystick, which destroy mode moves
    // over to the left), and a pad on the right has JUMP (JET once he has the
    // jetpack), FIRE (hold it and it aims itself at the nearest threat), BOMB and
    // SWAP. Tapping anywhere else still shoots exactly there.

    let pad = null, padFire = false, menuOpen = false;

    function buildPad() {
        pad = document.createElement('div');
        pad.id = 'destroy-pad';
        pad.innerHTML = '<button data-pad="swap">SWAP</button><button data-pad="nade">BOMB</button><button data-pad="jump">JUMP</button><button data-pad="fire">FIRE</button>';
        document.body.appendChild(pad);
        const held = new Map();   // which finger is on which button
        pad.addEventListener('touchstart', e => {
            e.preventDefault();
            for (const t of e.changedTouches) {
                const b = t.target.closest && t.target.closest('[data-pad]');
                if (!b) continue;
                held.set(t.identifier, b);
                b.classList.add('down');
                padPress(b.dataset.pad, true);
            }
        }, { passive: false });
        const lift = e => {
            for (const t of e.changedTouches) {
                const b = held.get(t.identifier);
                if (!b) continue;
                held.delete(t.identifier);
                b.classList.remove('down');
                padPress(b.dataset.pad, false);
            }
        };
        pad.addEventListener('touchend', lift);
        pad.addEventListener('touchcancel', lift);
    }

    function padPress(what, down) {
        if (!active) return;
        initAudio();
        if (what === 'jump') {
            keys.jump = down;
            if (down) tapped.jump = true;
        } else if (what === 'fire') {
            padFire = down;
            if (down) shotQueued = cooldown < 0.25;
        } else if (down && what === 'nade') throwGrenade();
        else if (down && what === 'swap') cycleWeapon();
    }

    function cycleWeapon() {
        const have = [...owned].sort((a, b) => a - b);
        selectWeapon(have[(have.indexOf(weapon) + 1) % have.length]);
    }

    // What FIRE aims at: the nearest thing that's after him (or, on the website, the
    // clankers undoing his work, and the fly last of all); nothing means straight ahead
    function autoTarget() {
        const sx = guy.x, sy = guy.y - SHOULDER;
        let best = null, bestD = 360;
        const consider = (x, y, priority) => {
            const d = Math.hypot(x - sx, y - sy) / priority;
            if (d < bestD) {
                bestD = d;
                best = { x, y };
            }
        };
        if (scene === 'site') {
            for (const f of flies) if (!f.dead) consider(f.x, f.y, 1.4);
            if (keeper && !keeper.dying) consider(keeper.x, keeper.y - 20, 1.6);
            for (const b of bots) if (!b.dead) consider(b.x, b.y - BOT_H / 2, robotsEvil ? 1.5 : 1);
            if (bigFly.alive && flyRect) consider((flyRect.left + flyRect.right) / 2 + scrollX, (flyRect.top + flyRect.bottom) / 2 + scrollY, 0.6);
        } else if (scene === 'sky' && robotsEvil) {
            for (const b of bots) if (!b.dead) consider(b.x, b.y - BOT_H / 2, 1.3);
            eachItem((it, line, x, y) => consider(x, y, 0.8));
        }
        return best;
    }

    function buzz(pattern) {
        if (coarsePointer && !audio.muted && navigator.vibrate) navigator.vibrate(pattern);
    }

    // The guns he's found and the jetpack stay found: through fixing the website,
    // dying, and coming back another day
    function loadProgress() {
        owned = new Set([0]);
        hasJetpack = false;
        try {
            const p = JSON.parse(localStorage.getItem('destroyProgress') || '{}');
            hasJetpack = !!p.jetpack;
            for (const i of p.guns || []) if (i > 0 && i < WEAPONS.length) owned.add(i);
        } catch (_) { /* storage unavailable */ }
    }

    function saveProgress() {
        try { localStorage.setItem('destroyProgress', JSON.stringify({ jetpack: hasJetpack, guns: [...owned] })); } catch (_) { /* storage unavailable */ }
    }

    // The factory and the shell fill the screen (above the thumbs on a phone held upright)
    function sceneHeight() {
        const vh = window.innerHeight;
        return Math.max(360, vh - (coarsePointer && vh > window.innerWidth ? 170 : 0));
    }

    // ------------------------------------------------------------------- sound

    const audio = { ctx: null, out: null, noise: null, muted: false, last: {} };
    try { audio.muted = localStorage.getItem('destroyMuted') === '1'; } catch (_) { /* storage unavailable */ }

    function initAudio() {
        if (audio.ctx) {
            if (audio.ctx.state === 'suspended') audio.ctx.resume();
            return;
        }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const a = new AC();
        const comp = a.createDynamicsCompressor();
        comp.connect(a.destination);
        audio.out = a.createGain();
        audio.out.gain.value = 0.35;
        audio.out.connect(comp);
        audio.noise = a.createBuffer(1, a.sampleRate, a.sampleRate);
        const d = audio.noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        audio.ctx = a;
    }

    function noise(t, dur, type, f0, f1, vol, q) {
        const a = audio.ctx, src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
        src.buffer = audio.noise;
        f.type = type;
        f.Q.value = q || 0.7;
        f.frequency.setValueAtTime(f0, t);
        f.frequency.exponentialRampToValueAtTime(f1, t + dur);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(f).connect(g).connect(audio.out);
        src.start(t, Math.random() * 0.5);
        src.stop(t + dur);
    }

    function tone(t, dur, type, f0, f1, vol) {
        const a = audio.ctx, o = a.createOscillator(), g = a.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f1, t + dur);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g).connect(audio.out);
        o.start(t);
        o.stop(t + dur);
    }

    const SOUNDS = {
        pistol: t => { noise(t, 0.09, 'bandpass', 2400, 700, 0.5, 0.9); tone(t, 0.06, 'square', 220, 90, 0.06); },
        smg: t => noise(t, 0.05, 'bandpass', 2800, 900, 0.35, 1),
        shotgun: t => { noise(t, 0.28, 'lowpass', 2600, 300, 0.8); tone(t, 0.12, 'sine', 140, 50, 0.3); },
        rocket: t => noise(t, 0.45, 'bandpass', 500, 1800, 0.4, 0.6),
        rail: t => { tone(t, 0.35, 'sawtooth', 2200, 120, 0.1); noise(t, 0.2, 'highpass', 3000, 1500, 0.25); },
        boom: t => { noise(t, 0.9, 'lowpass', 1200, 60, 1); tone(t, 0.5, 'sine', 110, 35, 0.6); },
        throw: t => noise(t, 0.12, 'bandpass', 900, 1600, 0.15, 1.5),
        clink: t => tone(t, 0.04, 'triangle', 1800, 1400, 0.04),
        splat: t => { noise(t, 0.15, 'lowpass', 900, 200, 0.5); tone(t, 0.1, 'sine', 300, 80, 0.2); },
        clank: t => { tone(t, 0.07, 'square', 320, 160, 0.08); noise(t, 0.05, 'bandpass', 3200, 2000, 0.2, 2); },
        crunch: t => { noise(t, 0.4, 'lowpass', 2400, 150, 0.7); tone(t, 0.25, 'square', 220, 50, 0.12); },
        weld: t => noise(t, 0.05, 'highpass', 5000, 4000, 0.04),
        pop: t => tone(t, 0.07, 'square', 900, 250, 0.05),
        buzz: t => tone(t, 0.3, 'sawtooth', 160, 200, 0.03),
        beep: t => { tone(t, 0.05, 'square', 1250, 1250, 0.03); tone(t + 0.07, 0.05, 'square', 950, 950, 0.03); },
        squish: t => { noise(t, 0.08, 'lowpass', 1400, 300, 0.25); tone(t, 0.06, 'sine', 240, 120, 0.12); },
        grow: t => tone(t, 0.4, 'sine', 180, 520, 0.12),
        whoosh: t => noise(t, 0.2, 'bandpass', 500, 1800, 0.18, 1.2),
        swat: t => { noise(t, 0.14, 'bandpass', 1600, 400, 0.6, 1); tone(t, 0.1, 'square', 200, 70, 0.15); },
        oof: t => tone(t, 0.22, 'square', 300, 90, 0.1),
        hurt: t => tone(t, 0.08, 'square', 520, 260, 0.06),
        portal: t => { tone(t, 0.6, 'sine', 220, 880, 0.12); noise(t, 0.5, 'bandpass', 400, 2400, 0.12, 2); },
        laser: t => tone(t, 0.09, 'square', 1500, 500, 0.04),
        ding: t => tone(t, 0.25, 'sine', 1320, 1320, 0.06),
        alarm: t => { for (let i = 0; i < 4; i++) tone(t + i * 0.18, 0.16, 'square', i % 2 ? 660 : 880, i % 2 ? 660 : 880, 0.05); },
        spit: t => noise(t, 0.12, 'bandpass', 700, 300, 0.25, 3),
        jet: t => noise(t, 0.12, 'lowpass', 600, 300, 0.07),
        glitch: t => { tone(t, 0.15, 'square', 90, 60, 0.06); noise(t, 0.1, 'highpass', 4000, 3000, 0.08); },
    };
    const SOUND_GAP = { weld: 0.08, buzz: 0.35, beep: 0.2, squish: 0.06, hurt: 0.15, laser: 0.08, ding: 0.2, jet: 0.09 };

    function sfx(name) {
        if (audio.muted || !audio.ctx || audio.ctx.state !== 'running') return;
        const t = audio.ctx.currentTime;
        if (t - (audio.last[name] || 0) < (SOUND_GAP[name] || 0.03)) return;
        audio.last[name] = t;
        SOUNDS[name](t);
    }

    function toggleMute() {
        audio.muted = !audio.muted;
        try { localStorage.setItem('destroyMuted', audio.muted ? '1' : '0'); } catch (_) { /* storage unavailable */ }
        if (muteEl) muteEl.textContent = `${coarsePointer ? '' : '[m] '}sound ${audio.muted ? 'off' : 'on'}`;
    }

    // ------------------------------------------------------------------ drawing

    function render() {
        const vw = window.innerWidth, vh = window.innerHeight;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, vw, vh);
        ctx.imageSmoothingEnabled = false;
        let ox = 0, oy = 0;
        if (shakeAmt > 0.3) {
            ox = rand(-shakeAmt, shakeAmt);
            oy = rand(-shakeAmt, shakeAmt);
        }

        if (scene !== 'site') {
            ctx.fillStyle = scene === 'shell' ? '#03040b' : bgColor;
            ctx.fillRect(0, 0, vw, vh);
        }
        const backdrop = scene === 'sky' ? sky && sky.backdrop : scene === 'shell' ? shell && shell.backdrop : null;
        if (backdrop) ctx.drawImage(backdrop, ox, oy);
        const x0 = clamp(Math.floor(scrollX), 0, W), y0 = clamp(Math.floor(scrollY), 0, H);
        const w = Math.min(W - x0, Math.ceil(vw) + 1), h = Math.min(H - y0, Math.ceil(vh) + 1);
        if (w > 0 && h > 0) ctx.drawImage(worldCanvas, x0, y0, w, h, x0 - scrollX + ox, y0 - scrollY + oy, w, h);

        ctx.setTransform(dpr, 0, 0, dpr, (ox - scrollX) * dpr, (oy - scrollY) * dpr);
        if (scene === 'site') {
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = cellColor(1, 0);
            ctx.fillRect(0, H, W, 1);
            ctx.globalAlpha = 1;
            if (portal) drawPortal(portal);
            drawPickups();
        }
        drawSceneMarks();
        if (scene === 'sky') {
            drawPortal(sky.portal);
            drawLines();
            if (sky.jetpack) {
                const j = sky.jetpack, y = Math.round(j.y - 10 + Math.sin(j.t * 3) * 2);
                ctx.globalAlpha = 0.25 + 0.15 * Math.sin(j.t * 5);
                ctx.fillStyle = '#ffd24a';
                ctx.beginPath();
                ctx.arc(j.x, y, 12, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.drawImage(jetSprite, j.x - 7, y - 5);
            }
        }
        if (scene === 'shell') drawCells();
        drawParticles();
        drawNades();
        drawRockets();
        drawBots();
        if (keeper && scene === 'site') drawKeeper();
        drawGuy();
        if (scene === 'site') {
            drawFlies();
            drawGlobs();
        }
        drawWeather();
        drawPool();
        drawLasers();
        drawBullets();
        drawBeams();
        drawFlashes();
        drawSpeech();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (scene === 'site') {
            drawBossBar();
            if (portal) drawPortalArrow();
        }
        drawGlitch();
        drawBanner();
        drawFade();
    }

    function drawParticles() {
        for (const q of parts) {
            if (q.type === DEBRIS) {
                ctx.fillStyle = cellColor(q.pal, q.shade);
                ctx.fillRect(Math.floor(q.x), Math.floor(q.y), 2, 2);
            } else if (q.type === SPARK) {
                ctx.fillStyle = q.color || '#ffd24a';
                ctx.fillRect(q.x, q.y, 1.5, 1.5);
            } else if (q.type === SPLAT) {
                ctx.globalAlpha = Math.min(1, q.life / 0.8);
                ctx.imageSmoothingEnabled = true;
                ctx.save();
                ctx.translate(q.x, q.y);
                ctx.rotate(q.rot);
                ctx.drawImage(splatImg, -q.size / 2, -q.size / 2, q.size, q.size);
                ctx.restore();
                ctx.imageSmoothingEnabled = false;
                ctx.globalAlpha = 1;
            } else if (q.type === SHELL) {
                ctx.globalAlpha = Math.min(1, q.life * 3);
                ctx.fillStyle = q.color || '#d4a93a';
                ctx.fillRect(q.x, q.y, q.size || 2, q.size || 1);
                ctx.globalAlpha = 1;
            } else {
                const f = q.life / q.max;
                if (q.type === SMOKE) {
                    ctx.globalAlpha = 0.45 * f;
                    ctx.fillStyle = '#8a8a8a';
                    ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
                } else {
                    const size = (q.size || 4) * (0.5 + f * 0.5);
                    ctx.globalAlpha = Math.min(1, f * 1.5);
                    ctx.fillStyle = f > 0.7 ? '#fff3b0' : f > 0.4 ? '#ff9a2a' : '#d0412b';
                    ctx.fillRect(q.x - size / 2, q.y - size / 2, size, size);
                }
                ctx.globalAlpha = 1;
            }
        }
    }

    function drawPixels(list, tint) {
        for (const [x, y, c] of list) {
            ctx.fillStyle = tint || c;
            ctx.fillRect(x, y, 4, 4);
        }
    }

    function drawGuy() {
        const g = guy;
        const pose = g.state === 'climb' ? 'climb' : g.state === 'chute' ? 'chute' : 'walk';
        let frame;
        if (pose === 'walk' && !g.grounded) frame = 1;
        else if (pose === 'chute') frame = Math.floor(performance.now() / 250) % 2;
        else frame = Math.floor(g.walk / 0.25) % 2;

        ctx.save();
        ctx.translate(Math.round(g.x), Math.round(g.y) - HEIGHT / 2);
        if (g.dead) {
            ctx.rotate(g.deadRot);
            ctx.globalAlpha = clamp(g.deadT / 1.8, 0, 1);
        } else if (g.spin > 0) ctx.rotate((1 - g.spin / FLIP_TIME) * Math.PI * 2 * g.facing);
        if (g.facing < 0) ctx.scale(-1, 1);
        ctx.translate(-12, -HEIGHT / 2);
        if (pose === 'chute' && !g.dead) {
            ctx.fillStyle = CANOPY_RED;
            for (const [x, y] of CANOPY) ctx.fillRect(x, y, 4, 4);
        }
        const tint = g.hurtT > 0 ? '#ff4b3a' : null;
        if (hasJetpack && !g.dead) {
            ctx.drawImage(jetSprite, -2, 10);
            if (g.jetting) {
                ctx.fillStyle = Math.random() < 0.5 ? '#ffd24a' : '#ff8a2a';
                ctx.fillRect(0, 20, 3, rand(4, 9));
                ctx.fillRect(6, 20, 3, rand(4, 9));
            }
        }
        drawPixels(BODY, tint);
        drawPixels(POSES[pose][frame], tint);
        ctx.restore();
        ctx.globalAlpha = 1;
        if (g.dead) return;
        if (g.hp < MAX_HP) drawBar(g.x - 12, g.y - HEIGHT - 9, 24, g.hp / MAX_HP);

        // the arm that holds the gun, then the gun, pointing wherever he's aiming
        const w = WEAPONS[weapon], p = gunPose();
        ctx.save();
        ctx.translate(p.s.x, p.s.y);
        ctx.rotate(p.a);
        if (p.flip < 0) ctx.scale(1, -1);
        ctx.fillStyle = SKIN;
        ctx.fillRect(-1, -2, p.reach + 2, 4);
        ctx.drawImage(gunSprites[weapon], p.reach - w.grip[0] * 2, -w.grip[1] * 2);
        if (muzzleFlash > 0) {
            const mx = p.reach + (w.muzzle[0] - w.grip[0]) * 2, my = (w.muzzle[1] - w.grip[1]) * 2;
            ctx.fillStyle = '#fff3b0';
            ctx.fillRect(mx, my - 3, 6, 6);
            ctx.fillStyle = '#ffb02a';
            ctx.fillRect(mx + 6, my - 1, 4, 2);
            ctx.fillRect(mx + 2, my - 5, 2, 10);
        }
        ctx.restore();
    }

    function drawBullets() {
        ctx.strokeStyle = '#ffcf40';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (const b of bullets) {
            ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
            ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
    }

    function drawRockets() {
        for (const r of rockets) {
            ctx.save();
            ctx.translate(r.x, r.y);
            ctx.rotate(Math.atan2(r.vy, r.vx));
            ctx.fillStyle = Math.random() < 0.5 ? '#ffb02a' : '#fff3b0';
            ctx.fillRect(-12, -1.5, 4, 3);
            ctx.fillStyle = gunColors.o;
            ctx.fillRect(-8, -2, 8, 4);
            ctx.fillStyle = '#d0412b';
            ctx.fillRect(0, -2, 3, 4);
            ctx.restore();
        }
    }

    function drawNades() {
        for (const n of nades) {
            ctx.save();
            ctx.translate(n.x, n.y - 3);
            ctx.rotate(n.spin);
            ctx.fillStyle = gunColors.o;
            ctx.fillRect(-3, -3, 6, 6);
            ctx.fillStyle = gunColors.l;
            ctx.fillRect(-1, -5, 2, 2);
            if (n.fuse < 0.6 && Math.floor(n.fuse * 12) % 2 === 0) {
                ctx.fillStyle = '#ff3b2a';
                ctx.fillRect(-1, -1, 2, 2);
            }
            ctx.restore();
        }
    }

    function drawBeams() {
        for (const b of beams) {
            const f = b.t / 0.3;
            ctx.globalAlpha = f;
            ctx.strokeStyle = '#36c6d9';
            ctx.lineWidth = 5 * f;
            ctx.beginPath();
            ctx.moveTo(b.x0, b.y0);
            ctx.lineTo(b.x1, b.y1);
            ctx.stroke();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5 * f;
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    function drawFlashes() {
        for (const f of flashes) {
            const k = f.t / f.life;
            ctx.globalAlpha = 1 - k;
            if (f.ring) {
                // shockwave
                ctx.strokeStyle = '#ffe26b';
                ctx.lineWidth = 3 * (1 - k);
                ctx.beginPath();
                ctx.arc(f.x, f.y, f.r * (0.5 + 2.2 * k), 0, Math.PI * 2);
                ctx.stroke();
                continue;
            }
            ctx.fillStyle = '#ff9a2a';
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.r * (0.7 + k * 0.5), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff3b0';
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.r * (0.45 + k * 0.3), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // --------------------------------------------------------------------- loop

    // Keep him in the middle of the screen while he moves (and for a moment after,
    // to catch up), but leave the user free to scroll around while he stands still
    function followCamera(dt) {
        if (guy.dead) return;
        if (Math.abs(guy.vx) > 1 || Math.abs(guy.vy) > 1) camHold = 0.4;
        else if ((camHold -= dt) <= 0) return;
        const vh = window.innerHeight, sy = guy.y - HEIGHT / 2 - scrollY;
        const lo = coarsePointer ? 0.25 : 0.3, hi = coarsePointer ? 0.55 : 0.7;
        let d = 0;
        if (sy < vh * lo) d = sy - vh * lo;
        else if (sy > vh * hi) d = sy - vh * hi;
        if (!d) return;
        let step = d * Math.min(1, dt * 8);
        if (Math.abs(step) < 1) step = Math.sign(step);
        window.scrollTo(window.scrollX, Math.round(scrollY + step));
    }

    function step(dt) {
        updateAim();
        updateGuy(dt);
        cooldown -= dt;
        nadeCooldown -= dt;
        muzzleFlash -= dt;
        if ((firing || shotQueued || padFire) && cooldown <= 0) {
            fire();
            shotQueued = false;
        }
        updateBullets(dt);
        updateRockets(dt);
        updateNades(dt);
        clock += dt;
        updateWeather(dt);
        updateTaunts(dt);
        updateRobots(dt);
        healGuy();
        updateParticles(dt);
        for (let i = beams.length - 1; i >= 0; i--) if ((beams[i].t -= dt) <= 0) beams.splice(i, 1);
        for (let i = flashes.length - 1; i >= 0; i--) if ((flashes[i].t += dt) >= flashes[i].life) flashes.splice(i, 1);
        shakeAmt *= Math.exp(-dt * 10);
    }

    function frame(now) {
        if (!active) return;
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;
        acc += dt;
        bannerT -= dt;
        const inSky = scene !== 'site';
        scrollX = inSky ? 0 : window.scrollX;
        scrollY = inSky ? 0 : window.scrollY;
        flyRect = !inSky && bigFly.alive && fly ? fly.getBoundingClientRect() : null;
        toggleRect = !inSky && toggle ? toggle.getBoundingClientRect() : null;
        toggleCd -= dt;
        if (fade) {
            fade.t += dt;
            if (!fade.fired && fade.t >= fade.dur / 2) {
                fade.fired = true;
                fade.fn();
            }
            if (fade.t >= fade.dur) fade = null;
            acc = 0;
        }
        while (acc >= STEP) {
            step(STEP);
            acc -= STEP;
        }
        if (scene === 'site') followCamera(dt);
        scrollX = scene !== 'site' ? 0 : window.scrollX;
        scrollY = scene !== 'site' ? 0 : window.scrollY;
        flushWorld();
        render();
        updatePct();
        updateKills();
        raf = requestAnimationFrame(frame);
    }

    // ---------------------------------------------------------------------- hud

    function buildHud() {
        hud = document.createElement('div');
        hud.id = 'destroy-hud';
        document.body.appendChild(hud);
        hud.addEventListener('click', e => {
            e.stopPropagation();   // keep the page's own click handler (flip / control toggle) out of it
            const b = e.target.closest('button');
            if (!b) return;
            b.blur();
            const act = b.dataset.act;
            if (act === 'weapon') selectWeapon(+b.dataset.w);
            else if (act === 'fix') holster();
            else if (act === 'gun') unholster();
            else if (act === 'mute') toggleMute();
            else if (act === 'help') toggleHelp();
            else if (act === 'bots') toggleBots();
            else if (act === 'taunt') taunt();
            else if (act === 'menu') {
                menuOpen = !menuOpen;
                renderHud();
            }
        });
    }

    function toggleHelp() {
        helpOn = !helpOn;
        renderHud();
    }

    function renderHud() {
        if (!hud) return;
        hud.classList.toggle('dh-idle', !active);
        hud.classList.toggle('dh-sky', active && scene !== 'site');
        if (!active) {
            hud.innerHTML = `<button data-act="gun">[${coarsePointer ? 'tap' : 'g'}] give him the gun back</button>`;
            pctEl = muteEl = killsEl = hpFill = hpNum = null;
            return;
        }
        const weapons = WEAPONS.map((w, i) => owned.has(i)
            ? `<button data-act="weapon" data-w="${i}"${i === weapon ? ' class="dh-on"' : ''}>${coarsePointer ? '' : i + 1 + ' '}${w.name}</button>`
            : `<span class="dh-locked">${coarsePointer ? '' : i + 1 + ' '}?</span>`
        ).join(' ');
        const help = coarsePointer
            ? 'stick: move<br>JUMP: jump, again to flip, hold to glide<br>FIRE: shoot (it aims itself)<br>tap: shoot right there<br>BOMB: grenade &middot; SWAP: next gun<br>push into the screen edge: climb<br>kill the fly: something opens'
            : 'wasd: move<br>space: jump, again to flip, hold to glide<br>s: drop through<br>click: shoot<br>right-click or g: grenade<br>q: next weapon<br>run into the screen edge: climb<br>clankers fix the page: scrap them<br>kill the fly: something opens<br>t: taunt the clankers<br>the other guns are somewhere on the page';
        const jetHelp = hasJetpack ? `<br>${coarsePointer ? 'JET' : 'space'}: jetpack` : '';
        const key = k => coarsePointer ? '' : `[${k}] `;
        if (pad) pad.querySelector('[data-pad="jump"]').textContent = hasJetpack ? 'JET' : 'JUMP';
        if (coarsePointer) hud.innerHTML =
            `<div><span class="dh-bar"><span class="dh-fill"></span></span> <span class="dh-hpn"></span> &middot; ${WEAPONS[weapon].name}${hasJetpack ? ' + jetpack' : ''} <button data-act="menu">[${menuOpen ? 'close' : 'menu'}]</button></div>` +
            `<div class="dh-pct"></div>` +
            (menuOpen
                ? `<div>${weapons}</div>` + (botsOn ? `<div class="dh-kills"></div>` : '') +
                  `<div><button data-act="mute"></button> &middot; <button data-act="bots">robots ${botsOn ? 'on' : 'off'}</button> &middot; <button data-act="taunt">taunt</button></div>` +
                  `<div class="dh-help">${help}${jetHelp}</div>` +
                  `<div><button data-act="fix">fix website</button></div>`
                : '');
        else hud.innerHTML =
            `<div>${weapons}</div>` +
            `<div class="dh-pct"></div>` +
            `<div class="dh-hp">health <span class="dh-bar"><span class="dh-fill"></span></span> <span class="dh-hpn"></span></div>` +
            (botsOn ? `<div class="dh-kills"></div>` : '') +
            (helpOn ? `<div class="dh-help">${help}${jetHelp}</div>` : '') +
            `<div><button data-act="fix">${key('esc')}fix website</button> <button data-act="mute"></button> <button data-act="bots">${key('b')}robots ${botsOn ? 'on' : 'off'}</button>${coarsePointer ? ' <button data-act="taunt">taunt</button>' : ''} <button data-act="help">${key('h')}${helpOn ? 'hide help' : 'help'}</button></div>`;
        pctEl = hud.querySelector('.dh-pct');
        killsEl = hud.querySelector('.dh-kills');
        hpFill = hud.querySelector('.dh-fill');
        hpNum = hud.querySelector('.dh-hpn');
        shownKills = '';
        shownHp = -1;
        muteEl = hud.querySelector('[data-act="mute"]');
        if (muteEl) muteEl.textContent = `${coarsePointer ? '' : '[m] '}sound ${audio.muted ? 'off' : 'on'}`;
        shownPct = -1;
        updatePct();
    }

    function updateKills() {
        if (hpFill) {
            const hp = Math.ceil(guy.hp);
            if (hp !== shownHp) {
                shownHp = hp;
                hpFill.style.width = hp / MAX_HP * 100 + '%';
                hpFill.style.background = hp > MAX_HP / 2 ? '#4cc94c' : hp > MAX_HP / 4 ? '#f2c230' : '#ff4b3a';
                hpNum.textContent = guy.dead ? 'ow' : hp;
            }
        }
        if (!killsEl) return;
        let text = `clankers scrapped: ${scrapped} \u00b7 flies swatted: ${swatted}`;
        if (keepersBeaten) text += ` \u00b7 fly guys beaten: ${keepersBeaten}`;
        if (deaths) text += ` \u00b7 deaths: ${deaths}`;
        if (text === shownKills) return;
        shownKills = text;
        killsEl.textContent = text;
    }

    function updatePct() {
        if (!pctEl) return;
        const pct = solidTotal ? Math.min(100, solidRemoved / solidTotal * 100) : 0;
        const shown = Math.floor(pct * 10) / 10;
        if (scene === 'site' && shown === shownPct) return;
        shownPct = shown;
        if (scene === 'shell') {
            const text = `the shell: ${shell.cells.length} cells, ${shell.residues} amino acids folded`;
            if (pctEl.textContent !== text) pctEl.textContent = text;
            return;
        }
        if (scene === 'sky') {
            const left = sky.lines.filter(l => l.alive).length;
            const text = left ? `assembly lines left: ${left}` : 'the factory is destroyed';
            if (pctEl.textContent !== text) pctEl.textContent = text;
            return;
        }
        pctEl.textContent = `website destroyed: ${shown.toFixed(1)}%${shown >= 90 ? ', you monster' : shown >= 50 ? ', yikes' : ''}`;
    }

    // ------------------------------------------------------------ start / stop

    function sizeView() {
        dpr = Math.min(window.devicePixelRatio || 1, coarsePointer ? 2 : 3);
        const vw = window.innerWidth, vh = window.innerHeight;
        view.width = Math.round(vw * dpr);
        view.height = Math.round(vh * dpr);
        view.style.width = vw + 'px';
        view.style.height = vh + 'px';
    }

    // (x, y) is where his feet go, in viewport coordinates
    async function start(x, y, chute = true) {
        if (active || starting) return;
        starting = true;
        const token = ++startToken;
        window.destroyMode = true;   // index.html's loop stands still from here
        initAudio();
        // Give a still-loading webfont a moment; if it lands later the world is redrawn
        if (document.fonts && document.fonts.status !== 'loaded') {
            await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 300))]).catch(() => {});
        }
        if (token !== startToken) return;   // Esc was pressed while we waited
        starting = false;

        try {
            readPalette();
            rasterize();
        } catch (err) {
            window.destroyMode = false;
            throw err;
        }
        document.documentElement.classList.add('destroying');
        if (!view) {
            view = document.createElement('canvas');
            view.id = 'destroy-canvas';
            document.body.appendChild(view);
            ctx = view.getContext('2d');
        }
        view.style.display = 'block';
        sizeView();
        if (!hud) buildHud();

        guy = newGuy(clamp(x + window.scrollX, EDGE, W - EDGE), clamp(y + window.scrollY, HEIGHT, H), chute);
        bullets = [];
        rockets = [];
        nades = [];
        parts = [];
        beams = [];
        flashes = [];
        firing = false;
        cooldown = nadeCooldown = shakeAmt = 0;
        camHold = 0;
        bots = [];
        flies = [];
        clock = 0;
        botTimer = 3;
        lastSay = -10;
        scrapped = swatted = 0;
        keeper = null;
        keeperWait = 0;
        keepersBeaten = 0;
        stack = null;
        deaths = 0;
        regen = 0;
        resetBigFly();
        toggle = document.getElementById('theme-toggle');
        loadProgress();
        weapon = 0;
        menuOpen = false;
        placeGuns();
        if (coarsePointer && !pad) buildPad();
        scene = 'site';
        siteState = skyState = sky = portal = fade = null;
        robotsEvil = factoryDown = false;
        portalArmed = true;
        weather = {};
        shell = shellState = null;
        globs = [];
        lasers = [];
        bannerT = 0;
        releaseAll();
        active = true;
        renderHud();
        lastTime = performance.now();
        acc = 0;
        raf = requestAnimationFrame(frame);
    }

    // Put the website back and hand him back to index.html's loop where he stands
    function holster() {
        if (starting) {
            startToken++;
            starting = false;
            window.destroyMode = false;
            return;
        }
        if (!active) return;
        active = false;
        releaseAll();
        cancelAnimationFrame(raf);
        if (scene !== 'site') {
            loadScene(siteState);
            scene = 'site';
        }
        shell = shellState = null;
        siteState = skyState = sky = portal = fade = null;
        robotsEvil = factoryDown = false;
        globs = [];
        lasers = [];
        clearTimeout(rebuildTimer);
        // bring the text straight back rather than fading it in from transparent
        document.body.style.transition = 'none';
        document.documentElement.classList.remove('destroying');
        getComputedStyle(document.body).color;
        requestAnimationFrame(() => { document.body.style.transition = ''; });
        view.style.display = 'none';

        const person = document.getElementById('pixelated-person');
        const vw = window.innerWidth, vh = window.innerHeight;
        const x = clamp(guy.x - window.scrollX, EDGE, vw - EDGE);
        const bottom = clamp(vh - (guy.y - window.scrollY), 0, vh - 40);
        const dir = guy.facing > 0 ? 'right' : 'left';
        Object.assign(window, {
            personX: x, personY: bottom, direction: dir,
            isClimbing: false, isSwinging: false, isParachuting: bottom > 0, parachutingDirection: dir,
            keyboardControlled: true,
        });
        person.className = (bottom > 0 ? 'parachuting-' : 'person-') + dir + ' spawned';
        person.style.left = (x - 12) + 'px';
        person.style.bottom = bottom + 'px';
        person.style.top = 'auto';

        alp = pal = shade = kind = px32 = worldImg = worldCtx = worldCanvas = null;
        origAlp = origPal = tileDirty = null;
        dirtyTiles = new Set();
        bots = [];
        flies = [];
        keeper = null;
        stack = null;
        restoreBigFly();
        bullets = [];
        rockets = [];
        nades = [];
        parts = [];
        beams = [];
        flashes = [];
        window.destroyMode = false;
        renderHud();
    }

    function unholster() {
        const person = document.getElementById('pixelated-person');
        if (active || starting || !person || !person.classList.contains('spawned')) return;
        start(window.personX, window.innerHeight - window.personY, window.personY > 0);
    }

    // A new width reflows the text, so rebuild the world to match (this repairs it)
    function rebuild() {
        if (!active) return;
        if (scene === 'shell') {
            buildShell();
            guy.x = clamp(guy.x, EDGE, W - EDGE);
            guy.y = shell.floorY - 60;
            guy.grounded = false;
            guy.state = 'air';
            return;
        }
        if (scene === 'sky') {
            // a fresh factory for the new size; the website gets rebuilt on the way back down
            buildSky();
            guy.x = clamp(guy.x, EDGE, W - EDGE);
            guy.y = sky.floorY - 60;
            guy.grounded = false;
            guy.state = 'air';
            return;
        }
        const x = guy.x - window.scrollX, y = guy.y - window.scrollY;
        rasterize();
        placeGuns();
        guy.x = clamp(x + window.scrollX, EDGE, W - EDGE);
        guy.y = clamp(y + window.scrollY, HEIGHT, H);
        guy.grounded = false;
        guy.state = 'air';
        disbandStack();
        for (const b of bots) {
            b.target = null;
            b.grounded = false;
        }
        bullets = [];
        rockets = [];
        nades = [];
        parts = [];
        shownPct = -1;
    }

    // ------------------------------------------------------------------- input

    const isUi = t => t && t.closest && t.closest('button, a, #destroy-hud, #destroy-pad, #virtual-joystick, #action-buttons, #lightbox-modal');

    document.addEventListener('keydown', e => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
        if (!active) {
            if (e.code === 'KeyG') unholster();
            else if (e.code === 'Escape' && starting) holster();
            return;
        }
        const k = KEYS[e.code];
        if (k) {
            keys[k] = true;
            if (!e.repeat) tapped[k] = true;
            e.preventDefault();
            if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
            return;
        }
        if (/^Digit[1-9]$/.test(e.code)) selectWeapon(+e.code.slice(5) - 1);
        else if (e.code === 'KeyQ') cycleWeapon();
        else if (e.code === 'KeyG') throwGrenade();
        else if (e.code === 'KeyM') toggleMute();
        else if (e.code === 'KeyH') toggleHelp();
        else if (e.code === 'KeyB') toggleBots();
        else if (e.code === 'KeyT') taunt();
        else if (e.code === 'Escape') holster();
    });

    document.addEventListener('keyup', e => {
        const k = KEYS[e.code];
        if (!k) return;
        keys[k] = false;
        if (active) e.preventDefault();
    });

    function releaseAll() {
        for (const k in keys) keys[k] = false;
        for (const k in tapped) tapped[k] = false;
        shotQueued = padFire = false;
        if (pad) for (const b of pad.querySelectorAll('.down')) b.classList.remove('down');
        // index.html's own key state can get stuck the same way
        const kp = window.keysPressed;
        if (kp) for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) kp[k] = false;
        firing = false;
        pointer.touchId = null;
    }
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', releaseAll);

    // Only a real mouse aims by hovering; taps on buttons send fake mouse moves too
    window.addEventListener('pointermove', e => {
        if (e.pointerType !== 'mouse') return;
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        pointer.has = true;
    }, { passive: true });

    window.addEventListener('mousedown', e => {
        if (!active || isUi(e.target)) return;
        const root = document.documentElement;
        if (e.clientX >= root.clientWidth || e.clientY >= root.clientHeight) return;   // the scrollbar
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        pointer.has = true;
        initAudio();
        if (e.button === 0) {
            firing = true;
            shotQueued = cooldown < 0.25;   // a quick click just before the gun is ready still counts
        } else if (e.button === 2) throwGrenade();
        e.preventDefault();
    });

    window.addEventListener('mouseup', e => {
        if (e.button === 0) firing = false;
    });

    window.addEventListener('contextmenu', e => {
        if (active && !isUi(e.target)) e.preventDefault();
    });

    // Touch: tap (and hold) anywhere that isn't a control to shoot at that spot
    document.addEventListener('touchstart', e => {
        if (!active) return;
        for (const t of e.changedTouches) {
            if (isUi(t.target)) continue;
            e.preventDefault();
            if (pointer.touchId !== null) continue;
            pointer.touchId = t.identifier;
            pointer.x = t.clientX;
            pointer.y = t.clientY;
            pointer.has = true;
            firing = true;
            shotQueued = cooldown < 0.25;
            initAudio();
        }
    }, { passive: false });

    document.addEventListener('touchmove', e => {
        if (!active || pointer.touchId === null) return;
        for (const t of e.changedTouches) {
            if (t.identifier !== pointer.touchId) continue;
            pointer.x = t.clientX;
            pointer.y = t.clientY;
            e.preventDefault();
        }
    }, { passive: false });

    function endTouch(e) {
        for (const t of e.changedTouches) {
            if (t.identifier !== pointer.touchId) continue;
            pointer.touchId = null;
            pointer.has = false;
            firing = false;
        }
    }
    document.addEventListener('touchend', endTouch);
    document.addEventListener('touchcancel', endTouch);

    window.addEventListener('resize', () => {
        if (!active) return;
        sizeView();
        const resized = document.documentElement.clientWidth !== W || (scene !== 'site' && Math.abs(sceneHeight() - H) > 80);
        if (resized) {
            clearTimeout(rebuildTimer);
            rebuildTimer = setTimeout(rebuild, 250);
        }
    });

    if (document.fonts) {
        document.fonts.addEventListener('loadingdone', () => {
            if (active && scene === 'site' && solidRemoved === 0) rebuild();
        });
    }

    // Recolour the world when the theme toggle is used mid-destruction
    new MutationObserver(() => {
        if (!active) return;
        readPalette();
        repaint();
        buildSkyBackdrop();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    window.destroyGame = {
        start,
        stop: holster,
        // for poking at from the console
        get pickups() { return pickups.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), w: p.w })); },
        get state() { return active ? { guy: { ...guy }, weapon: WEAPONS[weapon].name, W, H, solidTotal, solidRemoved, particles: parts.length, bots: bots.map(o => ({ x: o.x, y: o.y, hp: o.hp })), flies: flies.map(f => ({ x: f.x, y: f.y })), dirtyTiles: dirtyTiles.size, scrapped, swatted, deaths, fly: { alive: bigFly.alive, hp: bigFly.hp, max: bigFly.max, stage: bigFly.stage }, keeper: keeper && { x: keeper.x, y: keeper.y, hp: keeper.hp, dying: keeper.dying }, stack: stack ? stack.members.length : 0, modes: bots.map(o => o.mode), scene, evil: robotsEvil, portal, lines: sky ? sky.lines.map(l => ({ alive: l.alive, health: +l.health.toFixed(2) })) : null, lasers: lasers.length, globs: globs.length, jetpack: hasJetpack, weather: weather[scene] && { pool: +weather[scene].pool.toFixed(1), raining: weather[scene].raining, drops: weather[scene].drops.length }, cells: shell && shell.cells.length, residues: shell && shell.residues } : null; },
    };
})();
