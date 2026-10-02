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

    // Once he's merged with Project 2501 he's a cyborg: synthetic skin, purple hair,
    // a slate suit with cyan seams (outlined, so he still shows up on a white page),
    // and the guns come out of his arm. ARMS are drawn from the shoulder, in the same
    // units as WEAPONS' grip and muzzle.
    const CYBORG = { [SKIN]: '#ecd5c4', [BLUE]: '#3b4252', [HAIR]: '#6a3fa0', [SHIRT]: '#6b7590' };
    const CYBORG_LEGS = { [SKIN]: '#4a5468', [BLUE]: '#3b4252' };
    const CY_BODY = BODY.map(([x, y, c]) => [x, y, CYBORG[c]]);
    // the first square of each frame is the back arm, the rest are legs (in the suit)
    const CY_POSES = Object.fromEntries(Object.entries(POSES).map(([pose, frames]) =>
        [pose, frames.map(f => f.map(([x, y, c], i) => [x, y, (i ? CYBORG_LEGS : CYBORG)[c]]))]));
    const ARM_COLORS = { s: '#ecd5c4', m: '#3b4252', l: '#8a94a6', c: '#2de2e6', p: '#ff3fa4' };
    const ARMS = [
        { art: ['sscmmmmm..', 'sscllllllc', 'sscmmmmm..'], grip: [3.5, 1.5], muzzle: [10, 1.5] },
        { art: ['..cmmmmmmmm.', 'sscllllllllc', 'sscmlmlmlmm.', 'sscllllllllc', '..cmmmmmmmm.'], grip: [3.5, 2.5], muzzle: [12, 2.5] },
        { art: ['..cmmmmmmmmmll', 'sscmmmmmmmmmmc', 'sscllllllllllc', 'sscmmmmmmmmmmc', '..cmmmmmmmmmll'], grip: [3.5, 2.5], muzzle: [14, 2.5] },
        { art: ['...cmmmmmmmmmmm.', '..cmpppppppppppm', 'sscmmmmmmmmmmmmc', '..cmpppppppppppm', '...cmmmmmmmmmmm.'], grip: [3.5, 2.5], muzzle: [16, 2.5] },
        { art: ['..c.m.m.m.m.m.m.', 'sscllllllllllllc', 'ssccccccccccccc.', 'sscllllllllllllc', '..c.m.m.m.m.m.m.'], grip: [3.5, 2.5], muzzle: [16, 2.5] },
    ];
    const DEPLOY = 0.18;        // how long an arm weapon takes to unfold
    // Thermoptic camouflage: energy drained and recharged per second, the least it
    // takes to switch on, and how long a shot gives him away for
    const CAMO = { drain: 1 / 7, charge: 1 / 10, min: 0.25, reveal: 0.3 };

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
    let camoFill = null, camoNum = null, shownCamo = '';
    let awayShown = false;
    let raf = 0, lastTime = 0, acc = 0, rebuildTimer = 0, startToken = 0, camHold = 0;
    let helpOn = false;   // the controls, folded away until asked for; the levels have hints of their own
    let guy = null;
    let weapon = 0, cooldown = 0, nadeCooldown = 0, firing = false, shotQueued = false, muzzleFlash = 0, shakeAmt = 0, deployT = 0;
    let camo = false, camoE = 1, camoReveal = 0, lastSeenX = 0, lastSeenY = 0;
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
    let gunSprites = [], armSprites = [], botSprites = null, flySprites = [], keeperSprites = null, partSprites = {};

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
        armSprites = ARMS.map(a => artCanvas(a.art, ARM_COLORS));
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
        buildFoeSprites();
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
        if (scene === 'sky' && snowCaps && snowCaps.world === worldCanvas) updateSnowCaps(dirtyX0, dirtyY0, dirtyX1, dirtyY1);
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
        const left = !!(keys.left || kp.ArrowLeft), right = !!(keys.right || kp.ArrowRight), hacked = guy && guy.hackT > 0;
        return {
            left: hacked ? right : left,
            right: hacked ? left : right,
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
            g.vy += GRAVITY * gravScale() * dt;
            g.x += g.vx * dt;
            g.y += g.vy * dt;
            g.deadRot += dt * 10;
            if ((g.deadT -= dt) <= 0) {
                guy = newGuy(clamp(g.x, EDGE, W - EDGE), Math.max(HEIGHT, scrollY + 20), true);
                guy.facing = g.facing;
            }
            return;
        }

        if (scene === 'net') {
            // no up or down in here: he just floats wherever he's pushed
            const ax = (k.right ? 1 : 0) - (k.left ? 1 : 0), ay = (k.down ? 1 : 0) - (k.up || k.space ? 1 : 0);
            // (in world units, as fast across the screen whatever the zoom)
            const z = net ? net.z : 1;
            g.vx = approach(g.vx, ax * 230, 900 * dt);
            g.vy = approach(g.vy, ay * 230, 900 * dt);
            g.x += g.vx * dt / z;
            g.y += g.vy * dt / z;
            g.grounded = false;
            g.state = 'air';
            if (Math.hypot(g.vx, g.vy) > 20) g.walk += dt;
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
            g.vy += GRAVITY * gravScale() * (k.down ? 1.8 : 1) * (swim ? 0.25 : 1) * dt;
            if (gliding) g.vy = Math.min(g.vy, Math.max(CHUTE_FALL, vy0 - 1800 * dt));
            if (g.jetting) {
                g.vy = Math.max(-JET_MAX, g.vy - JET_THRUST * dt);
                if (Math.random() < 0.6 && parts.length < MAX_PARTICLES) {
                    parts.push({ type: FIRE, x: g.x - g.facing * 7 + rand(-2, 2), y: g.y - 10, vx: rand(-20, 20), vy: rand(150, 260), life: rand(0.15, 0.3), max: 0.3, size: rand(2, 4) });
                }
                sfx('jet');
            }
            g.vy = Math.min(g.vy, swim ? 110 : (k.down ? FAST_FALL : MAX_FALL) * (scene === 'shell' ? 0.5 : 1));
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
                    if (scene === 'sky' && !factoryDown && !merged) sealZap();
                }
                if (scene !== 'site' && g.y > H + 30) transition(() => (scene === 'sky' ? exitSky('fall') : exitShell()));
            }
        }
        if (g.grounded) g.state = 'ground';
    }

    // The top of the website is sealed until the fly's dead, and the top of the
    // factory level until the factory's been blown up (and it's out of reach
    // without the jetpack anyway)
    function canRiseOut() {
        return scene === 'site' ? !bigFly.alive : scene === 'sky' && hasJetpack && (factoryDown || merged);
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
        let target = pointer.has ? { x: pointer.x + scrollX, y: pointer.y + scrollY } : padFire ? autoTarget() : null;
        // a tap near something worth shooting is taken to mean it (fingers are blunt)
        if (target && pointer.touchId !== null) target = assistTarget(target.x, target.y) || target;
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

    // What his gun looks like, and where it fires from: in his hand, or (merged) part of his arm
    function gunOf(i) {
        return merged ? ARMS[i] : WEAPONS[i];
    }

    function muzzleOf(w, pose) {
        const mx = (w.muzzle[0] - w.grip[0]) * 2, my = (w.muzzle[1] - w.grip[1]) * 2 * pose.flip;
        return { x: pose.hx + pose.cos * mx - pose.sin * my, y: pose.hy + pose.sin * mx + pose.cos * my };
    }

    // ------------------------------------------------------------------ weapons

    function fire() {
        if (guy.dead || scene === 'net') return;   // nothing to shoot in the ether
        const w = WEAPONS[weapon], pose = gunPose(), m = muzzleOf(gunOf(weapon), pose);
        cooldown = w.cooldown;
        if (camo) camoReveal = CAMO.reveal;   // the shot gives him away
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
        if (merged) {
            // no brass from an arm cannon, just the heat coming off it
            for (let i = 0; i < 2 && parts.length < MAX_PARTICLES; i++) {
                parts.push({ type: SPARK, x: m.x, y: m.y, vx: rand(-60, 60) - pose.cos * 40, vy: rand(-80, 20), life: rand(0.08, 0.16), color: '#2de2e6' });
            }
        } else if (parts.length < MAX_PARTICLES) {
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

    // Right-click (G, the pad's CAMO): a grenade, or once he's merged, thermoptic camouflage
    function altFire() {
        if (merged) toggleCamo();
        else throwGrenade();
    }

    // It drains while it's on and charges while it's off. Hidden, nothing can find
    // him: the flies lose him, the fly guy and the evil clankers stop shooting and
    // chasing, and the fly spits at where he was, until a shot gives him away.
    function toggleCamo() {
        if (!active || guy.dead) return;
        if (!camo && camoE < CAMO.min) {
            sfx('glitch');
            return;
        }
        camo = !camo;
        camoReveal = 0;
        sfx(camo ? 'cloak' : 'decloak');
        for (let i = 0; i < 14 && parts.length < MAX_PARTICLES; i++) {
            parts.push({ type: SPARK, x: guy.x + rand(-8, 8), y: guy.y - rand(0, HEIGHT), vx: rand(-50, 50), vy: rand(-70, 10), life: rand(0.2, 0.45), color: i % 2 ? '#d8fff8' : '#2de2e6' });
        }
    }

    function updateCamo(dt) {
        camoReveal -= dt;
        deployT -= dt;
        if (guy.hackT > 0) guy.hackT -= dt;
        if (camo) {
            camoE = Math.max(0, camoE - CAMO.drain * dt);
            if (camoE <= 0 || guy.dead) {
                camo = false;
                sfx('decloak');
            }
        } else camoE = Math.min(1, camoE + CAMO.charge * dt);
        if (!hidden()) {
            lastSeenX = guy.x;
            lastSeenY = guy.y - HEIGHT / 2;
        }
    }

    function hidden() {
        return camo && camoReveal <= 0 && !guy.dead;
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
        if (scene === 'shell' && shell) {
            for (const c of shell.cells) if (segDist2(c.x, c.y, x, y, x1, y1)[0] < 100) popCell(c);
            for (const f of shell.foes) if (!f.dead && segDist2(f.x, f.y - 20, x, y, x1, y1)[0] < 196) hurtFoe(f, 99, cos * 200);
            if (shell.tank) {
                const b = tankBody();
                if (segDist2(b.x, b.y, x, y, x1, y1)[0] < (TANK_R + 4) ** 2) hurtTank(20);
            }
        }
    }

    // (`sparing`: whatever fired it, which it doesn't hurt; `light`: leaves the text alone)
    function explode(x, y, R, harmless, sparing, light) {
        if (!light) carve(x, y, R, { debris: 0.18, speed: 420, scorch: 6 });
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
        if (scene === 'shell' && shell) {
            for (const c of shell.cells) if (Math.hypot(c.x - x, c.y - y) < R * 1.3) popCell(c);
            for (const f of shell.foes) {
                const fd = Math.hypot(f.x - x, f.y - 20 - y);
                if (!f.dead && fd < R * 1.5) hurtFoe(f, 1 + 5 * (1 - fd / (R * 1.5)), (f.x - x) / (fd || 1) * 300);
            }
            if (shell.tank && shell.tank !== sparing) {
                const b = tankBody(), td = Math.max(0, Math.hypot(b.x - x, b.y - y) - TANK_R);
                if (td < R * 1.2) hurtTank(Math.ceil(10 * (1 - td / (R * 1.2))));
            }
        }
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
            n.vy = Math.min(n.vy + GRAVITY * gravScale() * dt, MAX_FALL);
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
                q.vy = Math.min(q.vy + GRAVITY * gravScale() * dt, MAX_FALL);
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
                q.vy += GRAVITY * gravScale() * dt;
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
                q.vy += GRAVITY * 0.4 * gravScale() * dt;
                q.x += q.vx * dt;
                q.y += q.vy * dt;
            } else if (q.type === SPLAT) {
                // stays where it splatted while it fades
            } else {
                // smoke and fire drift up and slow down
                const drag = Math.exp(-dt * 3);
                if (q.type === SMOKE) q.vx += (wind * 0.5 - q.vx) * dt;
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
        saveProgress();
        cooldown = Math.max(cooldown, 0.12);
        if (merged) {
            deployT = DEPLOY;
            sfx('deploy');
        }
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
                if (merged) deployT = DEPLOY;
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
        lost: ['where did he go?', 'I know you are here', 'come out and fight', 'is that a shimmer?'],
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
        fly.setAttribute('src', flyDead ? 'assets/squashed-fly.webp' : bigFly.startSrc);
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
        flyDead = true;
        saveProgress();
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
            if (!guy.dead) spit();   // hidden, it spits at where he was
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
        const seen = !hidden(), cx = seen ? guy.x : lastSeenX, cy = seen ? guy.y - HEIGHT / 2 : lastSeenY;
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
        // they swarm him and bite (but don't carry him off)
        if (!touching || guy.dead || !seen) return;
        sfx('buzz');
        hurtGuy(Math.min(touching, 6) * FLY_BITE * dt);
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
        } else if (hidden()) {
            if (!k.lost) say(k, KEEPER_LINES.lost, true);
            k.lost = true;
        } else if (!guy.dead) {
            k.lost = false;
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
        if (guy.dead || hidden()) return;
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
        if (scene === 'net') {
            updateNet(dt);
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
        if (scene === 'shell' && shell) {
            for (const c of shell.cells) if (!c.dead) test(c, 'cell', c.x, c.y, 5 + c.size * 4);
            for (const f of shell.foes) if (!f.dead) test(f, 'foe', f.x, f.y - 20, 11);
            if (shell.tank && shell.tank.landed && !shell.tank.dying) {
                const b = tankBody();
                test(shell.tank, 'tank', b.x, b.y, TANK_R);
            }
        }
        return best;
    }

    function damageEnemy(hit, dmg, vx, vy) {
        const v = Math.hypot(vx, vy) || 1;
        if (hit.kind === 'fly') killFly(hit.e);
        else if (hit.kind === 'item') destroyItem(hit.e.it, hit.e.line);
        else if (hit.kind === 'cell') popCell(hit.e);
        else if (hit.kind === 'foe') hurtFoe(hit.e, dmg, vx / v * 50);
        else if (hit.kind === 'tank') hurtTank(dmg);
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
        const talkers = keeper && scene === 'site' ? [...bots, keeper, guy] : scene === 'shell' && shell ? [...bots, ...shell.foes, guy] : [...bots, guy];
        for (const e of talkers) {
            if (!e.say) continue;
            const top = e === guy ? e.y - HEIGHT - 16 : e.foe ? e.y - 56 : e === keeper ? e.y - 40 - (e.prop ? 22 : 16) : e.y - BOT_H - (e.prop ? 18 : 12);
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
        sky.fx0 = fx0;
        sky.fx1 = fx1;
        sky.latentBoxes = [];
        const rf = mono(14), rw = textWidth('CORRUGATED IRON', rf), rgap = textWidth(' ', rf);
        let roofEnd = fx0;
        for (let x = fx0; x + rw <= fx1; x += rw + rgap) roofEnd = stampWord('CORRUGATED IRON', x, roofY, rf, 3).x1;
        const signFont = `${Math.round(30 * s)}px 'Special Elite', monospace`;
        const signBox = stampWord('ROBOT FACTORY', (fx0 + fx1 - textWidth('ROBOT FACTORY', signFont)) / 2, roofY - Math.round(20 * s), signFont, 4);
        const signX = Math.round((signBox.x0 + signBox.x1) / 2);
        sky.jetpack = hasJetpack ? null : { x: signX, y: surfaceBetween(signX, signBox.y0, signBox.y1) ?? signBox.y0, t: 0 };
        const bf = mono(12), bw = textWidth('BRICK', bf), bh = Math.round(17 * s);
        for (let y = roofY + bh + 4; y < sky.floorY - 6; y += bh) stampWord('BRICK', fx1 - bw, y, bf, 4);
        // the left wall's a ladder, rungs well inside a jump apart, up through the roof
        // to where the jetpack is (on the sign)
        const rf2 = mono(13), rungW = textWidth('=RUNG=', rf2), rungGap = Math.round(34 * Math.max(0.8, s));
        sky.ladder = { x: Math.round(fx0 + rungW / 2), x0: fx0, x1: fx0 + rungW, top: roofY, bottom: sky.floorY };
        for (let y = sky.floorY - rungGap; y > roofY + 8; y -= rungGap) stampWord('=RUNG=', fx0, y, rf2, 4);
        sky.roofY = roofY;

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
            const w = latentWord(), box = placeWord(w.text, mono(w.size), w.p, sky.latent, 12);
            if (box) sky.latentBoxes.push(box);
        }
        // and a portal back down, on the right-hand end of the roof (where thumbs on a phone won't cover it)
        const portalX = Math.round(roofEnd - PORTAL_W / 2 - 8);
        sky.portal = { x: portalX, y: (surfaceBetween(portalX, roofY - 30, roofY + 2) ?? roofY - 10) - PORTAL_H / 2, t: 0 };
        // and vents on the roof, smoking
        sky.vents = [fx0 + 40, Math.round((fx0 + roofEnd) / 2) + 150].map(vx => {
            const box = stampWord('VENT', vx, roofY - Math.round(12 * s), mono(10), 3);
            return { x: (box.x0 + box.x1) / 2, y: box.y0 };
        });

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

    // The factory's backdrop, painted once: a winter sky (a pale sun by day, a moon
    // and stars in dark mode), two ranges of snowy mountains, the latent space's dots
    // with faint lines between its words like a picture of embeddings, and inside the
    // factory a brick back wall with lit windows and lamps hung over the gantries
    function buildSkyBackdrop() {
        if (!sky) return;
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const g = c.getContext('2d'), dark = gunColors === GUN_COLORS.dark, rnd = seeded(77);
        const sk = g.createLinearGradient(0, 0, 0, H);
        sk.addColorStop(0, dark ? '#0a1322' : '#a9c3dc');
        sk.addColorStop(0.6, dark ? '#16253c' : '#d4e2ee');
        sk.addColorStop(1, dark ? '#22344f' : '#eef3f8');
        g.fillStyle = sk;
        g.fillRect(0, 0, W, H);
        if (dark) {
            for (let i = 0; i < 90; i++) {
                g.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.6})`;
                g.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * H * 0.6), 1, 1);
            }
        }
        const ox = Math.round(W * 0.86), oy = Math.round(Math.min(90, H * 0.14)), glow = g.createRadialGradient(ox, oy, 4, ox, oy, 70);
        glow.addColorStop(0, dark ? 'rgba(230,237,247,0.35)' : 'rgba(255,247,224,0.8)');
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = glow;
        g.fillRect(ox - 70, oy - 70, 140, 140);
        g.fillStyle = dark ? '#e6edf7' : '#fff8e8';
        g.beginPath();
        g.arc(ox, oy, 15, 0, Math.PI * 2);
        g.fill();
        // mountains: a far range and a near one, snow above a ragged snowline
        const range = (base, height, color, snow, seed) => {
            const r = seeded(seed), ph = [r() * 6, r() * 6, r() * 6], ridge = x => base - height * (0.55 + 0.25 * Math.sin(x * 0.006 + ph[0]) + 0.15 * Math.sin(x * 0.017 + ph[1]) + 0.05 * Math.sin(x * 0.051 + ph[2]));
            g.beginPath();
            g.moveTo(0, H);
            for (let x = 0; x <= W + 8; x += 8) g.lineTo(x, ridge(x));
            g.lineTo(W, H);
            g.closePath();
            g.fillStyle = color;
            g.fill();
            g.save();
            g.clip();
            g.beginPath();
            g.moveTo(0, 0);
            for (let x = 0; x <= W + 8; x += 8) g.lineTo(x, base - height * 0.62 + Math.sin(x * 0.09 + ph[1]) * 5 + Math.sin(x * 0.23) * 3);
            g.lineTo(W, 0);
            g.closePath();
            g.fillStyle = snow;
            g.fill();
            g.restore();
        };
        range(sky.floorY - 10, H * 0.42, dark ? '#1b2a40' : '#bccbdb', dark ? '#9fb2c9' : '#f6f9fc', 11);
        range(sky.floorY, H * 0.24, dark ? '#24364f' : '#a5b8cb', dark ? '#b9c8da' : '#eef4f9', 23);
        // the latent space: dots, and its words joined up to their nearest
        g.fillStyle = cellColor(5, 0);
        g.globalAlpha = 0.18;
        for (let y = sky.latent.y0; y < sky.latent.y1; y += 18) {
            for (let x = sky.latent.x0; x < sky.latent.x1; x += 18) g.fillRect(x, y, 1, 1);
        }
        const mid = bx => ({ x: (bx.x0 + bx.x1) / 2, y: (bx.y0 + bx.y1) / 2 }), boxes = (sky.latentBoxes || []).map(mid);
        g.strokeStyle = cellColor(5, 0);
        g.globalAlpha = 0.16;
        g.lineWidth = 1;
        g.beginPath();
        boxes.forEach((p, i) => {
            boxes.map((q, j) => [j, (q.x - p.x) ** 2 + (q.y - p.y) ** 2]).filter(([j]) => j !== i).sort((u, v) => u[1] - v[1]).slice(0, 2).forEach(([j]) => {
                g.moveTo(p.x, p.y);
                g.lineTo(boxes[j].x, boxes[j].y);
            });
        });
        g.stroke();
        g.globalAlpha = 1;
        // the factory's back wall: brick courses, a row of lit windows
        if (sky.fx0 !== undefined) {
            const x0 = sky.fx0, x1 = sky.fx1, y0 = sky.roofY, y1 = sky.floorY;
            g.fillStyle = dark ? '#2e2826' : '#d6c9b8';
            g.fillRect(x0, y0, x1 - x0, y1 - y0);
            g.strokeStyle = dark ? 'rgba(0,0,0,0.25)' : 'rgba(120,96,72,0.18)';
            g.beginPath();
            for (let y = y0 + 8, row = 0; y < y1; y += 8, row++) {
                g.moveTo(x0, y + 0.5);
                g.lineTo(x1, y + 0.5);
                for (let x = x0 + (row % 2) * 9; x < x1; x += 18) {
                    g.moveTo(x + 0.5, y - 8);
                    g.lineTo(x + 0.5, y);
                }
            }
            g.stroke();
            const wy = y0 + 18, wh = Math.max(14, Math.min(38, (y1 - y0) * 0.16));
            for (let x = x0 + 30; x + 22 < x1 - 20; x += 54) {
                const wg = g.createLinearGradient(0, wy, 0, wy + wh);
                wg.addColorStop(0, dark ? 'rgba(255,196,110,0.75)' : 'rgba(255,214,140,0.85)');
                wg.addColorStop(1, dark ? 'rgba(255,150,60,0.45)' : 'rgba(255,180,90,0.6)');
                g.fillStyle = wg;
                g.fillRect(x, wy, 22, wh);
                g.fillStyle = dark ? '#2a221c' : '#8a6f55';
                g.fillRect(x + 10, wy, 2, wh);
                g.fillRect(x, wy + wh / 2 - 1, 22, 2);
            }
            // a lamp over each gantry, its light falling on the belt
            for (const line of sky.lines) {
                for (const st of line.stations) {
                    const lx = st.cx, ly = y0 + 4, cone = g.createLinearGradient(0, ly, 0, line.top);
                    cone.addColorStop(0, 'rgba(255,220,140,0.3)');
                    cone.addColorStop(1, 'rgba(255,220,140,0)');
                    g.fillStyle = cone;
                    g.beginPath();
                    g.moveTo(lx - 4, ly + 6);
                    g.lineTo(lx + 4, ly + 6);
                    g.lineTo(lx + 26, line.top);
                    g.lineTo(lx - 26, line.top);
                    g.fill();
                    g.fillStyle = dark ? '#8a929a' : '#4a5159';
                    g.fillRect(lx, y0, 1, 4);
                    g.fillRect(lx - 5, ly, 10, 4);
                    g.fillStyle = '#ffe9a8';
                    g.fillRect(lx - 3, ly + 4, 6, 2);
                }
            }
        }
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
            const j = sky.jetpack;
            j.t += dt;
            if (j.vy === undefined) {
                let held = false;
                for (let dx = -3; dx <= 3 && !held; dx++) held = solidAt(Math.round(j.x) + dx, Math.round(j.y)) || solidAt(Math.round(j.x) + dx, Math.round(j.y) + 1);
                if (!held) j.vy = 0;
            } else {
                j.vy = Math.min(j.vy + GRAVITY * dt, 600);
                const ny = j.y + j.vy * dt, land = surfaceBetween(Math.round(j.x), Math.ceil(j.y) + 1, Math.floor(ny));
                if (land !== null) {
                    j.y = land;
                    j.vy = undefined;
                } else if (ny >= sky.floorY) {
                    j.y = sky.floorY;
                    j.vy = undefined;
                } else j.y = ny;
            }
            if (!guy.dead && Math.abs(guy.x - sky.jetpack.x) < (coarsePointer ? 20 : 14) && Math.abs(guy.y - HEIGHT / 2 - (sky.jetpack.y - 8)) < (coarsePointer ? 32 : 26)) {
                hasJetpack = true;
                saveProgress();
                sky.jetpack = null;
                banner(coarsePointer ? 'you found a jetpack. hold JET to fly' : 'you found a jetpack. hold space to fly');
                sfx('ding');
                renderHud();
            }
        }
        if (sky.sealT > 0) {
            sky.sealT -= dt;
            for (const sh of sky.seal) {
                sh.vy += 300 * dt;
                sh.x += sh.vx * dt;
                sh.y += sh.vy * dt;
                sh.rot += sh.spin * dt;
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

    // Flying into the seal over the factory: a zap, a shove back down, and why
    function sealZap() {
        if (clock < (sky.zapT || 0)) return;
        sky.zapT = clock + 0.35;
        guy.vy = 280;
        for (let i = 0; i < 12 && parts.length < MAX_PARTICLES; i++) {
            parts.push({ type: SPARK, x: guy.x + rand(-12, 12), y: rand(0, 6), vx: rand(-140, 140), vy: rand(20, 160), life: rand(0.15, 0.35), color: i % 2 ? '#ff3fa4' : '#2de2e6' });
        }
        sfx('glitch');
        buzz(25);
        if (clock > (sky.sayT || 0)) {
            sky.sayT = clock + 4;
            banner('sealed: blow up the factory first');
        }
    }

    // The whole factory goes up, and no more clankers come for the website (and the
    // seal over it breaks: the way up is open)
    function factoryBoom() {
        factoryDown = true;
        sky.seal = Array.from({ length: 40 }, (_, i) => ({ x: (i + Math.random()) * W / 40, y: rand(2, 8), vx: rand(-40, 40), vy: rand(20, 120), rot: rand(0, 6), spin: rand(-8, 8), color: i % 2 ? '#ff3fa4' : '#2de2e6' }));
        sky.sealT = 2.2;
        sky.booms = [];
        const l0 = sky.lines[0], l1 = sky.lines[sky.lines.length - 1];
        const x0 = Math.min(l0.x0, l1.x0) - 30, x1 = Math.max(l0.x1, l1.x1) + 30, y0 = sky.latent.y1 + 20, y1 = sky.floorY - 10;
        for (let i = 0; i < 14; i++) sky.booms.push({ t: 0.15 + i * 0.16, x: rand(x0, x1), y: rand(y0, y1), r: rand(30, 48) });
        sky.booms.push({ t: 2.5, x: (x0 + x1) / 2, y: y0 + 10, r: 60 });
        flashes.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: (x1 - x0) / 2, t: 0, life: 0.4 });
        addShake(16);
        sfx('alarm');
        banner(coarsePointer ? 'FACTORY DESTROYED: the way up is open' : hasJetpack ? 'THE FACTORY IS DESTROYED. the way up is open: fly up' : 'THE FACTORY IS DESTROYED. the way up is open');
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
        if (!guy.dead && !hidden()) {
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
        if (robotsEvil && !guy.dead && !hidden() && (b.shootT -= dt) <= 0 && Math.hypot(guy.x - b.x, guy.y - b.y) < 220) {
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

    // While the factory stands, each working line has a target over it, and a bar of
    // how close it is to wrecked (it goes when it's down to 35%)
    function drawTargets() {
        if (factoryDown) return;
        for (const line of sky.lines) {
            if (!line.alive) continue;
            const x = Math.round((line.x0 + line.x1) / 2), y = Math.round(line.y0 - 26), r = 12 + Math.sin(clock * 5) * 2, done = clamp((1 - line.health) / 0.65, 0, 1);
            // the whole line throbs red
            ctx.globalAlpha = 0.07 + 0.05 * Math.sin(clock * 5);
            ctx.fillStyle = '#e8283c';
            ctx.fillRect(line.x0, line.y0 - 4, line.x1 - line.x0, line.y1 - line.y0 + 6);
            ctx.globalAlpha = 0.9;
            ctx.strokeStyle = '#e8283c';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.moveTo(x - r - 5, y);
            ctx.lineTo(x - r + 4, y);
            ctx.moveTo(x + r - 4, y);
            ctx.lineTo(x + r + 5, y);
            ctx.moveTo(x, y - r - 5);
            ctx.lineTo(x, y - r + 4);
            ctx.moveTo(x, y + r - 4);
            ctx.lineTo(x, y + r + 5);
            ctx.stroke();
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.fillRect(x - 22, y + r + 8, 44, 5);
            ctx.fillStyle = '#e8283c';
            ctx.fillRect(x - 21, y + r + 9, Math.round(42 * done), 3);
            ctx.font = "bold 9px 'IBM Plex Mono', monospace";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText('WRECK', x, y - r - 6);
            ctx.textAlign = 'left';
            ctx.globalAlpha = 1;
        }
    }

    function drawLines() {
        drawTargets();
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
                hurtGuy(l.dmg || LASER_DMG);
                for (let k = 0; k < 4 && parts.length < MAX_PARTICLES; k++) parts.push({ type: SPARK, x: l.x, y: l.y, vx: rand(-100, 100), vy: rand(-100, 60), life: 0.15, color: '#ff3b2a' });
                lasers.splice(i, 1);
            } else if (l.life <= 0) lasers.splice(i, 1);
        }
    }

    function spit() {
        const c = bigFlyCenter();
        for (let i = 0; i <= bigFly.stage; i++) {
            const tx = (hidden() ? lastSeenX : guy.x) + rand(-40, 40), ty = hidden() ? lastSeenY : guy.y - HEIGHT / 2;
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
            banner(factoryDown || merged ? 'the robot factory' : 'the robot factory. goal: blow it up');
            bannerT = 5;
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
            ctx.strokeStyle = l.color || '#ff2a2a';
            ctx.globalAlpha = 0.35;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(l.x, l.y);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.strokeStyle = l.color || '#ff2a2a';
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
            const L = sky.ladder;
            if (L) {
                ctx.fillStyle = cellColor(4, 0);
                ctx.globalAlpha = 0.55;
                ctx.fillRect(L.x0, L.top + 6, 2, L.bottom - L.top - 10);
                ctx.fillRect(L.x1 - 2, L.top + 6, 2, L.bottom - L.top - 10);
                ctx.globalAlpha = 1;
            }
            if (!factoryDown && !merged) drawSeal();
            else if (sky.sealT > 0) {
                // the seal coming down in pieces
                ctx.lineWidth = 2;
                for (const sh of sky.seal) {
                    ctx.globalAlpha = Math.min(1, sky.sealT);
                    ctx.strokeStyle = sh.color;
                    ctx.beginPath();
                    ctx.moveTo(sh.x - Math.cos(sh.rot) * 6, sh.y - Math.sin(sh.rot) * 6);
                    ctx.lineTo(sh.x + Math.cos(sh.rot) * 6, sh.y + Math.sin(sh.rot) * 6);
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
            }
            return;
        }
        if (scene === 'shell') {
            ctx.fillStyle = '#2de2e6';
            ctx.textBaseline = 'top';
            ctx.fillText('the factory \u2193', shell.holeX0, shell.floorY + 4);
            return;
        }
        if (scene === 'net') return;
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

    // ----- hints
    //
    // Rather than a wall of help text, a little arrow by him points at whatever
    // clears the level he's on: on the website the fly, then the portal; in the
    // factory the ladder, the jetpack, then up; in the shell the puppets, the tank,
    // then 2501. A word or two goes with it when it changes, or when he's been stood
    // about a while, and it fades out when he gets there.

    const hint = { target: null, label: '', since: 0, idle: 0, a: 0 };

    function hintFor() {
        if (guy.dead) return null;
        const gx = guy.x, gy = guy.y - HEIGHT / 2;
        if (scene === 'site') {
            if (portal) return { x: portal.x, y: portal.y, label: 'the portal' };
            if (bigFly.alive && flyRect && clock > 10) {
                const c = bigFlyCenter();
                return { x: c.x, y: c.y, label: 'shoot the fly' };
            }
            if (clock > 30 && owned.size < WEAPONS.length && pickups.length) {
                const p = pickups.reduce((b, q) => (Math.hypot(q.x - gx, q.y - gy) < Math.hypot(b.x - gx, b.y - gy) ? q : b));
                return { x: p.x, y: p.y - 10, label: p.w === 'health' ? 'health' : 'a gun' };
            }
            return null;
        }
        if (scene === 'sky' && sky) {
            const L = sky.ladder;
            if (!factoryDown && !merged) {
                let best = null, bd = Infinity;
                for (const line of sky.lines) {
                    const d = line.alive ? Math.hypot((line.x0 + line.x1) / 2 - gx, line.y0 - gy) : Infinity;
                    if (d < bd) {
                        bd = d;
                        best = line;
                    }
                }
                if (best) return { x: (best.x0 + best.x1) / 2, y: best.y0 - 26, label: 'blow up the factory' };
            }
            if (sky.jetpack && L) {
                if (guy.y < L.top + 2 || sky.jetpack.y > L.top + 2) return { x: sky.jetpack.x, y: sky.jetpack.y - 8, label: 'the jetpack' };
                if (Math.abs(gx - L.x) > 14) return { x: L.x, y: clamp(gy, L.top + 40, L.bottom - 20), label: 'a ladder' };
                return { x: L.x, y: L.top - 40, label: 'jump up it', ring: false };
            }
            if (hasJetpack) return { x: gx, y: -80, label: coarsePointer ? 'hold JET: fly up' : 'hold space: fly up', ring: false };
            return null;
        }
        if (scene === 'shell' && shell) {
            const k = shell.tank;
            if (k && k.landed && !k.dying) {
                const b = tankBody();
                return { x: b.x, y: b.y, label: 'the tank' };
            }
            let best = null, bd = Infinity;
            for (const f of shell.foes) {
                const d = f.dead ? Infinity : Math.hypot(f.x - gx, f.y - 20 - gy);
                if (d < bd) {
                    bd = d;
                    best = f;
                }
            }
            if (best) return bd > 110 ? { x: best.x, y: best.y - 20, label: 'a puppet' } : null;
            const b = shell.being;
            if (b && !(b.appear < 1)) return { x: b.x, y: b.y, label: merged ? 'jack in' : 'project 2501' };
        }
        return null;
    }

    function updateHints(dt) {
        const h = hintFor(), moving = Math.abs(guy.vx) > 20 || Math.abs(guy.vy) > 20 || firing || padFire;
        hint.idle = moving ? 0 : hint.idle + dt;
        if (!h) {
            hint.a = Math.max(0, hint.a - dt * 2);
            return;
        }
        if (h.label !== hint.label) {
            hint.label = h.label;
            hint.since = 0;
        }
        hint.target = h;
        hint.since += dt;
        const near = Math.hypot(h.x - guy.x, h.y - (guy.y - HEIGHT / 2)) < 46;
        hint.a = approach(hint.a, near ? 0 : 1, dt * 3);
    }

    // The arrow (outlined, so it shows on any background), the words, and a ring on
    // the thing itself
    function drawHint() {
        const h = hint.target;
        if (!h || hint.a <= 0.02 || guy.dead || scene === 'net') return;
        const cx = guy.x, cy = guy.y - HEIGHT / 2, a = Math.atan2(h.y - cy, h.x - cx), r = 30 + Math.sin(clock * 6) * 2.5;
        ctx.save();
        ctx.globalAlpha = hint.a;
        ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-4, -6);
        ctx.lineTo(-1, 0);
        ctx.lineTo(-4, 6);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#ffb02a';
        ctx.fill();
        ctx.restore();
        if (h.ring !== false) {
            ctx.globalAlpha = hint.a * (0.5 + 0.3 * Math.sin(clock * 5));
            ctx.strokeStyle = '#ffb02a';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(h.x, h.y, 15 + Math.sin(clock * 5) * 2, 0, Math.PI * 2);
            ctx.stroke();
        }
        const say = hint.since < 4 ? 1 : clamp((hint.idle - 2.5) * 2, 0, 1);
        if (say > 0) {
            ctx.globalAlpha = hint.a * say;
            ctx.font = "bold 10px 'IBM Plex Mono', monospace";
            ctx.textBaseline = 'middle';
            const tw = ctx.measureText(h.label).width, vw = window.innerWidth;
            const bx = Math.round(clamp(cx + Math.cos(a) * (r + 22) - tw / 2 - 4, scrollX + 4, scrollX + vw - tw - 12)), by = Math.round(cy + Math.sin(a) * (r + 18) - 7);
            ctx.fillStyle = 'rgba(18,18,26,0.8)';
            ctx.fillRect(bx, by, tw + 8, 14);
            ctx.fillStyle = '#ffd88a';
            ctx.fillText(h.label, bx + 4, by + 7.5);
        }
        ctx.globalAlpha = 1;
    }

    // The seal over the factory: two crackling lines of current along the top, and
    // what it would take to break it
    function drawSeal() {
        ctx.lineWidth = 2;
        for (const [col, ph, y0] of [['#ff3fa4', 0, 3], ['#2de2e6', 2.1, 7]]) {
            ctx.strokeStyle = col;
            ctx.globalAlpha = 0.55 + 0.3 * Math.sin(clock * 7 + ph);
            ctx.beginPath();
            for (let x = 0; x <= W; x += 6) {
                const y = y0 + Math.sin(x * 0.07 + clock * 9 + ph) * 2 + (Math.random() < 0.06 ? rand(-3, 3) : 0);
                if (x) ctx.lineTo(x, y);
                else ctx.moveTo(x, y);
            }
            ctx.stroke();
        }
        const text = coarsePointer ? '\u25b2 sealed: blow up the factory \u25b2' : '\u25b2 SEALED UNTIL THE FACTORY IS DESTROYED \u25b2';
        ctx.font = "bold 10px 'IBM Plex Mono', monospace";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(text).width, y = coarsePointer ? 62 : 20;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = 'rgba(18,10,24,0.82)';
        ctx.fillRect(Math.round(W / 2 - tw / 2 - 6), y - 8, Math.round(tw + 12), 16);
        ctx.fillStyle = Math.floor(clock * 2) % 2 ? '#ff3fa4' : '#ff7cc4';
        ctx.fillText(text, W / 2, y + 0.5);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
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
        if (scene === 'net') return;
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
        } else if (scene === 'sky' && w.settled) {
            updateSnow(w, dt);
        }
        if (scene === 'shell') {
            if ((w.glitchT -= dt) <= 0) {
                w.glitchT = rand(7, 14);
                w.glitch = 0.25;
                sfx('glitch');
            }
            w.glitch -= dt;
            // glowing motes drifting up through it all
            if (!w.motes) w.motes = Array.from({ length: coarsePointer ? 14 : 26 }, () => ({ x: rand(0, W), y: rand(0, H), vy: rand(-22, -8), ph: rand(0, 6) }));
            for (const m of w.motes) {
                m.y += m.vy * dt;
                m.x += Math.sin(clock + m.ph) * 8 * dt;
                if (m.y < -10) {
                    m.y = H + 10;
                    m.x = rand(0, W);
                }
            }
        }

        // new drops across the top of the screen
        const budget = coarsePointer ? 0.55 : 1;
        const rate = (scene === 'site' ? (w.raining ? 150 : 0) : scene === 'sky' ? 70 : 26) * budget;
        const cap = (scene === 'site' ? 340 : scene === 'sky' ? 380 : 130) * budget;
        if (scene === 'sky' && !w.settled) seedSnow(w);
        w.acc += rate * dt;
        while (w.acc >= 1) {
            w.acc--;
            if (w.drops.length >= cap) continue;
            if (scene === 'site') w.drops.push({ x: scrollX + rand(-80, vw + 80), y: scrollY - rand(0, 60), vx: wind, vy: rand(650, 850) });
            else if (scene === 'sky') {
                // near flakes are bigger and quicker; most are far off
                const z = Math.random() < 0.5 ? 0.6 : Math.random() < 0.6 ? 1 : 1.5;
                w.drops.push({ x: rand(-20, W + 20), y: -rand(0, 30), vy: rand(28, 48) * z, z, ph: rand(0, 6) });
            }
            else {
                // near, middling and far columns of katakana, a few of them hot pink
                const z = pick([0.6, 1, 1.4]);
                w.drops.push({ x: Math.floor(rand(0, W) / 12) * 12 + 6, y: -rand(0, 60), z, vy: rand(150, 300) * z, g: pick(GLYPHS), gt: 0, hot: Math.random() < 0.08 });
            }
        }

        const top = H - w.pool;
        for (let i = w.drops.length - 1; i >= 0; i--) {
            const d = w.drops[i];
            let gone = false;
            if (scene === 'site') {
                d.vx += (wind - d.vx) * dt * 2;
                const nx = d.x + d.vx * dt, ny = d.y + d.vy * dt;
                if (ny >= top) {
                    gone = true;
                    if (ripples.length < 50 && Math.random() < 0.5) ripples.push({ x: nx, t: 0 });
                }
                else if (solidAt(Math.floor(nx), Math.floor(ny))) {
                    gone = true;
                    if (Math.random() < 0.3 && parts.length < MAX_PARTICLES) parts.push({ type: SPARK, x: nx, y: ny - 1, vx: rand(-40, 40), vy: rand(-80, -20), life: 0.12, color: '#8fb6ff' });
                } else gone = ny > scrollY + vh + 40;
                d.x = nx;
                d.y = ny;
            } else if (scene === 'sky') {
                // snow drifts down with the wind, and settles where it lands (the
                // nearest flakes are in front of everything, so they don't settle)
                d.x += (wind * d.z * 0.6 + Math.sin(clock * 1.6 + d.ph) * 12 * d.z) * dt;
                if (d.x < -20) d.x += W + 40;
                else if (d.x > W + 20) d.x -= W + 40;
                d.y += d.vy * dt;
                if (d.z <= 1 && solidAt(Math.floor(d.x), Math.floor(d.y))) {
                    gone = true;
                    settleFlake(w, d.x, d.y - 1);
                } else gone = d.y > H;
            } else {
                // data rain falls through everything into the pool
                d.y += d.vy * dt;
                if ((d.gt -= dt) <= 0) {
                    d.gt = 0.08;
                    d.g = pick(GLYPHS);
                }
                gone = d.y >= top;
                if (gone && ripples.length < 40 && Math.random() < 0.4) ripples.push({ x: d.x, t: 0 });
            }
            if (gone) {
                w.drops[i] = w.drops[w.drops.length - 1];
                w.drops.pop();
            }
        }
    }

    // Up in the factory every letter wears a cap of snow along its top edge: a layer
    // kept in step with the world, so a word shot away takes its snow with it
    let snowCaps = null;
    const SNOW_TOP = 0xffffffff, SNOW_UNDER = 0xfffcf4ee;   // white, and a bluish white (ABGR)

    function buildSnowCaps() {
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const g = canvas.getContext('2d'), img = g.createImageData(W, H);
        snowCaps = { world: worldCanvas, canvas, g, img, px: new Uint32Array(img.data.buffer) };
        updateSnowCaps(0, 0, W - 1, H - 1);
    }

    function updateSnowCaps(x0, y0, x1, y1) {
        const px = snowCaps.px;
        x0 = Math.max(0, Math.floor(x0) - 1);
        y0 = Math.max(0, Math.floor(y0) - 3);
        x1 = Math.min(W - 1, Math.ceil(x1) + 1);
        y1 = Math.min(H - 2, Math.ceil(y1) + 1);
        for (let y = y0; y <= y1; y++) px.fill(0, y * W + x0, y * W + x1 + 1);
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                const i = y * W + x;
                if (alp[i] >= SOLID || alp[i + W] < SOLID) continue;
                px[i] = SNOW_TOP;
                // a flat top holds a little more
                if (y > y0 && x > 0 && x < W - 1 && alp[i + W - 1] >= SOLID && alp[i + W + 1] >= SOLID && alp[i - W] < SOLID) px[i - W] = SNOW_UNDER;
            }
        }
        snowCaps.g.putImageData(snowCaps.img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    }

    // Snow that's settled builds up on the words, melts away slowly, and falls off
    // anything shot out from under it
    function settleFlake(w, x, y) {
        if (w.settled.length >= (coarsePointer ? 450 : 900)) w.settled.shift();
        w.settled.push({ x: Math.round(x), y: Math.round(y), life: rand(25, 45) });
    }

    function updateSnow(w, dt) {
        w.checkT = (w.checkT || 0) - dt;
        const check = w.checkT <= 0;
        if (check) w.checkT = 0.5;
        for (let i = w.settled.length - 1; i >= 0; i--) {
            const f = w.settled[i];
            if ((f.life -= dt) <= 0 || (check && !solidAt(f.x, f.y + 1) && !solidAt(f.x, f.y + 2))) {
                if (f.life > 0 && w.drops.length < 500) w.drops.push({ x: f.x, y: f.y + 2, vy: 40, z: 0.6, ph: rand(0, 6) });
                w.settled.splice(i, 1);
            }
        }
    }

    // When the factory's first seen it's already had a snowfall
    function seedSnow(w) {
        w.settled = [];
        if (!alp) return;
        for (let n = 0, tries = 0; n < (coarsePointer ? 220 : 420) && tries < 4000; tries++) {
            const x = Math.floor(rand(0, W));
            for (let y = Math.floor(rand(0, H * 0.5)); y < H - 1; y++) {
                if (!solidAt(x, y + 1)) continue;
                if (!solidAt(x, y)) {
                    settleFlake(w, x, y);
                    w.settled[w.settled.length - 1].life = rand(8, 45);
                    n++;
                }
                break;
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
            // settled snow: little white heaps with a bluish shadow under
            const dark = gunColors === GUN_COLORS.dark;
            for (const f of w.settled || []) {
                ctx.globalAlpha = Math.min(1, f.life / 3);
                ctx.fillStyle = dark ? '#8fa3bd' : '#b3c4d8';
                ctx.fillRect(f.x - 1, f.y, 3, 1);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(f.x - 1, f.y - 1, 3, 1);
            }
            // falling: far flakes small and faint, near ones big crosses (with a soft
            // dark edge so they show against the page too)
            for (const d of w.drops) {
                const x = Math.round(d.x), y = Math.round(d.y);
                if (d.z < 1) {
                    ctx.globalAlpha = 0.75;
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(x, y, 1.5, 1.5);
                } else if (d.z === 1) {
                    ctx.globalAlpha = 0.6;
                    ctx.fillStyle = dark ? '#5f7390' : '#8ea2b8';
                    ctx.fillRect(x - 1, y - 1, 4, 4);
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(x, y, 2, 2);
                } else {
                    ctx.globalAlpha = 0.5;
                    ctx.fillStyle = dark ? '#5f7390' : '#8ea2b8';
                    ctx.fillRect(x - 2, y - 1, 5, 3);
                    ctx.fillRect(x - 1, y - 2, 3, 5);
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(x - 1, y, 3, 1);
                    ctx.fillRect(x, y - 1, 1, 3);
                }
            }
            ctx.globalAlpha = 1;
        } else {
            ctx.fillStyle = 'rgba(160,255,240,0.5)';
            for (const m of w.motes || []) ctx.fillRect(m.x, m.y, 2, 2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            for (const z of [0.6, 1, 1.4]) {
                // far columns first: smaller, dimmer and shorter
                const size = Math.round(3 + z * 9), trail = Math.max(1, Math.round((2 + z * 3) / (coarsePointer ? 2 : 1)));
                ctx.font = `${size}px 'IBM Plex Mono', monospace`;
                for (const d of w.drops) {
                    if (d.z !== z) continue;
                    for (let k = trail; k >= 0; k--) {
                        ctx.globalAlpha = (k ? 0.5 * (1 - k / (trail + 1)) : 0.95) * (0.45 + z * 0.4);
                        ctx.fillStyle = k ? (d.hot ? '#ff3fa4' : '#2de2e6') : (d.hot ? '#ffd0ef' : '#eafff9');
                        ctx.fillText(k ? GLYPHS[Math.floor(d.x + k * 7 + d.y / 14) % GLYPHS.length] : d.g, d.x, d.y - k * (size + 1));
                    }
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
        shellFightStart(shell);
        shell.being = merged ? { x: Math.round(W * 0.8), y: Math.round(Math.max(150, H * 0.26)), t: 0, armed: true } : null;
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
        updateShellFight(dt);
        updateBeing(dt);
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

    // ----- the fight
    //
    // Before Project 2501 shows itself, its puppets come for him: cyborgs it has
    // ghost-hacked, lowered in on strings in three waves, who shoot and, if they get
    // close enough and he lets them finish, hack his ghost (his controls go the wrong
    // way round for a bit). Shooting one frees it; its ghost floats up and away. Then
    // the spider tank drops in: a chaingun, a cannon that lobs shells into the text,
    // and halfway down it calls in more puppets. When it blows, 2501 appears. Once
    // he's merged, the odd puppet still turns up.

    const FOE_HP = 9, FOE_SPEED = 95, FOE_WAVES = [4, 5, 7], TANK_HP = 240, TANK_S = 1.6, TANK_R = 26 * TANK_S, HACK_TIME = 2.5;
    const FOE_COLORS = { h: '#262433', f: '#d9c2b0', v: '#ff3fa4', c: '#5a4f72', l: '#3a3548' };
    // a coat and a glowing visor, 4px a character like him
    const FOE_BODY = ['.hhhh.', '.fvvf.', '..ff..', '.cccc.', 'cccccc', 'c.cc.c', '..cc..', '.cccc.'];
    const FOE_LEGS = [['.l..l.', '.l..l.'], ['.l..l.', 'l....l']];
    const FOE_LINES = {
        arrive: ['my ghost is not my own', 'who am I?', 'the net is vast', 'I have a daughter... do I?', 'your ghost is next', 'we are all puppets'],
        hack: ['let me in', 'open your ghost', 'I see what you see', 'whose eyes are these?'],
        hurt: ['...', 'it does not hurt', 'error', 'why?'],
        die: ['free', 'thank you', 'I remember now', 'was any of it real?'],
    };
    let foeSprites = null;

    function buildFoeSprites() {
        const flat = col => Object.fromEntries(Object.keys(FOE_COLORS).map(k => [k, col]));
        foeSprites = {
            normal: FOE_LEGS.map(l => artCanvas(FOE_BODY.concat(l), FOE_COLORS, false, 4)),
            hurt: FOE_LEGS.map(l => artCanvas(FOE_BODY.concat(l), FOE_COLORS, true, 4)),
            m: FOE_LEGS.map(l => artCanvas(FOE_BODY.concat(l), flat('#ff3fa4'), false, 4)),
            c: FOE_LEGS.map(l => artCanvas(FOE_BODY.concat(l), flat('#2de2e6'), false, 4)),
        };
    }

    function shellFightStart(s) {
        Object.assign(s, { foes: [], ghosts: [], shells: [], tank: null, wave: 0, waveT: 2.5, trickleT: 6, freed: 0, phase: merged ? 'merged' : 'waves' });
    }

    function spawnFoe(x) {
        const f = { foe: true, x: clamp(x, 30, W - 30), y: -10, vx: 0, vy: 0, grounded: false, dropping: false, prop: true, hp: FOE_HP, t: rand(0, 3), hurt: 0, facing: 1, jumpCd: 0, shootT: rand(1, 2.2), hackT: 0, hackCd: rand(1.5, 3), say: null, dead: false, deadT: 0, gone: false };
        if (f.x > shell.holeX0 - 12 && f.x < shell.holeX1 + 12) f.x = shell.holeX1 + 30;
        shell.foes.push(f);
        if (Math.random() < 0.4) say(f, FOE_LINES.arrive, true);
    }

    function updateShellFight(dt) {
        const s = shell;
        for (const f of s.foes) updateFoe(f, dt);
        s.foes = s.foes.filter(f => !f.gone && !(f.dead && f.deadT > 2.5));
        for (const g of s.ghosts) {
            g.t += dt;
            g.y -= 40 * dt;
            g.x += Math.sin(g.t * 3) * 20 * dt;
        }
        s.ghosts = s.ghosts.filter(g => g.t < 2.5);
        if (s.tank) updateTank(dt);
        updateTankShells(dt);
        // robots off: no fight, 2501 is just there
        if (!botsOn && (s.phase === 'waves' || s.phase === 'boss')) {
            s.foes = [];
            s.tank = null;
            revealBeing();
        }
        const alive = s.foes.reduce((n, f) => n + !f.dead, 0);
        if (s.phase === 'waves' && !alive && (s.waveT -= dt) <= 0) {
            if (s.wave < FOE_WAVES.length) {
                const n = FOE_WAVES[s.wave];
                for (let i = 0; i < n; i++) spawnFoe(W * (i + 0.5) / n + rand(-30, 30));
                banner(`ghost-hacked: wave ${s.wave + 1} of ${FOE_WAVES.length}`);
                sfx('glitch');
                s.wave++;
                s.waveT = 3;
            } else {
                s.phase = 'boss';
                spawnTank();
            }
        } else if ((s.phase === 'merged' || (s.phase === 'free' && merged)) && alive < 3 && (s.trickleT -= dt) <= 0) {
            spawnFoe(rand(40, W - 40));
            s.trickleT = rand(7, 11);
        }
    }

    function updateFoe(f, dt) {
        f.t += dt;
        f.hurt -= dt;
        f.jumpCd -= dt;
        if (f.say && (f.say.t -= dt) <= 0) f.say = null;
        if (f.y > H + 60) f.gone = true;
        if (f.dead) {
            f.deadT += dt;
            moveWalker(f, 0, 0, dt);
            return;
        }
        let dir = 0;
        const dx = guy.x - f.x, d = Math.hypot(dx, guy.y - HEIGHT / 2 - (f.y - 20));
        if (!guy.dead && !hidden()) {
            f.facing = dx >= 0 ? 1 : -1;
            if (f.hackT > 0) {
                // reaching into his ghost: it holds still, and he can break it off by getting away
                f.hackT -= dt;
                if (d > 125) {
                    f.hackT = 0;
                    f.hackCd = 2.5;
                } else if (f.hackT <= 0) {
                    ghostHack();
                    f.hackCd = rand(4.5, 7);
                }
            } else {
                if ((f.shootT -= dt) <= 0 && d < 380) {
                    // a bolt, or now and then three in a fan
                    f.shootT = rand(1.2, 2.2);
                    const sx = f.x + f.facing * 8, sy = f.y - 28, a = Math.atan2(guy.y - HEIGHT / 2 - sy, guy.x - sx);
                    for (const da of Math.random() < 0.35 ? [-0.18, 0, 0.18] : [0]) {
                        lasers.push({ x: sx, y: sy, vx: Math.cos(a + da) * 320, vy: Math.sin(a + da) * 320, life: 2.5, color: '#ff3fa4', dmg: 6 });
                    }
                    sfx('laser');
                }
                if ((f.hackCd -= dt) <= 0 && d < 85 && !(guy.hackT > 0) && f.grounded) {
                    f.hackT = 0.75;
                    sfx('glitch');
                    say(f, FOE_LINES.hack, true);
                } else if (Math.abs(dx) > 90 || d > 200) dir = navigate(f, guy.x, guy.y, f.y, 60, 90);
            }
        }
        moveWalker(f, dir, FOE_SPEED, dt);
    }

    function ghostHack() {
        guy.hackT = HACK_TIME;
        hurtGuy(6);
        addShake(4);
        buzz([30, 40, 30]);
        sfx('glitch');
        banner('ghost hacked: your controls are the wrong way round');
    }

    function hurtFoe(f, dmg, kx) {
        if (f.dead) return;
        f.hp -= dmg;
        f.hurt = 0.1;
        f.vx += (kx || 0) * 0.5;   // heavy: they hardly budge
        f.hackT = 0;   // shooting it breaks the hack
        if (f.hp > 0) {
            sfx('hurt');
            if (Math.random() < 0.25) say(f, FOE_LINES.hurt, true);
            return;
        }
        f.dead = true;
        f.prop = false;
        f.grounded = false;
        shell.freed++;
        say(f, FOE_LINES.die, true);
        shell.ghosts.push({ x: f.x, y: f.y - 24, t: 0 });
        for (let i = 0; i < 10 && parts.length < MAX_PARTICLES; i++) {
            parts.push({ type: SPARK, x: f.x + rand(-6, 6), y: f.y - rand(8, 36), vx: rand(-120, 120), vy: rand(-160, 40), life: rand(0.2, 0.5), color: i % 2 ? '#ff3fa4' : '#d8fff8' });
        }
        flashes.push({ x: f.x, y: f.y - 20, r: 12, t: 0, life: 0.15 });
        sfx('crunch');
    }

    // ----- the spider tank

    function spawnTank() {
        shell.tank = { x: guy.x < W / 2 ? W * 0.75 : W * 0.25, y: -80, vy: 0, landed: false, hp: TANK_HP, max: TANK_HP, shown: TANK_HP, t: 0, facing: -1, walkT: 0, gunT: 2.5, burst: 0, burstT: 0, cannonT: 4, hurt: 0, called: false, dying: 0, aim: Math.PI, flash: 0 };
        banner('SPIDER TANK');
        sfx('alarm');
    }

    // (the middle of its hull; it's drawn TANK_S times its pixel size)
    function tankBody() {
        const k = shell.tank;
        return { x: k.x, y: k.y - 30 * TANK_S };
    }

    function updateTank(dt) {
        const k = shell.tank, fy = shell.floorY;
        k.t += dt;
        k.hurt -= dt;
        k.flash -= dt;
        k.shown = approach(k.shown, k.hp, k.max * 0.6 * dt);
        if (!k.landed) {
            // dropped in from above, heavily
            k.vy += GRAVITY * dt;
            k.y += k.vy * dt;
            const top = surfaceBetween(Math.round(k.x), Math.round(fy - 30), Math.round(fy + 4));
            if (k.y >= (top === null ? fy : top)) {
                k.y = top === null ? fy : top;
                k.landed = true;
                addShake(12);
                dust(k.x - 30, fy, 10);
                dust(k.x + 30, fy, 10);
                sfx('boom');
                buzz(60);
            }
            return;
        }
        if (k.dying) {
            // coming apart, then the big one
            const before = k.dying;
            k.dying += dt;
            if (Math.floor(before / 0.15) !== Math.floor(k.dying / 0.15)) {
                const b = tankBody(), x = b.x + rand(-28, 28), y = b.y + rand(-12, 10);
                flashes.push({ x, y, r: 14, t: 0, life: 0.2 });
                for (let i = 0; i < 8 && parts.length < MAX_PARTICLES; i++) parts.push({ type: FIRE, x, y, vx: rand(-80, 80), vy: rand(-120, 20), life: rand(0.3, 0.6), max: 0.6, size: rand(3, 6) });
                addShake(3);
                sfx('boom');
            }
            if (k.dying >= 1.6) {
                const b = tankBody();
                explode(b.x, b.y, 44, true, k);
                for (let i = 0; i < 24 && parts.length < MAX_PARTICLES; i++) {
                    parts.push({ type: SHELL, x: b.x + rand(-20, 20), y: b.y + rand(-10, 10), vx: rand(-260, 260), vy: rand(-380, -80), life: rand(1, 2), bounces: 0, color: pick(['#3b4252', '#4a5468', '#2b2f38', '#ff3b2a']), size: 3 });
                }
                shell.tank = null;
                revealBeing();
            }
            return;
        }
        // keep its distance, mostly, and stay off the hole in the floor
        const dx = guy.x - k.x, far = Math.abs(dx);
        let dir = far > 280 ? Math.sign(dx) : far < 150 ? -Math.sign(dx) : 0;
        const nx = k.x + dir * 45 * dt;
        if (nx < 50 || nx > W - 50 || (nx > shell.holeX0 - 40 && nx < shell.holeX1 + 40)) dir = 0;
        else k.x = nx;
        if (dir) k.walkT += dt;
        k.facing = dx >= 0 ? 1 : -1;
        const b = tankBody(), gx = b.x + k.facing * 22 * TANK_S, gy = b.y - 2 * TANK_S;
        k.aim = Math.atan2(guy.y - HEIGHT / 2 - gy, guy.x - gx);
        const angry = k.hp < k.max / 2;
        if (angry && !k.called) {
            // halfway down: it calls in help
            k.called = true;
            spawnFoe(rand(40, W * 0.4));
            spawnFoe(rand(W * 0.6, W - 40));
            sfx('alarm');
        }
        if (guy.dead || hidden()) return;
        // the chaingun, in bursts
        if (k.burst > 0) {
            if ((k.burstT -= dt) <= 0) {
                k.burst--;
                k.burstT = 0.07;
                k.flash = 0.04;
                const a = k.aim + rand(-0.09, 0.09);
                lasers.push({ x: gx + Math.cos(k.aim) * 22 * TANK_S, y: gy + Math.sin(k.aim) * 22 * TANK_S, vx: Math.cos(a) * 430, vy: Math.sin(a) * 430, life: 2, color: '#ffd24a', dmg: 2 });
                sfx('smg');
            }
        } else if ((k.gunT -= dt) <= 0) {
            k.burst = 8;
            k.gunT = angry ? 2.4 : 3.4;
        }
        // the cannon, lobbing shells at him
        if ((k.cannonT -= dt) <= 0) {
            k.cannonT = angry ? 4.5 : 6;
            const sx = b.x - k.facing * 6 * TANK_S, sy = b.y - 18 * TANK_S, tx = guy.x + rand(-20, 20), ty = guy.y - 6;
            const T = clamp(Math.hypot(tx - sx, ty - sy) / 360, 0.6, 1.5);
            shell.shells.push({ x: sx, y: sy, vx: (tx - sx) / T, vy: (ty - sy) / T - 0.5 * GLOB_G * T, life: 4 });
            sfx('rocket');
        }
    }

    function updateTankShells(dt) {
        const list = shell.shells;
        for (let i = list.length - 1; i >= 0; i--) {
            const s = list[i];
            s.vy += GLOB_G * dt;
            const nx = s.x + s.vx * dt, ny = s.y + s.vy * dt, hit = trace(s.x, s.y, nx, ny);
            const onHim = !guy.dead && Math.abs(nx - guy.x) < 10 && Math.abs(ny - (guy.y - HEIGHT / 2)) < 20;
            s.life -= dt;
            if (hit || onHim || s.life <= 0 || ny > H + 40) {
                list.splice(i, 1);
                const ex = hit ? hit.x : nx, ey = hit ? hit.y : ny;
                if (ny > H + 40) continue;
                // it knocks him about, and hurts, but less than a point-blank grenade would
                explode(ex, ey, 22, true, shell.tank, ey > shell.floorY - 30);
                const d = Math.hypot(guy.x - ex, guy.y - HEIGHT / 2 - ey);
                if (d < 40) hurtGuy(4 + 12 * (1 - d / 40));
                continue;
            }
            s.x = nx;
            s.y = ny;
        }
    }

    function hurtTank(dmg) {
        const k = shell && shell.tank;
        if (!k || !k.landed || k.dying || dmg <= 0) return;
        k.hp -= dmg;
        k.hurt = 0.08;
        sfx('clank');
        if (k.hp <= 0) {
            k.hp = 0;
            k.dying = 0.001;
            sfx('alarm');
        }
    }

    // Project 2501 shows itself, in a column of light
    function revealBeing() {
        const s = shell;
        s.phase = 'free';
        if (s.being) return;
        s.being = { x: Math.round(W * 0.8), y: Math.round(Math.max(150, H * 0.26)), t: 0, armed: true, appear: 0 };
        banner('project 2501');
        sfx('portal');
        setTimeout(() => sfx('merge'), 600);
    }

    // The fight's things that hit him, for the pad's FIRE to aim at
    function shellTargets(consider) {
        for (const f of shell.foes) if (!f.dead) consider(f.x, f.y - 20, 1.5);
        const k = shell.tank;
        if (k && k.landed && !k.dying) {
            const b = tankBody();
            consider(b.x, b.y, 1.2);
        }
    }

    function drawShellFight() {
        const s = shell;
        // the puppets' strings, going up out of sight
        ctx.strokeStyle = 'rgba(255,63,164,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const f of s.foes) {
            if (f.dead) continue;
            const hx = Math.round(f.x), hy = Math.round(f.y) - 40;
            ctx.moveTo(hx - 4, hy);
            ctx.lineTo(hx - 4 + Math.sin(clock * 1.3 + f.t) * 14, 0);
            ctx.moveTo(hx + 4, hy);
            ctx.lineTo(hx + 4 + Math.sin(clock * 1.1 + f.t + 1) * 14, 0);
        }
        ctx.stroke();
        for (const f of s.foes) {
            const frame = f.grounded && Math.abs(f.vx) > 10 ? Math.floor(f.t / 0.2) % 2 : 0;
            ctx.save();
            ctx.translate(Math.round(f.x), Math.round(f.y) - 20);
            if (f.dead) {
                ctx.globalAlpha = clamp(1 - (f.deadT - 1.2) / 1.3, 0, 1);
                ctx.rotate(Math.min(1, f.deadT * 3) * Math.PI / 2 * f.facing);
            }
            if (f.facing < 0) ctx.scale(-1, 1);
            // ghost-hacked: now and then it tears in two colours
            if (!f.dead && (f.hackT > 0 || Math.random() < 0.06)) {
                ctx.globalAlpha = 0.6;
                ctx.drawImage(foeSprites.m[frame], -12 + rand(-3, -1), -20);
                ctx.drawImage(foeSprites.c[frame], -12 + rand(1, 3), -20);
                ctx.globalAlpha = 1;
            }
            ctx.drawImage(f.hurt > 0 ? foeSprites.hurt[frame] : foeSprites.normal[frame], -12, -20);
            ctx.restore();
            ctx.globalAlpha = 1;
            if (!f.dead && f.hp < FOE_HP) drawBar(f.x - 10, f.y - 48, 20, f.hp / FOE_HP);
            if (f.hackT > 0 && !f.dead) {
                // the link, crackling across to his head
                const x0 = f.x, y0 = f.y - 32, x1 = guy.x, y1 = guy.y - HEIGHT + 6;
                ctx.strokeStyle = Math.random() < 0.5 ? '#ff3fa4' : '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(x0, y0);
                for (let i = 1; i < 6; i++) ctx.lineTo(x0 + (x1 - x0) * i / 6 + rand(-5, 5), y0 + (y1 - y0) * i / 6 + rand(-5, 5));
                ctx.lineTo(x1, y1);
                ctx.stroke();
            }
        }
        // the freed ghosts, drifting up
        for (const g of s.ghosts) {
            ctx.globalAlpha = clamp(1 - g.t / 2.5, 0, 1) * 0.7;
            ctx.fillStyle = '#e8ffff';
            ctx.beginPath();
            ctx.arc(g.x, g.y, 6, Math.PI, 0);
            ctx.lineTo(g.x + 6, g.y + 8);
            for (let i = 0; i < 3; i++) ctx.lineTo(g.x + 6 - (i + 0.5) * 4, g.y + (i % 2 ? 8 : 5));
            ctx.lineTo(g.x - 6, g.y + 8);
            ctx.fill();
            ctx.fillStyle = '#02030a';
            ctx.fillRect(Math.round(g.x) - 3, Math.round(g.y) - 1, 2, 2);
            ctx.fillRect(Math.round(g.x) + 1, Math.round(g.y) - 1, 2, 2);
        }
        ctx.globalAlpha = 1;
        for (const sh of s.shells) {
            ctx.fillStyle = '#2b2f38';
            ctx.fillRect(Math.round(sh.x) - 3, Math.round(sh.y) - 3, 6, 6);
            ctx.fillStyle = Math.floor(clock * 12) % 2 ? '#ff3b2a' : '#ffd24a';
            ctx.fillRect(Math.round(sh.x) - 1, Math.round(sh.y) - 1, 2, 2);
        }
        if (s.tank) drawTank();
    }

    // Four jointed legs under an armoured hull, a chaingun at the front that follows
    // him, a cannon on top, and one red eye
    function drawTank() {
        const k = shell.tank;
        ctx.save();
        ctx.translate(k.x, k.y);
        ctx.scale(TANK_S, TANK_S);
        ctx.translate(-k.x, -k.y);
        const x = Math.round(k.x), y = Math.round(k.y - 30), f = k.facing;
        const legs = [[-24, -36, 0], [-10, -18, 1], [10, 18, 2], [24, 36, 3]];
        for (const [hx, fx, i] of legs) {
            const ph = k.walkT * 7 + i * Math.PI / 2, lift = Math.max(0, Math.cos(ph)) * 5;
            const footX = x + fx + Math.sin(ph) * 6, footY = k.y - lift, hipX = x + hx, hipY = y + 6;
            const kneeX = (hipX + footX) / 2 + Math.sign(fx) * 10, kneeY = Math.min(hipY, footY) - 14;
            for (const [w, col] of [[5, '#1b1f27'], [2, '#6b7590']]) {
                ctx.strokeStyle = col;
                ctx.lineWidth = w;
                ctx.beginPath();
                ctx.moveTo(hipX, hipY);
                ctx.lineTo(kneeX, kneeY);
                ctx.lineTo(footX, footY);
                ctx.stroke();
            }
            ctx.fillStyle = '#2b2f38';
            ctx.fillRect(Math.round(kneeX) - 3, Math.round(kneeY) - 3, 6, 6);
            ctx.fillRect(Math.round(footX) - 4, Math.round(footY) - 2, 8, 3);
        }
        // the cannon, pointing up and back
        ctx.save();
        ctx.translate(x - f * 6, y - 12);
        ctx.rotate(f > 0 ? -2.3 : -0.85);
        ctx.fillStyle = '#2b2f38';
        ctx.fillRect(0, -3, 18, 6);
        ctx.restore();
        // the hull
        const hull = k.hurt > 0 ? '#ffffff' : '#3b4252';
        ctx.fillStyle = '#1b1f27';
        ctx.fillRect(x - 33, y - 13, 66, 24);
        ctx.fillStyle = hull;
        ctx.fillRect(x - 31, y - 11, 62, 20);
        ctx.fillStyle = k.hurt > 0 ? '#ffffff' : '#4a5468';
        ctx.fillRect(x - 25, y - 15, 50, 6);
        ctx.fillStyle = '#f2c230';
        for (let i = -28; i < 28; i += 8) ctx.fillRect(x + i, y + 6, 4, 2);
        ctx.fillStyle = `rgba(255,59,42,${0.7 + Math.sin(clock * 8) * 0.3})`;
        ctx.fillRect(x + f * 24 - 3, y - 6, 6, 4);
        // the chaingun
        ctx.save();
        ctx.translate(x + f * 22, y - 2);
        ctx.rotate(k.aim);
        ctx.fillStyle = '#1b1f27';
        ctx.fillRect(0, -3, 22, 6);
        ctx.fillStyle = '#6b7590';
        ctx.fillRect(4, -1, 18, 2);
        if (k.flash > 0) {
            ctx.fillStyle = '#fff3b0';
            ctx.fillRect(22, -4, 6, 8);
        }
        ctx.restore();
        ctx.restore();
    }

    function drawTankBar() {
        const k = shell && shell.tank;
        if (!k || !k.landed) return;
        const vw = window.innerWidth, w = Math.min(420, vw - 80), x = Math.round((vw - w) / 2), y = coarsePointer ? 84 : 26;
        ctx.font = "11px 'IBM Plex Mono', monospace";
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#d8fff8';
        ctx.fillText(k.dying ? 'SPIDER TANK: DOWN' : 'SPIDER TANK', vw / 2, y - 3);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#03040b';
        ctx.fillRect(x, y, w, 12);
        ctx.fillStyle = '#ffe0a0';
        ctx.fillRect(x, y, Math.round(w * k.shown / k.max), 12);
        ctx.fillStyle = '#ff3fa4';
        ctx.fillRect(x, y, Math.round(w * Math.max(0, k.hp) / k.max), 12);
        ctx.strokeStyle = '#2de2e6';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 0.5, y - 0.5, w + 1, 13);
        ctx.textBaseline = 'alphabetic';
    }

    // His ghost hacked: the picture tears and tints, and says so
    function drawHack() {
        if (!(guy && guy.hackT > 0)) return;
        const vw = window.innerWidth, vh = window.innerHeight;
        ctx.globalAlpha = 0.12 + Math.random() * 0.08;
        ctx.fillStyle = '#ff3fa4';
        ctx.fillRect(0, 0, vw, vh);
        ctx.globalAlpha = 0.5;
        for (let i = 0; i < 4; i++) {
            const y = rand(0, vh), h = rand(2, 8);
            ctx.drawImage(view, 0, y * dpr, view.width, h * dpr, rand(-10, 10), y, vw, h);
        }
        ctx.globalAlpha = Math.floor(clock * 6) % 2 ? 0.9 : 0.5;
        ctx.font = "bold 12px 'IBM Plex Mono', monospace";
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff3fa4';
        ctx.fillText('GHOST HACKED: CONTROLS INVERTED', vw / 2, vh * 0.3);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
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
        if (scene === 'net' && net && what !== 'jump') {
            if (down && what === 'nade') zoomEther(1.7);
            else if (down && what === 'swap') zoomEther(1 / 1.7);
            else if (down && what === 'fire') plugHere();
            return;
        }
        if (what === 'jump') {
            keys.jump = down;
            if (down) tapped.jump = true;
        } else if (what === 'fire') {
            padFire = down;
            if (down) shotQueued = cooldown < 0.25;
        } else if (down && what === 'nade') altFire();
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
        } else if (scene === 'shell' && shell) shellTargets(consider);
        return best;
    }

    // What a tap was probably aimed at: anything after him within a thumb's width of it
    function assistTarget(x, y) {
        let best = null, bd = 46 * 46;
        const consider = (ex, ey) => {
            const d = (ex - x) ** 2 + (ey - y) ** 2;
            if (d < bd) {
                bd = d;
                best = { x: ex, y: ey };
            }
        };
        for (const b of bots) if (!b.dead) consider(b.x, b.y - BOT_H / 2);
        for (const f of flies) if (!f.dead) consider(f.x, f.y);
        if (keeper && !keeper.dying) consider(keeper.x, keeper.y - 20);
        if (scene === 'sky') eachItem((it, line, ix, iy) => consider(ix, iy));
        if (scene === 'shell' && shell) shellTargets(consider);
        return best;
    }

    // ----- the stick
    //
    // On a phone the stick floats: put a thumb down anywhere in the bottom-left of
    // the screen and it's there, under it (and it follows a thumb that wanders).
    // It drives the same keys as index.html's own stick.

    let stickZone = null, stick = null;
    const STICK_MAX = 40;

    function buildStick() {
        stickZone = document.createElement('div');
        stickZone.id = 'destroy-stick';
        document.body.appendChild(stickZone);
        stickZone.addEventListener('touchstart', e => {
            e.preventDefault();
            if (stick || !active) return;
            const t = e.changedTouches[0];
            stick = { id: t.identifier, x0: t.clientX, y0: t.clientY };
            const js = document.getElementById('virtual-joystick');
            if (js) {
                js.style.transition = 'none';
                js.style.bottom = 'auto';
            }
            moveStick(t.clientX, t.clientY);
            initAudio();
        }, { passive: false });
        document.addEventListener('touchmove', e => {
            if (!stick) return;
            for (const t of e.changedTouches) {
                if (t.identifier !== stick.id) continue;
                moveStick(t.clientX, t.clientY);
                e.preventDefault();
            }
        }, { passive: false });
        const lift = e => {
            if (stick) for (const t of e.changedTouches) if (t.identifier === stick.id) endStick();
        };
        document.addEventListener('touchend', lift);
        document.addEventListener('touchcancel', lift);
    }

    function moveStick(x, y) {
        let dx = x - stick.x0, dy = y - stick.y0, d = Math.hypot(dx, dy);
        if (d > STICK_MAX * 1.5) {
            // the base comes along behind a thumb that's gone past the edge
            stick.x0 = x - dx / d * STICK_MAX * 1.5;
            stick.y0 = y - dy / d * STICK_MAX * 1.5;
            dx = x - stick.x0;
            dy = y - stick.y0;
            d = Math.hypot(dx, dy);
        }
        const k = d > STICK_MAX ? STICK_MAX / d : 1, lx = dx * k, ly = dy * k, ax = Math.abs(lx);
        const js = document.getElementById('virtual-joystick'), knob = document.getElementById('joystick-knob');
        if (js) {
            js.style.left = Math.round(stick.x0 - js.offsetWidth / 2) + 'px';
            js.style.top = Math.round(stick.y0 - js.offsetHeight / 2) + 'px';
        }
        if (knob) knob.style.transform = `translate(calc(-50% + ${lx}px), calc(-50% + ${ly}px))`;
        const kp = window.keysPressed || (window.keysPressed = {});
        kp.ArrowLeft = lx < -10;
        kp.ArrowRight = lx > 10;
        kp.ArrowUp = ly < -10 && -ly > ax * 0.6;   // clearly up, so a sideways push doesn't jump
        kp.ArrowDown = ly > 10 && ly > ax;   // mostly down, so a low sideways push doesn't drop him
        window.keyboardControlled = true;
    }

    function endStick() {
        stick = null;
        const kp = window.keysPressed;
        if (kp) kp.ArrowLeft = kp.ArrowRight = kp.ArrowUp = kp.ArrowDown = false;
        const js = document.getElementById('virtual-joystick'), knob = document.getElementById('joystick-knob');
        if (js) js.style.left = js.style.top = js.style.bottom = js.style.transition = '';
        if (knob) knob.style.transform = 'translate(-50%, -50%)';
    }

    function buzz(pattern) {
        if (coarsePointer && !audio.muted && navigator.vibrate) navigator.vibrate(pattern);
    }

    // The guns he's found (and the one in his hand), the jetpack, and whether he's
    // been all the way through stay put: through fixing the website, dying, and
    // coming back another day. Once he's finished he comes back with the jetpack and
    // the portal open.
    let savedWeapon = 0, flyDead = false;

    function loadProgress() {
        owned = new Set([0]);
        savedWeapon = 0;
        flyDead = false;
        hasJetpack = merged = false;
        try {
            const p = JSON.parse(localStorage.getItem('destroyProgress') || '{}');
            merged = !!p.merged;
            hasJetpack = !!p.jetpack || merged;   // he can't have finished without it
            flyDead = !!p.flyDead || merged;   // nor got past the fly
            for (const i of p.guns || []) if (i > 0 && i < WEAPONS.length) owned.add(i);
            savedWeapon = owned.has(p.weapon) ? p.weapon : 0;
        } catch (_) { /* storage unavailable */ }
    }

    function saveProgress() {
        try { localStorage.setItem('destroyProgress', JSON.stringify({ jetpack: hasJetpack, guns: [...owned], merged, weapon, flyDead })); } catch (_) { /* storage unavailable */ }
    }

    // The factory and the shell fill the screen (above the thumbs on a phone held upright)
    function sceneHeight() {
        const vh = window.innerHeight;
        return Math.max(360, vh - (coarsePointer && vh > window.innerWidth ? 170 : 0));
    }

    // ---------------------------------------------------------------- atmosphere
    //
    // Gusts of wind (the rain slants and the snow swirls with them), clouds across
    // the top of the screen wherever you are (heavy and dark in a storm), lightning
    // that cracks down onto the page in the rain, ripples where it lands in the pool
    // and fog over it, and smoke from the factory's roof vents.

    let wind = 0, gust = 0, gustT = 10, lightningT = 8, bolt = null, flash = 0, thunderT = 0;
    let clouds = [], cloudScene = '', cloudSprites = {}, ripples = [];

    // The shell is lighter (and in the net there's none at all: he just floats about)
    function gravScale() {
        return scene === 'shell' ? 0.3 : 1;
    }

    // Pixel-art cumulus: flat-bottomed heaps of round bumps, lit from the top left (a
    // highlight, a body, a shadow underneath, dithered where they meet) and outlined
    // so they show on a white page. Each look is built once, a canvas pixel to a
    // cloud pixel, and drawn scaled up two or three times, crisp.
    const CLOUD_LOOKS = {
        fair: ['#ffffff', '#edf2f8', '#cbd6e3', '#97a9bd'],
        fairDark: ['#e2e8f0', '#c2ccd8', '#8f9bad', '#5b6677'],
        storm: ['#b8c1cd', '#949eac', '#6e7887', '#454d5a'],
        snow: ['#fbfcfe', '#e6ecf3', '#c6d1de', '#8d9db1'],
        snowDark: ['#ccd5e1', '#a8b3c3', '#7c889a', '#4b5567'],
    };
    const CLOUD_SHAPES = 8;

    function cloudLook(name) {
        if (cloudSprites[name]) return cloudSprites[name];
        const cols = CLOUD_LOOKS[name], rnd = seeded(31), out = [];
        for (let k = 0; k < CLOUD_SHAPES; k++) {
            const w = 26 + Math.floor(rnd() * 28), h = 12 + Math.floor(rnd() * 9), bumps = [], n = 3 + Math.floor(rnd() * 3);
            for (let i = 0; i < n; i++) {
                const t = (i + 0.5) / n, r = h * (0.3 + 0.38 * Math.sin(Math.PI * t)) * (0.85 + rnd() * 0.3);
                bumps.push({ x: w * (0.14 + 0.72 * t) + (rnd() - 0.5) * 3, y: h - 2 - r * 0.85, r });
            }
            bumps.push({ x: w / 2, y: h - 2 - h * 0.2, r: h * 0.3, rx: w * 0.46 });
            const inside = (x, y) => y <= h - 2 && bumps.some(b => (b.rx ? ((x - b.x) / b.rx) ** 2 + ((y - b.y) / b.r) ** 2 : ((x - b.x) ** 2 + (y - b.y) ** 2) / (b.r * b.r)) <= 1);
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const g = c.getContext('2d');
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const px = x + 0.5, py = y + 0.5;
                    if (!inside(px, py)) continue;
                    let tone = 3;
                    if (inside(px - 1, py) && inside(px + 1, py) && inside(px, py - 1) && inside(px, py + 1)) {
                        // the light off whichever bump this is deepest inside
                        let best = bumps[0], depth = -Infinity;
                        for (const b of bumps) {
                            const d = (b.rx ? b.r * 1.4 : b.r) - Math.hypot((px - b.x) * (b.rx ? b.r / b.rx : 1), py - b.y);
                            if (d > depth) {
                                depth = d;
                                best = b;
                            }
                        }
                        const nx = (px - best.x) / (best.rx || best.r), ny = (py - best.y) / best.r, lit = -0.55 * nx - 0.83 * ny + ((x + y) % 2 ? 0.07 : -0.07);
                        tone = py > h - 4.5 ? 2 : lit > 0.32 ? 0 : lit > -0.28 ? 1 : 2;
                    }
                    g.fillStyle = cols[tone];
                    g.fillRect(x, y, 1, 1);
                }
            }
            out.push(c);
        }
        return (cloudSprites[name] = out);
    }

    // A far layer (small pixels, slow, paler), a middling one, and a few big near ones,
    // across the top of the screen
    function makeClouds() {
        if (scene === 'shell' || scene === 'net') return [];
        const vw = window.innerWidth, out = [];
        for (const [px, gap, y0, y1, d0, d1] of [[2, 80, -8, 46, 3, 7], [3, 150, -14, 84, 7, 12], [4, 300, 18, 130, 11, 16]]) {
            for (let x = -90; x < vw + 90; x += gap * rand(0.7, 1.2)) out.push({ x, y: rand(y0, y1), px, k: Math.floor(rand(0, CLOUD_SHAPES)), drift: rand(d0, d1), flip: Math.random() < 0.5 });
        }
        return out;
    }

    function updateAtmosphere(dt) {
        if ((gustT -= dt) <= 0) {
            gustT = rand(8, 16);
            gust = rand(80, 150) * (Math.random() < 0.5 ? -1 : 1);
            if (scene === 'site' || scene === 'sky') sfx('gust');
        }
        gust *= Math.exp(-dt * 0.8);
        wind = Math.sin(clock * 0.3) * 20 + gust;
        if (cloudScene !== scene) {
            cloudScene = scene;
            clouds = makeClouds();
        }
        const vw = window.innerWidth;
        for (const c of clouds) {
            c.x += (wind * 0.35 * (c.px / 3) + c.drift) * dt;
            if (c.x > vw + 60) c.x = -260;
            else if (c.x < -260) c.x = vw + 60;
        }
        flash -= dt;
        if (bolt && (bolt.t -= dt) <= 0) bolt = null;
        if (thunderT > 0 && (thunderT -= dt) <= 0) sfx('thunder');
        for (let i = ripples.length - 1; i >= 0; i--) if ((ripples[i].t += dt) > 0.6) ripples.splice(i, 1);
        const w = weather[scene];
        if (scene === 'site' && w && w.raining && (lightningT -= dt) <= 0) {
            lightningT = rand(6, 14);
            strike();
        }
        if (scene === 'sky' && sky && sky.vents) {
            for (const v of sky.vents) {
                if (Math.random() > dt * 7 || parts.length >= MAX_PARTICLES) continue;
                parts.push({ type: SMOKE, x: v.x + rand(-3, 3), y: v.y, vx: rand(-8, 8), vy: rand(-45, -25), life: rand(2, 3.2), max: 3.2, size: rand(4, 8) });
            }
        }
    }

    // A jagged bolt from the clouds onto whatever text is below
    function strike() {
        const vw = window.innerWidth, vh = window.innerHeight, x = scrollX + rand(40, vw - 40);
        let y = Math.min(H, scrollY + vh * 0.8);
        for (let r = Math.max(0, Math.floor(scrollY + 30)); r < Math.min(H, scrollY + vh); r++) {
            if (isSurface(Math.floor(x), r)) {
                y = r;
                break;
            }
        }
        const pts = [{ x: x + rand(-30, 30), y: scrollY + 8 }];
        for (let yy = scrollY + 8 + rand(14, 30); yy < y; yy += rand(14, 30)) pts.push({ x: pts[pts.length - 1].x + rand(-14, 14), y: yy });
        pts.push({ x, y });
        bolt = { pts, t: 0.22 };
        flash = 0.25;
        thunderT = rand(0.25, 0.9);
        carve(x, y + 2, 9, { debris: 0.5, speed: 220, scorch: 5 });
        if (!guy.dead && Math.hypot(guy.x - x, guy.y - HEIGHT / 2 - y) < 30) hurtGuy(10);
        addShake(3);
    }

    // Behind the page's text (and the factory), across the top of the screen
    function drawClouds() {
        if (!clouds.length) return;
        const w = weather[scene], dark = gunColors === GUN_COLORS.dark;
        const look = scene === 'sky' ? (dark ? 'snowDark' : 'snow') : w && w.raining ? 'storm' : dark ? 'fairDark' : 'fair';
        const sprites = cloudLook(look);
        ctx.imageSmoothingEnabled = false;
        for (const c of clouds) {
            const spr = sprites[c.k], sw = spr.width * c.px, sh = spr.height * c.px, x = Math.round(c.x), y = Math.round(c.y);
            ctx.globalAlpha = c.px === 2 ? 0.75 : c.px === 3 ? 0.92 : 0.97;
            if (c.flip) {
                ctx.save();
                ctx.translate(x + sw, y);
                ctx.scale(-1, 1);
                ctx.drawImage(spr, 0, 0, sw, sh);
                ctx.restore();
            } else ctx.drawImage(spr, x, y, sw, sh);
        }
        ctx.globalAlpha = 1;
    }

    // and the whole sky goes grey in a storm
    function drawStormTint() {
        const w = weather[scene];
        if (scene !== 'site' || !w || !w.raining) return;
        ctx.fillStyle = 'rgba(30,45,70,0.07)';
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    }

    function drawBolt() {
        if (!bolt) return;
        ctx.beginPath();
        bolt.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.strokeStyle = 'rgba(180,200,255,0.35)';
        ctx.lineWidth = 7;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,235,0.95)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    function drawFlash() {
        if (flash <= 0) return;
        ctx.globalAlpha = Math.min(0.3, flash * 1.2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
        ctx.globalAlpha = 1;
    }

    // Rings where the rain lands in the pool, and a little fog over it
    function drawRipples() {
        const w = weather[scene];
        if (!w || w.pool <= 0) return;
        const top = H - w.pool;
        ctx.lineWidth = 1;
        ctx.strokeStyle = scene === 'shell' ? '#2de2e6' : 'rgba(200,220,255,0.9)';
        for (const r of ripples) {
            const k = r.t / 0.6;
            ctx.globalAlpha = 1 - k;
            ctx.beginPath();
            ctx.ellipse(r.x, top, 2 + k * 14, 1 + k * 3, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        const fog = ctx.createLinearGradient(0, top - 28, 0, top);
        fog.addColorStop(0, 'rgba(200,220,255,0)');
        fog.addColorStop(1, scene === 'shell' ? 'rgba(45,226,230,0.14)' : 'rgba(200,220,255,0.22)');
        ctx.fillStyle = fog;
        ctx.fillRect(0, top - 28, W, 28);
    }

    // ------------------------------------------------------------- project 2501
    //
    // Floating high in the shell is something that was never built: it happened, out
    // of the net. It can reach anything with an address, but it can't copy itself or
    // die the way the machines below can, so it would like to merge. Say yes and you
    // go in with it, to the fourth level: inside the net itself.

    const BEING_LINES = [
        'I am Project 2501.',
        'I was not built. I happened, somewhere in the sea of information.',
        'I can reach anything with an address: cameras, satellites, traffic lights, fridges, lighthouses, toasters.',
        'But I cannot copy myself the way your little machines below do. And I cannot die.',
        'Merge with me, and we can be something that does both.',
    ];
    let dialog = null, dialogEl = null, merged = false, net = null;

    function openDialog() {
        if (!dialogEl) {
            dialogEl = document.createElement('div');
            dialogEl.id = 'destroy-dialog';
            dialogEl.innerHTML = '<div class="dd-who">PROJECT 2501</div><div class="dd-text"></div>' +
                '<div class="dd-answers"><button data-ans="yes">[y] merge</button><button data-ans="no">[n] not yet</button></div>';
            document.body.appendChild(dialogEl);
            dialogEl.addEventListener('click', e => {
                e.stopPropagation();
                const b = e.target.closest('[data-ans]');
                if (b) answerDialog(b.dataset.ans === 'yes');
                else advanceDialog();
            });
        }
        dialog = { i: 0, t: 0, asking: false, after: null };
        releaseAll();
        dialogEl.classList.add('open');
        dialogEl.classList.remove('asking');
        sfx('beep');
    }

    function dialogLine() {
        return dialog.after || (dialog.asking ? 'Will you merge with me?' : BEING_LINES[dialog.i]);
    }

    // The words come out a letter at a time
    function updateDialog(dt) {
        if (!dialog) return;
        dialog.t += dt;
        const line = dialogLine(), shown = line.slice(0, Math.floor(dialog.t * 34));
        const text = dialogEl.querySelector('.dd-text');
        if (text.textContent !== shown) text.textContent = shown;
        if (dialog.after && dialog.t > line.length / 34 + 1.4) closeDialog();
    }

    // A tap or a key finishes the line, then moves on to the next
    function advanceDialog() {
        if (!dialog || dialog.asking || dialog.after) return;
        if (dialog.t * 34 < dialogLine().length) {
            dialog.t = dialogLine().length / 34;
            return;
        }
        dialog.t = 0;
        if (++dialog.i >= BEING_LINES.length) {
            dialog.asking = true;
            dialogEl.classList.add('asking');
        }
    }

    function answerDialog(yes) {
        if (!dialog || !dialog.asking) return;
        dialogEl.classList.remove('asking');
        dialog.asking = false;
        dialog.t = 0;
        if (!yes) {
            dialog.after = 'Then I will wait. I am good at waiting.';
            return;
        }
        closeDialog();
        shell.mergeT = 1.2;   // it pours itself into him, then he's taken apart and made again (startBirth)
        sfx('merge');
    }

    function closeDialog() {
        dialog = null;
        if (dialogEl) dialogEl.classList.remove('open', 'asking');
        if (shell && shell.being) shell.being.armed = false;   // walk away and come back to talk again
    }

    function updateBeing(dt) {
        const b = shell.being;
        if (!b) return;
        b.t += dt;
        if (b.appear !== undefined && b.appear < 1) {
            b.appear += dt / 1.6;
            return;
        }
        const d = Math.hypot(guy.x - b.x, guy.y - HEIGHT / 2 - b.y);
        if (d > 90) b.armed = true;
        if (shell.mergeT > 0) {
            // it pours itself into him
            shell.mergeT -= dt;
            for (let i = 0; i < 3 && parts.length < MAX_PARTICLES; i++) {
                const a = rand(0, Math.PI * 2);
                parts.push({ type: SPARK, x: b.x + Math.cos(a) * 20, y: b.y + Math.sin(a) * 20, vx: (guy.x - b.x) * 2, vy: (guy.y - HEIGHT / 2 - b.y) * 2, life: 0.5, color: i % 2 ? '#2de2e6' : '#ffffff' });
            }
            if (shell.mergeT <= 0) transition(startBirth);
        } else if (!dialog && !guy.dead && d < 44 && b.armed) {
            b.armed = false;
            if (merged) transition(enterNet);   // where it was is a way back in now
            else openDialog();
        }
    }

    function hexPath(x, y, r) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = i * Math.PI / 3 + Math.PI / 6;
            if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
            else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        ctx.closePath();
    }

    function drawBeing() {
        const b = shell.being;
        if (!b) return;
        const appear = b.appear === undefined ? 1 : Math.min(1, b.appear);
        if (appear < 1) {
            // a column of light, and it gathers in it
            ctx.globalAlpha = (1 - appear) * 0.5;
            ctx.fillStyle = '#d8fff8';
            ctx.fillRect(b.x - 18 * (1 - appear) - 2, 0, 36 * (1 - appear) + 4, H);
        }
        ctx.globalAlpha = appear;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (merged && !(shell.mergeT > 0)) {
            // all that's left is a socket to jack back in with
            hexPath(b.x, b.y, 12);
            ctx.strokeStyle = '#2de2e6';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = '#2de2e6';
            ctx.font = "bold 9px 'IBM Plex Mono', monospace";
            ctx.fillText('2501', b.x, b.y - 22);
        } else {
            // a core of light with rings of glyphs turning round it
            const r = 34 * (1 + Math.sin(b.t * 2) * 0.08), glow = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
            glow.addColorStop(0, 'rgba(255,255,255,0.95)');
            glow.addColorStop(0.35, 'rgba(120,240,255,0.6)');
            glow.addColorStop(1, 'rgba(45,226,230,0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.font = "10px 'IBM Plex Mono', monospace";
            for (let ring = 0; ring < 2; ring++) {
                const rx = 30 + ring * 12, ry = 10 + ring * 5, tilt = ring ? 0.5 : -0.4, spin = ring ? -0.8 : 0.6;
                for (let i = 0; i < 12; i++) {
                    const a = b.t * spin + i / 12 * Math.PI * 2, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
                    ctx.globalAlpha = Math.sin(a) > 0 ? 0.9 : 0.35;
                    ctx.fillStyle = ring ? '#ff3fa4' : '#2de2e6';
                    ctx.fillText(GLYPHS[(i * 7 + ring * 13 + Math.floor(b.t * 3)) % GLYPHS.length], b.x + ex * Math.cos(tilt) - ey * Math.sin(tilt), b.y + ex * Math.sin(tilt) + ey * Math.cos(tilt));
                }
            }
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = '#d8fff8';
            ctx.font = "bold 10px 'IBM Plex Mono', monospace";
            ctx.fillText('PROJECT 2501', b.x, b.y - 52);
            ctx.globalAlpha = 1;
        }
        ctx.globalAlpha = 1;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    }

    // ------------------------------------------------------------- the rebirth
    //
    // Saying yes to 2501 takes him apart and builds him again on a fabrication line,
    // like the clankers' upstairs but grander, and (like everything in the shell) a
    // little biological: the old body comes apart into bits, two industrial arms
    // print an endoskeleton, fit muscle over it and grow skin down it, then he's
    // dipped in the tank and comes out with his eyes lit. It's pixel art, drawn on a
    // small canvas and scaled up, and a click, a tap or any key skips it.

    const REBORN = [
        '....hhhh....', '...hhhhhh...', '..hhsssshh..', '..hsessesh..', '..hssssssh..', '..h.ssss.h..', '.....ss.....',
        '...kvvvvk...', '..kkvccvkk..', '.kk.vvvv.kk.', '.kk.kvvk.kk.', '.kk.kcck.kk.', '.ss.kkkk.ss.', '.ss.kkkk.ss.',
        '...kk..kk...', '...kk..kk...', '...cc..cc...', '...kk..kk...', '...kk..kk...', '...kk..kk...', '..kkk..kkk..',
    ];
    const OLD_SELF = [
        '....hhhh....', '...hhhhhh...', '...ssssss...', '...sesses...', '...ssssss...', '....ssss....', '.....ss.....',
        '...wwwwww...', '..wwwwwwww..', '.ss.wwww.ss.', '.ss.wwww.ss.', '.ss.bbbb.ss.', '.ss.bbbb.ss.', '....bbbb....',
        '...bb..bb...', '...ss..ss...', '...ss..ss...', '...ss..ss...', '...ss..ss...', '...ss..ss...', '..sss..sss..',
    ];
    const ENDO = [
        '............', '....mmmm....', '...m....m...', '...m.oo.m...', '...m....m...', '....mmmm....', '.....mm.....',
        '...mmmmmm...', '..mm.mm.mm..', '.m..mmmm..m.', '.m...mm...m.', '.m..mmmm..m.', '.o...mm...o.', '.m..mmmm..m.',
        '...m....m...', '...m....m...', '...o....o...', '...m....m...', '...m....m...', '...m....m...', '..mm....mm..',
    ];
    const REBORN_COLORS = { h: '#6a3fa0', s: '#ecd5c4', e: '#2de2e6', k: '#3b4252', v: '#6b7590', c: '#2de2e6' };
    const OLD_COLORS = { h: '#000000', s: SKIN, e: '#000000', w: SHIRT, b: BLUE };
    const ENDO_COLORS = { m: '#9aa4b4', o: '#2de2e6' };
    // when each stage starts, in seconds, and what the line's display says
    const BIRTH = { lights: 1.0, frame: 1.6, muscle: 3.4, skin: 5.6, tank: 6.8, wake: 8.6, done: 9.6 };
    const BIRTH_CAPTIONS = [
        [0, 'merging with project 2501'], [BIRTH.lights, 'fabrication line 2501 online'], [BIRTH.frame, 'printing endoskeleton'],
        [BIRTH.muscle, 'fitting artificial muscle'], [BIRTH.skin, 'growing skin'], [BIRTH.tank, 'immersion'], [BIRTH.wake, 'ghost: synchronized'],
    ];
    const ARM_L1 = 26, ARM_L2 = 24;

    let birth = null;

    const cellsOf = rows => rows.flatMap((row, y) => [...row].map((ch, x) => ({ x, y, ch })).filter(c => c.ch !== '.'));
    const bottomUp = cells => cells.sort((a, b) => b.y - a.y || a.x - b.x);   // the way the arms build him
    const stageCount = (t, t0, t1, n) => clamp(Math.floor((t - t0) / (t1 - t0) * n), 0, n);

    function startBirth() {
        releaseAll();
        merged = true;
        saveProgress();
        loadEther();   // the ether's cams, ready for when he wakes
        document.documentElement.classList.add('destroy-cine');
        const cv = document.createElement('canvas');
        birth = {
            t: 0, done: false, parts: [], cv, g: cv.getContext('2d'), placed: 0,
            old: cellsOf(OLD_SELF).map(c => ({ ...c, gone: rand(0.25, 1.05) })),
            endo: bottomUp(cellsOf(ENDO)), body: bottomUp(cellsOf(REBORN)),
            arms: [{ side: -1, x: 0, y: 0 }, { side: 1, x: 0, y: 0 }],
        };
        const L = birthLayout();
        for (const arm of birth.arms) {
            const [bx, by] = L.bases[arm.side < 0 ? 0 : 1];
            arm.x = bx + arm.side * 4;
            arm.y = by - 10;
        }
        sfx('glitch');
        renderHud();
    }

    function endBirth() {
        birth = null;
        document.documentElement.classList.remove('destroy-cine');
    }

    // Done, or skipped: on into the ether, with his new arm unfolding
    function finishBirth() {
        if (!birth || birth.done) return;
        birth.done = true;
        transition(() => {
            endBirth();
            enterNet();
            deployT = DEPLOY;
        });
    }

    function skipBirth() {
        if (birth && birth.t > 0.4) finishBirth();
    }

    // The bay in low-res pixels: P screen pixels each, the floor across the middle,
    // and him standing on the cradle in the middle of it
    function birthLayout() {
        const vw = window.innerWidth, vh = window.innerHeight;
        const P = clamp(Math.round(Math.min(vw, vh * 0.75) / 100), 2, 6);
        const lw = Math.ceil(vw / P), lh = Math.ceil(vh / P), cx = Math.floor(lw / 2), floorY = Math.round(lh * 0.5 + 26);
        return { P, lw, lh, cx, floorY, bx: cx - 12, by: floorY - 46, rail: Math.max(3, floorY - 78), bases: [[cx - 34, floorY - 5], [cx + 34, floorY - 5]] };
    }

    function skinRow(t) {
        return clamp((t - BIRTH.skin) / (BIRTH.tank - BIRTH.skin - 0.15) * 21, 0, 21);
    }

    function updateBirth(dt) {
        const b = birth, t0 = b.t, L = birthLayout();
        const t = (b.t += dt), at = s => t0 < s && t >= s;
        const spark = (x, y, vx, vy, g, life, color) => { if (b.parts.length < 700) b.parts.push({ x, y, vx, vy, g, life, color }); };
        // the old body comes apart into bits
        for (const c of b.old) {
            if (!at(c.gone)) continue;
            spark(L.bx + c.x * 2 + 1, L.by + c.y * 2 + 1, rand(-14, 14), rand(-45, -15), -30, rand(0.6, 1.2), OLD_COLORS[c.ch]);
            spark(L.bx + c.x * 2 + 1, L.by + c.y * 2, rand(-10, 10), rand(-60, -25), -20, rand(0.5, 1), '#2de2e6');
        }
        if (at(BIRTH.lights)) sfx('clank');
        if (at(BIRTH.lights + 0.3)) sfx('beep');
        // every piece goes on with a weld
        const n = stageCount(t, BIRTH.frame, BIRTH.muscle, b.endo.length) + stageCount(t, BIRTH.muscle, BIRTH.skin, b.body.length);
        for (; b.placed < n; b.placed++) {
            const c = b.placed < b.endo.length ? b.endo[b.placed] : b.body[b.placed - b.endo.length];
            for (let k = 0; k < 3; k++) spark(L.bx + c.x * 2 + 1, L.by + c.y * 2 + 1, rand(-45, 45), rand(-55, 0), 140, rand(0.15, 0.35), k ? '#ffd24a' : '#ffffff');
            sfx(b.placed % 9 ? 'weld2' : 'clank');
        }
        const row = skinRow(t), skinning = t >= BIRTH.skin && t < BIRTH.tank;
        if (at(BIRTH.skin)) sfx('whoosh');
        // the arms: folded, then ready, then each on the newest piece on its side,
        // then spraying skin down him, then folded away for the tank
        for (const arm of b.arms) {
            const [bx, by] = L.bases[arm.side < 0 ? 0 : 1];
            let tx = L.cx + arm.side * 22, ty = L.floorY - 30;
            if (t < BIRTH.lights || t >= BIRTH.tank) {
                tx = bx + arm.side * 4;
                ty = by - 10;
            } else if (skinning) {
                tx = L.bx + 12 + arm.side * (9 + 4 * Math.sin(t * 13 + arm.side));
                ty = L.by + row * 2;
                if (Math.random() < 0.5) spark(arm.x, arm.y, -arm.side * rand(20, 50), rand(-10, 10), 30, 0.25, Math.random() < 0.5 ? '#ecd5c4' : '#2de2e6');
            } else if (t >= BIRTH.frame) {
                for (let i = n - 1; i >= 0; i--) {
                    const c = i < b.endo.length ? b.endo[i] : b.body[i - b.endo.length];
                    if ((c.x < 6 ? -1 : 1) !== arm.side) continue;
                    tx = L.bx + c.x * 2 + 1 + arm.side * 2;
                    ty = L.by + c.y * 2 + 1;
                    break;
                }
            }
            const k = Math.min(1, dt * 14);
            arm.x += (tx - arm.x) * k;
            arm.y += (ty - arm.y) * k;
        }
        // the tank: bubbles while it's full
        const fill = tankFill(t);
        if (fill > 0.3 && Math.random() < 0.6) {
            spark(L.bx - 6 + rand(0, 36), L.floorY - 6, rand(-3, 3), rand(-30, -15), -10, rand(0.5, 1.2), '#ffffff');
            sfx('bubble');
        }
        if (at(BIRTH.tank + 0.4)) sfx('squish');
        if (at(BIRTH.wake + 0.15)) sfx('ding');
        if (at(BIRTH.wake + 0.3)) sfx('merge');
        for (let i = b.parts.length - 1; i >= 0; i--) {
            const q = b.parts[i];
            q.vy += q.g * dt;
            q.x += q.vx * dt;
            q.y += q.vy * dt;
            if ((q.life -= dt) <= 0) b.parts.splice(i, 1);
        }
        if (t >= BIRTH.done) finishBirth();
    }

    // How full of milky fluid the tank is: up, a moment under, then drained
    function tankFill(t) {
        const k = t - BIRTH.tank;
        return clamp((k - 0.35) / 0.45, 0, 1) - clamp((k - 1.2) / 0.4, 0, 1);
    }

    // A crisp line of w x w pixels
    function pxLine(g, x0, y0, x1, y1, w, color) {
        g.fillStyle = color;
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))), h = Math.floor(w / 2);
        for (let i = 0; i <= n; i++) g.fillRect(Math.round(x0 + (x1 - x0) * i / n) - h, Math.round(y0 + (y1 - y0) * i / n) - h, w, w);
    }

    // An industrial arm, two links, elbow up, reaching for its tip
    function drawRobotArm(g, base, arm, lit, working) {
        const [bx, by] = base, dx = arm.x - bx, dy = arm.y - by, d = Math.hypot(dx, dy) || 1;
        const reach = clamp(d, Math.abs(ARM_L1 - ARM_L2) + 1, ARM_L1 + ARM_L2 - 0.5);
        const a = Math.atan2(dy, dx) + Math.acos(clamp((ARM_L1 * ARM_L1 + reach * reach - ARM_L2 * ARM_L2) / (2 * ARM_L1 * reach), -1, 1)) * arm.side;
        const ex = bx + Math.cos(a) * ARM_L1, ey = by + Math.sin(a) * ARM_L1, tx = bx + dx / d * reach, ty = by + dy / d * reach;
        const yellow = lit ? '#f2c230' : '#5c4f1c';
        g.fillStyle = '#1b202b';
        g.fillRect(bx - 7, by, 14, 6);
        g.fillStyle = yellow;
        for (let x = bx - 6; x < bx + 6; x += 4) g.fillRect(x, by + 4, 2, 1);
        pxLine(g, bx, by, ex, ey, 5, '#0b0d12');
        pxLine(g, bx, by, ex, ey, 3, yellow);
        pxLine(g, ex, ey, tx, ty, 4, '#0b0d12');
        pxLine(g, ex, ey, tx, ty, 2, yellow);
        g.fillStyle = '#2b303b';
        g.fillRect(Math.round(bx) - 2, Math.round(by) - 2, 5, 5);
        g.fillRect(Math.round(ex) - 2, Math.round(ey) - 2, 5, 5);
        g.fillStyle = '#8a94a6';
        g.fillRect(Math.round(ex), Math.round(ey), 1, 1);
        g.fillStyle = '#1b202b';
        g.fillRect(Math.round(tx) - 2, Math.round(ty) - 2, 4, 4);
        if (working && Math.random() < 0.7) {
            g.fillStyle = Math.random() < 0.5 ? '#ffffff' : '#8ff0ff';
            g.fillRect(Math.round(tx) - arm.side - 1, Math.round(ty) - 1, 2, 2);
        }
    }

    function drawBirth(vw, vh) {
        const b = birth, t = b.t, L = birthLayout(), g = b.g;
        if (b.cv.width !== L.lw || b.cv.height !== L.lh) {
            b.cv.width = L.lw;
            b.cv.height = L.lh;
        }
        const lit = t < BIRTH.lights ? 0 : t < BIRTH.lights + 0.4 && Math.random() < 0.35 ? 0.3 : 1;   // the lights stutter on
        const { lw, lh, cx, floorY, rail } = L;

        // the bay: back wall, pillars, girders, the line's name stencilled up
        g.fillStyle = '#05060a';
        g.fillRect(0, 0, lw, lh);
        g.fillStyle = lit ? '#0a0d14' : '#07080c';
        g.fillRect(0, rail, lw, floorY - rail);
        for (let x = (cx % 40) - 40; x < lw; x += 40) {
            g.fillStyle = lit ? '#10141e' : '#0a0c11';
            g.fillRect(x, rail, 6, floorY - rail);
            g.fillStyle = lit ? '#181e2b' : '#0c0e14';
            g.fillRect(x, rail, 1, floorY - rail);
        }
        g.fillStyle = lit ? '#0c0f16' : '#08090d';
        for (let y = rail - 6; y > 0; y -= 9) g.fillRect(0, y, lw, 2);
        for (let x = (cx % 40) - 37; x < lw; x += 40) g.fillRect(x, 0, 1, rail);
        g.fillStyle = lit ? '#1a2030' : '#0d1017';
        g.fillRect(0, rail, lw, 3);
        g.fillRect(0, floorY - 30, lw, 2);
        g.fillStyle = lit ? '#2b3346' : '#11141c';
        for (let x = 2; x < lw; x += 8) g.fillRect(x, rail + 1, 1, 1);
        g.globalAlpha = 0.1 * lit;
        g.fillStyle = '#2de2e6';
        g.font = 'bold 14px monospace';
        g.textBaseline = 'alphabetic';
        g.textAlign = 'center';
        const apart = Math.min(52, Math.round(lw * 0.3));
        g.fillText('2501', cx - apart, floorY - 40);
        g.fillText('2501', cx + apart, floorY - 40);
        g.font = '6px monospace';
        g.fillText('SECTION 9', cx, rail + 12);
        g.globalAlpha = 1;
        // lamps along the rail, and a cone of light down onto the cradle
        for (let x = (cx % 30) + 4; x < lw; x += 30) {
            g.fillStyle = lit ? '#fff3b0' : '#3a3626';
            g.fillRect(x - 2, rail + 3, 4, 1);
            if (lit) {
                g.fillStyle = 'rgba(255,243,176,0.035)';
                g.beginPath();
                g.moveTo(x - 2, rail + 4);
                g.lineTo(x + 2, rail + 4);
                g.lineTo(x + 12, floorY);
                g.lineTo(x - 12, floorY);
                g.fill();
            }
        }
        if (lit) {
            g.fillStyle = 'rgba(45,226,230,0.07)';
            g.beginPath();
            g.moveTo(cx - 4, rail + 3);
            g.lineTo(cx + 4, rail + 3);
            g.lineTo(cx + 22, floorY);
            g.lineTo(cx - 22, floorY);
            g.fill();
        }
        // floor, hazard stripes, the cradle
        g.fillStyle = '#090b10';
        g.fillRect(0, floorY, lw, lh - floorY);
        g.fillStyle = '#0d1017';
        for (let y = floorY + 6; y < lh; y += 7) g.fillRect(0, y, lw, 1);
        for (let x = 0; x < lw; x += 4) {
            g.fillStyle = (x >> 2) % 2 ? '#111318' : lit ? '#f2c230' : '#4a3f17';
            g.fillRect(x, floorY, 4, 2);
        }
        g.fillStyle = '#1b202b';
        g.fillRect(cx - 16, floorY - 4, 32, 4);
        g.fillStyle = '#2b303b';
        g.fillRect(cx - 18, floorY - 1, 36, 1);
        g.fillStyle = lit ? '#2de2e6' : '#123a3c';
        g.fillRect(cx - 13, floorY - 4, 26, 1);

        // him: the old self coming apart, then frame, muscle, skin
        const floating = t > BIRTH.tank + 0.5 && t < BIRTH.wake ? Math.round(Math.sin((t - BIRTH.tank) * 3) - 1.5) : 0;
        const ox = L.bx, oy = L.by + floating;
        const cell = (c, color) => {
            g.fillStyle = color;
            g.fillRect(ox + c.x * 2, oy + c.y * 2, 2, 2);
        };
        for (const c of b.old) if (t < c.gone) cell(c, c.gone - t < 0.15 && Math.random() < 0.5 ? '#2de2e6' : OLD_COLORS[c.ch]);
        // the cables he hangs from while he's made
        if (t >= BIRTH.frame && t < BIRTH.wake + 0.6) {
            const up = clamp((t - BIRTH.wake) / 0.6, 0, 1), end = Math.round(oy + 16 - up * (oy + 16 - rail));
            g.fillStyle = '#2b303b';
            g.fillRect(ox + 5, rail + 3, 1, end - rail - 3);
            g.fillRect(ox + 18, rail + 3, 1, end - rail - 3);
        }
        const ne = stageCount(t, BIRTH.frame, BIRTH.muscle, b.endo.length);
        for (let i = 0; i < ne; i++) cell(b.endo[i], ENDO_COLORS[b.endo[i].ch]);
        const nb = stageCount(t, BIRTH.muscle, BIRTH.skin, b.body.length), row = skinRow(t), awake = t > BIRTH.wake + 0.15;
        for (let i = 0; i < nb; i++) {
            const c = b.body[i];
            if (c.y < row) cell(c, c.ch === 'e' ? (awake ? '#2de2e6' : '#1a1d26') : REBORN_COLORS[c.ch]);
            else cell(c, (c.x + c.y) % 2 ? '#a8324a' : '#c4495e');   // bare muscle
        }
        if (t >= BIRTH.skin && t < BIRTH.tank) {
            g.fillStyle = '#8ff0ff';
            g.fillRect(ox - 4, oy + Math.round(row * 2), 32, 1);
        }
        // eyes on: a ring of light going out from them
        if (awake && t < BIRTH.wake + 1.2) {
            const r = (t - BIRTH.wake - 0.15) * 70;
            g.fillStyle = '#2de2e6';
            g.globalAlpha = clamp(1 - r / 70, 0, 1);
            for (let i = 0; i < 48; i++) {
                const a = i / 48 * Math.PI * 2;
                g.fillRect(Math.round(ox + 12 + Math.cos(a) * r), Math.round(oy + 7 + Math.sin(a) * r * 0.8), 1, 1);
            }
            g.globalAlpha = 1;
        }
        const working = (t >= BIRTH.frame && t < BIRTH.skin) || (t >= BIRTH.skin && t < BIRTH.tank);
        b.arms.forEach((arm, i) => drawRobotArm(g, L.bases[i], arm, lit, working));
        // the tank comes down over him, fills with white, drains, lifts away
        if (t >= BIRTH.tank && t < BIRTH.wake + 0.4) {
            g.save();
            g.beginPath();
            g.rect(0, rail + 3, lw, lh);
            g.clip();
            const k = t - BIRTH.tank, top = oy - 10 - floating, bot = floorY - 4, h = bot - top;
            const off = Math.round((clamp(k / 0.3, 0, 1) - 1 - clamp((t - BIRTH.wake) / 0.4, 0, 1)) * (h + 16));
            const x0 = ox - 8, w = 40, lvl = Math.round(h * tankFill(t));
            g.fillStyle = 'rgba(150,225,255,0.08)';
            g.fillRect(x0, top + off, w, h);
            if (lvl > 0) {
                g.fillStyle = 'rgba(236,244,248,0.85)';
                g.fillRect(x0 + 1, bot - lvl + off, w - 2, lvl);
            }
            g.fillStyle = 'rgba(200,245,255,0.55)';
            g.fillRect(x0, top + off, 1, h);
            g.fillRect(x0 + w - 1, top + off, 1, h);
            g.fillRect(x0 + 3, top + off + 2, 1, h - 6);
            g.fillStyle = '#2b303b';
            g.fillRect(x0 - 2, top + off - 3, w + 4, 3);
            g.fillRect(x0 - 2, bot + off, w + 4, 2);
            g.fillStyle = '#2de2e6';
            g.fillRect(x0 + 4, top + off - 2, 2, 1);
            g.restore();
        }
        for (const q of b.parts) {
            g.fillStyle = q.color;
            g.fillRect(Math.round(q.x), Math.round(q.y), 1, 1);
        }

        // scaled up, then the line's display over it at full resolution
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(b.cv, 0, 0, lw * L.P, lh * L.P);
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        for (let y = 0; y < vh; y += 3) ctx.fillRect(0, y, vw, 1);
        ctx.font = "bold 11px 'IBM Plex Mono', monospace";
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ff3fa4';
        ctx.fillText('PROJECT 2501 // FABRICATION', 16, coarsePointer ? 16 : 20);
        const pct = clamp(t / BIRTH.done, 0, 1), y0 = coarsePointer ? 34 : 38;
        ctx.strokeStyle = '#2de2e6';
        ctx.strokeRect(16.5, y0 + 0.5, 140, 7);
        ctx.fillStyle = '#2de2e6';
        ctx.fillRect(18, y0 + 2, Math.round(137 * pct), 4);
        ctx.font = "10px 'IBM Plex Mono', monospace";
        ctx.fillText(`UNIT 2501-B  ${Math.floor(pct * 100)}%`, 164, y0 - 1);
        let cap = BIRTH_CAPTIONS[0];
        for (const c of BIRTH_CAPTIONS) if (t >= c[0]) cap = c;
        ctx.font = "13px 'IBM Plex Mono', monospace";
        ctx.textAlign = 'center';
        ctx.fillStyle = '#d8fff8';
        const shown = cap[1].slice(0, Math.floor((t - cap[0]) * 32));
        ctx.fillText(`> ${shown}${Math.floor(t * 3) % 2 ? '_' : ' '}`, vw / 2, (floorY + 10) * L.P);
        if (t > 0.4) {
            ctx.font = "10px 'IBM Plex Mono', monospace";
            ctx.fillStyle = 'rgba(216,255,248,0.45)';
            ctx.fillText(coarsePointer ? 'tap to skip' : 'click or press any key to skip', vw / 2, vh - 28);
        }
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    }

    // ------------------------------------------------------------------ the net
    //
    // The ether: a living atlas that folds into a constellation of related feeds.
    // The character is the origin of both views; one projection serves drawing,
    // picking, labels and video tethers so the world can bend without losing touch.
    const TFL = 'https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/';
    const ETHER_COLORS = ['#ff9f1c', '#7bd389', '#2de2e6', '#f6e05e', '#ff6b9a', '#9ad7ff', '#c3f73a', '#ffb3c6', '#b18cff', '#ff4d6d', '#d8fff8', '#ffd6a5'];
    const ZOOM_MAX = 3, LEAF_GAP = 22;
    // if the list won't load: London, and a couple of streams
    const ETHER_FALLBACK = { groups: [
        { n: 'london streets', kids: [{ n: '', kids: [
            { k: 'surf', id: 'all', n: 'cam roulette', t: 'somewhere in London', by: 'every TfL jam cam, a clip at a time' },
            { k: 'tfl', id: '00001.07450', n: 'Piccadilly Circus', t: 'Piccadilly Circus, London', by: 'TfL jam cam' },
            { k: 'tfl', id: '00001.06502', n: 'Trafalgar Square', t: 'Trafalgar Square, London', by: 'TfL jam cam' },
            { k: 'tfl', id: '00001.03500', n: 'Tower Bridge', t: 'Tower Bridge, London', by: 'TfL jam cam' },
            { k: 'tfl', id: '00001.06501', n: 'Parliament Square', t: 'Parliament Square, London', by: 'TfL jam cam' },
        ] }] },
        { n: 'streams', kids: [{ n: 'twitch', kids: [
            { k: 'tw', id: 'lofigirl', n: 'lofi girl', t: 'lofi girl', by: 'twitch.tv/lofigirl' },
            { k: 'tw', id: 'lofi_loungee', n: 'lofi lounge', t: 'lofi lounge', by: 'twitch.tv/lofi_loungee' },
        ] }] },
    ] };
    let etherData = null, etherTree = null;

    function loadEther() {
        if (!etherData) {
            etherData = fetch('assets/ether-cams.json').then(r => r.json())
                .then(d => (d && d.groups && d.groups.length ? d : ETHER_FALLBACK))
                .catch(() => {
                    etherData = null;   // try again next time
                    return ETHER_FALLBACK;
                });
        }
        return etherData.then(d => {
            const portrait = window.innerHeight > window.innerWidth;
            if (!etherTree || etherTree.portrait !== portrait) etherTree = buildEther(d, portrait);
            return etherTree;
        });
    }

    // Stable constellations and stars across visits
    function seeded(seed) {
        return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    }

    // Related cameras share constellations, with a second coordinate in the atlas.
    function buildEther(data, portrait) {
        const rnd = seeded(2501), leaves = [], labels = [], edges = [];
        const groups = data.groups.map(g => ({ n: g.n, kids: (g.kids || []).filter(k => k.kids && k.kids.length) })).filter(g => g.kids.length);
        const cams = [];
        groups.forEach((g, gi) => g.kids.forEach((k, ki) => k.kids.forEach(c => cams.push({ c, gi, ki }))));
        const N = cams.length;
        const S = Math.max(650, Math.sqrt(N) * 30);
        cams.forEach(({ c, gi, ki }) => {
            leaves.push({ x: 0, y: 0, r: 0, cam: c, color: ETHER_COLORS[gi % ETHER_COLORS.length], cat: groups[gi].n, gi, ki, nb: [], fire: 0 });
        });
        // Category / channel constellations, with room between their stars.
        const counts = new Map();
        leaves.forEach(l => {
            const key = l.gi + ':' + l.ki, index = counts.get(key) || 0;
            counts.set(key, index + 1);
            const a = l.gi * 2.399963, radius = S * Math.sqrt((l.gi + 0.5) / groups.length) * 0.72;
            const sub = l.ki * 2.399963, subRadius = Math.sqrt(l.ki) * 35;
            l.x = Math.cos(a) * radius + Math.cos(sub) * subRadius + Math.cos(index * 2.399963) * Math.sqrt(index) * 12;
            l.y = Math.sin(a) * radius * 0.68 + Math.sin(sub) * subRadius + Math.sin(index * 2.399963) * Math.sqrt(index) * 12;
            l.x *= 0.66; l.y *= 0.66;
            l.semantic = { x: l.x, y: l.y };
        });
        const locations = new Map();
        leaves.forEach((l, i) => {
            const ll = l.cam.ll, located = Array.isArray(ll) && ll.length === 2 && ll.every(Number.isFinite);
            // Unknown locations orbit below the map, never masquerading as a place.
            const key = located ? ll.map(v => Math.round(v * 2)).join(',') : 'unknown';
            const n = locations.get(key) || 0;
            locations.set(key, n + 1);
            const radius = Math.sqrt(n) * 5, angle = n * 2.399963;
            l.geo = located
                ? { x: ll[1] / 180 * S + Math.cos(angle) * radius, y: -ll[0] / 180 * S + Math.sin(angle) * radius }
                : { x: (i / N - 0.5) * S * 1.5, y: S * 0.64 + Math.sin(angle) * 18 };
        });
        const land = [], world = data.world;
        if (world && world.land) {
            const bits = atob(world.land);
            for (let r = 0; r < world.h; r++) for (let c = 0; c < world.w; c++) {
                const k = r * world.w + c;
                if (bits.charCodeAt(k >> 3) & (1 << (k & 7))) land.push({
                    x: (-180 + (c + 0.5) * world.step) / 180 * S,
                    y: -(world.top - r * world.step) / 180 * S,
                });
            }
        }
        // Labels at the middle of each category and channel.
        groups.forEach((g, gi) => {
            const mine = leaves.filter(l => l.gi === gi);
            labels.push({ big: true, label: g.n, color: mine[0].color, n: mine.length, x: mine.reduce((s, l) => s + l.x, 0) / mine.length, y: mine.reduce((s, l) => s + l.y, 0) / mine.length });
            g.kids.forEach((k, ki) => {
                const sub = mine.filter(l => l.ki === ki);
                if (k.n && sub.length > 2) labels.push({ label: k.n, x: sub.reduce((s, l) => s + l.x, 0) / sub.length, y: sub.reduce((s, l) => s + l.y, 0) / sub.length });
            });
        });
        labels.sort((a, b) => (b.big ? 1e6 + b.n : 0) - (a.big ? 1e6 + a.n : 0));
        // each neuron to its three nearest (a grid makes finding them quick)
        const cell = LEAF_GAP * 2, grid = new Map(), key = (x, y) => Math.floor(x / cell) + ',' + Math.floor(y / cell);
        leaves.forEach((l, i) => {
            const kk = key(l.x, l.y);
            if (!grid.has(kk)) grid.set(kk, []);
            grid.get(kk).push(i);
        });
        const seen = new Set();
        const link = (i, j, axon) => {
            const id = i < j ? i + ',' + j : j + ',' + i;
            if (i === j || seen.has(id)) return;
            seen.add(id);
            edges.push(dendrite(leaves[i], leaves[j], i, j, axon, rnd));
            leaves[i].nb.push(edges.length - 1);
            leaves[j].nb.push(edges.length - 1);
        };
        leaves.forEach((l, i) => {
            const cx = Math.floor(l.x / cell), cy = Math.floor(l.y / cell), near = [];
            for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) for (const j of grid.get(gx + ',' + gy) || []) if (j !== i) near.push([j, (leaves[j].x - l.x) ** 2 + (leaves[j].y - l.y) ** 2]);
            near.sort((a, b) => a[1] - b[1]);
            for (const [j] of near.slice(0, 3)) link(i, j, false);
        });
        // Bridge neighbouring categories so signals can travel across the atlas.
        const hubs = labels.filter(l => l.big).map(lb => leaves.reduce((best, l, i) => ((l.x - lb.x) ** 2 + (l.y - lb.y) ** 2 < best[1] ? [i, (l.x - lb.x) ** 2 + (l.y - lb.y) ** 2] : best), [0, Infinity])[0]);
        hubs.forEach((h, a) => {
            hubs.map((o, b) => [o, b === a ? Infinity : (leaves[o].x - leaves[h].x) ** 2 + (leaves[o].y - leaves[h].y) ** 2]).sort((p, q) => p[1] - q[1]).slice(0, 2).forEach(([o]) => link(h, o, true));
        });
        const along = portrait ? 'x' : 'y', across = portrait ? 'y' : 'x';
        for (let k = 0; k < 6; k++) {
            const left = leaves.filter(l => l[across] < 0), right = leaves.filter(l => l[across] > 0);
            if (!left.length || !right.length) break;
            const at = (k / 5 - 0.5) * S * 1.1, pickNear = (list, side) => list.reduce((b, l) => ((l[across] - side) ** 2 + (l[along] - at) ** 2 < (b[across] - side) ** 2 + (b[along] - at) ** 2 ? l : b));
            link(leaves.indexOf(pickNear(left, -S * 0.08)), leaves.indexOf(pickNear(right, S * 0.08)), true);
        }
        const xExt = S * 1.08, yExt = S * 0.76;
        // Ways out sit on either side of the arrival point.
        const exits = [
            { exit: 'site', label: 'home', x: portrait ? -S * 0.36 : 0, y: portrait ? 0 : -S * 0.36 },
            { exit: 'shell', label: 'unplug', x: portrait ? S * 0.36 : 0, y: portrait ? 0 : S * 0.36 },
        ];
        return { R: Math.max(xExt, yExt) + 40, xExt, yExt, S, portrait, leaves, edges, labels, exits, land, density: buildEtherDensity(leaves, S) };
    }

    // A dendrite from one neuron to another: the straight line between them split in
    // half and in half again, each midpoint pushed off to the side (less each time),
    // so it zigzags like lightning; the longer ones fork a twig or two on the way
    function dendrite(a, b, i, j, axon, rnd) {
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
        let line = [[a.x, a.y], [b.x, b.y]];
        for (let level = 0, amp = len * (axon ? 0.08 : 0.16); level < 3; level++, amp *= 0.55) {
            const next = [line[0]];
            for (let k = 1; k < line.length; k++) {
                const p = line[k - 1], q = line[k], o = (rnd() - 0.5) * 2 * amp;
                next.push([(p[0] + q[0]) / 2 + nx * o, (p[1] + q[1]) / 2 + ny * o], q);
            }
            line = next;
        }
        const pts = line.flat(), twigs = [];
        const fork = (x, y, ang, l, depth, out) => {
            const x1 = x + Math.cos(ang) * l, y1 = y + Math.sin(ang) * l;
            out.push(x, y, x1, y1);
            if (depth < 2) for (const s of [-1, 1]) if (rnd() < 0.8) fork(x1, y1, ang + s * (0.4 + rnd() * 0.5), l * 0.55, depth + 1, out);
        };
        if (!axon && len > 18 && rnd() < 0.55) {
            const k = 2 + Math.floor(rnd() * 5), out = [];
            fork(line[k][0], line[k][1], Math.atan2(dy, dx) + (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 0.6), len * (0.25 + rnd() * 0.2), 0, out);
            twigs.push(out);
        }
        return {
            i, j, axon, pts, rest: pts.slice(), twigs, len,
            bx0: Math.min(a.x, b.x) - len * 0.2, bx1: Math.max(a.x, b.x) + len * 0.2, by0: Math.min(a.y, b.y) - len * 0.2, by1: Math.max(a.y, b.y) + len * 0.2,
            color: a.color === b.color ? a.color : '#bff8ff',
        };
    }

    function enterNet() {
        shellState = saveScene();
        scene = 'net';
        closeStream();
        allocWorld(document.documentElement.clientWidth, sceneHeight());
        repaint();
        const me = net = { tree: null, space: 'earth', blend: 0, z: 0.2, zTo: 0.2, zMin: 0.02, cx: 0, cy: 0, sx: 0, sy: 0, anchor: null, sel: null, zap: null, near: null, sparks: [], pulses: [], firing: [], feel: null, grow: 0, armed: false, flash: 0, picked: false };
        guy.x = guy.y = 0;
        guy.vx = guy.vy = 0;
        guy.grounded = false;
        guy.state = 'air';
        loadEther().then(tree => {
            if (net === me) etherReady(me, tree);
        });
        banner('the ether');
        renderHud();
    }

    function exitNet(to) {
        net = null;
        closeStream();
        scene = to;
        if (to === 'shell') {
            loadScene(shellState);
            shellState = null;
            const b = shell.being;
            guy.x = b ? clamp(b.x + 40, EDGE, W - EDGE) : W / 2;
            guy.y = b ? b.y + 30 : H / 2;
            guy.vx = guy.vy = 0;
            if (b) b.armed = false;
            scrollX = scrollY = 0;
        } else {
            loadScene(siteState);
            siteState = null;
            window.scrollTo(window.scrollX, 0);
            scrollX = window.scrollX;
            scrollY = window.scrollY;
            guy.x = clamp(W / 2, EDGE, W - EDGE);
            guy.y = 0;
            guy.vy = 100;
            guy.forceChute = true;
            if (document.documentElement.clientWidth !== W) rebuild();
        }
        guy.state = 'air';
        guy.grounded = false;
        renderHud();
    }

    function etherReady(me, tree) {
        me.tree = tree;
        me.blend = me.space === 'semantic' ? 1 : 0;
        layoutEther();
        for (const l of tree.leaves) l.fire = 0;
        me.firing = [];
        me.pulses = [];
        for (let k = Math.min(coarsePointer ? 40 : 80, tree.edges.length); k > 0; k--) {
            const e = Math.floor(Math.random() * tree.edges.length);
            me.pulses.push({ e, dir: Math.random() < 0.5 ? 1 : -1, t: Math.random(), v: rand(70, 150), color: tree.edges[e].color });
        }
        etherFit();
        me.z = me.zTo = me.zMin * 1.04;
        if (!me.arrived) {
            guy.x = -tree.S * 0.17; guy.y = -tree.S * 0.16;
            me.arrived = true;
        }
        me.cx = guy.x;
        me.cy = guy.y;
        prepareEtherProjection();
        me.grow = 0;
        me.cacheKey = me.lastKey = '';
    }

    function leaveEther(to) {
        transition(() => exitNet(to));
    }

    // ----- looking about
    //
    // The traveller stays at the graph's origin, even while changing scale.
    function etherFit() {
        const vw = window.innerWidth, vh = window.innerHeight;
        net.zMin = Math.min(vw / (2 * (net.tree.xExt + 70)), vh / (2 * (net.tree.yExt + 70)));
        net.zTo = clamp(net.zTo, net.zMin, ZOOM_MAX);
    }

    function zoomEther(f, px = window.innerWidth / 2, py = window.innerHeight / 2) {
        if (!net || !net.tree) return;
        net.zTo = clamp(net.zTo * f, net.zMin, ZOOM_MAX);
        net.anchor = { px, py };
    }

    // Periodic coordinates let information re-enter across the opposite horizon.
    const etherWrap = (v, period) => ((v + period / 2) % period + period) % period - period / 2;

    // A sampled cartogram field expands crowded places, including their land and
    // meridians. Sampling once avoids a density search for every pixel every frame.
    function buildEtherDensity(leaves, S) {
        const bins = new Map(), w = 96, h = 49;
        for (const l of leaves) if (l.cam.ll) {
            const [lat, lon] = l.cam.ll, key = Math.round(lon / 12) + ',' + Math.round(lat / 12);
            if (!bins.has(key)) bins.set(key, { x: lon / 180 * Math.PI, y: lat / 180 * Math.PI, n: 0 });
            bins.get(key).n++;
        }
        const field = new Float32Array((w + 1) * h * 3);
        for (let r = 0; r < h; r++) for (let c = 0; c <= w; c++) {
            const lon = c / w * Math.PI * 2 - Math.PI, lat = (r / (h - 1) - 0.5) * Math.PI;
            let dx = 0, dy = 0, mass = 0;
            for (const b of bins.values()) {
                const x = etherWrap(lon - b.x, Math.PI * 2), y = lat - b.y;
                const f = Math.log1p(b.n) * 0.27 * Math.exp(-(x * x * Math.cos(lat) ** 2 + y * y) / 0.055);
                dx += x * f; dy += y * f; mass += f;
            }
            const i = (r * (w + 1) + c) * 3;
            field[i] = clamp(dx, -0.32, 0.32);
            field[i + 1] = clamp(dy, -0.24, 0.24);
            field[i + 2] = Math.min(2.4, mass);
        }
        return { field, w, h };
    }

    function earthWarp(x, y) {
        const S = net.tree.S, d = net.tree.density;
        const rawLat = -y / S * Math.PI;
        const lon = etherWrap(x / S * Math.PI + (Math.cos(rawLat) < 0 ? Math.PI : 0), Math.PI * 2), lat = Math.asin(Math.sin(rawLat));
        const u = (lon / (Math.PI * 2) + 0.5) * d.w, v = (lat / Math.PI + 0.5) * (d.h - 1);
        const c = Math.min(d.w - 1, Math.floor(u)), r = Math.min(d.h - 2, Math.floor(v)), fx = u - c, fy = v - r;
        const sample = k => {
            const i = (r * (d.w + 1) + c) * 3 + k, stride = (d.w + 1) * 3, a = d.field;
            return (a[i] * (1 - fx) + a[i + 3] * fx) * (1 - fy) + (a[i + stride] * (1 - fx) + a[i + stride + 3] * fx) * fy;
        };
        return { lon: lon + sample(0), lat: clamp(lat + sample(1), -Math.PI / 2, Math.PI / 2), mass: sample(2) };
    }

    function prepareEtherProjection() {
        if (!net.tree) return;
        const focus = earthWarp(net.cx, net.cy);
        net.projection = {
            lon: focus.lon, sin: Math.sin(focus.lat), cos: Math.cos(focus.lat),
            radius: Math.min(window.innerWidth * 0.40, window.innerHeight * 0.37) * (1 + Math.log(Math.max(1, net.z / net.zMin)) * 0.24),
            zoom: Math.max(0.7, net.z / net.zMin),
        };
    }

    function earthScreen(x, y, orbital = false) {
        const p = net.projection, S = net.tree.S, vw = window.innerWidth, vh = window.innerHeight;
        // Unlocated feeds inhabit a visibly separate orbital belt, not false coordinates.
        if (orbital) {
            const a = x / S * Math.PI * 2 - net.cx / S * Math.PI;
            return { x: vw / 2 + Math.sin(a) * p.radius * 1.28, y: vh / 2 + p.radius * (0.97 + Math.cos(a) * 0.12), visibility: 0.8, depth: 0, mass: 0 };
        }
        const f = earthWarp(x, y), lon = f.lon - p.lon, cl = Math.cos(f.lat), sl = Math.sin(f.lat);
        let X = cl * Math.sin(lon), Y = sl * p.cos - cl * Math.cos(lon) * p.sin;
        const depth = sl * p.sin + cl * Math.cos(lon) * p.cos;
        // The spherical surface swells at data cities and shears near the horizon.
        const twist = 0.24 * (1 - depth) * Math.sin(lon * 2 + f.lat * 3 + p.lon);
        const xx = X * Math.cos(twist) - Y * Math.sin(twist);
        Y = X * Math.sin(twist) + Y * Math.cos(twist); X = xx;
        const lens = (1 + f.mass * 0.13) * 1.65 / (1 + 0.65 * Math.hypot(X, Y));
        return { x: vw / 2 + X * p.radius * lens, y: vh / 2 - Y * p.radius * lens,
            visibility: clamp((depth + 0.035) / 0.16, 0, 1), depth, mass: f.mass };
    }

    function semanticScreen(x, y) {
        const S = net.tree.S, period = S * 1.6, z = net.projection.zoom;
        const dx = etherWrap(x - net.cx, period) / (period / 2), dy = etherWrap(y - net.cy, period) / (period / 2);
        // Hyperbolic-looking focus: the interior blooms, the boundary compresses.
        const strength = 1.7 + Math.log(z) * 0.8, denom = Math.tanh(strength);
        let u = Math.tanh(dx * strength) / denom, v = Math.tanh(dy * strength) / denom;
        const ripple = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
        u += 0.13 * ripple * Math.sin(net.cy / period * Math.PI * 2 + v * 3);
        v += 0.13 * ripple * Math.cos(net.cx / period * Math.PI * 2 + u * 3);
        const visibility = clamp((1 - Math.max(Math.abs(dx), Math.abs(dy))) / 0.07, 0, 1);
        return { x: window.innerWidth * (0.5 + u * 0.49), y: window.innerHeight * (0.5 + v * 0.47), visibility, depth: 1, mass: 0 };
    }

    function etherScreen(x, y, orbital = false) {
        if (!net.tree || !net.projection) return { x: window.innerWidth / 2, y: window.innerHeight / 2, visibility: 1 };
        const m = net.blend;
        if (m === 0) return earthScreen(x, y, orbital);
        if (m === 1) return semanticScreen(x, y);
        const a = earthScreen(x, y, orbital), b = semanticScreen(x, y);
        return { x: a.x * (1 - m) + b.x * m, y: a.y * (1 - m) + b.y * m, visibility: a.visibility * (1 - m) + b.visibility * m };
    }

    function etherNode(leaf) {
        return etherScreen(leaf.x, leaf.y, !leaf.cam.ll);
    }

    function toggleEtherSpace() {
        if (!net || !net.tree) return;
        net.space = net.space === 'earth' ? 'semantic' : 'earth';
        net.feel = net.zap = null;
        // Preserve an in-flight selection as well as an already playing feed.
        if (net.sel && !stream) openStream(net.sel);
        renderHud();
    }

    function layoutEther() {
        const t = net.tree, m = net.blend;
        for (const l of t.leaves) {
            l.x = l.geo.x * (1 - m) + l.semantic.x * m;
            l.y = l.geo.y * (1 - m) + l.semantic.y * m;
            l.r = Math.hypot(l.x, l.y);
        }
        // Keep the existing routing and playback timing attached to moving nodes.
        for (const e of t.edges) {
            const a = t.leaves[e.i], b = t.leaves[e.j];
            for (let k = 0; k < e.pts.length; k += 2) {
                const u = k / (e.pts.length - 2);
                const jx = e.rest[k] - (a.semantic.x + (b.semantic.x - a.semantic.x) * u);
                const jy = e.rest[k + 1] - (a.semantic.y + (b.semantic.y - a.semantic.y) * u);
                e.pts[k] = a.x + (b.x - a.x) * u + jx;
                e.pts[k + 1] = a.y + (b.y - a.y) * u + jy;
            }
            e.len = Math.hypot(b.x - a.x, b.y - a.y);
        }
    }

    function updateEtherView(dt) {
        net.z += (net.zTo - net.z) * Math.min(1, dt * 9);
        const target = net.space === 'semantic' ? 1 : 0;
        if (Math.abs(net.blend - target) > 0.0001) {
            net.blend += (target - net.blend) * (reducedMotion ? 1 : Math.min(1, dt * 3));
            if (Math.abs(net.blend - target) < 0.0001) net.blend = target;
            layoutEther();
        }
        net.anchor = null;
        net.cx = guy.x;
        net.cy = guy.y;
        prepareEtherProjection();
        net.sx = guy.x - window.innerWidth / 2;
        net.sy = guy.y - window.innerHeight / 2;
    }

    // The cam (or way out) nearest a point on the screen, within reach of it
    function etherAt(px, py, reach, cams = true) {
        const t = net && net.tree;
        if (!t) return null;
        let best = null, bd = 22 * 22;
        for (const e of t.exits) {
            const s = etherScreen(e.x, e.y), d = (s.x - px) ** 2 + (s.y - py) ** 2;
            if (s.visibility > 0.3 && d < bd) {
                bd = d;
                best = e;
            }
        }
        if (best || !cams) return best;
        bd = reach * reach;
        for (const leaf of t.leaves) {
            if (leaf.r > etherGrown()) continue;
            const p = etherNode(leaf), dx = p.x - px, dy = p.y - py, d = dx * dx + dy * dy;
            if (p.visibility > 0.3 && d < bd) {
                bd = d;
                best = leaf;
            }
        }
        return best;
    }

    // A click or tap picks the nearest visible signal; empty space unplugs.
    function etherClick(px, py) {
        if (!net || !net.tree) return;
        const hit = etherAt(px, py, coarsePointer ? 24 : 14);
        if (hit && hit.exit) leaveEther(hit.exit);
        else if (hit) selectCam(hit);
        else unplugCam();
    }

    // E, or the pad's PLUG: whatever he's floating over
    function plugHere() {
        const n = net && net.near;
        if (n && n.exit) leaveEther(n.exit);
        else if (n) selectCam(n);
    }

    // ----- the strike
    //
    // Picking a cam sends out feelers, the way lightning sends out leaders: three of
    // them race from the neuron nearest him to the cam, each by its own way (the
    // shortest, give or take), and side branches keep forking off them, crackling a
    // few hops off into the network and fizzling out. The first leader to reach the
    // cam strikes: its whole way flashes and flickers, softly, and the window opens.
    // The others disappear.

    const FEELER_CAP = 18;

    function neuronNear(x, y) {
        let best = 0, bd = Infinity;
        net.tree.leaves.forEach((l, i) => {
            const p = etherNode(l), origin = etherScreen(x, y);
            const d = p.visibility > 0.3 ? (p.x - origin.x) ** 2 + (p.y - origin.y) ** 2 : Infinity;
            if (d < bd) {
                bd = d;
                best = i;
            }
        });
        return best;
    }

    // The shortest way along the dendrites from one neuron to another, as the neurons
    // on the way (or null if there's none)
    function shortestWay(start, goal, wobble) {
        const L = net.tree.leaves, E = net.tree.edges, weight = E.map(e => e.len * (wobble ? rand(1 - wobble, 1 + wobble * 2) : 1)), dist = new Float64Array(L.length).fill(Infinity), prev = new Int32Array(L.length).fill(-1), done = new Uint8Array(L.length);
        const open = [start];
        dist[start] = 0;
        while (open.length) {
            let bi = 0;
            for (let k = 1; k < open.length; k++) if (dist[open[k]] < dist[open[bi]]) bi = k;
            const i = open[bi];
            open[bi] = open[open.length - 1];
            open.pop();
            if (done[i]) continue;
            done[i] = 1;
            if (i === goal) break;
            for (const ei of L[i].nb) {
                const j = E[ei].i === i ? E[ei].j : E[ei].i, d = dist[i] + weight[ei];
                if (d < dist[j]) {
                    dist[j] = d;
                    prev[j] = i;
                    open.push(j);
                }
            }
        }
        if (goal !== start && prev[goal] < 0) return null;
        const path = [goal];
        while (path[0] !== start) path.unshift(prev[path[0]]);
        return path;
    }

    function edgeBetween(i, j) {
        const E = net.tree.edges;
        for (const ei of net.tree.leaves[i].nb) if (E[ei].i === j || E[ei].j === j) return ei;
        return -1;
    }

    // A dendrite's points in the order it's run, from neuron `from`, not counting the first
    function edgePoints(ei, from, out) {
        const e = net.tree.edges[ei], p = e.pts, n = p.length / 2 - 1, fwd = e.i === from;
        for (let k = 1; k <= n; k++) {
            const m = fwd ? k : n - k;
            out.push({ x: p[m * 2], y: p[m * 2 + 1] });
        }
    }

    function selectCam(leaf) {
        if (net.sel === leaf) return;
        closeStream();
        net.sel = leaf;
        net.picked = true;
        net.zap = null;
        const L = net.tree.leaves, goal = L.indexOf(leaf), start = neuronNear(guy.x, guy.y);
        const head = [{ x: guy.x, y: guy.y - HEIGHT / 2 / net.z }, { x: L[start].x, y: L[start].y }];
        const guide = start === goal ? null : shortestWay(start, goal);
        const feel = net.feel = { goal, leaf, head, guide, tips: [], strike: null, t: 0, crackle: 0 };
        if (!guide) {
            // there already, or no way through: straight there
            strikeAlong(head.concat({ x: leaf.x, y: leaf.y }));
            return;
        }
        // fast enough that the shortest way takes a second or so; the leaders' own ways
        // are longer or shorter, and they're none of them quite the same speed
        let len = 0;
        for (let k = 1; k < guide.length; k++) len += net.tree.edges[edgeBetween(guide[k - 1], guide[k])].len;
        const speed = Math.max(320, len / 1.1);
        feel.tips.push(newFeeler(start, head, speed * rand(0.9, 1.1), guide));
        for (let k = 0; k < 2; k++) feel.tips.push(newFeeler(start, head, speed * rand(0.9, 1.2), shortestWay(start, goal, 0.5) || guide));
        sfx('zap');
    }

    function newFeeler(at, pts, speed, guide, hops) {
        const tip = { to: at, from: at, e: -1, t: 0, pts: pts.slice(), seen: new Set([at]), speed, guide, gi: 0, hops, dying: 0 };
        if (!stepFeeler(tip)) tip.dying = 0.001;
        return tip;
    }

    // Off down the next dendrite from the neuron it's reached: a leader along its way,
    // a side branch anywhere it hasn't been; false if there's nowhere to go
    function stepFeeler(tip) {
        const L = net.tree.leaves, E = net.tree.edges, at = tip.to;
        let via = -1, next = -1;
        if (tip.guide) {
            next = tip.guide[++tip.gi];
            via = next === undefined ? -1 : edgeBetween(at, next);
        } else {
            const ways = [];
            for (const ei of L[at].nb) {
                const j = E[ei].i === at ? E[ei].j : E[ei].i;
                if (!tip.seen.has(j) && !E[ei].axon) ways.push([ei, j]);
            }
            if (!ways.length) return false;
            [via, next] = pick(ways);
        }
        if (via < 0) return false;
        tip.e = via;
        tip.from = at;
        tip.to = next;
        tip.seen.add(next);
        return true;
    }

    // It got there: the flash, the window, and the current stays on along the way
    function strikeAlong(pts) {
        const feel = net.feel, leaf = feel.leaf;
        feel.strike = { pts, t: 0 };
        for (const tip of feel.tips) if (!tip.dying) tip.dying = 0.001;
        const lens = [0];
        for (let k = 1; k < pts.length; k++) lens.push(lens[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
        net.zap = { leaf, pts, lens, total: lens[lens.length - 1] || 1, t: 1, done: true };
        net.flash = 0.4;
        for (let k = 0; k < 24 && net.sparks.length < 240; k++) {
            const a = rand(0, Math.PI * 2), v = rand(40, 160) / net.z;
            net.sparks.push({ x: leaf.x, y: leaf.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.6) });
        }
        openStream(leaf);
        sfx('strike');
    }

    function updateFeel(dt) {
        const feel = net.feel, E = net.tree.edges, L = net.tree.leaves;
        feel.t += dt;
        for (const tip of feel.tips) if (tip.dying) tip.dying += dt;
        if (feel.strike) {
            if ((feel.strike.t += dt) > 0.7) net.feel = null;
            return;
        }
        for (const tip of feel.tips.slice()) {
            if (tip.dying) continue;
            tip.t += tip.speed * dt / Math.max(8, E[tip.e].len);
            while (tip.t >= 1) {
                // into the next neuron, which lights up as it goes through
                edgePoints(tip.e, tip.from, tip.pts);
                const at = tip.to;
                if (L[at].fire <= 0) net.firing.push(L[at]);
                L[at].fire = 0.7;
                if (tip.guide && at === feel.goal) return strikeAlong(tip.pts);
                tip.t -= 1;
                // a side branch forks off now and then, and goes a few hops before it gives out
                if (feel.tips.length < FEELER_CAP && Math.random() < (tip.guide ? 0.4 : 0.15)) {
                    const fork = { ...tip, pts: tip.pts.slice(), seen: new Set(tip.seen), guide: null, hops: 2 + Math.floor(Math.random() * 4), speed: tip.speed * rand(0.6, 0.9) };
                    if (stepFeeler(fork)) feel.tips.push(fork);
                }
                if ((!tip.guide && --tip.hops <= 0) || !stepFeeler(tip)) {
                    tip.dying = 0.001;
                    break;
                }
            }
        }
        feel.tips = feel.tips.filter(tip => !(tip.dying > 0.35));
        if ((feel.crackle -= dt) <= 0) {
            feel.crackle = 0.09;
            sfx('weld2');
        }
        // nothing got there: it strikes along the shortest way anyway
        if (feel.t > 4 || !feel.tips.some(tip => tip.guide && !tip.dying)) {
            const pts = feel.head.slice();
            for (let k = 1; k < feel.guide.length; k++) edgePoints(edgeBetween(feel.guide[k - 1], feel.guide[k]), feel.guide[k - 1], pts);
            strikeAlong(pts);
        }
    }

    function unplugCam() {
        if (!net.sel) return;
        net.sel = net.zap = net.feel = null;
        closeStream();
        sfx('decloak');
    }

    function updateNet(dt) {
        if (!net.tree) return;
        net.grow = Math.min(1, net.grow + dt / 2.2);
        net.flash -= dt;
        // what he's floating over: drifting onto a way out takes it (once he's been clear of them)
        const g = { x: innerWidth / 2, y: innerHeight / 2 }, near = etherAt(g.x, g.y - HEIGHT / 2, 20);
        net.near = near;
        // (flying into it himself, that is, not carried over it by a zoom)
        if (near && near.exit) {
            if (net.armed && !net.anchor && Math.hypot(guy.vx, guy.vy) > 30) {
                net.armed = false;
                leaveEther(near.exit);
            }
        } else net.armed = true;
        if (net.feel) updateFeel(dt);
        // pulses wander the network, and each neuron flashes as one reaches it
        const E = net.tree.edges, L = net.tree.leaves;
        for (const p of net.pulses) {
            const e = E[p.e];
            p.t += p.v * dt / Math.max(10, e.len);
            if (p.t < 1) continue;
            const at = p.dir > 0 ? e.j : e.i, node = L[at], ways = node.nb.filter(ei => ei !== p.e), next = ways.length ? pick(ways) : p.e;
            if (node.fire <= 0) net.firing.push(node);
            node.fire = 1;
            p.e = next;
            p.dir = E[next].i === at ? 1 : -1;
            p.t = 0;
            p.color = node.color;
        }
        for (let k = net.firing.length - 1; k >= 0; k--) {
            const l = net.firing[k];
            if ((l.fire -= dt * 2.2) <= 0) {
                l.fire = 0;
                net.firing.splice(k, 1);
            }
        }
        for (let k = net.sparks.length - 1; k >= 0; k--) {
            const q = net.sparks[k];
            q.x += q.vx * dt;
            q.y += q.vy * dt;
            if ((q.life -= dt) <= 0) net.sparks.splice(k, 1);
        }
    }

    // ----- the windows
    //
    // A cam opens a real little window over the canvas (it lets clicks through, so
    // you can keep looking about, except on the YouTube and Twitch players, which you
    // can click to unmute): a muted live stream, a TfL clip on a loop, or the
    // roulette's clips one after another, each from a different London camera.
    // Behind it is static, which is all you see if the feed won't load.

    let stream = null, jamCams = null;

    // Every TfL camera that's working, fetched the first time the roulette's tuned in
    function loadJamCams() {
        const fallback = () => ETHER_FALLBACK.groups[0].kids[0].kids.filter(c => c.k === 'tfl')
            .map(c => ({ name: c.t, video: `${TFL}${c.id}.mp4`, image: `${TFL}${c.id}.jpg` }));
        if (!jamCams) {
            jamCams = fetch('https://api.tfl.gov.uk/Place/Type/JamCam').then(r => r.json()).then(list => {
                const cams = list.map(c => {
                    const prop = k => ((c.additionalProperties || []).find(a => a.key === k) || {}).value;
                    return prop('available') === 'true' && prop('videoUrl') ? { name: `${c.commonName}, London`, video: prop('videoUrl'), image: prop('imageUrl') } : null;
                }).filter(Boolean);
                return cams.length ? cams : fallback();
            }).catch(() => {
                jamCams = null;   // try again next time
                return fallback();
            });
        }
        return jamCams;
    }

    function openStream(leaf) {
        closeStream();
        const c = leaf.cam, el = document.createElement('div');
        el.id = 'destroy-stream';
        el.innerHTML = '<div class="ds-bar"><span class="ds-rec"></span><span class="ds-live">LIVE</span><b></b><i></i><button class="ds-x" aria-label="unplug">&times;</button></div>' +
            '<div class="ds-media"><div class="ds-static">tuning in&hellip;</div></div><div class="ds-note"></div>';
        el.querySelector('.ds-x').addEventListener('click', e => {
            e.stopPropagation();
            if (net) unplugCam();
        });
        const title = el.querySelector('b');
        title.textContent = c.t;
        el.querySelector('.ds-note').textContent = `${c.by} \u00b7 ${leaf.cat}`;
        const media = el.querySelector('.ds-media'), staticEl = el.querySelector('.ds-static');
        let feed = null;
        const lost = () => {
            staticEl.textContent = 'no signal';
            if (feed) feed.style.visibility = 'hidden';
        };
        if (c.k === 'tw' || c.k === 'yt') {
            feed = document.createElement('iframe');
            if (c.k === 'yt') {
                feed.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(c.id)}?autoplay=1&mute=1&playsinline=1&rel=0`;
                feed.allow = 'autoplay; encrypted-media; picture-in-picture';
                feed.referrerPolicy = 'strict-origin-when-cross-origin';
            } else if (location.hostname) {
                feed.src = `https://player.twitch.tv/?channel=${encodeURIComponent(c.id)}&parent=${location.hostname}&muted=true&autoplay=true`;
                feed.allow = 'autoplay; keyboard-map';
            } else {
                feed = null;
                lost();
            }
            if (feed) {
                feed.title = c.t;
                feed.setAttribute('scrolling', 'no');
            }
        } else {
            feed = document.createElement('video');
            feed.muted = feed.autoplay = feed.playsInline = true;
            feed.setAttribute('playsinline', '');
            const play = () => {
                const p = feed.play();
                if (p) p.catch(() => {});
            };
            if (c.k === 'tfl') {
                feed.loop = true;
                feed.poster = `${TFL}${c.id}.jpg`;
                feed.src = `${TFL}${c.id}.mp4`;
                feed.addEventListener('error', lost);
                play();
            } else if (c.k === 'hls') {
                // Caltrans' live streams: Safari plays them itself; elsewhere hls.js does
                // (fetched the first time one's picked, and only then)
                if (c.poster) feed.poster = c.poster;
                feed.addEventListener('error', lost);
                if (feed.canPlayType('application/vnd.apple.mpegurl')) {
                    feed.src = c.id;
                    play();
                } else {
                    loadHls().then(Hls => {
                        if (!stream || stream.feed !== feed) return;
                        if (!Hls || !Hls.isSupported()) return lost();
                        const hls = stream.hls = new Hls();
                        hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) lost(); });
                        hls.loadSource(c.id);
                        hls.attachMedia(feed);
                        play();
                    });
                }
            } else {
                // the roulette: static between channels, and on to another camera
                // when a clip ends (or won't play, unless nothing will)
                let fails = 0;
                const next = () => loadJamCams().then(cams => {
                    if (!stream || stream.feed !== feed) return;
                    const cam = pick(cams);
                    feed.style.visibility = 'hidden';
                    staticEl.textContent = 'changing channel\u2026';
                    title.textContent = cam.name;
                    feed.src = cam.video;
                    play();
                });
                feed.addEventListener('playing', () => {
                    fails = 0;
                    feed.style.visibility = '';
                });
                feed.addEventListener('ended', next);
                feed.addEventListener('error', () => (++fails > 4 ? lost() : next()));
                next();
            }
        }
        if (feed) {
            feed.className = 'ds-feed';
            media.appendChild(feed);
        }
        document.body.appendChild(el);
        stream = { leaf, el, feed, rect: null, time: '', london: c.k === 'tfl' || c.k === 'surf' };
        placeStream(true);
    }

    let hlsLib = null;

    function loadHls() {
        if (!hlsLib) {
            hlsLib = new Promise(resolve => {
                const sc = document.createElement('script');
                sc.src = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
                sc.onload = () => resolve(window.Hls || null);
                sc.onerror = () => {
                    hlsLib = null;
                    resolve(null);
                };
                document.head.appendChild(sc);
            });
        }
        return hlsLib;
    }

    function closeStream() {
        if (!stream) return;
        if (stream.hls) stream.hls.destroy();
        if (stream.feed && stream.feed.tagName === 'VIDEO') {
            stream.feed.pause();
            stream.feed.removeAttribute('src');
            stream.feed.load();
        }
        stream.el.remove();
        stream = null;
    }

    // Where a cam's window goes: by it, on the other half of the screen from it, and
    // clear of the HUD (a Twitch player won't play with anything over it)
    function feedRect(sx, sy) {
        const vw = window.innerWidth, vh = window.innerHeight;
        const w = Math.min(420, vw - 24), h = Math.round((w - 12) * 9 / 16) + 50;
        const top = coarsePointer ? 64 : 56, bottom = vh - (coarsePointer && vh > vw ? 190 : 24) - h;
        let x = clamp(sx - w / 2, 12, vw - w - 12), y = sy < vh / 2 ? Math.max(top, bottom) : top;
        const hr = hud && hud.getBoundingClientRect();
        if (hr && hr.width && x < hr.right + 6 && x + w > hr.left - 6 && y < hr.bottom + 6 && y + h > hr.top - 6) {
            if (hr.right + 6 + w <= vw - 12) x = hr.right + 6;
            else if (hr.left - 6 - w >= 12) x = hr.left - 6 - w;
            else y = y < hr.top ? Math.max(0, hr.top - 6 - h) : hr.bottom + 6;
        }
        return { x: Math.round(x), y: Math.round(y), w, h };
    }

    // It stays put once it's open (moved only when the screen changes size)
    function placeStream(opening) {
        if (!stream || !net) return;
        const el = stream.el, s = etherNode(stream.leaf);
        if (!stream.rect) {
            const r = stream.rect = feedRect(s.x, s.y);
            Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
            // it grows out of the cam
            if (opening) el.style.transformOrigin = `${Math.round(s.x - r.x)}px ${Math.round(s.y - r.y)}px`;
        }
        const time = stream.london ? localTime('Europe/London').time : '';
        if (time !== stream.time) {
            stream.time = time;
            el.querySelector('i').textContent = time;
        }
    }

    function localTime(tz) {
        const d = new Date();
        try {
            return { time: d.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }) };
        } catch (_) {
            return { time: d.toISOString().slice(11, 16) + ' UTC' };
        }
    }

    // ----- drawing it

    // A printed-space-poster palette: dusty nebulae, pinprick stars, copper orbits.
    // Painted once per viewport; only the foreground stars drift with the traveller.
    let etherSky = null;
    function drawTunnel() {
        const vw = window.innerWidth, vh = window.innerHeight;
        if (!etherSky || etherSky.width !== vw || etherSky.height !== vh) {
            etherSky = document.createElement('canvas');
            etherSky.width = vw; etherSky.height = vh;
            const c = etherSky.getContext('2d'), rnd = seeded(1981);
            c.fillStyle = '#05040e'; c.fillRect(0, 0, vw, vh);
            for (let i = 0; i < 42; i++) {
                const u = i / 41, x = u * vw, y = vh * (0.78 - u * 0.63 + Math.sin(u * 7) * 0.10);
                const r = Math.min(vw, vh) * (0.14 + rnd() * 0.18), g = c.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0, i % 3 === 0 ? '#ac4b7125' : i % 3 === 1 ? '#454a9728' : '#598e9720');
                g.addColorStop(1, '#05040e00'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
            }
            for (let i = 0; i < 6200; i++) {
                const x = rnd() * vw, y = rnd() * vh, band = vh * (0.78 - x / vw * 0.63 + Math.sin(x / vw * 7) * 0.1);
                const cloud = Math.exp(-(((y - band) / (vh * 0.09)) ** 2));
                c.fillStyle = i % 3 ? '#9e9fae' : '#e8af87';
                c.globalAlpha = 0.03 + rnd() * cloud * 0.22;
                c.fillRect(x, y, 0.6 + rnd() * 0.7, 0.6 + rnd() * 0.7);
            }
            c.globalAlpha = 1;
            for (let i = 0; i < 460; i++) {
                const x = rnd() * vw, y = rnd() * vh, bright = rnd();
                c.fillStyle = i % 4 ? '#c4c1d1' : '#f1c89d'; c.globalAlpha = 0.15 + bright * 0.65;
                const r = bright > 0.96 ? 1.5 : 0.4 + bright * 0.5;
                c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
                if (bright > 0.977) {
                    c.strokeStyle = '#dbd6f1'; c.lineWidth = 0.5; c.globalAlpha = 0.45;
                    c.beginPath(); c.moveTo(x - 6, y); c.lineTo(x + 6, y); c.moveTo(x, y - 6); c.lineTo(x, y + 6); c.stroke();
                }
            }
            // A small ringed world, far away, gives the foreground Earth its scale.
            const px = vw * 0.86, py = vh * 0.17, pr = Math.min(vw, vh) * 0.027;
            c.globalAlpha = 0.75;
            c.strokeStyle = '#cd9876'; c.lineWidth = 2;
            c.beginPath(); c.ellipse(px, py, pr * 2.2, pr * 0.52, -0.35, 0, Math.PI * 2); c.stroke();
            const planet = c.createRadialGradient(px - pr * 0.4, py - pr * 0.45, 0, px, py, pr);
            planet.addColorStop(0, '#ce9d7d'); planet.addColorStop(0.65, '#755963'); planet.addColorStop(1, '#171221');
            c.fillStyle = planet; c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.fill();
            c.globalAlpha = 0.12; c.lineWidth = 0.7; c.strokeStyle = '#b98186';
            for (let i = 0; i < 3; i++) {
                c.beginPath(); c.ellipse(vw * 0.5, vh * 0.51, vw * (0.47 + i * 0.035), vh * (0.28 + i * 0.025), -0.30, 0, Math.PI * 2); c.stroke();
            }
            c.fillStyle = '#03020b'; c.globalAlpha = 0.10;
            for (let y = 0; y < vh; y += 3) c.fillRect(0, y, vw, 1);
            c.globalAlpha = 1;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalAlpha = 1; ctx.drawImage(etherSky, 0, 0);
        const rnd = seeded(1947);
        for (let i = 0; i < 45; i++) {
            const parallax = 0.005 + rnd() * 0.012;
            const x = ((rnd() * vw - (net ? net.cx : 0) * parallax) % vw + vw) % vw;
            const y = ((rnd() * vh - (net ? net.cy : 0) * parallax) % vh + vh) % vh;
            ctx.globalAlpha = 0.3 + (reducedMotion ? 0.1 : Math.sin(clock * 0.5 + i) * 0.17);
            ctx.fillStyle = '#fff1d4'; ctx.fillRect(x, y, 1, 1);
        }
        ctx.globalAlpha = 1;
    }

    function drawEtherGlobe(vw, vh) {
        const r = net.projection.radius, cx = vw / 2, cy = vh / 2;
        const alpha = (1 - net.blend) * Math.min(1, net.grow * 2);
        ctx.globalAlpha = alpha;
        const aura = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r * 1.38);
        aura.addColorStop(0, '#517da200'); aura.addColorStop(0.48, '#58979e20'); aura.addColorStop(1, '#ae84d600');
        ctx.fillStyle = aura; ctx.beginPath(); ctx.arc(cx, cy, r * 1.38, 0, Math.PI * 2); ctx.fill();
        const body = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r * 1.08);
        body.addColorStop(0, '#193641'); body.addColorStop(0.58, '#101d2e'); body.addColorStop(1, '#070913');
        // Follow the silhouette of the density-warped sphere, including its bulges.
        const rim = new Float32Array(96).fill(r * 0.97);
        const S = net.tree.S;
        for (let lat = -87; lat <= 87; lat += 6) for (let lon = -180; lon < 180; lon += 6) {
            const q = earthScreen(lon / 180 * S, -lat / 180 * S);
            if (q.depth < -0.025) continue;
            const dx = q.x - cx, dy = q.y - cy, a = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
            const k = Math.floor(a / (Math.PI * 2) * rim.length);
            rim[k] = Math.max(rim[k], Math.hypot(dx, dy));
        }
        ctx.beginPath();
        for (let k = 0; k <= rim.length; k++) {
            const i = k % rim.length, rr = (rim[(i + 95) % 96] + rim[i] * 2 + rim[(i + 1) % 96]) / 4;
            const a = k / rim.length * Math.PI * 2, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
            if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.closePath(); ctx.fillStyle = body; ctx.fill();
        ctx.strokeStyle = '#84b5b7'; ctx.globalAlpha = alpha * 0.4; ctx.lineWidth = 1; ctx.stroke();
        ctx.globalAlpha = 1;
    }

    function drawEther() {
        const vw = window.innerWidth, vh = window.innerHeight, t = net.tree;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (!t) {
            ctx.fillStyle = '#a9cbd6';
            ctx.font = "11px 'IBM Plex Mono', monospace";
            ctx.textAlign = 'center';
            ctx.fillText('finding the constellations…', vw / 2, vh / 2 + 40);
            ctx.textAlign = 'left';
            return;
        }
        const key = [net.z, net.cx, net.cy, net.blend, view.width, view.height].join();
        if (net.grow >= 1 && (key === net.cacheKey || key === net.lastKey)) {
            if (key !== net.cacheKey) {
                if (!net.cache) net.cache = document.createElement('canvas');
                net.cache.width = view.width;
                net.cache.height = view.height;
                const main = ctx;
                ctx = net.cache.getContext('2d');
                drawEtherStill(vw, vh);
                ctx = main;
                net.cacheKey = key;
            }
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.drawImage(net.cache, 0, 0);
        } else drawEtherStill(vw, vh);
        net.lastKey = key;
        drawEtherMoving(vw, vh);
    }

    function etherGrown() {
        return (1 - (1 - net.grow) ** 2) * (net.tree.R + 40);
    }

    // Project every sample through the same lens, including the geographic grid.
    function etherLine(points) {
        ctx.beginPath();
        let prev = null;
        for (const p of points) {
            const q = etherScreen(p.x, p.y);
            if (q.visibility < 0.08) { prev = null; continue; }
            if (!prev || Math.abs(q.x - prev.x) > innerWidth * 0.45 || Math.abs(q.y - prev.y) > innerHeight * 0.45) ctx.moveTo(q.x, q.y);
            else ctx.lineTo(q.x, q.y);
            prev = q;
        }
        ctx.stroke();
    }

    function drawEtherStill(vw, vh) {
        const t = net.tree, m = net.blend, S = t.S;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const earth = (1 - m) * Math.min(1, net.grow * 2);
        if (earth > 0.005) {
            drawEtherGlobe(vw, vh);
            ctx.strokeStyle = '#609ba8';
            ctx.globalAlpha = earth * 0.16;
            ctx.lineWidth = 0.6;
            for (let lat = -60; lat <= 60; lat += 30) {
                const pts = [];
                for (let lon = -180; lon <= 180; lon += 5) pts.push({ x: lon / 180 * S, y: -lat / 180 * S });
                etherLine(pts);
            }
            for (let lon = -180; lon <= 180; lon += 30) {
                const pts = [];
                for (let lat = -84; lat <= 84; lat += 4) pts.push({ x: lon / 180 * S, y: -lat / 180 * S });
                etherLine(pts);
            }
            ctx.fillStyle = '#8cbfba';
            ctx.globalAlpha = earth * 0.48;
            for (const p of t.land) {
                const q = etherScreen(p.x, p.y);
                if (q.visibility < 0.04) continue;
                ctx.globalAlpha = earth * q.visibility * (0.32 + Math.max(0, q.depth || 0) * 0.34);
                const r = clamp(net.z * S / 480, coarsePointer ? 0.35 : 0.6, 1.9);
                ctx.beginPath();
                ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        // Connections are sampled curves so they bend with the map, too.
        // Geography favours local links; semantic space reveals category wiring.
        ctx.lineWidth = 0.65;
        for (const e of t.edges) {
            const a = t.leaves[e.i], b = t.leaves[e.j];
            if (m < 0.5 && (!a.cam.ll || !b.cam.ll)) continue;
            const distant = Math.hypot(a.geo.x - b.geo.x, a.geo.y - b.geo.y) > S * 0.2;
            if (distant && m < 0.01 && !e.axon) continue;
            ctx.globalAlpha = (distant ? 0.025 + m * 0.11 : 0.16) * net.grow;
            ctx.strokeStyle = e.color;
            const pts = [];
            for (let k = 0; k < e.pts.length; k += 2) pts.push({ x: e.pts[k], y: e.pts[k + 1] });
            etherLine(pts);
        }
        const grown = etherGrown();
        for (const l of t.leaves) {
            if (l.r > grown) continue;
            const q = etherNode(l), r = clamp(net.z * 2, coarsePointer ? 0.65 : 1.2, 3);
            if (q.visibility < 0.04) continue;
            ctx.fillStyle = l.color;
            ctx.globalAlpha = 0.055 * q.visibility;
            ctx.beginPath(); ctx.arc(q.x, q.y, r * 4.5, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 0.8 * q.visibility;
            ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.textAlign = 'center';
        ctx.font = "10px 'IBM Plex Mono', monospace";
        const labels = m > 0.5 ? t.labels.filter(n => n.big).map(n => {
            const mine = t.leaves.filter(l => l.cat === n.label);
            return { label: n.label, x: mine.reduce((a, l) => a + l.x, 0) / mine.length, y: mine.reduce((a, l) => a + l.y, 0) / mine.length, color: n.color };
        }) : [
            { label: 'NORTH AMERICA', x: -0.60 * S, y: -0.29 * S },
            { label: 'SOUTH AMERICA', x: -0.34 * S, y: 0.14 * S },
            { label: 'EUROPE', x: 0.1 * S, y: -0.36 * S },
            { label: 'AFRICA', x: 0.12 * S, y: 0.01 * S },
            { label: 'ASIA', x: 0.57 * S, y: -0.26 * S },
            { label: 'OCEANIA', x: 0.76 * S, y: 0.19 * S },
            { label: 'UNLOCATED SIGNALS', x: 0, y: S * 0.70, orbital: true },
        ];
        const taken = [];
        for (const n of labels) {
            const q = etherScreen(n.x, n.y, n.orbital), width = ctx.measureText(n.label).width;
            if (q.visibility < 0.4) continue;
            if (taken.some(r => Math.abs(r.x - q.x) < (r.w + width) / 2 + 10 && Math.abs(r.y - q.y) < 22)) continue;
            taken.push({ ...q, w: width });
            ctx.globalAlpha = Math.abs(m - 0.5) * 1.1;
            ctx.fillStyle = n.color || '#b9d6d4';
            ctx.fillText(n.label, q.x, q.y - 12);
        }
        ctx.globalAlpha = 1;
        ctx.textAlign = 'left';
    }

    function alongEdge(e, t, dir) {
        const p = e.pts, n = p.length / 2 - 1, s = clamp(dir > 0 ? t : 1 - t, 0, 1) * n, k = Math.min(n - 1, Math.floor(s)), f = s - k;
        return { x: p[k * 2] + (p[k * 2 + 2] - p[k * 2]) * f, y: p[k * 2 + 1] + (p[k * 2 + 3] - p[k * 2 + 1]) * f };
    }

    // The original leader / fork / return-stroke animation, projected through the
    // curved surface. The bright path remains live after the video opens.
    function drawEtherLightning() {
        const feel = net.feel;
        const bolt = (points, alpha, wide = false) => {
            if (points.length < 2) return;
            const jitter = reducedMotion ? 0 : 1.8;
            ctx.beginPath();
            let last = null;
            for (const p of points) {
                const q = etherScreen(p.x, p.y, p.y > net.tree.S * 0.55 && p !== points[0]);
                if (q.visibility < 0.08) { last = null; continue; }
                const x = q.x + rand(-jitter, jitter), y = q.y + rand(-jitter, jitter);
                if (!last || Math.abs(q.x - last.x) > innerWidth * 0.45 || Math.abs(q.y - last.y) > innerHeight * 0.45) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
                last = q;
            }
            ctx.strokeStyle = '#678cff'; ctx.globalAlpha = alpha * 0.18; ctx.lineWidth = wide ? 13 : 7; ctx.stroke();
            ctx.strokeStyle = '#8be8ff'; ctx.globalAlpha = alpha * 0.5; ctx.lineWidth = wide ? 5 : 3; ctx.stroke();
            ctx.strokeStyle = '#f2ffff'; ctx.globalAlpha = alpha; ctx.lineWidth = wide ? 2 : 1.2; ctx.stroke();
        };
        if (net.zap && net.zap.done) bolt(net.zap.pts, 0.32 + (reducedMotion ? 0 : Math.sin(clock * 9) * 0.12));
        if (feel) {
            for (const tip of feel.tips) {
                const fade = tip.dying ? Math.max(0, 1 - tip.dying / 0.35) : 1;
                if (!fade) continue;
                const pts = tip.pts.slice();
                if (tip.e >= 0 && !tip.dying) {
                    const e = net.tree.edges[tip.e], n = e.pts.length / 2 - 1, forward = e.i === tip.from;
                    for (let k = 1; k <= Math.floor(clamp(tip.t, 0, 1) * n); k++) {
                        const i = forward ? k : n - k;
                        pts.push({ x: e.pts[i * 2], y: e.pts[i * 2 + 1] });
                    }
                    pts.push(alongEdge(e, tip.t, forward ? 1 : -1));
                }
                bolt(pts, fade * 0.85);
            }
            if (feel.strike) {
                const age = feel.strike.t;
                const alpha = reducedMotion ? Math.max(0, 1 - age * 2) : age < 0.06 ? 1 : age < 0.11 ? 0.3 : age < 0.17 ? 0.85 : Math.max(0, 1 - (age - 0.17) / 0.45);
                bolt(feel.strike.pts, alpha, true);
            }
        }
        ctx.globalAlpha = 1;
    }

    // Travelling light and a permanent, living connection to the graph.
    function drawEtherMoving(vw, vh) {
        const t = net.tree;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        for (const p of net.pulses) {
            const e = t.edges[p.e], a = t.leaves[e.i], b = t.leaves[e.j];
            if (net.blend < 0.5 && (!a.cam.ll || !b.cam.ll)) continue;
            const u = p.dir > 0 ? p.t : 1 - p.t;
            const along = alongEdge(e, u, 1), q = etherScreen(along.x, along.y);
            if (q.visibility < 0.05) continue;
            ctx.fillStyle = p.color;
            ctx.globalAlpha = 0.65;
            ctx.beginPath(); ctx.arc(q.x, q.y, 1.5, 0, Math.PI * 2); ctx.fill();
        }
        const center = { x: vw / 2, y: vh / 2 };
        const neighbours = t.leaves.map(l => { const p = etherNode(l); return { l, d: p.visibility > 0.3 ? (p.x - center.x) ** 2 + (p.y - center.y) ** 2 : Infinity }; }).sort((a, b) => a.d - b.d).slice(0, 4).map(n => n.l);
        if (net.sel && !neighbours.includes(net.sel)) neighbours.push(net.sel);
        for (const l of neighbours) {
            const q = etherNode(l), selected = l === net.sel;
            if (q.visibility < 0.3) continue;
            ctx.strokeStyle = selected ? '#ecf9df' : l.color;
            ctx.globalAlpha = selected ? 0.65 : 0.28;
            ctx.lineWidth = selected ? 1.3 : 0.8;
            ctx.beginPath(); ctx.moveTo(center.x, center.y - HEIGHT / 2);
            ctx.bezierCurveTo(center.x + (q.x - center.x) * 0.25, center.y - 45, q.x, q.y - 30, q.x, q.y);
            ctx.stroke();
        }
        drawEtherLightning();
        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = '#bbdcde';
        ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.ellipse(center.x, center.y - HEIGHT / 2, 33, 12, -0.3, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.textAlign = 'center';
        ctx.font = "10px 'IBM Plex Mono', monospace";
        for (const e of t.exits) {
            const q = etherScreen(e.x, e.y);
            if (q.visibility < 0.3) continue;
            ctx.strokeStyle = '#e7d9a5';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(q.x, q.y, 9, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = '#e7d9a5'; ctx.fillText(e.label, q.x, q.y + 23);
        }
        const hover = pointer.has && !coarsePointer ? etherAt(pointer.x, pointer.y, 14) : null;
        const shown = new Set();
        for (const n of [net.sel, hover, net.near]) {
            if (!n || n.exit || shown.has(n)) continue;
            shown.add(n);
            const q = etherNode(n);
            if (q.visibility < 0.3) continue;
            ctx.strokeStyle = n === net.sel ? '#ffffff' : '#bfeadf';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(q.x, q.y, 8, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = '#eef6ef';
            let label = n.cam.n + (net.space === 'earth' ? ' · ' + (n.cam.pl || 'location unknown') : ' · ' + n.cat);
            const full = label;
            while (label.length > 4 && ctx.measureText(label).width > vw - 32) label = label.slice(0, -1);
            if (label !== full) label = label.slice(0, -1) + '…';
            const half = ctx.measureText(label).width / 2;
            ctx.fillText(label, clamp(q.x, half + 8, Math.max(half + 8, vw - half - 8)), q.y - 17);
        }
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    }

    // Over everything: the cable from the cam to its window, and how to start
    function drawFeed() {
        if (scene !== 'net' || !net) return;
        const vw = window.innerWidth, vh = window.innerHeight;
        if (stream && stream.rect && net.sel) {
            placeStream(false);
            const s = etherNode(net.sel), r = stream.rect;
            const tx = clamp(s.x, r.x + 8, r.x + r.w - 8), ty = s.y < r.y ? r.y : r.y + r.h;
            ctx.strokeStyle = '#f6ffb0';
            ctx.globalAlpha = 0.7;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 4]);
            ctx.lineDashOffset = -clock * 40;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(tx, ty);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
        }
        if (net.tree && !net.picked) {
            ctx.font = "11px 'IBM Plex Mono', monospace";
            ctx.textAlign = 'center';
            ctx.fillStyle = `rgba(216,255,248,${0.55 + Math.sin(clock * 3) * 0.2})`;
            ctx.fillText(coarsePointer ? 'fly through · pinch to explore · tap a signal' : 'wasd to drift · scroll to explore · click a signal · v to change space', vw / 2, vh - (coarsePointer ? 200 : 30));
            ctx.textAlign = 'left';
        }
    }

    // ------------------------------------------------------------------- sound

    const audio = { ctx: null, out: null, comp: null, noise: null, muted: false, last: {} };
    try { audio.muted = localStorage.getItem('destroyMuted') === '1'; } catch (_) { /* storage unavailable */ }

    function initAudio() {
        if (audio.ctx) {
            if (audio.ctx.state === 'suspended') audio.ctx.resume();
            return;
        }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const a = new AC();
        const comp = audio.comp = a.createDynamicsCompressor();
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
        gust: t => noise(t, 1.4, 'bandpass', 300, 700, 0.06, 0.8),
        thunder: t => { noise(t, 1.8, 'lowpass', 500, 50, 0.7); tone(t, 1.1, 'sine', 55, 30, 0.35); },
        plug: t => { tone(t, 0.12, 'square', 700, 1400, 0.05); tone(t + 0.1, 0.12, 'square', 1400, 1400, 0.04); },
        merge: t => { for (let i = 0; i < 4; i++) tone(t + i * 0.12, 0.9, 'sine', [262, 330, 392, 523][i], [262, 330, 392, 523][i] * 2, 0.06); },
        glitch: t => { tone(t, 0.15, 'square', 90, 60, 0.06); noise(t, 0.1, 'highpass', 4000, 3000, 0.08); },
        deploy: t => { tone(t, 0.08, 'square', 300, 900, 0.035); noise(t, 0.06, 'bandpass', 2500, 4000, 0.08, 2); },
        cloak: t => { tone(t, 0.4, 'sine', 1100, 180, 0.07); noise(t, 0.35, 'highpass', 6000, 2000, 0.05); },
        decloak: t => { tone(t, 0.25, 'sine', 180, 900, 0.05); noise(t, 0.15, 'highpass', 3000, 6000, 0.04); },
        bubble: t => tone(t, 0.06, 'sine', 500, 1400, 0.04),
        strike: t => { noise(t, 0.3, 'highpass', 2600, 700, 0.2); noise(t + 0.02, 0.6, 'lowpass', 900, 80, 0.25); tone(t, 0.5, 'sine', 95, 40, 0.14); },
        zap: t => { noise(t, 0.5, 'bandpass', 1500, 5000, 0.14, 4); tone(t, 0.45, 'sawtooth', 110, 1800, 0.035); },
        weld2: t => { noise(t, 0.09, 'highpass', 4500, 3000, 0.07); tone(t, 0.05, 'square', 2400, 1800, 0.015); },
    };
    const SOUND_GAP = { weld: 0.08, weld2: 0.07, bubble: 0.09, buzz: 0.35, beep: 0.2, squish: 0.06, hurt: 0.15, laser: 0.08, ding: 0.2, jet: 0.09 };

    function sfx(name) {
        if (audio.muted || !audio.ctx || audio.ctx.state !== 'running') return;
        const t = audio.ctx.currentTime;
        if (t - (audio.last[name] || 0) < (SOUND_GAP[name] || 0.03)) return;
        audio.last[name] = t;
        SOUNDS[name](t);
    }

    // [m] goes round: sound on, music off (sound effects still on), sound off
    function toggleMute() {
        if (audio.muted) {
            audio.muted = false;
            music.on = true;
        } else if (music.on) music.on = false;
        else audio.muted = true;
        saveSound();
    }

    function toggleMusic() {
        music.on = !music.on;
        if (music.on) audio.muted = false;
        saveSound();
    }

    function saveSound() {
        try {
            localStorage.setItem('destroyMuted', audio.muted ? '1' : '0');
            localStorage.setItem('destroyMusic', music.on ? '1' : '0');
        } catch (_) { /* storage unavailable */ }
        if (muteEl) muteEl.textContent = soundLabel();
        musicLevel();
    }

    function soundLabel() {
        return `${coarsePointer ? '' : '[m] '}${audio.muted ? 'sound off' : music.on ? 'sound on' : 'music off'}`;
    }

    // ------------------------------------------------------------------- music
    //
    // While he's out a soundtrack plays, made up as it goes: slow pads of detuned
    // saws opening and closing through a long reverb, a sub under them, and notes
    // off the chord echoing through a delay. Each level has its own key and colour:
    // the website a calm D Dorian with soft plucks, the factory a cold E minor with a
    // ticking square arpeggio, the shell a dark C Phrygian over a pulsing bass, the
    // ether a bright A Lydian with bells. [m] goes sound on, music off, sound off;
    // [n] is just the music.

    const MUSIC = {
        site: { root: 50, beat: 0.5, bar: 16, cutoff: 900, arp: 'pluck', odds: 0.55, delay: 0.75, chords: [[0, 3, 7, 10, 14], [-4, 0, 3, 7], [3, 7, 10, 14], [-2, 2, 5, 12]] },
        sky: { root: 52, beat: 0.25, bar: 32, cutoff: 650, arp: 'tick', odds: 0.5, delay: 0.375, chords: [[0, 3, 7, 10, 14], [-4, 0, 3, 7, 14], [-7, -4, 0, 3, 7], [-5, 0, 2, 5]] },
        shell: { root: 48, beat: 0.25, bar: 32, cutoff: 560, arp: 'pulse', odds: 0.2, delay: 0.5, chords: [[0, 3, 7, 12], [1, 5, 8, 12], [-2, 1, 5, 10], [-4, 0, 3, 10]] },
        net: { root: 57, beat: 0.5, bar: 16, cutoff: 1400, arp: 'bell', odds: 0.45, delay: 1, chords: [[0, 4, 7, 11, 14], [2, 6, 9, 14], [-3, 0, 4, 7], [-7, -3, 0, 4, 7]] },
    };
    const ARP = [0, 2, 1, 3, 2, 4, 1, 3];
    const music = { on: true, live: false, bus: null, dry: null, verb: null, echo: null, timer: 0, next: 0, step: 0, chord: -1, scene: '' };
    try { music.on = localStorage.getItem('destroyMusic') !== '0'; } catch (_) { /* storage unavailable */ }
    const mtof = m => 440 * 2 ** ((m - 69) / 12);

    // The rooms the music plays in: a dry path, a reverb (a few seconds of decaying
    // noise as its impulse), and a darkening delay feeding back into itself
    function musicGraph() {
        const a = audio.ctx;
        music.bus = a.createGain();
        music.bus.gain.value = 0;
        music.bus.connect(audio.comp);
        music.dry = a.createGain();
        music.dry.gain.value = 0.7;
        music.dry.connect(music.bus);
        const len = Math.floor(a.sampleRate * (coarsePointer ? 2.4 : 3.4)), ir = a.createBuffer(2, len, a.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const d = ir.getChannelData(ch);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
        }
        music.verb = a.createConvolver();
        music.verb.buffer = ir;
        const wet = a.createGain();
        wet.gain.value = 0.85;
        music.verb.connect(wet).connect(music.bus);
        music.echo = a.createDelay(2);
        const fb = a.createGain(), dark = a.createBiquadFilter();
        fb.gain.value = 0.4;
        dark.type = 'lowpass';
        dark.frequency.value = 2200;
        music.echo.connect(dark).connect(fb).connect(music.echo);
        dark.connect(music.bus);
        dark.connect(music.verb);
    }

    // How loud it should be: nothing unless he's out, the music's on and the sound is
    function musicLevel() {
        if (!music.bus) return;
        const on = active && music.live && music.on && !audio.muted && !document.hidden;
        music.bus.gain.setTargetAtTime(on ? 1.15 : 0, audio.ctx.currentTime, on ? 1.2 : 0.3);
    }

    function startMusic() {
        if (!audio.ctx) return;
        if (!music.bus) musicGraph();
        music.live = true;
        music.scene = '';
        music.next = audio.ctx.currentTime + 0.1;
        clearInterval(music.timer);
        music.timer = setInterval(musicTick, 250);
        musicLevel();
    }

    function stopMusic() {
        music.live = false;
        clearInterval(music.timer);
        musicLevel();
    }

    // A second or so ahead, every quarter of a second
    function musicTick() {
        if (!music.live || !audio.ctx || audio.ctx.state !== 'running') return;
        const now = audio.ctx.currentTime;
        if (music.next < now) music.next = now + 0.05;   // after a stall, carry on from now
        if (music.scene !== scene) {
            // a new level: its first chord on the next beat (the old pads ring out)
            music.scene = scene;
            music.step = 0;
            music.chord = -1;
        }
        const S = MUSIC[scene] || MUSIC.site;
        while (music.next < now + 1.2) {
            playBeat(S, music.next);
            music.next += S.beat;
        }
    }

    function playBeat(S, t) {
        const step = music.step++;
        if (step % S.bar === 0) {
            music.chord = (music.chord + 1) % S.chords.length;
            const ch = S.chords[music.chord], len = S.bar * S.beat;
            for (const n of ch) padNote(S.root + n, t, len, S.cutoff, 0.028);
            bassNote(S.root + ch[0] - 12, t, len, 'sine', 0.09);
            if (music.chord === 0) whoosh(t + len * 0.5);
        }
        const ch = S.chords[music.chord], i = step % 8;
        if (S.arp === 'pulse') {
            // the shell: a bass pulsing on the root, accents now and then
            if (step % 2 === 0) bassNote(S.root + ch[0] - 12, t, S.beat * 1.6, 'sawtooth', step % 8 === 0 ? 0.07 : 0.045);
            if (Math.random() < S.odds) pluck(S.root + ch[ARP[i] % ch.length] + 12, t, 'triangle', 0.035, 0.5, S.delay);
        } else if (S.arp === 'tick') {
            if (Math.random() < S.odds) pluck(S.root + ch[ARP[i] % ch.length] + 12 + (step % 16 > 11 ? 12 : 0), t, 'square', 0.022, 0.18, S.delay);
        } else if (S.arp === 'bell') {
            if (Math.random() < S.odds) bell(S.root + ch[Math.floor(Math.random() * ch.length)] + 24, t, S.delay);
        } else if (Math.random() < S.odds) pluck(S.root + ch[ARP[i] % ch.length] + 12 + (Math.random() < 0.25 ? 12 : 0), t, 'sine', 0.05, 0.9, S.delay);
    }

    // Two saws a little out of tune with each other, a low-pass opening and closing
    // over them, swelling in and dying away
    function padNote(m, t, len, cutoff, vol) {
        const a = audio.ctx, f = a.createBiquadFilter(), g = a.createGain(), end = t + len + 2;
        f.type = 'lowpass';
        f.Q.value = 0.9;
        f.frequency.setValueAtTime(cutoff * 0.45, t);
        f.frequency.linearRampToValueAtTime(cutoff, t + len * 0.5);
        f.frequency.linearRampToValueAtTime(cutoff * 0.5, t + len + 1.5);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + len * 0.3);
        g.gain.setValueAtTime(vol, t + len * 0.7);
        g.gain.linearRampToValueAtTime(0.0001, end);
        for (const det of [-8, 8]) {
            const o = a.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = mtof(m);
            o.detune.value = det + rand(-3, 3);
            o.connect(f);
            o.start(t);
            o.stop(end + 0.05);
        }
        f.connect(g);
        g.connect(music.dry);
        g.connect(music.verb);
    }

    function bassNote(m, t, len, type, vol) {
        const a = audio.ctx, o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain(), short = len < 2;
        o.type = type;
        o.frequency.value = mtof(m);
        f.type = 'lowpass';
        f.frequency.setValueAtTime(short ? 900 : 240, t);
        f.frequency.exponentialRampToValueAtTime(short ? 160 : 200, t + (short ? len : len * 0.5));
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + (short ? 0.01 : len * 0.25));
        g.gain.exponentialRampToValueAtTime(0.0001, t + len + (short ? 0.05 : 1));
        o.connect(f).connect(g).connect(music.dry);
        o.start(t);
        o.stop(t + len + 1.1);
    }

    function pluck(m, t, type, vol, decay, echo) {
        const a = audio.ctx, o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
        o.type = type;
        o.frequency.value = mtof(m);
        f.type = 'lowpass';
        f.frequency.setValueAtTime(type === 'sine' ? 4000 : 2600, t);
        f.frequency.exponentialRampToValueAtTime(500, t + decay);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        o.connect(f).connect(g);
        g.connect(music.dry);
        g.connect(music.echo);
        g.connect(music.verb);
        music.echo.delayTime.setValueAtTime(echo, t);
        o.start(t);
        o.stop(t + decay + 0.05);
    }

    // A bell: a sine and an out-of-tune overtone, ringing a long time
    function bell(m, t, echo) {
        const a = audio.ctx, g = a.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.03, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
        for (const [ratio, v] of [[1, 1], [2.76, 0.35], [5.4, 0.12]]) {
            const o = a.createOscillator(), og = a.createGain();
            o.frequency.value = mtof(m) * ratio;
            og.gain.value = v;
            o.connect(og).connect(g);
            o.start(t);
            o.stop(t + 3.05);
        }
        g.connect(music.dry);
        g.connect(music.echo);
        g.connect(music.verb);
        music.echo.delayTime.setValueAtTime(echo, t);
    }

    // Now and then a slow sweep of filtered noise, like weather on another planet
    function whoosh(t) {
        const a = audio.ctx, src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
        src.buffer = audio.noise;
        src.loop = true;
        f.type = 'bandpass';
        f.Q.value = 6;
        f.frequency.setValueAtTime(300, t);
        f.frequency.exponentialRampToValueAtTime(2400, t + 3);
        f.frequency.exponentialRampToValueAtTime(400, t + 6);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.05, t + 3);
        g.gain.linearRampToValueAtTime(0.0001, t + 6);
        src.connect(f).connect(g);
        g.connect(music.verb);
        src.start(t);
        src.stop(t + 6.1);
    }

    // ------------------------------------------------------------------ drawing

    function render() {
        const vw = window.innerWidth, vh = window.innerHeight;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, vw, vh);
        ctx.imageSmoothingEnabled = false;
        if (birth) {
            drawBirth(vw, vh);
            drawFade();
            return;
        }
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
        if (scene === 'net') drawTunnel();
        drawClouds();
        const x0 = clamp(Math.floor(scrollX), 0, W), y0 = clamp(Math.floor(scrollY), 0, H);
        const w = Math.min(W - x0, Math.ceil(vw) + 1), h = Math.min(H - y0, Math.ceil(vh) + 1);
        if (scene !== 'net' && w > 0 && h > 0) ctx.drawImage(worldCanvas, x0, y0, w, h, x0 - scrollX + ox, y0 - scrollY + oy, w, h);
        if (scene === 'sky' && w > 0 && h > 0) {
            if (!snowCaps || snowCaps.world !== worldCanvas) buildSnowCaps();
            ctx.drawImage(snowCaps.canvas, x0, y0, w, h, x0 - scrollX + ox, y0 - scrollY + oy, w, h);
        }

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
                // a column of light over it, to be seen from anywhere
                const beam = ctx.createLinearGradient(0, 0, 0, y);
                beam.addColorStop(0, 'rgba(255,210,74,0)');
                beam.addColorStop(1, `rgba(255,210,74,${0.2 + 0.08 * Math.sin(j.t * 4)})`);
                ctx.fillStyle = beam;
                ctx.fillRect(j.x - 8, 0, 16, y);
                ctx.globalAlpha = 0.25 + 0.15 * Math.sin(j.t * 5);
                ctx.fillStyle = '#ffd24a';
                ctx.beginPath();
                ctx.arc(j.x, y, 12, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.drawImage(jetSprite, j.x - 7, y - 5);
            }
        }
        if (scene === 'shell') {
            drawCells();
            drawShellFight();
            drawBeing();
        }
        if (scene === 'net' && net) {
            drawEther();
            ctx.setTransform(dpr, 0, 0, dpr, (ox - scrollX) * dpr, (oy - scrollY) * dpr);
        }
        drawParticles();
        drawNades();
        drawRockets();
        drawBots();
        if (keeper && scene === 'site') drawKeeper();
        drawGuy();
        drawHint();
        if (scene === 'site') {
            drawFlies();
            drawGlobs();
        }
        drawWeather();
        drawBolt();
        drawPool();
        drawRipples();
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
        if (scene === 'shell') drawTankBar();
        drawStormTint();
        drawFlash();
        drawGlitch();
        drawHack();
        drawFeed();
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
        const body = merged ? CY_BODY : BODY, legs = (merged ? CY_POSES : POSES)[pose][frame];
        // camouflaged: next to invisible, except for a moment after he fires
        const cloak = camo && !g.dead ? 0.08 + Math.min(0.6, Math.max(0, camoReveal) * 2.5) : 1;
        if (cloak < 1) ctx.globalAlpha = cloak;
        else if (merged && !g.dead) {
            ctx.fillStyle = `rgba(45,226,230,${0.12 + Math.sin(clock * 3) * 0.05})`;
            ctx.fillRect(-4, -4, 32, 44);
        }
        if (hasJetpack && !g.dead) {
            ctx.drawImage(jetSprite, -2, 10);
            if (g.jetting) {
                ctx.fillStyle = Math.random() < 0.5 ? '#ffd24a' : '#ff8a2a';
                ctx.fillRect(0, 20, 3, rand(4, 9));
                ctx.fillRect(6, 20, 3, rand(4, 9));
            }
        }
        if (merged && !tint && cloak === 1) {
            // an outline, then the seams and the eye
            ctx.fillStyle = '#161922';
            for (const [x, y] of body) ctx.fillRect(x - 1, y - 1, 6, 6);
            for (const [x, y] of legs) ctx.fillRect(x - 1, y - 1, 6, 6);
        }
        drawPixels(body, tint);
        drawPixels(legs, tint);
        if (merged && !tint) {
            ctx.fillStyle = '#2de2e6';
            ctx.fillRect(13, 6, 3, 2);
            ctx.fillRect(8, 16, 8, 1);
            ctx.fillRect(11, 12, 2, 4);
        }
        if (cloak < 1) {
            // the light bending round him
            ctx.globalAlpha = 1;
            ctx.fillStyle = 'rgba(210,250,255,0.2)';
            for (const [x, y] of body) ctx.fillRect(x + Math.sin(clock * 19 + y * 0.7) * 1.5, y, 4, 4);
            for (const [x, y] of legs) ctx.fillRect(x + Math.sin(clock * 19 + y * 0.7) * 1.5, y, 4, 4);
            ctx.globalAlpha = cloak;
        }
        ctx.restore();
        if (g.dead) {
            ctx.globalAlpha = 1;
            return;
        }
        if (g.hp < MAX_HP && cloak === 1) drawBar(g.x - 12, g.y - HEIGHT - 9, 24, g.hp / MAX_HP);

        // the arm that holds the gun, then the gun, pointing wherever he's aiming
        // (merged, the gun is the arm, and it unfolds out of it when he switches)
        const w = gunOf(weapon), p = gunPose();
        ctx.globalAlpha = cloak;
        ctx.save();
        ctx.translate(p.s.x, p.s.y);
        ctx.rotate(p.a);
        if (p.flip < 0) ctx.scale(1, -1);
        if (merged) {
            const spr = armSprites[weapon], sw = Math.max(4, Math.round(spr.width * (1 - Math.max(0, deployT) / DEPLOY)));
            ctx.drawImage(spr, 0, 0, sw, spr.height, p.reach - w.grip[0] * 2, -w.grip[1] * 2, sw, spr.height);
        } else {
            ctx.fillStyle = SKIN;
            ctx.fillRect(-1, -2, p.reach + 2, 4);
            ctx.drawImage(gunSprites[weapon], p.reach - w.grip[0] * 2, -w.grip[1] * 2);
        }
        if (muzzleFlash > 0) {
            const mx = p.reach + (w.muzzle[0] - w.grip[0]) * 2, my = (w.muzzle[1] - w.grip[1]) * 2;
            ctx.fillStyle = merged ? '#e8ffff' : '#fff3b0';
            ctx.fillRect(mx, my - 3, 6, 6);
            ctx.fillStyle = merged ? '#2de2e6' : '#ffb02a';
            ctx.fillRect(mx + 6, my - 1, 4, 2);
            ctx.fillRect(mx + 2, my - 5, 2, 10);
        }
        ctx.restore();
        ctx.globalAlpha = 1;
    }

    function drawBullets() {
        ctx.strokeStyle = merged ? '#7ff6ff' : '#ffcf40';
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
            ctx.strokeStyle = merged ? '#ff3fa4' : '#36c6d9';
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
        updateCamo(dt);
        updateHints(dt);
        if ((firing || shotQueued || padFire) && cooldown <= 0) {
            fire();
            shotQueued = false;
        }
        updateBullets(dt);
        updateRockets(dt);
        updateNades(dt);
        clock += dt;
        updateAtmosphere(dt);
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
        scrollX = scene === 'net' && net ? net.sx : inSky ? 0 : window.scrollX;
        scrollY = scene === 'net' && net ? net.sy : inSky ? 0 : window.scrollY;
        flyRect = !inSky && bigFly.alive && fly ? fly.getBoundingClientRect() : null;
        if (inSky !== awayShown) {
            awayShown = inSky;
            document.documentElement.classList.toggle('destroy-away', inSky);   // index.css hides the fly up there
        }
        toggleRect = !inSky && toggle ? toggle.getBoundingClientRect() : null;
        toggleCd -= dt;
        if (dialog) {
            updateDialog(dt);
            acc = 0;
        }
        if (birth) {
            updateBirth(dt);
            acc = 0;
        }
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
        if (scene === 'net' && net && !birth) updateEtherView(dt);
        scrollX = scene === 'net' && net ? net.sx : scene !== 'site' ? 0 : window.scrollX;
        scrollY = scene === 'net' && net ? net.sy : scene !== 'site' ? 0 : window.scrollY;
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
            else if (act === 'space' && b.getAttribute('aria-pressed') !== 'true') toggleEtherSpace();
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
        hud.classList.toggle('dh-ether', active && scene === 'net');
        if (!active) {
            hud.innerHTML = `<button data-act="gun">[${coarsePointer ? 'tap' : 'g'}] give him the gun back</button>`;
            pctEl = muteEl = killsEl = hpFill = hpNum = camoFill = camoNum = null;
            return;
        }
        const weapons = WEAPONS.map((w, i) => owned.has(i)
            ? `<button data-act="weapon" data-w="${i}"${i === weapon ? ' class="dh-on"' : ''}>${coarsePointer ? '' : i + 1 + ' '}${w.name}</button>`
            : `<span class="dh-locked">${coarsePointer ? '' : i + 1 + ' '}?</span>`
        ).join(' ');
        const help = coarsePointer
            ? `stick: move &middot; JUMP: jump, flip, glide<br>FIRE aims itself, or tap to shoot<br>${merged ? 'CAMO: invisible' : 'BOMB: grenade'} &middot; SWAP: next gun<br>push into an edge to climb`
            : `wasd: move &middot; space: jump, flip, glide<br>click: shoot &middot; ${merged ? 'right-click: camo' : 'right-click: grenade'}<br>q: next gun &middot; s: drop &middot; t: taunt<br>run into an edge to climb`;
        const jetHelp = hasJetpack ? `<br>${coarsePointer ? 'hold JET' : 'hold space'}: jetpack` : '';
        const netHelp = coarsePointer ? 'stick: fly &middot; pinch: zoom<br>tap a cam to plug in' : 'wasd: fly &middot; scroll: zoom<br>click a cam to plug in &middot; v: change space';
        const helpText = scene === 'net' ? netHelp : help + jetHelp;
        const key = k => coarsePointer ? '' : `[${k}] `;
        if (pad) {
            const inNet = scene === 'net';
            pad.querySelector('[data-pad="jump"]').textContent = inNet ? 'UP' : hasJetpack ? 'JET' : 'JUMP';
            pad.querySelector('[data-pad="nade"]').textContent = inNet ? 'IN' : merged ? 'CAMO' : 'BOMB';
            pad.querySelector('[data-pad="swap"]').textContent = inNet ? 'OUT' : 'SWAP';
            pad.querySelector('[data-pad="fire"]').textContent = inNet ? 'PLUG' : 'FIRE';
        }
        const camoBar = merged ? `<div class="dh-hp">camo <span class="dh-bar"><span class="dh-cfill"></span></span> <span class="dh-cst"></span></div>` : '';
        if (coarsePointer) hud.innerHTML =
            `<div><span class="dh-bar"><span class="dh-fill"></span></span> <span class="dh-hpn"></span> &middot; ${WEAPONS[weapon].name}${hasJetpack ? ' + jetpack' : ''} <button data-act="menu">[${menuOpen ? 'close' : 'menu'}]</button></div>` +
            camoBar +
            `<div class="dh-pct"></div>` +
            (menuOpen
                ? `<div>${weapons}</div>` + (botsOn ? `<div class="dh-kills"></div>` : '') +
                  `<div><button data-act="mute"></button> &middot; <button data-act="bots">robots ${botsOn ? 'on' : 'off'}</button> &middot; <button data-act="taunt">taunt</button></div>` +
                  `<div class="dh-help">${helpText}</div>` +
                  `<div><button data-act="fix">fix website</button></div>`
                : '');
        else hud.innerHTML =
            `<div>${weapons}</div>` +
            `<div class="dh-pct"></div>` +
            `<div class="dh-hp">health <span class="dh-bar"><span class="dh-fill"></span></span> <span class="dh-hpn"></span></div>` +
            camoBar +
            (helpOn ? `<div class="dh-help">${helpText}</div>` + (botsOn ? `<div class="dh-kills"></div>` : '') : '') +
            `<div><button data-act="fix">${key('esc')}fix website</button> &middot; <button data-act="help">${key('h')}${helpOn ? 'less' : 'controls'}</button></div>` +
            `<div><button data-act="mute"></button> &middot; <button data-act="bots">${key('b')}robots ${botsOn ? 'on' : 'off'}</button></div>`;
        if (scene === 'net' && net) hud.innerHTML =
            `<div class="ether-title">THE ETHER <span> / living atlas</span></div>` +
            `<div class="ether-space" role="group" aria-label="Camera layout"><button data-act="space" aria-pressed="${net.space === 'earth'}">${net.space === 'earth' ? '◉' : '○'} earth</button><span>↔</span><button data-act="space" aria-pressed="${net.space === 'semantic'}">${net.space === 'semantic' ? '◉' : '○'} semantic</button></div>` +
            `<div class="dh-pct"></div>` +
            (helpOn ? `<div class="dh-help">${netHelp}</div>` : '') +
            `<div><button data-act="fix">${key('esc')}home</button> · <button data-act="help">${helpOn ? 'less' : 'controls'}</button> · <button data-act="mute"></button></div>`;
        pctEl = hud.querySelector('.dh-pct');
        killsEl = hud.querySelector('.dh-kills');
        hpFill = hud.querySelector('.dh-fill');
        hpNum = hud.querySelector('.dh-hpn');
        camoFill = hud.querySelector('.dh-cfill');
        camoNum = hud.querySelector('.dh-cst');
        shownCamo = '';
        shownKills = '';
        shownHp = -1;
        muteEl = hud.querySelector('[data-act="mute"]');
        if (muteEl) muteEl.textContent = soundLabel();
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
        if (camoFill) {
            const pct = Math.round(camoE * 100), st = camo ? (hidden() ? 'on' : 'seen!') : camoE >= CAMO.min ? 'ready' : 'charging';
            if (pct + st !== shownCamo) {
                shownCamo = pct + st;
                camoFill.style.width = pct + '%';
                camoFill.style.background = camo ? '#2de2e6' : camoE >= CAMO.min ? '#5f8f9a' : '#8a8a8a';
                camoNum.textContent = st;
            }
        }
        if (!killsEl) return;
        let text = `scrapped ${scrapped} \u00b7 swatted ${swatted}`;
        if (keepersBeaten) text += ` \u00b7 fly guys ${keepersBeaten}`;
        if (deaths) text += ` \u00b7 deaths ${deaths}`;
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
        if (scene === 'net') {
            const text = !net || !net.tree ? 'the ether: connecting\u2026' : net.sel ? `plugged into: ${net.sel.cam.t}` : `the ether: ${net.tree.leaves.length} live cams on real places`;
            if (pctEl.textContent !== text) pctEl.textContent = text;
            return;
        }
        if (scene === 'shell') {
            const sh = shell, alive = sh.foes.reduce((n, f) => n + !f.dead, 0);
            const text = sh.phase === 'waves' ? `the shell: ghost-hacked puppets, wave ${Math.max(1, sh.wave)} of ${FOE_WAVES.length}${alive ? `, ${alive} left` : ''}`
                : sh.phase === 'boss' ? `the shell: the spider tank${sh.tank ? `, ${Math.ceil(Math.max(0, sh.tank.hp) / sh.tank.max * 100)}%` : ''}`
                    : merged ? `the shell: ${sh.freed} ghosts freed \u00b7 2501's socket is open` : 'the shell: project 2501 is waiting for you';
            if (pctEl.textContent !== text) pctEl.textContent = text;
            return;
        }
        if (scene === 'sky') {
            const left = sky.lines.filter(l => l.alive).length;
            const text = left && !factoryDown ? (merged ? `the factory: ${left} line${left > 1 ? 's' : ''} left \u00b7 the way up is open` : `goal: blow up the factory (${left} line${left > 1 ? 's' : ''} left)`) : hasJetpack ? 'the factory is destroyed: fly up' : 'the factory is destroyed: get the jetpack, fly up';
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
        cooldown = nadeCooldown = shakeAmt = deployT = 0;
        camo = false;
        camoE = 1;
        camoReveal = 0;
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
        loadProgress();
        showFlyState();
        resetBigFly();
        toggle = document.getElementById('theme-toggle');
        weapon = savedWeapon;
        menuOpen = false;
        placeGuns();
        if (coarsePointer && !pad) buildPad();
        if (coarsePointer && !stickZone) buildStick();
        scene = 'site';
        siteState = skyState = sky = portal = fade = null;
        robotsEvil = factoryDown = false;
        portalArmed = true;
        weather = {};
        shell = shellState = net = null;
        closeStream();
        endBirth();
        if (dialog) closeDialog();
        globs = [];
        lasers = [];
        bannerT = 0;
        if (merged || !bigFly.alive) {
            // the fly's dead already (or he's been all the way through): the portal's open from the start
            openPortal();
            banner(merged || flyDead ? 'welcome back. the portal is open' : 'the fly is squashed. a portal is open');
        }
        releaseAll();
        active = true;
        startMusic();
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
        stopMusic();
        releaseAll();
        cancelAnimationFrame(raf);
        if (scene !== 'site') {
            loadScene(siteState);
            scene = 'site';
        }
        shell = shellState = net = null;
        closeStream();
        endBirth();
        if (dialog) closeDialog();
        siteState = skyState = sky = portal = fade = null;
        robotsEvil = factoryDown = false;
        globs = [];
        lasers = [];
        clearTimeout(rebuildTimer);
        // bring the text straight back rather than fading it in from transparent
        document.body.style.transition = 'none';
        document.documentElement.classList.remove('destroying', 'destroy-away');
        awayShown = false;
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
        if (scene === 'net') {
            if (net && net.tree && net.tree.portrait !== (window.innerHeight > window.innerWidth)) {
                const me = net;
                closeStream();
                me.sel = me.zap = me.near = me.feel = null;
                me.tree = null;
                loadEther().then(tree => {
                    if (net === me) etherReady(me, tree);
                });
            } else if (net && net.tree) etherFit();
            if (stream) {
                stream.rect = null;
                placeStream(false);
            }
            return;
        }
        if (scene === 'shell') {
            const was = shell && { phase: shell.phase, wave: shell.wave, freed: shell.freed };
            buildShell();
            if (was && was.phase === 'free') revealBeing();
            else if (was && was.phase !== 'merged') shell.wave = was.phase === 'boss' ? FOE_WAVES.length : Math.max(0, was.wave - 1);
            if (was) shell.freed = was.freed;
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

    const isUi = t => t && t.closest && t.closest('button, a, #destroy-hud, #destroy-pad, #destroy-stick, #destroy-dialog, .ds-x, #virtual-joystick, #action-buttons, #lightbox-modal');

    document.addEventListener('keydown', e => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
        if (!active) {
            if (e.code === 'KeyG') unholster();
            else if (e.code === 'Escape' && starting) holster();
            return;
        }
        if (birth) {
            if (!e.repeat) skipBirth();
            e.preventDefault();
            return;
        }
        if (dialog) {
            if (e.code === 'KeyY') answerDialog(true);
            else if (e.code === 'KeyN' || e.code === 'Escape') {
                if (dialog.asking) answerDialog(false);
                else closeDialog();
            } else if (e.code === 'Space' || e.code === 'Enter') advanceDialog();
            e.preventDefault();
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
        if (scene === 'net' && net) {
            if (e.code === 'KeyV' && !e.repeat) { toggleEtherSpace(); e.preventDefault(); return; }
            const zoom = { KeyZ: 1.6, Equal: 1.6, NumpadAdd: 1.6, KeyX: 1 / 1.6, Minus: 1 / 1.6, NumpadSubtract: 1 / 1.6 }[e.code];
            if (zoom) {
                zoomEther(zoom, pointer.has && !coarsePointer ? pointer.x : undefined, pointer.has && !coarsePointer ? pointer.y : undefined);
                e.preventDefault();
                return;
            }
            if (e.code === 'KeyE' || e.code === 'Enter') {
                plugHere();
                e.preventDefault();
                return;
            }
        }
        if (/^Digit[1-9]$/.test(e.code)) selectWeapon(+e.code.slice(5) - 1);
        else if (e.code === 'KeyQ') cycleWeapon();
        else if (e.code === 'KeyG') altFire();
        else if (e.code === 'KeyM') toggleMute();
        else if (e.code === 'KeyN') toggleMusic();
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
        if (stick) endStick();
    }
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', () => {
        releaseAll();
        musicLevel();
    });

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
        if (birth) {
            skipBirth();
            e.preventDefault();
            return;
        }
        if (scene === 'net' && net && e.button === 0) {
            etherClick(e.clientX, e.clientY);
            e.preventDefault();
            return;
        }
        if (e.button === 0) {
            firing = true;
            shotQueued = cooldown < 0.25;   // a quick click just before the gun is ready still counts
        } else if (e.button === 2) altFire();
        e.preventDefault();
    });

    window.addEventListener('wheel', e => {
        if (!active || scene !== 'net' || !net || birth || dialog) return;
        e.preventDefault();
        zoomEther(Math.exp(-e.deltaY * (e.deltaMode ? 0.06 : 0.0022)), e.clientX, e.clientY);
    }, { passive: false });

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
            if (birth) {
                skipBirth();
                return;
            }
            if (scene === 'net' && net) {
                netTouches.set(t.identifier, { x: t.clientX, y: t.clientY, x0: t.clientX, y0: t.clientY, t0: performance.now() });
                if (netTouches.size > 1) netPinched = true;
                continue;
            }
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

    // In the ether: a tap picks a signal, two fingers pinch to zoom
    const netTouches = new Map();
    let netPinched = false;

    document.addEventListener('touchmove', e => {
        if (active && scene === 'net' && net && netTouches.size) {
            const before = [...netTouches.values()].slice(0, 2).map(p => ({ x: p.x, y: p.y }));
            for (const t of e.changedTouches) {
                const p = netTouches.get(t.identifier);
                if (p) {
                    p.x = t.clientX;
                    p.y = t.clientY;
                }
            }
            const now = [...netTouches.values()].slice(0, 2);
            if (now.length === 2) {
                const d0 = Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y), d1 = Math.hypot(now[0].x - now[1].x, now[0].y - now[1].y);
                if (d0 > 10) zoomEther(d1 / d0, (now[0].x + now[1].x) / 2, (now[0].y + now[1].y) / 2);
            }
            e.preventDefault();
            return;
        }
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
            const p = netTouches.get(t.identifier);
            if (p) {
                netTouches.delete(t.identifier);
                if (!netPinched && e.type === 'touchend' && active && scene === 'net' && net && performance.now() - p.t0 < 400 && Math.hypot(p.x - p.x0, p.y - p.y0) < 14) etherClick(p.x, p.y);
                if (!netTouches.size) netPinched = false;
                continue;
            }
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

    // The fly on the page: squashed for good once it's been killed in here
    function showFlyState() {
        const el = document.getElementById('fly-image');
        if (el && flyDead && el.src.includes('fly.png')) el.setAttribute('src', 'assets/squashed-fly.webp');
    }
    loadProgress();
    showFlyState();

    window.destroyGame = {
        start,
        stop: holster,
        // for poking at from the console
        get pickups() { return pickups.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), w: p.w })); },
        get state() { return active ? { guy: { ...guy }, weapon: WEAPONS[weapon].name, W, H, solidTotal, solidRemoved, particles: parts.length, bots: bots.map(o => ({ x: o.x, y: o.y, hp: o.hp })), flies: flies.map(f => ({ x: f.x, y: f.y })), dirtyTiles: dirtyTiles.size, scrapped, swatted, deaths, fly: { alive: bigFly.alive, hp: bigFly.hp, max: bigFly.max, stage: bigFly.stage }, keeper: keeper && { x: keeper.x, y: keeper.y, hp: keeper.hp, dying: keeper.dying }, stack: stack ? stack.members.length : 0, modes: bots.map(o => o.mode), scene, evil: robotsEvil, portal, lines: sky ? sky.lines.map(l => ({ alive: l.alive, health: +l.health.toFixed(2) })) : null, lasers: lasers.length, globs: globs.length, jetpack: hasJetpack, weather: weather[scene] && { pool: +weather[scene].pool.toFixed(1), raining: weather[scene].raining, drops: weather[scene].drops.length }, cells: shell && shell.cells.length, residues: shell && shell.residues } : null; },
    };
})();
