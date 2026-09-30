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
    const MAX_PARTICLES = 3000;
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
    const BOT_COLORS = {
        light: { y: '#f2c230', g: '#9aa3ad', k: '#2b2f33', e: '#ff4b3a', d: '#6b737c', b: '#c9a227', m: '#4a5159', w: '#bfe3ff' },
        dark: { y: '#f2c230', g: '#aab3bd', k: '#6a7178', e: '#ff4b3a', d: '#7d858e', b: '#c9a227', m: '#8a929a', w: '#bfe3ff' },
    };
    const BOT_BODY = ['...yyy...', '..yyyyy..', '.yyyyyyy.', '.ggggggg.', '.gkeeekg.', '.ggggggg.', '..ddddd..', '.ddbdddd.', '.ddddddd.'];
    const BOT_LEGS = [['..k...k..', '.kk...kk.'], ['...k.k...', '..kk.kk..']];
    const FLY_ART = [
        ['ww...ww', '.wwkww.', '..kek..', '..kkk..', '...k...'],
        ['.......', '..kkk..', 'wwkekww', 'w.kkk.w', '...k...'],
    ];

    const DEBRIS = 0, SPARK = 1, SHELL = 2, SMOKE = 3, FIRE = 4;
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
    const palette = [null, [0, 0, 0], [0, 0, 0]];   // 1: text, 2: links
    let colorCache = new Map();
    let solidTotal = 0, solidRemoved = 0;

    let active = false, starting = false;
    let view = null, ctx = null, dpr = 1;
    let hud = null, pctEl = null, muteEl = null, killsEl = null, shownPct = -1, shownKills = '';
    let raf = 0, lastTime = 0, acc = 0, rebuildTimer = 0, startToken = 0, camHold = 0;
    let helpOn = window.matchMedia('(min-width: 1272px) and (pointer: fine)').matches;
    let guy = null;
    let weapon = 0, cooldown = 0, nadeCooldown = 0, firing = false, shotQueued = false, muzzleFlash = 0, shakeAmt = 0;
    let bullets = [], rockets = [], nades = [], parts = [], beams = [], flashes = [];
    let scrollX = 0, scrollY = 0, fly = null, flyRect = null;
    let origAlp = null, origPal = null, tileDirty = null, dirtyTiles = new Set(), TW = 0, hadDamage = false;
    let bots = [], flies = [], clock = 0, botTimer = 3, flyTimer = 12, lastSay = -10, scrapped = 0, swatted = 0;
    let botsOn = true, revenge = null;
    try { botsOn = localStorage.getItem('destroyBots') !== '0'; } catch (_) { /* storage unavailable */ }
    const pointer = { has: false, x: 0, y: 0, touchId: null };
    const keys = {};
    const tapped = {};   // presses not yet seen by a physics step, so quick taps still count

    let gunColors = GUN_COLORS.light, botColors = BOT_COLORS.light, bgColor = '#fff';
    let gunSprites = [], botSprites = null, flySprites = [];

    // Pixel art from strings, 2px per character; `white` gives the flash when a robot is hit
    function artCanvas(rows, colors, white) {
        const c = document.createElement('canvas');
        c.width = rows[0].length * 2;
        c.height = rows.length * 2;
        const g = c.getContext('2d');
        rows.forEach((row, y) => [...row].forEach((ch, x) => {
            if (colors[ch]) {
                g.fillStyle = white ? '#ffffff' : colors[ch];
                g.fillRect(x * 2, y * 2, 2, 2);
            }
        }));
        return c;
    }

    function buildSprites() {
        gunSprites = WEAPONS.map(w => artCanvas(w.art, gunColors));
        botSprites = {
            normal: BOT_LEGS.map(legs => artCanvas(BOT_BODY.concat(legs), botColors)),
            hurt: BOT_LEGS.map(legs => artCanvas(BOT_BODY.concat(legs), botColors, true)),
        };
        flySprites = FLY_ART.map(rows => artCanvas(rows, botColors));
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
        gunColors = dark ? GUN_COLORS.dark : GUN_COLORS.light;
        botColors = dark ? BOT_COLORS.dark : BOT_COLORS.light;
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
        if (y >= H) return true;
        if (x < 0 || x >= W || y < 0) return false;
        return alp[y * W + x] >= SOLID;
    }

    // A cell he can stand on: solid, with nothing solid on top of it
    function isSurface(x, r) {
        if (r >= H) return true;
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
                        if (kind[i] === ORIGINAL) solidRemoved++;
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
        };
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
        const jumpHeld = k.up || k.space;
        let jumpPressed = (jumpHeld && !g.jumpHeld) || k.tapped.up || k.tapped.jump;
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

        if (g.state === 'climb') {
            g.x = g.wall < 0 ? EDGE : W - EDGE;
            const climb = (k.down ? 1 : 0) - (k.up ? 1 : 0);
            g.vx = 0;
            g.vy = climb * CLIMB_SPEED;
            if (climb) g.walk += dt;
            const y0 = g.y;
            g.y = Math.max(HEIGHT, g.y + g.vy * dt);
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
        const speed = g.state === 'chute' ? CHUTE_SPEED : RUN_SPEED;
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
            if (jumpPressed) {
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
            const gliding = (jumpHeld || g.forceChute) && g.vy > 0 && !k.down && g.spin <= 0;
            const vy0 = g.vy;
            g.vy += GRAVITY * (k.down ? 1.8 : 1) * dt;
            if (gliding) g.vy = Math.min(g.vy, Math.max(CHUTE_FALL, vy0 - 1800 * dt));
            g.vy = Math.min(g.vy, k.down ? FAST_FALL : MAX_FALL);
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
                if (g.y < 0) {
                    g.y = 0;
                    g.vy = Math.max(0, g.vy);
                }
            }
        }
        if (g.grounded) g.state = 'ground';
    }

    function shoulder() {
        return { x: guy.x + guy.facing, y: guy.y - SHOULDER };
    }

    function updateAim() {
        const s = shoulder();
        if (pointer.has) {
            const tx = pointer.x + scrollX, ty = pointer.y + scrollY;
            if (Math.abs(tx - guy.x) > 2) guy.facing = tx > guy.x ? 1 : -1;
            guy.aim = Math.atan2(ty - s.y, tx - s.x);
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
        if (!active || nadeCooldown > 0) return;
        nadeCooldown = GRENADE.cooldown;
        const s = shoulder();
        const a = pointer.has ? guy.aim : (guy.facing > 0 ? -0.5 : Math.PI + 0.5);
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
        let len = 0;
        for (; len < max; len += 2) {
            const px = x + cos * len, py = y + sin * len;
            if (px < -hole || px > W + hole || py < -hole || py > H) break;
            carve(px, py, hole, { debris: 0.2, speed: 160, fx: -sin * (Math.random() < 0.5 ? 1 : -1), fy: cos });
            hitFly(px, py);
        }
        const x1 = x + cos * len, y1 = y + sin * len;
        beams.push({ x0: x, y0: y, x1, y1, t: 0.3 });
        for (const b of bots) if (!b.dead && !b.leaving && segDist2(b.x, b.y - BOT_H / 2, x, y, x1, y1)[0] < 144) hurtBot(b, 99, cos * 200, -150);
        for (const f of flies) if (!f.dead && segDist2(f.x, f.y, x, y, x1, y1)[0] < 81) killFly(f);
    }

    function explode(x, y, R) {
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

        // knock him (and everything else) around
        const reach = R * 2.2;
        const dx = guy.x - x, dy = guy.y - HEIGHT / 2 - y, d = Math.hypot(dx, dy) || 1;
        if (d < reach) {
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
            if (b.dead || b.leaving) continue;
            const bdx = b.x - x, bdy = b.y - BOT_H / 2 - y, bd = Math.hypot(bdx, bdy) || 1;
            if (bd < R * 1.5) hurtBot(b, 1 + 5 * (1 - bd / (R * 1.5)), bdx / bd * 400, -250);
        }
        for (const f of flies) if (!f.dead && Math.hypot(f.x - x, f.y - y) < R * 1.6) killFly(f);
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

    // You can finally do something about the fly
    function hitFly(x, y) {
        if (!flyRect || !fly.src.includes('fly.png')) return false;
        const sx = x - scrollX, sy = y - scrollY;
        if (sx < flyRect.left || sx > flyRect.right || sy < flyRect.top || sy > flyRect.bottom) return false;
        fly.src = 'assets/squashed-fly.webp';
        for (let i = 0; i < 10 && parts.length < MAX_PARTICLES; i++) {
            parts.push({ type: SPARK, x, y, vx: rand(-160, 160), vy: rand(-200, 40), life: rand(0.15, 0.35), color: '#6b8f23' });
        }
        sfx('splat');
        // ...and a moment later its mechanical relatives would like a word
        if (botsOn) revenge = { x, y, t: 0.5 };
        return true;
    }

    function updateBullets(dt) {
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
            b.life -= dt;
            const hit = trace(b.x, b.y, nx, ny);
            if (hitFly((b.x + nx) / 2, (b.y + ny) / 2) || hitFly(nx, ny)) {
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
            if (hit || hitFly(nx, ny) || r.life <= 0) {
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
                if (nx < 0 || nx >= W) dead = true;
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
        if (i === weapon || i < 0 || i >= WEAPONS.length) return;
        weapon = i;
        cooldown = Math.max(cooldown, 0.12);
        renderHud();
    }

    function addShake(s) {
        if (!reducedMotion) shakeAmt = Math.min(16, shakeAmt + s);
    }

    // ------------------------------------------------------------------ robots
    //
    // Clankers are hard-hatted repair robots. Whenever the page is damaged they
    // propeller down from the top of the screen, walk and hop over the text to the
    // damage, and weld it back from a snapshot of the original page, sweeping up
    // rubble as they go. Robot flies come in from the sides in swarms and mob him;
    // enough of them at once will carry him off. Everything goes down to gunfire.

    const LINES = {
        arrive: ['on it', 'who did this', 'repair crew!', 'clocking in', 'ugh, again?', 'not the kerning'],
        work: ['bzzt', 'welding...', 'good as new', 'kerning restored', 'almost there', 'hold still'],
        hurt: ['ow', 'hey!', 'rude', 'my warranty!', 'I have a family', 'stop that'],
        grief: ['GARY NO', 'he was 2 days from retirement', 'avenge him!', 'noooo'],
        fixed: ['all fixed :)', "you're welcome", 'good as new'],
        leave: ['my work here is done', 'break time', 'see ya'],
    };
    const pick = a => a[Math.floor(Math.random() * a.length)];

    function say(b, lines, force) {
        if (!force && clock - lastSay < 1.5) return;
        lastSay = clock;
        b.say = { text: pick(lines), t: 1.8 };
        sfx('beep');
    }

    function markTile(x, y) {
        const t = (y >> 4) * TW + (x >> 4);
        hadDamage = true;
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
        const b = {
            x: clamp(x, EDGE, W - EDGE), y: scrollY - 4, vx: 0, vy: 30, grounded: false, dropping: false,
            prop: true, leaving: false, dead: false, hp: BOT_HP, facing: Math.random() < 0.5 ? -1 : 1,
            t: 0, seed: rand(0, 6), hurt: 0, jumpCd: 0, retarget: 0, target: null, weldAcc: 0,
            progressT: clock, bestDist: Infinity, idle: 0, skip: new Map(), say: null, beam: null,
        };
        bots.push(b);
        say(b, LINES.arrive);
    }

    function spawnSwarm(n, angry, from) {
        const side = Math.random() < 0.5 ? -1 : 1, vw = window.innerWidth, vh = window.innerHeight;
        for (let i = 0; i < n && flies.length < MAX_FLIES; i++) {
            flies.push({
                x: from ? from.x + rand(-10, 10) : side < 0 ? scrollX - rand(10, 80) : scrollX + vw + rand(10, 80),
                y: from ? from.y + rand(-10, 10) : scrollY + vh * rand(0.1, 0.7),
                vx: from ? rand(-160, 160) : -side * rand(120, 200), vy: rand(-60, 60),
                t: 0, phase: rand(0, Math.PI * 2), orbit: angry ? rand(8, 20) : rand(16, 34), angry, dead: false,
                bored: rand(25, 40), away: side,
            });
        }
        sfx('buzz');
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

    function moveBot(b, dir, dt) {
        b.vx = approach(b.vx, dir * BOT_SPEED, (b.grounded ? 900 : 250) * dt);
        b.x = clamp(b.x + b.vx * dt, EDGE, W - EDGE);
        if (b.grounded) {
            const ground = groundUnder(b.x, b.y);
            if (ground === null) {
                b.grounded = false;
                b.vy = 0;
            } else {
                b.y = ground;
                b.vy = 0;
            }
        }
        if (!b.grounded) {
            b.vy = Math.min(b.vy + GRAVITY * dt, b.prop ? 90 : MAX_FALL);
            const y1 = b.y + b.vy * dt;
            let land = null;
            if (b.vy > 0) {
                if (b.dropping && !feetInSolid(b.x, y1)) b.dropping = false;
                if (!b.dropping) land = surfaceBetween(b.x, Math.ceil(b.y), Math.floor(y1));
            }
            if (land !== null) {
                b.y = land;
                b.vy = 0;
                b.grounded = true;
                b.prop = false;
            } else b.y = Math.max(-40, y1);
        }
    }

    function updateBot(b, dt) {
        b.t += dt;
        b.hurt -= dt;
        b.jumpCd -= dt;
        b.retarget -= dt;
        b.beam = null;
        if (b.say && (b.say.t -= dt) <= 0) b.say = null;

        if (b.leaving) {
            // off back up to wherever they come from
            b.vy = Math.max(-150, b.vy - 300 * dt);
            b.y += b.vy * dt;
            if (b.y < scrollY - 80) b.dead = true;
            return;
        }

        if (!b.prop && (!b.target || !tileDirty[b.target.tile]) && b.retarget <= 0) {
            b.target = pickTarget(b);
            b.retarget = 0.5;
            b.bestDist = Infinity;
            b.progressT = clock;
            if (b.target) b.idle = 0;
        }

        let dir = 0;
        if (b.target) {
            const torchX = b.x + b.facing * 9, torchY = b.y - 12;
            const dx = b.target.x - b.x, dist = Math.hypot(b.target.x - torchX, b.target.y - torchY);
            if (dist < BOT_REACH) {
                b.facing = dx >= 0 ? 1 : -1;
                weld(b, dt);
            } else if (b.grounded) {
                if (Math.abs(dx) > 8) dir = Math.sign(dx);
                if (Math.abs(dx) < 40 && b.jumpCd <= 0) {
                    if (b.target.y < torchY - 20) {
                        // hop up to it: the text is one-way, so there's nothing to bump into
                        const rise = clamp(b.y - (b.target.y - 6), 20, 220);
                        b.vy = -Math.sqrt(2 * GRAVITY * rise);
                        b.grounded = false;
                        b.jumpCd = 0.5;
                    } else if (b.target.y > b.y + 26 && b.y < H) {
                        b.grounded = false;
                        b.dropping = true;
                        b.y += 1;
                        b.vy = 60;
                        b.jumpCd = 0.3;
                    }
                }
            }
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
        } else if (!b.prop) {
            b.idle += dt;
            if (b.idle > 1.5 && b.grounded) dir = Math.sin(b.t * 0.7 + b.seed) > 0 ? 1 : -1;
            if (b.idle > 9 && !dirtyTiles.size) {
                b.leaving = true;
                b.prop = true;
                b.vy = -40;
                say(b, LINES.leave);
            }
        }
        if (dir) b.facing = dir;
        moveBot(b, dir, dt);
    }

    function updateFlies(dt) {
        const cx = guy.x, cy = guy.y - HEIGHT / 2;
        let touching = 0;
        for (const f of flies) {
            f.t += dt;
            // buzz in circles around him until they get bored and wander off
            const a = f.phase + f.t * (f.angry ? 4.2 : 2.6);
            const leaving = f.t > f.bored;
            const tx = leaving ? cx + f.away * 5000 : cx + Math.cos(a) * f.orbit;
            const ty = leaving ? f.y - 40 : cy + Math.sin(a * 1.3) * f.orbit * 0.7;
            if (leaving && Math.abs(f.x - cx) > window.innerWidth) f.dead = true;
            const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy) || 1;
            f.vx += (dx / d * 800 + rand(-400, 400)) * dt;
            f.vy += (dy / d * 800 + rand(-400, 400)) * dt;
            for (const o of flies) {
                if (o === f) continue;
                const ox = f.x - o.x, oy = f.y - o.y, o2 = ox * ox + oy * oy;
                if (o2 < 64 && o2 > 0.01) {
                    const od = Math.sqrt(o2);
                    f.vx += ox / od * 300 * dt;
                    f.vy += oy / od * 300 * dt;
                }
            }
            const max = f.angry ? 270 : FLY_SPEED, v = Math.hypot(f.vx, f.vy);
            if (v > max) {
                f.vx *= max / v;
                f.vy *= max / v;
            }
            f.x += f.vx * dt;
            f.y += f.vy * dt;
            if (!leaving && Math.abs(f.x - cx) < 20 && Math.abs(f.y - cy) < 24) touching++;
        }
        if (!touching) return;
        sfx('buzz');
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

    function updateRobots(dt) {
        for (const b of bots) updateBot(b, dt);
        if (revenge && (revenge.t -= dt) <= 0) {
            spawnSwarm(14, true, revenge);
            revenge = null;
        }
        updateFlies(dt);
        if (bots.some(b => b.dead)) bots = bots.filter(b => !b.dead);
        if (flies.some(f => f.dead)) flies = flies.filter(f => !f.dead);
        if (!botsOn) return;

        const pct = solidTotal ? solidRemoved / solidTotal * 100 : 0;
        if (dirtyTiles.size) {
            botTimer -= dt;
            const working = bots.filter(b => !b.leaving).length;
            if (botTimer <= 0 && working < Math.min(MAX_BOTS, 1 + Math.floor(pct / 3))) {
                spawnBot();
                botTimer = clamp(9 - pct / 5, 2.5, 9);
            }
        } else {
            botTimer = Math.max(botTimer, 3);
            if (hadDamage) {
                hadDamage = false;
                const b = bots.find(o => !o.leaving);
                if (b && solidRemoved === 0) say(b, LINES.fixed, true);
            }
        }
        flyTimer -= dt;
        if (flyTimer <= 0) {
            spawnSwarm(3 + Math.floor(pct / 10) + Math.min(4, Math.floor(clock / 60)), false);
            flyTimer = rand(15, 25);
        }
    }

    function segDist2(cx, cy, x0, y0, x1, y1) {
        const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy || 1;
        const t = clamp(((cx - x0) * dx + (cy - y0) * dy) / L, 0, 1);
        const ex = x0 + dx * t - cx, ey = y0 + dy * t - cy;
        return [ex * ex + ey * ey, t];
    }

    // The first robot or fly along a segment: { e, fly, t } or null
    function enemyOnSegment(x0, y0, x1, y1, pad = 0) {
        let best = null;
        for (const b of bots) {
            if (b.dead || b.leaving) continue;
            const [d2, t] = segDist2(b.x, b.y - BOT_H / 2, x0, y0, x1, y1);
            if (d2 <= (10 + pad) ** 2 && (!best || t < best.t)) best = { e: b, fly: false, t };
        }
        for (const f of flies) {
            if (f.dead) continue;
            const [d2, t] = segDist2(f.x, f.y, x0, y0, x1, y1);
            if (d2 <= (7 + pad) ** 2 && (!best || t < best.t)) best = { e: f, fly: true, t };
        }
        return best;
    }

    function damageEnemy(hit, dmg, vx, vy) {
        if (hit.fly) return killFly(hit.e);
        const v = Math.hypot(vx, vy) || 1;
        hurtBot(hit.e, dmg, vx / v * 60, -40);
    }

    function hurtBot(b, dmg, kx, ky) {
        if (b.dead) return;
        b.hp -= dmg;
        b.hurt = 0.1;
        b.vx += kx;
        if (ky < -50) {
            b.grounded = false;
            b.vy = Math.min(b.vy, ky);
        }
        if (b.hp <= 0) return killBot(b);
        sfx('clank');
        if (Math.random() < 0.5) say(b, LINES.hurt, true);
    }

    function killBot(b) {
        b.dead = true;
        scrapped++;
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
            if (o.dead || o.leaving || Math.hypot(o.x - b.x, o.y - b.y) > 160) continue;
            say(o, LINES.grief, true);
            break;
        }
    }

    function killFly(f) {
        if (f.dead) return;
        f.dead = true;
        swatted++;
        for (let i = 0; i < 5 && parts.length < MAX_PARTICLES; i++) {
            parts.push({ type: SHELL, x: f.x, y: f.y, vx: rand(-140, 140), vy: rand(-200, -20), life: rand(0.6, 1.1), bounces: 0, color: pick([botColors.k, botColors.w, botColors.e]), size: 2 });
        }
        sfx('pop');
    }

    function toggleBots() {
        botsOn = !botsOn;
        try { localStorage.setItem('destroyBots', botsOn ? '1' : '0'); } catch (_) { /* storage unavailable */ }
        if (!botsOn) {
            for (const e of [...bots, ...flies]) dust(e.x, e.y, 4);
            bots = [];
            flies = [];
        } else {
            botTimer = 3;
            flyTimer = 6;
        }
        renderHud();
    }

    function drawBots() {
        for (const b of bots) {
            const x = Math.round(b.x), top = Math.round(b.y) - BOT_H;
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
            ctx.drawImage(b.hurt > 0 ? botSprites.hurt[frame] : botSprites.normal[frame], -9, 0);
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

    function drawSpeech() {
        ctx.font = "10px 'IBM Plex Mono', monospace";
        ctx.textBaseline = 'middle';
        for (const b of bots) {
            if (!b.say) continue;
            const w = Math.ceil(ctx.measureText(b.say.text).width) + 8;
            const x = Math.round(b.x - w / 2), y = Math.round(b.y - BOT_H - (b.prop ? 18 : 12));
            ctx.globalAlpha = Math.min(1, b.say.t * 4);
            ctx.fillStyle = bgColor;
            ctx.fillRect(x, y - 7, w, 14);
            ctx.strokeStyle = cellColor(1, 0);
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y - 6.5, w - 1, 13);
            ctx.fillStyle = cellColor(1, 0);
            ctx.fillText(b.say.text, x + 4, y + 0.5);
        }
        ctx.globalAlpha = 1;
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
    };
    const SOUND_GAP = { weld: 0.08, buzz: 0.35, beep: 0.2 };

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

        const x0 = clamp(Math.floor(scrollX), 0, W), y0 = clamp(Math.floor(scrollY), 0, H);
        const w = Math.min(W - x0, Math.ceil(vw) + 1), h = Math.min(H - y0, Math.ceil(vh) + 1);
        if (w > 0 && h > 0) ctx.drawImage(worldCanvas, x0, y0, w, h, x0 - scrollX + ox, y0 - scrollY + oy, w, h);

        ctx.setTransform(dpr, 0, 0, dpr, (ox - scrollX) * dpr, (oy - scrollY) * dpr);
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = cellColor(1, 0);
        ctx.fillRect(0, H, W, 1);
        ctx.globalAlpha = 1;
        drawParticles();
        drawNades();
        drawRockets();
        drawBots();
        drawGuy();
        drawFlies();
        drawBullets();
        drawBeams();
        drawFlashes();
        drawSpeech();
    }

    function drawParticles() {
        for (const q of parts) {
            if (q.type === DEBRIS) {
                ctx.fillStyle = cellColor(q.pal, q.shade);
                ctx.fillRect(Math.floor(q.x), Math.floor(q.y), 2, 2);
            } else if (q.type === SPARK) {
                ctx.fillStyle = q.color || '#ffd24a';
                ctx.fillRect(q.x, q.y, 1.5, 1.5);
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

    function drawPixels(list) {
        for (const [x, y, c] of list) {
            ctx.fillStyle = c;
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
        if (g.spin > 0) ctx.rotate((1 - g.spin / FLIP_TIME) * Math.PI * 2 * g.facing);
        if (g.facing < 0) ctx.scale(-1, 1);
        ctx.translate(-12, -HEIGHT / 2);
        if (pose === 'chute') {
            ctx.fillStyle = CANOPY_RED;
            for (const [x, y] of CANOPY) ctx.fillRect(x, y, 4, 4);
        }
        drawPixels(BODY);
        drawPixels(POSES[pose][frame]);
        ctx.restore();

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
        if (Math.abs(guy.vx) > 1 || Math.abs(guy.vy) > 1) camHold = 0.4;
        else if ((camHold -= dt) <= 0) return;
        const vh = window.innerHeight, sy = guy.y - HEIGHT / 2 - scrollY;
        let d = 0;
        if (sy < vh * 0.3) d = sy - vh * 0.3;
        else if (sy > vh * 0.7) d = sy - vh * 0.7;
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
        if ((firing || shotQueued) && cooldown <= 0) {
            fire();
            shotQueued = false;
        }
        updateBullets(dt);
        updateRockets(dt);
        updateNades(dt);
        clock += dt;
        updateRobots(dt);
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
        scrollX = window.scrollX;
        scrollY = window.scrollY;
        flyRect = fly && fly.src.includes('fly.png') ? fly.getBoundingClientRect() : null;
        while (acc >= STEP) {
            step(STEP);
            acc -= STEP;
        }
        followCamera(dt);
        scrollX = window.scrollX;
        scrollY = window.scrollY;
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
        });
    }

    function toggleHelp() {
        helpOn = !helpOn;
        renderHud();
    }

    function renderHud() {
        if (!hud) return;
        hud.classList.toggle('dh-idle', !active);
        if (!active) {
            hud.innerHTML = `<button data-act="gun">[${coarsePointer ? 'tap' : 'g'}] give him the gun back</button>`;
            pctEl = muteEl = killsEl = null;
            return;
        }
        const weapons = WEAPONS.map((w, i) =>
            `<button data-act="weapon" data-w="${i}"${i === weapon ? ' class="dh-on"' : ''}>${coarsePointer ? '' : i + 1 + ' '}${w.name}</button>`
        ).join(' ');
        const help = coarsePointer
            ? 'stick: move<br>&uarr;: jump, again to flip, hold to glide<br>tap: shoot<br>A: grenade<br>push into the screen edge: climb'
            : 'wasd: move<br>space: jump, again to flip, hold to glide<br>s: drop through<br>click: shoot<br>right-click or g: grenade<br>q: next weapon<br>run into the screen edge: climb<br>clankers fix the page: scrap them';
        const key = k => coarsePointer ? '' : `[${k}] `;
        hud.innerHTML =
            `<div>${weapons}</div>` +
            `<div class="dh-pct"></div>` +
            (botsOn ? `<div class="dh-kills"></div>` : '') +
            (helpOn ? `<div class="dh-help">${help}</div>` : '') +
            `<div><button data-act="fix">${key('esc')}fix website</button> <button data-act="mute"></button> <button data-act="bots">${key('b')}robots ${botsOn ? 'on' : 'off'}</button> <button data-act="help">${key('h')}${helpOn ? 'hide help' : 'help'}</button></div>`;
        pctEl = hud.querySelector('.dh-pct');
        killsEl = hud.querySelector('.dh-kills');
        shownKills = '';
        muteEl = hud.querySelector('[data-act="mute"]');
        muteEl.textContent = `${coarsePointer ? '' : '[m] '}sound ${audio.muted ? 'off' : 'on'}`;
        shownPct = -1;
        updatePct();
    }

    function updateKills() {
        if (!killsEl) return;
        const text = `clankers scrapped: ${scrapped} \u00b7 flies swatted: ${swatted}`;
        if (text === shownKills) return;
        shownKills = text;
        killsEl.textContent = text;
    }

    function updatePct() {
        if (!pctEl) return;
        const pct = solidTotal ? Math.min(100, solidRemoved / solidTotal * 100) : 0;
        const shown = Math.floor(pct * 10) / 10;
        if (shown === shownPct) return;
        shownPct = shown;
        pctEl.textContent = `website destroyed: ${shown.toFixed(1)}%${shown >= 90 ? ', you monster' : shown >= 50 ? ', yikes' : ''}`;
    }

    // ------------------------------------------------------------ start / stop

    function sizeView() {
        dpr = Math.min(window.devicePixelRatio || 1, 3);
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
        fly = document.getElementById('fly-image');

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
        flyTimer = 12;
        lastSay = -10;
        scrapped = swatted = 0;
        revenge = null;
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
        const x = guy.x - window.scrollX, y = guy.y - window.scrollY;
        rasterize();
        guy.x = clamp(x + window.scrollX, EDGE, W - EDGE);
        guy.y = clamp(y + window.scrollY, HEIGHT, H);
        guy.grounded = false;
        guy.state = 'air';
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

    const isUi = t => t && t.closest && t.closest('button, a, #destroy-hud, #virtual-joystick, #action-buttons, #lightbox-modal');

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
        else if (e.code === 'KeyQ') selectWeapon((weapon + 1) % WEAPONS.length);
        else if (e.code === 'KeyG') throwGrenade();
        else if (e.code === 'KeyM') toggleMute();
        else if (e.code === 'KeyH') toggleHelp();
        else if (e.code === 'KeyB') toggleBots();
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
        shotQueued = false;
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

    const actionButton = document.getElementById('action-button');
    if (actionButton) actionButton.addEventListener('touchstart', () => throwGrenade());

    // index.html's joystick rewrites ArrowUp on every move, which would let go of a
    // jump button that's being held to glide, so track the button separately
    const jumpButton = document.getElementById('jump-button');
    if (jumpButton) {
        jumpButton.addEventListener('touchstart', () => {
            if (!active) return;
            keys.jump = true;
            tapped.jump = true;
        });
        jumpButton.addEventListener('touchend', () => { keys.jump = false; });
        jumpButton.addEventListener('touchcancel', () => { keys.jump = false; });
    }

    window.addEventListener('resize', () => {
        if (!active) return;
        sizeView();
        if (document.documentElement.clientWidth !== W) {
            clearTimeout(rebuildTimer);
            rebuildTimer = setTimeout(rebuild, 250);
        }
    });

    if (document.fonts) {
        document.fonts.addEventListener('loadingdone', () => {
            if (active && solidRemoved === 0) rebuild();
        });
    }

    // Recolour the world when the theme toggle is used mid-destruction
    new MutationObserver(() => {
        if (!active) return;
        readPalette();
        repaint();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    window.destroyGame = {
        start,
        stop: holster,
        // for poking at from the console
        get state() { return active ? { guy: { ...guy }, weapon: WEAPONS[weapon].name, W, H, solidTotal, solidRemoved, particles: parts.length, bots: bots.map(o => ({ x: o.x, y: o.y, hp: o.hp })), flies: flies.map(f => ({ x: f.x, y: f.y })), dirtyTiles: dirtyTiles.size, scrapped, swatted } : null; },
    };
})();
