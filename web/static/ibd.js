'use strict';
// ════════════════════════════════════════════════════════════
// IBD Editor – Informations-Blockdiagramme (Informationsfluss)
//
// Schwesterprojekt zum PAP Editor. Notation und Prüfregeln folgen dem
// Konzept "Informationsfluss in der µC-Programmierung":
//   Bauteil · Verarbeitung · eigene Funktion · Variable (+ globale Zone)
//   Übergabewert · Rückgabewert · Bauteilsignal · globaler Zugriff ·
//   veränderte Liste
//
// Die Zeichenfläche ist ein SVG. Dadurch ist der SVG-Export dieselbe
// Zeichenroutine wie die Anzeige, PNG/JPG entstehen aus diesem SVG.
// ════════════════════════════════════════════════════════════

const APP_VERSION = '1.0.0';
const FILE_FORMAT = 'ibd-editor';
const GITHUB_REPO = 'juchemGDG/IBD_Editor';   // Quelle der Desktop-Pakete (leer = nur downloads/)

// ── Farben und Maße (aus der Darstellungskonvention) ─────────
const FONT_SANS = 'Helvetica, Arial, sans-serif';
const FONT_MONO = "'Courier New', Courier, monospace";
const ACCENT    = '#2563eb';

const NODE_TYPES = {
  bauteil:      { name: 'Bauteil',         hint: 'Quelle oder Ziel: Taster, Sensor, LED, Konsole',
                  fill: '#FFDBB6', stroke: '#FF8000', text: 'Bauteil',     mono: false },
  verarbeitung: { name: 'Verarbeitung',    hint: 'fertige Funktion, Methode, Operation',
                  fill: '#E7E7E7', stroke: '#7F7F7F', text: 'adc.read()',  mono: true },
  funktion:     { name: 'eigene Funktion', hint: 'selbst geschriebene Funktion (def, void, function …) – Gültigkeitsbereich für Variablen',
                  fill: '#DEE6EF', stroke: '#2A6099', text: 'name()',      mono: true },
  variable:     { name: 'Variable',        hint: 'abgelegter Wert, optional mit Rolle',
                  fill: '#FFFFFF', stroke: '#3C3C3C', text: 'wert',        mono: true },
  zone:         { name: 'globale Zone',    hint: 'nur Festwerte und Bauteile',
                  fill: 'none',    stroke: '#8C8C8C', text: 'globale Zone: nur Festwerte und Bauteile', mono: false },
};
const NODE_ORDER = ['bauteil', 'verarbeitung', 'funktion', 'variable', 'zone'];

const ARROW_KINDS = {
  uebergabe: { name: 'Übergabewert',     hint: 'dunkel, schmal',
               color: '#3C3C3C', width: 1.8, head: 10, half: 4.5 },
  rueckgabe: { name: 'Rückgabewert',     hint: 'blau, breit, Punkt = Rückgabe (return)',
               color: '#1F5F8B', width: 3.6, head: 13, half: 6.5, dot: 5.5, bold: true },
  signal:    { name: 'Bauteilsignal',    hint: 'orange, Bauteil ↔ Verarbeitung',
               color: '#FF8000', width: 2.2, head: 10, half: 5 },
  global:    { name: 'globaler Zugriff', hint: 'gestrichelt, braucht Begründung',
               color: '#8C8C8C', width: 1.8, head: 10, half: 4.5, dash: '7 5' },
  liste:     { name: 'veränderte Liste', hint: 'blau, breit, zwei Spitzen',
               color: '#1F5F8B', width: 3.6, head: 13, half: 6.5, both: true, bold: true },
};
const KIND_ORDER = ['uebergabe', 'rueckgabe', 'signal', 'global', 'liste'];

const ROLES = ['Festwert', 'Zähler', 'Sammler', 'Merker', 'Aktueller Wert'];

const FONT_SIZE = 13, FONT_MIN = 8, FONT_MAX = 36;
const BORDER_TOL = 7;       // Breite der Randzone, in der ein Pfeil beginnt
const GRIP = 7;
const STUB = 30;            // Ausweichlänge bei Pfeilen "außen herum"

// ════════════════════════════════════════════════════════════
// Zustand
// ════════════════════════════════════════════════════════════
let nodes = {};             // id → {id,type,x,y,w,h,text,desc,role,list,fontSize,manual}
let arrows = {};            // id → {id,src,tgt,kind,label,sa:{side,t},ta:{side,t},mid}
let nextId = 1;
let selNodes = new Set();
let selArrow = null;
let curFile = null;
let gridSize = 20;
let showGrid = true;
let view = { x: 0, y: 0, z: 1 };
let defaultKind = 'auto';
let dirty = false;
let marks = { nodes: {}, arrows: {} };   // Ergebnis der letzten Prüfung
let undoStack = [], redoStack = [];
let clipboard = null;
let drag = null;
let hoverAnchor = null;     // {id, side, t}
let stage = null;

// ════════════════════════════════════════════════════════════
// Hilfen
// ════════════════════════════════════════════════════════════
function byId(id) { return document.getElementById(id); }
function on(id, ev, fn, opt) { const el = byId(id); if (el) el.addEventListener(ev, fn, opt); }
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function snap(v) { return Math.round(v / gridSize) * gridSize; }
function r1(v) { return Math.round(v * 10) / 10; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function isContainer(n) { return n.type === 'funktion' || n.type === 'zone'; }
function fontOf(n) { return n.fontSize || FONT_SIZE; }
function setStatus(msg) { const el = byId('status'); if (el) el.textContent = msg; }

let measCtx = null;
function textW(text, size, mono, bold) {
  if (!measCtx) measCtx = document.createElement('canvas').getContext('2d');
  measCtx.font = `${bold ? 'bold ' : ''}${size}px ${mono ? FONT_MONO : FONT_SANS}`;
  return measCtx.measureText(text).width;
}
function wrapLines(text, maxW, size) {
  const out = [];
  String(text || '').split('\n').forEach(par => {
    let line = '';
    par.split(/\s+/).forEach(word => {
      const probe = line ? line + ' ' + word : word;
      if (line && textW(probe, size, false, false) > maxW) { out.push(line); line = word; }
      else line = probe;
    });
    out.push(line);
  });
  return out.filter((l, i) => l || i > 0);
}

// Anzeigename einer Variablen (Listen bekommen "[ ]")
function varLabel(n) { return n.text + (n.list ? ' [ ]' : ''); }
function shortName(n) {
  const t = (n.type === 'variable' ? varLabel(n) : (n.text || '').split('\n')[0]).trim();
  return t ? `„${t}“` : `(${NODE_TYPES[n.type].name} ohne Text)`;
}

// ════════════════════════════════════════════════════════════
// Geometrie der Bausteine
// ════════════════════════════════════════════════════════════
function drawOrder() {
  const list = Object.values(nodes);
  const rank = n => n.type === 'zone' ? 0 : n.type === 'funktion' ? 1 : 2;
  return list.sort((a, b) => rank(a) - rank(b) || (b.w * b.h) - (a.w * a.h) || a.id - b.id);
}
function inside(n, x, y, m) {
  m = m || 0;
  return x >= n.x - m && x <= n.x + n.w + m && y >= n.y - m && y <= n.y + n.h + m;
}
// Behälter (Funktion/Zone), in denen der Mittelpunkt von n liegt – kleinster zuerst
function enclosing(n) {
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
  return Object.values(nodes)
    .filter(c => c.id !== n.id && isContainer(c) && c.w * c.h > n.w * n.h && inside(c, cx, cy))
    .sort((a, b) => a.w * a.h - b.w * b.h);
}
// Gültigkeitsbereich: die eigene Funktion, in der ein Baustein liegt (oder null)
function scopeOf(n) { return enclosing(n).find(c => c.type === 'funktion') || null; }
function contentsOf(c) {
  return Object.values(nodes).filter(m => m.id !== c.id && enclosing(m).some(e => e.id === c.id));
}
function hasChildren(n) { return n.type === 'funktion' && Object.values(nodes).some(m => m.type === 'variable' && (scopeOf(m) || {}).id === n.id); }

// Automatische Größe passend zum Text (solange nicht von Hand verändert)
function fitSize(n) {
  if (n.manual) return;
  const fs = fontOf(n), lh = Math.round(fs * 1.3);
  const up = v => Math.ceil(v / 20) * 20;
  const lines = String(n.text || '').split('\n');
  const mono = NODE_TYPES[n.type].mono;
  const tw = Math.max(0, ...lines.map(l => textW(l, fs, mono, true)));
  if (n.type === 'variable') {
    const w = Math.max(textW(varLabel(n), fs, true, true), n.role ? textW(n.role, fs - 2, false, false) : 0);
    n.w = up(Math.max(120, w + 40));
    n.h = up(Math.max(40, (n.role ? lh + fs : lh) + 22));
  } else if (n.type === 'funktion') {
    n.w = up(Math.max(180, tw + 44));
    const dl = n.desc ? wrapLines(n.desc, n.w - 30, fs - 1).length : 0;
    n.h = up(Math.max(80, lines.length * lh + dl * (lh - 1) + 40));
  } else if (n.type === 'zone') {
    n.w = 440; n.h = 260;
  } else {
    n.w = up(Math.max(100, tw + 36));
    n.h = up(Math.max(40, lines.length * lh + 22));
  }
}

// ── Anschlusspunkte: beliebige Stelle auf dem Rand ───────────
const NORMAL = { l: [-1, 0], r: [1, 0], t: [0, -1], b: [0, 1] };
function anchorPt(n, a) {
  const t = clamp(a.t, 0, 1);
  if (a.side === 'l') return [n.x, n.y + n.h * t];
  if (a.side === 'r') return [n.x + n.w, n.y + n.h * t];
  if (a.side === 't') return [n.x + n.w * t, n.y];
  return [n.x + n.w * t, n.y + n.h];
}
function sideLen(n, side) { return (side === 'l' || side === 'r') ? n.h : n.w; }
// Position entlang einer Seite aus einer Weltkoordinate, mit Einrasten
function sideT(n, side, x, y, snapIt) {
  const horiz = side === 'l' || side === 'r';
  const len = sideLen(n, side), start = horiz ? n.y : n.x;
  let d = (horiz ? y : x) - start;
  const margin = Math.min(10, len / 4);
  if (snapIt) {
    if (Math.abs(d - len / 2) < 9) d = len / 2;
    else d = Math.round(d / 10) * 10;
  }
  d = clamp(d, margin, len - margin);
  return d / len;
}
function nearestSide(n, x, y) {
  const d = { l: Math.abs(x - n.x), r: Math.abs(x - n.x - n.w), t: Math.abs(y - n.y), b: Math.abs(y - n.y - n.h) };
  return Object.keys(d).sort((a, b) => d[a] - d[b])[0];
}
function anchorAt(n, x, y) {
  const side = nearestSide(n, x, y);
  return { side, t: sideT(n, side, x, y, true) };
}
// Seite von n, die dem Punkt zugewandt ist
function facingSide(n, x, y) {
  if (x <= n.x) return 'l';
  if (x >= n.x + n.w) return 'r';
  if (y <= n.y) return 't';
  if (y >= n.y + n.h) return 'b';
  return nearestSide(n, x, y);
}
// Zielanker für einen Pfeil, der bei (fx,fy) beginnt und bei (x,y) losgelassen wird
function targetAnchor(n, fx, fy, x, y, onBorder) {
  const side = onBorder ? nearestSide(n, x, y) : facingSide(n, fx, fy);
  const horiz = side === 'l' || side === 'r';
  const len = sideLen(n, side), start = horiz ? n.y : n.x, from = horiz ? fy : fx;
  const margin = Math.min(10, len / 4);
  const alignable = from >= start + margin && from <= start + len - margin;
  // gerade Linie, wenn der Startpunkt auf Höhe der Zielseite liegt
  if (alignable && (!onBorder || Math.abs((horiz ? y : x) - from) < 14)) return { side, t: (from - start) / len };
  if (!onBorder && !inside(n, x, y)) return { side, t: 0.5 };
  return { side, t: sideT(n, side, x, y, true) };
}

// ── Pfeilverlauf (rechtwinklig) ──────────────────────────────
function arrowRoute(a) {
  const s = nodes[a.src], t = nodes[a.tgt];
  if (!s || !t) return null;
  return routeBetween(anchorPt(s, a.sa), a.sa.side, anchorPt(t, a.ta), a.ta.side, a.mid);
}
function routeBetween(p0, side0, p1, side1, mid) {
  const d0 = NORMAL[side0], d1 = NORMAL[side1];
  const [x0, y0] = p0, [x1, y1] = p1;
  const h0 = d0[0] !== 0, h1 = d1[0] !== 0;
  if (h0 && h1) {
    if (Math.abs(y0 - y1) < 0.5 && (x1 - x0) * d0[0] > 0) return [p0, p1];
    if (d0[0] === d1[0]) {
      const mx = mid != null ? mid : (d0[0] > 0 ? Math.max(x0, x1) + STUB : Math.min(x0, x1) - STUB);
      return [p0, [mx, y0], [mx, y1], p1];
    }
    if ((x1 - x0) * d0[0] > 0) {
      const mx = mid != null ? clamp(mid, Math.min(x0, x1) + 4, Math.max(x0, x1) - 4) : (x0 + x1) / 2;
      return [p0, [mx, y0], [mx, y1], p1];
    }
    const my = mid != null ? mid : (y0 + y1) / 2;
    return [p0, [x0 + STUB * d0[0], y0], [x0 + STUB * d0[0], my], [x1 + STUB * d1[0], my], [x1 + STUB * d1[0], y1], p1];
  }
  if (!h0 && !h1) {
    if (Math.abs(x0 - x1) < 0.5 && (y1 - y0) * d0[1] > 0) return [p0, p1];
    if (d0[1] === d1[1]) {
      const my = mid != null ? mid : (d0[1] > 0 ? Math.max(y0, y1) + STUB : Math.min(y0, y1) - STUB);
      return [p0, [x0, my], [x1, my], p1];
    }
    if ((y1 - y0) * d0[1] > 0) {
      const my = mid != null ? clamp(mid, Math.min(y0, y1) + 4, Math.max(y0, y1) - 4) : (y0 + y1) / 2;
      return [p0, [x0, my], [x1, my], p1];
    }
    const mx = mid != null ? mid : (x0 + x1) / 2;
    return [p0, [x0, y0 + STUB * d0[1]], [mx, y0 + STUB * d0[1]], [mx, y1 + STUB * d1[1]], [x1, y1 + STUB * d1[1]], p1];
  }
  if (h0) {   // waagrecht hinaus, senkrecht hinein
    if ((x1 - x0) * d0[0] > 0 && (y0 - y1) * d1[1] > 0) return [p0, [x1, y0], p1];
    return [p0, [x0 + STUB * d0[0], y0], [x0 + STUB * d0[0], y1 + STUB * d1[1]], [x1, y1 + STUB * d1[1]], p1];
  }
  if ((y1 - y0) * d0[1] > 0 && (x0 - x1) * d1[0] > 0) return [p0, [x0, y1], p1];
  return [p0, [x0, y0 + STUB * d0[1]], [x1 + STUB * d1[0], y0 + STUB * d0[1]], [x1 + STUB * d1[0], y1], p1];
}
// Mittleres Segment eines Z-/U-Verlaufs (verschiebbar)
function midHandle(route) {
  if (!route || route.length !== 4) return null;
  const a = route[1], b = route[2];
  return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, vertical: Math.abs(a[0] - b[0]) < 0.5 };
}
function labelPos(route) {
  let best = 0, len = -1;
  for (let i = 0; i < route.length - 1; i++) {
    const l = Math.hypot(route[i + 1][0] - route[i][0], route[i + 1][1] - route[i][1]);
    if (l > len + 0.5) { len = l; best = i; }
  }
  const a = route[best], b = route[best + 1];
  const vertical = Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) > 0.5;
  return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, vertical };
}
function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - x1 - t * dx, py - y1 - t * dy);
}

// ════════════════════════════════════════════════════════════
// Zeichnen (SVG)
// ════════════════════════════════════════════════════════════
function textBlock(lines, cx, cy, size, lh, attrs) {
  // senkrecht um cy zentriert; Grundlinie von Hand, damit Export = Anzeige
  const y0 = cy - (lines.length - 1) * lh / 2 + size * 0.35;
  return lines.map((l, i) => `<text x="${r1(cx)}" y="${r1(y0 + i * lh)}" ${attrs}>${esc(l)}</text>`).join('');
}
function nodeSVG(n) {
  const T = NODE_TYPES[n.type], fs = fontOf(n), lh = Math.round(fs * 1.3);
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
  const mono = `font-family="${FONT_MONO}" font-size="${fs}" font-weight="bold" text-anchor="middle" fill="#1f1f1f"`;
  const sans = `font-family="${FONT_SANS}" font-size="${fs}" font-weight="bold" text-anchor="middle" fill="#1f1f1f"`;
  const sub  = `font-family="${FONT_SANS}" font-size="${fs - 2}" text-anchor="middle" fill="#555555"`;
  const lines = String(n.text || '').split('\n');
  let s = '';
  if (n.type === 'bauteil') {
    s += `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="${T.fill}" stroke="${T.stroke}" stroke-width="1.6"/>`;
    s += textBlock(lines, cx, cy, fs, lh, sans);
  } else if (n.type === 'verarbeitung') {
    s += `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="9" fill="${T.fill}" stroke="${T.stroke}" stroke-width="1.6"/>`;
    s += textBlock(lines, cx, cy, fs, lh, mono);
  } else if (n.type === 'variable') {
    s += `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="#FFFFFF" stroke="${T.stroke}" stroke-width="1.3"/>`;
    s += `<rect x="${n.x + 5}" y="${n.y + 5}" width="${n.w - 10}" height="${n.h - 10}" fill="#FFFFFF" stroke="${T.stroke}" stroke-width="1.3"/>`;
    if (n.role) {
      s += textBlock([varLabel(n)], cx, cy - (fs - 2) * 0.6, fs, lh, mono);
      s += textBlock([n.role], cx, cy + fs * 0.65, fs - 2, lh, sub);
    } else s += textBlock([varLabel(n)], cx, cy, fs, lh, mono);
  } else if (n.type === 'funktion') {
    const rx = Math.min(26, n.w / 6, n.h / 4);
    s += `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${r1(rx)}" fill="${T.fill}" stroke="${T.stroke}" stroke-width="1.6"/>`;
    const dl = n.desc ? wrapLines(n.desc, n.w - 30, fs - 1) : [];
    const subf = `font-family="${FONT_SANS}" font-size="${fs - 1}" text-anchor="middle" fill="#555555"`;
    const th = lines.length * lh, dh = dl.length * (lh - 1);
    // mit Variablen darin steht der Name oben, sonst mittig
    const top = hasChildren(n) ? n.y + 12 : cy - (th + dh) / 2;
    s += textBlock(lines, cx, top + th / 2, fs, lh, mono);
    if (dl.length) s += textBlock(dl, cx, top + th + 2 + dh / 2, fs - 1, lh - 1, subf);
  } else {
    s += `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="none" stroke="${T.stroke}" stroke-width="1.5" stroke-dasharray="7 5"/>`;
    s += `<text x="${n.x + 12}" y="${n.y + 8 + fs}" font-family="${FONT_SANS}" font-size="${fs - 1}" fill="#555555">${esc(lines[0] || '')}</text>`;
  }
  return s;
}
function headPoly(tip, from, K) {
  const dx = tip[0] - from[0], dy = tip[1] - from[1], l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l;
  const bx = tip[0] - ux * K.head, by = tip[1] - uy * K.head;
  return `<polygon points="${r1(tip[0])},${r1(tip[1])} ${r1(bx - uy * K.half)},${r1(by + ux * K.half)} ${r1(bx + uy * K.half)},${r1(by - ux * K.half)}" fill="${K.color}"/>`;
}
function shorten(p, q, by) {   // p um "by" in Richtung q verschieben
  const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
  const k = Math.min(by, l * 0.9) / l;
  return [p[0] + dx * k, p[1] + dy * k];
}
function arrowSVG(route, kind, label) {
  const K = ARROW_KINDS[kind] || ARROW_KINDS.uebergabe;
  const pts = route.map(p => p.slice()), n = pts.length;
  const tip = pts[n - 1].slice(), tail = pts[0].slice();
  pts[n - 1] = shorten(pts[n - 1], pts[n - 2], K.head - 1.5);
  if (K.both) pts[0] = shorten(pts[0], pts[1], K.head - 1.5);
  let s = `<polyline points="${pts.map(p => r1(p[0]) + ',' + r1(p[1])).join(' ')}" fill="none" stroke="${K.color}" stroke-width="${K.width}" stroke-linejoin="round"${K.dash ? ` stroke-dasharray="${K.dash}"` : ''}/>`;
  s += headPoly(tip, route[n - 2], K);
  if (K.both) s += headPoly(tail, route[1], K);
  if (K.dot) s += `<circle cx="${r1(tail[0])}" cy="${r1(tail[1])}" r="${K.dot}" fill="${K.color}"/>`;
  if (label) {
    const lp = labelPos(route), lines = String(label).split('\n'), fs = 12, lh = 15;
    const col = K.bold ? K.color : '#555555';
    const base = `font-family="${FONT_SANS}" font-size="${fs}" fill="${col}"${K.bold ? ' font-weight="bold"' : ''}`;
    // weiße Kontur, damit die Schrift auf Kästen und Linien lesbar bleibt
    const halo = ' stroke="#ffffff" stroke-width="3" stroke-linejoin="round" paint-order="stroke" stroke-opacity="0.85"';
    lines.forEach((l, i) => {
      if (lp.vertical) s += `<text x="${r1(lp.x + 9)}" y="${r1(lp.y - (lines.length - 1) * lh / 2 + i * lh + 4)}" text-anchor="start" ${base}${halo}>${esc(l)}</text>`;
      else s += `<text x="${r1(lp.x)}" y="${r1(lp.y - 8 - K.width / 2 - (lines.length - 1 - i) * lh)}" text-anchor="middle" ${base}${halo}>${esc(l)}</text>`;
    });
  }
  return s;
}
function labelBox(route, label) {
  const lp = labelPos(route), lines = String(label).split('\n');
  const w = Math.max(...lines.map(l => textW(l, 12, false, true))), h = lines.length * 15;
  return lp.vertical ? [lp.x + 9, lp.y - h / 2 - 4, lp.x + 9 + w, lp.y + h / 2 + 4]
                     : [lp.x - w / 2, lp.y - 12 - h, lp.x + w / 2, lp.y];
}

function redraw() {
  if (!stage) return;
  const W = stage.clientWidth, H = stage.clientHeight, z = view.z;
  let s = '';
  if (showGrid) {
    const g = gridSize * z;
    if (g >= 6) {
      const ox = ((view.x % g) + g) % g, oy = ((view.y % g) + g) % g;
      s += `<defs><pattern id="gridpat" width="${g}" height="${g}" patternUnits="userSpaceOnUse" x="${r1(ox)}" y="${r1(oy)}"><path d="M ${g} 0 L 0 0 0 ${g}" fill="none" stroke="#e6ebf2" stroke-width="1"/></pattern></defs><rect width="${W}" height="${H}" fill="url(#gridpat)"/>`;
    }
  }
  s += `<g transform="translate(${r1(view.x)} ${r1(view.y)}) scale(${z})">`;
  const order = drawOrder();
  const ring = (n, col, wd, dash) => `<rect x="${n.x - 5}" y="${n.y - 5}" width="${n.w + 10}" height="${n.h + 10}" rx="6" fill="none" stroke="${col}" stroke-width="${wd}"${dash ? ' stroke-dasharray="6 4"' : ''}/>`;
  order.forEach(n => {
    s += nodeSVG(n);
    const m = marks.nodes[n.id];
    if (m) s += ring(n, m === 'error' ? '#dc2626' : '#d97706', 2.5, false);
    if (selNodes.has(n.id)) s += ring(n, ACCENT, 1.6, true);
  });
  Object.values(arrows).forEach(a => {
    const route = arrowRoute(a);
    if (!route) return;
    const m = marks.arrows[a.id];
    const pl = route.map(p => r1(p[0]) + ',' + r1(p[1])).join(' ');
    if (m) s += `<polyline points="${pl}" fill="none" stroke="${m === 'error' ? '#dc2626' : '#d97706'}" stroke-width="9" stroke-opacity="0.3" stroke-linecap="round"/>`;
    if (selArrow === a.id) s += `<polyline points="${pl}" fill="none" stroke="${ACCENT}" stroke-width="9" stroke-opacity="0.25" stroke-linecap="round"/>`;
    s += arrowSVG(route, a.kind, a.label);
  });
  // Anfasser
  if (selNodes.size === 1 && !selArrow) {
    const n = nodes[[...selNodes][0]];
    if (n) s += `<rect x="${n.x + n.w - GRIP}" y="${n.y + n.h - GRIP}" width="${GRIP * 2}" height="${GRIP * 2}" fill="#fff" stroke="${ACCENT}" stroke-width="1.5"/>`;
  }
  if (selArrow && arrows[selArrow]) {
    const route = arrowRoute(arrows[selArrow]);
    if (route) {
      [route[0], route[route.length - 1]].forEach(p => { s += `<circle cx="${r1(p[0])}" cy="${r1(p[1])}" r="6" fill="#fff" stroke="${ACCENT}" stroke-width="2"/>`; });
      const mh = midHandle(route);
      if (mh) s += `<rect x="${r1(mh.x - 5)}" y="${r1(mh.y - 5)}" width="10" height="10" fill="${ACCENT}" stroke="#fff" stroke-width="1.5"/>`;
    }
  }
  if (hoverAnchor && nodes[hoverAnchor.id] && !drag) {
    const p = anchorPt(nodes[hoverAnchor.id], hoverAnchor);
    s += `<circle cx="${r1(p[0])}" cy="${r1(p[1])}" r="6" fill="${ACCENT}" stroke="#fff" stroke-width="1.5"/>`;
  }
  if (drag && drag.type === 'conn') {
    const sn = nodes[drag.src], p0 = anchorPt(sn, drag.sa);
    let route = [p0, [drag.x, drag.y]];
    if (drag.over) route = routeBetween(p0, drag.sa.side, anchorPt(nodes[drag.over.id], drag.over.a), drag.over.a.side);
    s += `<g opacity="0.75">${arrowSVG(route, drag.kind, '')}</g>`;
    if (drag.over) s += ring(nodes[drag.over.id], ACCENT, 1.6, true);
  }
  if (drag && drag.type === 'end' && drag.over) s += ring(nodes[drag.over.id], ACCENT, 1.6, true);
  if (drag && drag.type === 'band') {
    const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1);
    s += `<rect x="${x}" y="${y}" width="${Math.abs(drag.x1 - drag.x0)}" height="${Math.abs(drag.y1 - drag.y0)}" fill="${ACCENT}" fill-opacity="0.08" stroke="${ACCENT}" stroke-dasharray="5 4"/>`;
  }
  if (drag && drag.type === 'palette' && drag.wx != null) {
    const g = { id: -1, type: drag.ntype, text: NODE_TYPES[drag.ntype].text, x: 0, y: 0 };
    fitSize(g); g.x = snap(drag.wx - g.w / 2); g.y = snap(drag.wy - g.h / 2);
    s += `<g opacity="0.6">${nodeSVG(g)}</g>`;
  }
  s += '</g>';
  stage.innerHTML = s;
  updateUI();
}

// Eigenständiges SVG für Export und Einbettung
function buildSVG() {
  const list = drawOrder();
  if (!list.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (a, b, c, d) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); };
  list.forEach(n => grow(n.x, n.y, n.x + n.w, n.y + n.h));
  let body = list.map(nodeSVG).join('');
  Object.values(arrows).forEach(a => {
    const route = arrowRoute(a);
    if (!route) return;
    route.forEach(p => grow(p[0] - 8, p[1] - 8, p[0] + 8, p[1] + 8));
    if (a.label) grow(...labelBox(route, a.label));
    body += arrowSVG(route, a.kind, a.label);
  });
  const pad = 24, w = Math.ceil(x1 - x0 + 2 * pad), h = Math.ceil(y1 - y0 + 2 * pad);
  return { w, h, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${Math.floor(x0 - pad)} ${Math.floor(y0 - pad)} ${w} ${h}"><rect x="${Math.floor(x0 - pad)}" y="${Math.floor(y0 - pad)}" width="${w}" height="${h}" fill="#ffffff"/>${body}</svg>` };
}

// ════════════════════════════════════════════════════════════
// Treffer-Tests
// ════════════════════════════════════════════════════════════
function worldPt(e) {
  const r = stage.getBoundingClientRect();
  return [(e.clientX - r.left - view.x) / view.z, (e.clientY - r.top - view.y) / view.z];
}
function onBorder(n, x, y, tol) {
  const inner = Math.min(tol, n.w / 4, n.h / 4);
  return inside(n, x, y, tol) && !(x > n.x + inner && x < n.x + n.w - inner && y > n.y + inner && y < n.y + n.h - inner);
}
// Die Zone ist nur am Rand und an ihrer Beschriftung greifbar – sonst
// ließe sich in ihr kein Auswahlrahmen aufziehen.
function grabbable(n, x, y) {
  if (n.type !== 'zone') return inside(n, x, y);
  return onBorder(n, x, y, 8) || (inside(n, x, y) && y < n.y + 26);
}
function hitNode(x, y) {
  const order = drawOrder().reverse();
  return order.find(n => grabbable(n, x, y)) || null;
}
// Randzone des obersten Bausteins: dort beginnt ein Pfeil
function hitBorder(x, y, tol) {
  const order = drawOrder().reverse();
  for (const n of order) {
    if (n.type === 'zone') continue;
    if (onBorder(n, x, y, tol)) return n;
    if (inside(n, x, y)) return null;
  }
  return null;
}
// Zielbaustein beim Ziehen eines Pfeils
function hitTarget(x, y, exceptId) {
  const order = drawOrder().reverse();
  return order.find(n => n.type !== 'zone' && n.id !== exceptId && inside(n, x, y, 6)) || null;
}
function hitArrow(x, y) {
  let best = null, bd = 7 / Math.min(1, view.z);
  Object.values(arrows).forEach(a => {
    const route = arrowRoute(a);
    if (!route) return;
    for (let i = 0; i < route.length - 1; i++) {
      const d = distSeg(x, y, route[i][0], route[i][1], route[i + 1][0], route[i + 1][1]);
      if (d < bd) { bd = d; best = a; }
    }
    if (a.label) { const b = labelBox(route, a.label); if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]) best = best || a; }
  });
  return best;
}

// ════════════════════════════════════════════════════════════
// Bearbeiten
// ════════════════════════════════════════════════════════════
function statePayload() {
  return {
    format: FILE_FORMAT, version: 1, grid: gridSize,
    nodes: Object.values(nodes).map(n => {
      const o = { id: n.id, type: n.type, x: n.x, y: n.y, w: n.w, h: n.h, text: n.text };
      if (n.desc) o.desc = n.desc;
      if (n.role) o.role = n.role;
      if (n.list) o.list = true;
      if (n.fontSize) o.fontSize = n.fontSize;
      if (n.manual) o.manual = true;
      return o;
    }),
    arrows: Object.values(arrows).map(a => {
      const o = { id: a.id, src: a.src, tgt: a.tgt, kind: a.kind, label: a.label || '', sa: a.sa, ta: a.ta };
      if (a.mid != null) o.mid = a.mid;
      return o;
    }),
  };
}
function loadPayload(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.nodes)) throw new Error('Keine Datei des IBD Editors.');
  if (p.format && p.format !== FILE_FORMAT) throw new Error('Unbekanntes Dateiformat „' + p.format + '“.');
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
  const nn = {}, aa = {};
  let max = 0;
  p.nodes.forEach(o => {
    if (!o || !NODE_TYPES[o.type]) return;
    const id = num(o.id, 0);
    if (id <= 0 || nn[id]) return;
    const n = { id, type: o.type, x: num(o.x, 0), y: num(o.y, 0), w: Math.max(40, num(o.w, 120)), h: Math.max(30, num(o.h, 40)),
                text: String(o.text == null ? '' : o.text), desc: o.desc ? String(o.desc) : '', role: o.role ? String(o.role) : '',
                list: o.list === true, manual: o.manual === true };
    if (o.fontSize) n.fontSize = clamp(num(o.fontSize, FONT_SIZE), FONT_MIN, FONT_MAX);
    nn[id] = n; max = Math.max(max, id);
  });
  const okA = a => a && NORMAL[a.side] && typeof a.t === 'number';
  (p.arrows || []).forEach(o => {
    if (!o) return;
    const id = num(o.id, 0);
    if (id <= 0 || aa[id] || nn[id] || !nn[o.src] || !nn[o.tgt] || o.src === o.tgt) return;
    const a = { id, src: o.src, tgt: o.tgt, kind: ARROW_KINDS[o.kind] ? o.kind : 'uebergabe', label: String(o.label || ''),
                sa: okA(o.sa) ? { side: o.sa.side, t: clamp(o.sa.t, 0, 1) } : { side: 'r', t: 0.5 },
                ta: okA(o.ta) ? { side: o.ta.side, t: clamp(o.ta.t, 0, 1) } : { side: 'l', t: 0.5 } };
    if (typeof o.mid === 'number') a.mid = o.mid;
    aa[id] = a; max = Math.max(max, id);
  });
  nodes = nn; arrows = aa; nextId = max + 1;
  if (num(p.grid, 0) >= 5) { gridSize = p.grid; const g = byId('grid-size'); if (g) g.value = gridSize; }
  selNodes = new Set(); selArrow = null; clearMarks();
}
function pushUndo() {
  undoStack.push(JSON.stringify(statePayload()));
  if (undoStack.length > 80) undoStack.shift();
  redoStack = [];
  touch();
}
function touch() { dirty = true; embedChanged = true; clearMarks(); }
function clearMarks() { marks = { nodes: {}, arrows: {} }; }
function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(statePayload()));
  loadPayload(JSON.parse(undoStack.pop())); touch(); redraw();
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(statePayload()));
  loadPayload(JSON.parse(redoStack.pop())); touch(); redraw();
}

function addNode(type, cx, cy, props) {
  const n = Object.assign({ id: nextId++, type, x: 0, y: 0, w: 120, h: 40, text: NODE_TYPES[type].text, desc: '', role: '', list: false, manual: false }, props || {});
  if (type === 'zone') n.manual = true, n.w = n.w > 120 ? n.w : 440, n.h = n.h > 40 ? n.h : 260;
  else fitSize(n);
  n.x = snap(cx - n.w / 2); n.y = snap(cy - n.h / 2);
  nodes[n.id] = n;
  return n;
}
// Pfeiltyp, der zu zwei Bausteinen am besten passt
function autoKind(s, t) {
  if (s.type === 'bauteil' || t.type === 'bauteil') return 'signal';
  if (s.type === 'verarbeitung') return 'rueckgabe';
  if (s.type === 'funktion' && t.type !== 'funktion') return 'rueckgabe';
  return 'uebergabe';
}
function addArrow(src, sa, tgt, ta, kind, label) {
  const a = { id: nextId++, src, tgt, sa, ta, kind: kind || autoKind(nodes[src], nodes[tgt]), label: label || '' };
  arrows[a.id] = a;
  return a;
}
function removeNode(id) {
  delete nodes[id];
  Object.values(arrows).forEach(a => { if (a.src === id || a.tgt === id) delete arrows[a.id]; });
}
function deleteSelected() {
  if (!selNodes.size && !selArrow) return;
  pushUndo();
  selNodes.forEach(removeNode);
  if (selArrow) delete arrows[selArrow];
  selNodes = new Set(); selArrow = null;
  redraw();
}
function selectAll() { selNodes = new Set(Object.keys(nodes).map(Number)); selArrow = null; redraw(); }
function copySelection() {
  if (!selNodes.size) return;
  const ids = new Set(selNodes);
  // Inhalt markierter Funktionen/Zonen wandert mit
  [...ids].forEach(id => { if (isContainer(nodes[id])) contentsOf(nodes[id]).forEach(m => ids.add(m.id)); });
  clipboard = {
    nodes: [...ids].map(id => JSON.parse(JSON.stringify(nodes[id]))),
    arrows: Object.values(arrows).filter(a => ids.has(a.src) && ids.has(a.tgt)).map(a => JSON.parse(JSON.stringify(a))),
  };
  setStatus(`${clipboard.nodes.length} Baustein(e) kopiert`);
}
function pasteSelection() {
  if (!clipboard) return;
  pushUndo();
  const map = {};
  selNodes = new Set(); selArrow = null;
  clipboard.nodes.forEach(o => {
    const n = Object.assign({}, o, { id: nextId++, x: o.x + 2 * gridSize, y: o.y + 2 * gridSize });
    map[o.id] = n.id; nodes[n.id] = n; selNodes.add(n.id);
  });
  clipboard.arrows.forEach(o => {
    const a = Object.assign({}, o, { id: nextId++, src: map[o.src], tgt: map[o.tgt], sa: Object.assign({}, o.sa), ta: Object.assign({}, o.ta) });
    delete a.mid; arrows[a.id] = a;
  });
  clipboard.nodes.forEach(o => { o.x += 2 * gridSize; o.y += 2 * gridSize; });
  redraw();
}
function changeFontSize(delta) {
  if (!selNodes.size) { setStatus('Erst Bausteine markieren'); return; }
  pushUndo();
  selNodes.forEach(id => {
    const n = nodes[id];
    n.fontSize = clamp(fontOf(n) + delta, FONT_MIN, FONT_MAX);
    if (n.fontSize === FONT_SIZE) delete n.fontSize;
    fitSize(n);
  });
  redraw();
}
function autoSizeSelected() {
  if (!selNodes.size) { setStatus('Erst Bausteine markieren'); return; }
  pushUndo();
  selNodes.forEach(id => { const n = nodes[id]; if (n.type !== 'zone') { n.manual = false; fitSize(n); } });
  redraw();
}
function setArrowKind(a, kind) { pushUndo(); a.kind = kind; redraw(); setStatus('Pfeiltyp: ' + ARROW_KINDS[kind].name); }
function reverseArrow(a) {
  pushUndo();
  [a.src, a.tgt] = [a.tgt, a.src]; [a.sa, a.ta] = [a.ta, a.sa];
  redraw();
}

// ── Bearbeiten-Dialog ────────────────────────────────────────
let editCb = null;
function openEdit(title, fields, cb) {
  byId('edit-title').textContent = title;
  const box = byId('edit-fields');
  box.innerHTML = fields.map(f => {
    if (f.type === 'check') return `<label class="edit-check"><input type="checkbox" id="ef-${f.key}"${f.value ? ' checked' : ''}> ${esc(f.label)}</label>`;
    let inp;
    if (f.type === 'area') inp = `<textarea id="ef-${f.key}" rows="${f.rows || 2}" spellcheck="false" autocapitalize="off" autocomplete="off">${esc(f.value || '')}</textarea>`;
    else if (f.type === 'select') inp = `<select id="ef-${f.key}">${f.options.map(o => `<option value="${esc(o[0])}"${o[0] === f.value ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
    else inp = `<input type="text" id="ef-${f.key}" value="${esc(f.value || '')}" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off"${f.list ? ` list="ef-${f.key}-list"` : ''}>` +
               (f.list ? `<datalist id="ef-${f.key}-list">${f.list.map(o => `<option value="${esc(o)}">`).join('')}</datalist>` : '');
    return `<label class="edit-label" for="ef-${f.key}">${esc(f.label)}</label>${inp}${f.help ? `<div class="edit-help">${esc(f.help)}</div>` : ''}`;
  }).join('');
  editCb = () => {
    const out = {};
    fields.forEach(f => { const el = byId('ef-' + f.key); out[f.key] = f.type === 'check' ? el.checked : el.value; });
    cb(out);
  };
  byId('edit-modal').style.display = 'flex';
  const first = byId('ef-' + fields[0].key);
  setTimeout(() => { first.focus(); if (first.select) first.select(); }, 30);
}
function closeEdit(ok) {
  // Tastatur schließen; iOS schiebt die Seite beim Fokussieren nach oben
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  byId('edit-modal').style.display = 'none';
  window.scrollTo(0, 0);
  resetPointers();
  const cb = editCb; editCb = null;
  if (ok && cb) cb();
}
function editOpen() { return byId('edit-modal').style.display === 'flex'; }

function editNode(n) {
  const T = NODE_TYPES[n.type];
  let fields;
  if (n.type === 'variable') fields = [
    { key: 'text', label: 'Name der Variablen', value: n.text },
    { key: 'list', type: 'check', label: 'Liste – wird mit [ ] gekennzeichnet', value: n.list },
    { key: 'role', label: 'Rolle (optional)', value: n.role, list: ROLES, help: 'Prüfreihenfolge: Festwert? Zähler? Sammler? Merker? Sonst: Aktueller Wert.' },
  ];
  else if (n.type === 'funktion') fields = [
    { key: 'text', label: 'Name, z. B. messen() oder def messen()', value: n.text },
    { key: 'desc', type: 'area', rows: 3, label: 'Kurzbeschreibung (optional)', value: n.desc },
  ];
  else fields = [{ key: 'text', type: n.type === 'zone' ? 'text' : 'area', label: 'Beschriftung', value: n.text }];
  openEdit(T.name + ' bearbeiten', fields, v => {
    pushUndo();
    n.text = String(v.text).trim();
    if (n.type === 'variable') { n.list = !!v.list; n.role = String(v.role).trim(); n.text = n.text.replace(/\s*\[\s*\]\s*$/, m => { n.list = true; return ''; }); }
    if (n.type === 'funktion') n.desc = String(v.desc).trim();
    fitSize(n); redraw();
  });
}
function editArrow(a) {
  openEdit('Pfeil beschriften', [
    { key: 'label', type: 'area', label: 'Bedeutung und Einheit, z. B. Reaktionszeit in ms', value: a.label },
    { key: 'kind', type: 'select', label: 'Pfeiltyp', value: a.kind, options: KIND_ORDER.map(k => [k, ARROW_KINDS[k].name + ' – ' + ARROW_KINDS[k].hint]) },
  ], v => { pushUndo(); a.label = String(v.label).trim(); a.kind = v.kind; redraw(); });
}

// ════════════════════════════════════════════════════════════
// Fehlerprüfung
//
// Jede Regel hat eine ID, einen Schweregrad (error = Fehler, warning =
// Hinweis) und eine Meldung an die Schülerin/den Schüler. Die Gruppen
// folgen den vier Prüfregeln des Konzepts:
//   1  Jeder Pfeil hat Quelle und Ziel.
//   2  Was eine Verarbeitung benutzt, kommt als Pfeil an.
//   3  Was sie erzeugt oder verändert, verlässt sie als Pfeil.
//   4  Gestrichelt (globaler Zugriff) braucht eine Begründung.
// Dazu kommen die Darstellungskonvention (K) und Beschriftungen (B).
// evaluateDiagram ist eine reine Funktion und damit einzeln testbar.
// ════════════════════════════════════════════════════════════
const RULES = {
  I01: ['warning', 'K', 'Diagramm ist leer'],
  I02: ['error',   '1', 'Ergebnis einer Verarbeitung hat kein Ziel'],
  I03: ['warning', '1', 'Baustein ohne Pfeil'],
  I04: ['warning', '3', 'eigene Funktion: etwas kommt an, nichts geht hinaus'],
  I05: ['error',   '1', 'Rückgabewert mit falscher Quelle oder falschem Ziel'],
  I06: ['error',   '3', 'Wert aus einer Verarbeitung in eine Variable ohne Rückgabewert'],
  I10: ['error',   '2', 'Pfeil von Variable zu Variable über Funktionsgrenzen'],
  I11: ['error',   'K', 'Variable außerhalb einer eigenen Funktion'],
  I12: ['error',   'K', 'Bauteil in einer eigenen Funktion'],
  I13: ['error',   'K', 'Verarbeitung/Funktion in einer eigenen Funktion'],
  I14: ['warning', 'K', 'Baustein liegt auf einem Rand oder überdeckt einen anderen'],
  I15: ['error',   '3', 'veränderte Liste ohne Liste'],
  I16: ['error',   '3', 'veränderte Liste ohne Funktion'],
  I17: ['warning', '3', 'Rückgabewert bleibt in der eigenen Funktion'],
  I20: ['error',   'K', 'Bauteil mit falschem Pfeiltyp verbunden'],
  I21: ['error',   'K', 'Bauteil direkt mit Variable/Bauteil verbunden'],
  I22: ['error',   'K', 'Bauteilsignal ohne Bauteil'],
  I30: ['warning', '4', 'globaler Zugriff braucht eine Begründung'],
  I31: ['error',   '4', 'globaler Zugriff nicht zwischen Funktion und Variable'],
  I32: ['warning', '4', 'gestrichelter Pfeil unnötig'],
  I40: ['error',   'B', 'Baustein ohne Beschriftung'],
  I41: ['warning', 'B', 'Pfeil ohne Beschriftung'],
  I42: ['warning', 'B', 'Schreibweise „def“ uneinheitlich oder passt nicht zum Baustein'],
  I43: ['error',   'B', 'Funktionsname doppelt'],
  I44: ['error',   'B', 'Variablenname im selben Bereich doppelt'],
  I45: ['warning', 'B', 'ungültiger Variablenname'],
  I46: ['warning', 'B', 'Festwert nicht in Großbuchstaben'],
  I47: ['error',   'K', 'Festwert wird verändert'],
  I48: ['warning', 'K', 'doppelter Pfeil'],
  I49: ['warning', 'K', 'kein Hauptprogramm (main, setup/loop)'],
};

function evaluateDiagram(nodeMap, arrowMap) {
  const saved = nodes;
  nodes = nodeMap;            // scopeOf/enclosing arbeiten auf dem geprüften Diagramm
  try { return evaluateInner(Object.values(nodeMap), Object.values(arrowMap)); }
  finally { nodes = saved; }
}
function evaluateInner(N, A) {
  const out = [];
  const F = (rule, message, nodeIds, arrowIds) => out.push({ rule, severity: RULES[rule][0], group: RULES[rule][1], message, nodeIds: nodeIds || [], arrowIds: arrowIds || [] });
  const real = N.filter(n => n.type !== 'zone');
  if (!real.length) { F('I01', 'Das Diagramm ist noch leer. Ziehe Bausteine aus der linken Leiste auf die Fläche.'); return out; }

  const byNode = id => N.find(n => n.id === id);
  const scope = {}; N.forEach(n => { const s = scopeOf(n); scope[n.id] = s ? s.id : null; });
  const inc = {}, outg = {};
  N.forEach(n => { inc[n.id] = []; outg[n.id] = []; });
  A.forEach(a => { if (outg[a.src]) outg[a.src].push(a); if (inc[a.tgt]) inc[a.tgt].push(a); });
  const proc = n => n.type === 'verarbeitung' || n.type === 'funktion';
  const fname = n => (n.text || '').split('\n')[0].trim();
  const headName = n => { const h = fname(n).replace(/\(.*$/, '').trim();
    return /^haupt[\s-]*programm$/i.test(h) ? h : (h.split(/\s+/).pop() || ''); };
  const bare = n => headName(n);
  const isMain = n => n.type === 'funktion' &&
    (/^haupt[\s-]*programm$/i.test(String(n.text || '').replace(/\(.*$/s, '').trim())
     || /^(main|hauptprogramm|setup|loop)$/i.test(headName(n)));
  const isConst = n => n.type === 'variable' && (/^festwert$/i.test(n.role || '') || /^[A-ZÄÖÜ][A-ZÄÖÜ0-9_]*$/.test(n.text || ''));
  const funcs = real.filter(n => n.type === 'funktion');
  const varsIn = f => real.filter(v => v.type === 'variable' && scope[v.id] === f.id);

  // ── B: Beschriftungen ──
  real.forEach(n => { if (!fname(n)) F('I40', `Ein Baustein „${NODE_TYPES[n.type].name}“ hat keine Beschriftung. Doppelklick zum Beschriften.`, [n.id]); });
  const hasDef = n => /^def\s/.test(fname(n));
  if (funcs.some(hasDef))
    funcs.forEach(n => {
      if (fname(n) && !hasDef(n) && !isMain(n))
        F('I42', `Die eigene Funktion ${shortName(n)} ist ohne „def“ geschrieben, andere Funktionen im Diagramm mit. Einheitlich schreiben, z. B. „def ${bare(n).replace(/\s+/g, '_') || 'name'}()“.`, [n.id]);
    });
  real.filter(n => n.type === 'verarbeitung' && /^def\s/.test(fname(n))).forEach(n =>
    F('I42', `${shortName(n)} beginnt mit „def“, ist aber als fertige Verarbeitung (grau) gezeichnet. Eigene Funktionen sind blau.`, [n.id]));
  const seenF = {};
  funcs.forEach(n => { const k = bare(n); if (!k) return; (seenF[k] = seenF[k] || []).push(n.id); });
  Object.keys(seenF).forEach(k => { if (seenF[k].length > 1) F('I43', `Die eigene Funktion „${k}“ kommt ${seenF[k].length}-mal vor. Jede eigene Funktion wird nur einmal gezeichnet.`, seenF[k]); });
  const seenV = {};
  real.filter(n => n.type === 'variable' && n.text).forEach(n => { const k = scope[n.id] + '|' + n.text; (seenV[k] = seenV[k] || []).push(n); });
  Object.values(seenV).forEach(l => { if (l.length > 1) F('I44', `Die Variable „${l[0].text}“ steht mehrfach im selben Gültigkeitsbereich. Ein Name bezeichnet dort nur einen Kasten.`, l.map(n => n.id)); });
  real.filter(n => n.type === 'variable' && n.text && !/^[A-Za-z_ÄÖÜäöüß][A-Za-z0-9_ÄÖÜäöüß]*$/.test(n.text)).forEach(n =>
    F('I45', `„${n.text}“ ist kein gültiger Variablenname (nur Buchstaben, Ziffern und _, kein Leerzeichen).`, [n.id]));
  real.filter(n => n.type === 'variable' && /^festwert$/i.test(n.role || '') && n.text && n.text !== n.text.toUpperCase()).forEach(n =>
    F('I46', `Der Festwert „${n.text}“ sollte in Großbuchstaben geschrieben werden: ${n.text.toUpperCase()}.`, [n.id]));

  // ── K: Lage der Bausteine (Gültigkeitsbereiche) ──
  real.forEach(n => {
    const s = scope[n.id] && byNode(scope[n.id]);
    if (!s) return;
    if (n.type === 'bauteil') F('I12', `Das Bauteil ${shortName(n)} liegt in ${shortName(s)}. Bauteile gehören in die globale Zone, nicht in eine Funktion.`, [n.id, s.id]);
    if (proc(n)) F('I13', `${shortName(n)} liegt in ${shortName(s)}. Aufgerufenes steht neben dem Aufrufer, nie darin.`, [n.id, s.id]);
  });
  if (funcs.length) {
    real.filter(n => n.type === 'variable' && !scope[n.id] && !isConst(n)).forEach(n =>
      F('I11', `Die Variable ${shortName(n)} liegt in keiner eigenen Funktion. Global stehen nur Festwerte (GROSS geschrieben) und Bauteile.`, [n.id]));
    if (funcs.length > 1 && !funcs.some(isMain))
      F('I49', 'Es gibt eigene Funktionen, aber kein Hauptprogramm, das sie aufruft. Das Hauptprogramm steht ebenfalls in einer Funktion (Python: main(), Arduino: setup() und loop()).', []);
  }
  real.forEach(n => {
    if (n.type === 'funktion') return;
    N.filter(c => c.type === 'funktion' && c.id !== n.id && scope[n.id] !== c.id).forEach(c => {
      const ox = Math.min(n.x + n.w, c.x + c.w) - Math.max(n.x, c.x), oy = Math.min(n.y + n.h, c.y + c.h) - Math.max(n.y, c.y);
      if (ox > 2 && oy > 2) F('I14', `${shortName(n)} ragt in ${shortName(c)} hinein. Lege den Baustein eindeutig hinein oder daneben.`, [n.id, c.id]);
    });
  });
  for (let i = 0; i < real.length; i++) for (let j = i + 1; j < real.length; j++) {
    const a = real[i], b = real[j];
    if (a.type === 'funktion' || b.type === 'funktion') {
      if (!(a.type === 'funktion' && b.type === 'funktion')) continue;
    }
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ox > 2 && oy > 2 && scope[a.id] !== b.id && scope[b.id] !== a.id) F('I14', `${shortName(a)} und ${shortName(b)} überdecken sich.`, [a.id, b.id]);
  }

  // ── Pfeile ──
  const dup = {};
  A.forEach(a => {
    const s = byNode(a.src), t = byNode(a.tgt);
    if (!s || !t) return;
    const K = ARROW_KINDS[a.kind].name, ids = [s.id, t.id];
    const key = a.src + '>' + a.tgt + '>' + a.kind + '>' + (a.label || '');
    if (dup[key]) F('I48', `Zwischen ${shortName(s)} und ${shortName(t)} gibt es denselben Pfeil doppelt.`, ids, [a.id, dup[key]]); else dup[key] = a.id;

    const withPart = s.type === 'bauteil' || t.type === 'bauteil';
    if (withPart) {
      const other = s.type === 'bauteil' ? t : s;
      if (!proc(other)) { F('I21', `${shortName(s)} und ${shortName(t)} sind direkt verbunden. Ein Bauteil hängt immer an einer Verarbeitung – Bauteile sind keine Variablen.`, ids, [a.id]); return; }
      if (a.kind !== 'signal') F('I20', `Der Pfeil zwischen ${shortName(s)} und ${shortName(t)} ist ein „${K}“. Zu einem Bauteil führt ein Bauteilsignal (orange).`, ids, [a.id]);
    } else if (a.kind === 'signal') {
      F('I22', `Der orange Pfeil von ${shortName(s)} nach ${shortName(t)} ist ein Bauteilsignal, aber kein Bauteil ist beteiligt.`, ids, [a.id]);
    }
    if (!a.label && a.kind !== 'signal') F('I41', `Der Pfeil von ${shortName(s)} nach ${shortName(t)} hat keine Beschriftung. Jeder Pfeil trägt Bedeutung und Einheit.`, [], [a.id]);
    if (withPart) return;

    if (t.type === 'variable' && isConst(t) && a.kind !== 'global')
      F('I47', `In den Festwert ${shortName(t)} führt ein Pfeil. Ein Festwert ändert sich nie.`, [t.id], [a.id]);

    if (a.kind === 'rueckgabe') {
      if (!proc(s)) F('I05', `Der Rückgabewert beginnt an der Variablen ${shortName(s)}. Nur eine Verarbeitung oder Funktion gibt etwas zurück (Python: return).`, ids, [a.id]);
      else if (t.type === 'variable' && scope[t.id] === s.id) F('I17', `Der Rückgabewert von ${shortName(s)} landet in ${shortName(t)} – das ist eine Variable derselben Funktion. Ein Rückgabewert verlässt die Funktion.`, ids, [a.id]);
    }
    if (a.kind === 'uebergabe') {
      if (proc(s) && t.type === 'variable')
        F('I06', `Von ${shortName(s)} führt ein Übergabewert in die Variable ${shortName(t)}. Was eine Verarbeitung liefert, ist ein Rückgabewert (blau, Punkt = Rückgabe, in Python return).`, ids, [a.id]);
      if (s.type === 'variable' && t.type === 'variable' && scope[s.id] && scope[t.id] && scope[s.id] !== scope[t.id])
        F('I10', `Der Pfeil führt von ${shortName(s)} direkt zu ${shortName(t)} in einer anderen Funktion. Information wechselt die Funktion nur als Übergabewert hinein oder als Rückgabewert heraus.`, ids, [a.id]);
    }
    if (a.kind === 'global') {
      const f = s.type === 'funktion' ? s : t.type === 'funktion' ? t : null;
      const v = s.type === 'variable' ? s : t.type === 'variable' ? t : null;
      if (!f || !v) F('I31', `Ein gestrichelter Pfeil (globaler Zugriff) verbindet eine eigene Funktion mit einer Variablen – hier: ${shortName(s)} und ${shortName(t)}.`, ids, [a.id]);
      else if (isConst(v)) F('I32', `${shortName(v)} ist ein Festwert. Festwerte sind vom globalen Zugriff ausgenommen – ein normaler Pfeil genügt.`, ids, [a.id]);
      else if (scope[v.id] === f.id) F('I32', `${shortName(v)} liegt in ${shortName(f)} selbst. Dafür braucht es keinen globalen Zugriff.`, ids, [a.id]);
      else F('I30', `Globaler Zugriff von ${shortName(f)} auf ${shortName(v)}: Begründe, warum hier kein Übergabewert oder Rückgabewert möglich ist.`, ids, [a.id]);
    }
    if (a.kind === 'liste') {
      const vs = [s, t].filter(n => n.type === 'variable');
      vs.filter(v => !v.list).forEach(v => F('I15', `Der Doppelpfeil „veränderte Liste“ hängt an ${shortName(v)}, das ist keine Liste. Zahlen ändern sich nur über return.`, [v.id], [a.id]));
      if (!proc(s) && !proc(t)) F('I16', `Der Doppelpfeil zwischen ${shortName(s)} und ${shortName(t)} braucht eine Funktion, die die Liste verändert.`, ids, [a.id]);
    }
  });

  // ── 1/3: Informationsketten ──
  const touched = n => inc[n.id].length + outg[n.id].length;
  real.forEach(n => {
    if (n.type === 'verarbeitung') {
      if (!touched(n)) F('I03', `Die Verarbeitung ${shortName(n)} ist mit nichts verbunden.`, [n.id]);
      else if (!outg[n.id].length && !inc[n.id].some(a => a.kind === 'liste'))
        F('I02', `Was ${shortName(n)} liefert, hat kein Ziel. Ein Rückgabewert braucht eine Variable oder eine weitere Verarbeitung – oder ein Bauteil, auf das gewirkt wird.`, [n.id]);
    } else if (n.type === 'funktion') {
      const vs = varsIn(n), vt = vs.reduce((k, v) => k + touched(v), 0);
      if (!touched(n) && !vt) F('I03', `Die eigene Funktion ${shortName(n)} ist mit nichts verbunden.`, [n.id]);
      else if (!isMain(n)) {
        // hinein/hinaus zählt auch über die Variablen der Funktion
        const own = new Set([n.id].concat(vs.map(v => v.id)));
        const cross = A.filter(a => own.has(a.src) !== own.has(a.tgt));
        const comesIn = cross.some(a => own.has(a.tgt)), goesOut = cross.some(a => own.has(a.src) || a.kind === 'liste' || a.kind === 'global');
        if (comesIn && !goesOut)
          F('I04', `In ${shortName(n)} kommt Information an, aber nichts verlässt die Funktion: kein Rückgabewert, kein Bauteilsignal, keine veränderte Liste. Fehlt die Rückgabe (Python: return)?`, [n.id]);
      }
    } else if (!touched(n)) {
      F('I03', n.type === 'variable' ? `Die Variable ${shortName(n)} wird nie benutzt – kein Pfeil hinein, keiner heraus.` : `Das Bauteil ${shortName(n)} ist mit nichts verbunden.`, [n.id]);
    }
  });
  return out;
}

function checkDiagram() {
  const res = evaluateDiagram(nodes, arrows);
  clearMarks();
  res.slice().sort((a, b) => (a.severity === 'error') - (b.severity === 'error')).forEach(f => {
    f.nodeIds.forEach(id => { marks.nodes[id] = f.severity; });
    f.arrowIds.forEach(id => { marks.arrows[id] = f.severity; });
  });
  selNodes = new Set(); selArrow = null;
  redraw();
  const errs = res.filter(f => f.severity === 'error'), warns = res.filter(f => f.severity !== 'error');
  const grp = g => g === 'K' ? 'Konvention' : g === 'B' ? 'Beschriftung' : 'Prüfregel ' + g;
  const item = f => `<li class="${f.severity}"><span class="check-tag">${f.rule} · ${grp(f.group)}</span>${esc(f.message)}</li>`;
  let html;
  if (!res.length) html = '<p class="check-ok">Keine Auffälligkeiten gefunden. Prüfe trotzdem mit der Leitfrage: Wo kommt die Information her, wo geht sie hin?</p>';
  else html = (errs.length ? `<h3 class="check-h error">${errs.length} Fehler</h3><ul class="check-list">${errs.map(item).join('')}</ul>` : '') +
              (warns.length ? `<h3 class="check-h warning">${warns.length} Hinweis${warns.length > 1 ? 'e' : ''}</h3><ul class="check-list">${warns.map(item).join('')}</ul>` : '') +
              '<p class="check-foot">Die betroffenen Bausteine und Pfeile sind im Diagramm markiert (rot = Fehler, gelb = Hinweis).</p>';
  showModal('Diagramm prüfen', html, true);
  setStatus(res.length ? `${errs.length} Fehler, ${warns.length} Hinweise` : 'Prüfung ohne Befund');
  return res;
}

// ════════════════════════════════════════════════════════════
// Datei: Neu, Laden, Speichern, Export
// ════════════════════════════════════════════════════════════
function confirmDiscard() { return !Object.keys(nodes).length || !dirty || confirm('Das aktuelle Diagramm verwerfen?'); }
function newDiagram() {
  if (!confirmDiscard()) return;
  pushUndo();
  nodes = {}; arrows = {}; nextId = 1; selNodes = new Set(); selArrow = null; curFile = null;
  view = { x: 0, y: 0, z: 1 }; dirty = false;
  redraw(); setStatus('Neues Diagramm');
}
function baseName() { return (curFile || 'informationsfluss.json').replace(/\.json$/i, ''); }
function saveDiagram() {
  const blob = new Blob([JSON.stringify(statePayload(), null, 2)], { type: 'application/json' });
  downloadBlob(blob, baseName() + '.json');
  dirty = false; setStatus('Gespeichert');
}
function loadDiagram() {
  if (!confirmDiscard()) return;
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,application/json';
  inp.addEventListener('change', () => {
    const file = inp.files && inp.files[0];
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const p = JSON.parse(rd.result);
        if (p && Array.isArray(p.nodes) && p.nodes.some(n => n && n.templateLabel)) throw new Error('Das ist eine Datei des PAP Editors. Öffne sie dort.');
        const before = JSON.stringify(statePayload());
        loadPayload(p);
        undoStack.push(before); redoStack = [];
        curFile = file.name; dirty = false;
        fitView(); setStatus(file.name + ' geladen');
      } catch (err) { showModal('Laden fehlgeschlagen', esc(err.message || String(err)), true); }
    };
    rd.readAsText(file);
  });
  inp.click();
}
function exportSVG() {
  const r = buildSVG();
  if (!r) { setStatus('Nichts zu exportieren'); return; }
  downloadBlob(new Blob([r.svg], { type: 'image/svg+xml' }), baseName() + '.svg');
}
function exportRaster(mime, ext) {
  const r = buildSVG();
  if (!r) { setStatus('Nichts zu exportieren'); return; }
  const scale = Math.min(3, Math.max(1, 6000 / Math.max(r.w, r.h)));
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = Math.round(r.w * scale); c.height = Math.round(r.h * scale);
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    c.toBlob(b => { if (b) downloadBlob(b, baseName() + '.' + ext); else setStatus('Export fehlgeschlagen'); }, mime, 0.95);
  };
  img.onerror = () => setStatus('Export fehlgeschlagen');
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(r.svg);
}
function downloadBlob(blob, name) {
  // Eingebettet speichert auf Wunsch die einbettende Seite (siehe unten)
  if (EMBED && embedHostDownloads) {
    embedSend({ event: 'download', name, mime: blob.type || 'application/octet-stream', blob }, embedOrigin);
    setStatus(`${name} an die einbettende Seite übergeben`);
    return;
  }
  // Desktop-Version: nativer Speichern-Dialog
  if (window.pywebview && window.pywebview.api && window.pywebview.api.save_file) {
    const rd = new FileReader();
    rd.onload = () => {
      window.pywebview.api.save_file(name, String(rd.result).split(',')[1]).then(path => {
        if (path) { setStatus('Gespeichert: ' + path); if (/\.json$/i.test(name)) curFile = String(path).split(/[\\/]/).pop(); }
        else setStatus('Speichern abgebrochen');
      });
    };
    rd.readAsDataURL(blob);
    return;
  }
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  setStatus(name + ' gespeichert');
}

// ── Ansicht ──────────────────────────────────────────────────
function fitView() {
  const list = Object.values(nodes);
  if (!list.length || !stage) { view = { x: 0, y: 0, z: 1 }; redraw(); return; }
  const x0 = Math.min(...list.map(n => n.x)), y0 = Math.min(...list.map(n => n.y));
  const x1 = Math.max(...list.map(n => n.x + n.w)), y1 = Math.max(...list.map(n => n.y + n.h));
  const W = stage.clientWidth, H = stage.clientHeight;
  const z = clamp(Math.min((W - 80) / (x1 - x0), (H - 80) / (y1 - y0)), 0.3, 1);
  view = { z, x: (W - (x1 - x0) * z) / 2 - x0 * z, y: (H - (y1 - y0) * z) / 2 - y0 * z };
  redraw();
}
function zoomAt(factor, cx, cy) {
  const z = clamp(view.z * factor, 0.25, 3);
  if (cx == null) { cx = stage.clientWidth / 2; cy = stage.clientHeight / 2; }
  view.x = cx - (cx - view.x) * z / view.z; view.y = cy - (cy - view.y) * z / view.z; view.z = z;
  redraw();
}

// ── Beispiel: Reaktionszeittester ────────────────────────────
function exampleDiagram() {
  if (!confirmDiscard()) return;
  pushUndo();
  nodes = {}; arrows = {}; nextId = 1; selNodes = new Set(); selArrow = null; curFile = null;
  const put = (type, x, y, w, h, props) => { const n = addNode(type, 0, 0, Object.assign({ manual: true }, props)); n.x = x; n.y = y; n.w = w; n.h = h; return n; };
  const main = put('funktion', 40, 40, 340, 480, { text: 'def main()', desc: 'Hauptprogramm, zehn Runden' });
  const zeit = put('variable', 80, 110, 260, 60, { text: 'zeit', role: 'Aktueller Wert' });
  const zeiten = put('variable', 80, 320, 260, 60, { text: 'reaktionszeiten', list: true, role: 'Sammler' });
  const messen = put('funktion', 580, 40, 340, 180, { text: 'def reaktionszeit_messen()', desc: 'wartet zufällig, schaltet die LED, misst bis zum Tastendruck' });
  const median = put('funktion', 580, 300, 340, 100, { text: 'def median()', desc: 'sortiert eine Kopie, wählt die Mitte' });
  const print = put('verarbeitung', 640, 460, 160, 60, { text: 'print()' });
  const led = put('bauteil', 1080, 40, 160, 60, { text: 'LED' });
  const taster = put('bauteil', 1080, 160, 160, 60, { text: 'Taster' });
  const konsole = put('bauteil', 920, 460, 160, 60, { text: 'Konsole' });
  const link = (s, ss, st, t, ts, kind, label) => {
    const p = anchorPt(s, { side: ss, t: st });
    const horiz = ts === 'l' || ts === 'r';
    const tt = clamp(((horiz ? p[1] - t.y : p[0] - t.x)) / (horiz ? t.h : t.w), 0.08, 0.92);
    return addArrow(s.id, { side: ss, t: st }, t.id, { side: ts, t: tt }, kind, label);
  };
  link(messen, 'l', 0.56, zeit, 'r', 'rueckgabe', 'Reaktionszeit in ms');
  link(zeit, 'b', 0.5, zeiten, 't', 'uebergabe', 'append()');
  link(zeiten, 'r', 0.5, median, 'l', 'uebergabe', 'alle Runden [ ]');
  link(median, 'b', 0.41, print, 't', 'rueckgabe', 'Median in ms');
  link(print, 'r', 0.5, konsole, 'l', 'signal', '');
  link(messen, 'r', 0.17, led, 'l', 'signal', 'Startsignal');
  link(taster, 'l', 0.5, messen, 'r', 'signal', 'gedrückt');
  dirty = false;
  fitView(); setStatus('Beispiel: Reaktionszeittester');
}

// ════════════════════════════════════════════════════════════
// Zeiger-Bedienung (Maus, Stift, Finger)
// ════════════════════════════════════════════════════════════
const pointers = new Map();
let pinch = null, lastTap = { t: 0, x: 0, y: 0 }, longPress = null, spaceDown = false;

function gripHit(x, y) {
  if (selNodes.size !== 1 || selArrow) return null;
  const n = nodes[[...selNodes][0]];
  const tol = GRIP + 3;
  return n && Math.abs(x - n.x - n.w) <= tol && Math.abs(y - n.y - n.h) <= tol ? n : null;
}
function arrowHandleHit(x, y) {
  const a = selArrow && arrows[selArrow];
  if (!a) return null;
  const route = arrowRoute(a);
  if (!route) return null;
  const near = p => Math.hypot(x - p[0], y - p[1]) <= 9;
  if (near(route[route.length - 1])) return 't';
  if (near(route[0])) return 's';
  const mh = midHandle(route);
  if (mh && near([mh.x, mh.y])) return 'm';
  return null;
}

// Vergessene Zeiger zurücksetzen. iPad/Safari liefert nicht immer ein
// pointerup – z. B. wenn ein Doppeltipp den Textdialog öffnet und die
// Bildschirmtastatur erscheint. Ein übrig gebliebener Zeiger ließ jede
// weitere Berührung als zweiten Finger (Zoomen) gelten.
function resetPointers() {
  pointers.clear(); pinch = null; drag = null; spaceDown = false;
  cancelLongPress();
}

function pointerDown(e) {
  closeCtxMenu();
  if (e.pointerType === 'mouse' && e.button === 2) return;   // Kontextmenü
  // primär = erster Finger auf dem Glas: alle gemerkten Zeiger sind veraltet
  if (e.isPrimary) { pointers.clear(); pinch = null; }
  stage.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {           // zwei Finger: verschieben und zoomen
    cancelLongPress();
    drag = null;
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    return;
  }
  const [x, y] = worldPt(e);
  if ((e.pointerType === 'mouse' && e.button === 1) || spaceDown) { drag = { type: 'pan', cx: e.clientX, cy: e.clientY, vx: view.x, vy: view.y }; return; }

  // Doppeltipp/Doppelklick
  const now = Date.now();
  if (now - lastTap.t < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 14) {
    lastTap.t = 0;
    // öffnet ggf. den Textdialog – das zugehörige pointerup kommt dann evtl. nie
    pointers.delete(e.pointerId);
    if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    dblClick(x, y); return;
  }
  lastTap = { t: now, x: e.clientX, y: e.clientY };
  if (e.pointerType !== 'mouse') startLongPress(e.clientX, e.clientY, x, y);

  const g = gripHit(x, y);
  if (g) { drag = { type: 'resize', id: g.id, moved: false }; return; }
  const h = arrowHandleHit(x, y);
  if (h === 'm') { drag = { type: 'mid', aid: selArrow, moved: false }; return; }
  if (h) { drag = { type: 'end', aid: selArrow, which: h, moved: false, over: null }; return; }

  const tol = e.pointerType === 'mouse' ? BORDER_TOL : BORDER_TOL + 4;
  const bn = hitBorder(x, y, tol);
  const arr = hitArrow(x, y);
  if (arr && !(bn && e.pointerType === 'mouse' && hoverAnchor)) {
    selArrow = arr.id; selNodes = new Set(); drag = { type: 'none' }; redraw(); return;
  }
  if (bn) {
    const sa = anchorAt(bn, x, y);
    drag = { type: 'conn', src: bn.id, sa, x, y, over: null, kind: defaultKind === 'auto' ? 'uebergabe' : defaultKind, moved: false, sx: x, sy: y };
    hoverAnchor = null; redraw(); return;
  }
  const n = hitNode(x, y);
  if (n) {
    selArrow = null;
    if (e.shiftKey) { if (selNodes.has(n.id)) selNodes.delete(n.id); else selNodes.add(n.id); }
    else if (!selNodes.has(n.id)) selNodes = new Set([n.id]);
    const ids = new Set(selNodes);
    [...ids].forEach(id => { if (nodes[id] && isContainer(nodes[id])) contentsOf(nodes[id]).forEach(m => ids.add(m.id)); });
    drag = { type: 'move', sx: x, sy: y, moved: false, start: [...ids].map(id => ({ id, x: nodes[id].x, y: nodes[id].y })), anchor: n.id };
    redraw(); return;
  }
  if (!e.shiftKey) { selNodes = new Set(); selArrow = null; }
  drag = e.pointerType === 'mouse' ? { type: 'band', x0: x, y0: y, x1: x, y1: y } : { type: 'pan', cx: e.clientX, cy: e.clientY, vx: view.x, vy: view.y };
  redraw();
}

function pointerMove(e) {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const r = stage.getBoundingClientRect();
    view.x += cx - pinch.cx; view.y += cy - pinch.cy;
    if (pinch.d > 0) zoomAt(d / pinch.d, cx - r.left, cy - r.top); else redraw();
    pinch = { d, cx, cy };
    return;
  }
  const [x, y] = worldPt(e);
  if (!drag) {
    if (e.pointerType !== 'mouse') return;
    const bn = gripHit(x, y) || arrowHandleHit(x, y) ? null : hitBorder(x, y, BORDER_TOL);
    const prev = hoverAnchor;
    hoverAnchor = bn ? Object.assign({ id: bn.id }, anchorAt(bn, x, y)) : null;
    stage.style.cursor = gripHit(x, y) ? 'nwse-resize' : hoverAnchor ? 'crosshair' : (hitNode(x, y) || arrowHandleHit(x, y)) ? 'move' : hitArrow(x, y) ? 'pointer' : 'default';
    if (JSON.stringify(prev) !== JSON.stringify(hoverAnchor)) redraw();
    return;
  }
  if (longPress && Math.hypot(e.clientX - longPress.cx, e.clientY - longPress.cy) > 8) cancelLongPress();
  if (drag.type === 'pan') { view.x = drag.vx + e.clientX - drag.cx; view.y = drag.vy + e.clientY - drag.cy; redraw(); return; }
  if (drag.type === 'band') { drag.x1 = x; drag.y1 = y; redraw(); return; }
  if (drag.type === 'move') {
    const dx = x - drag.sx, dy = y - drag.sy;
    if (!drag.moved) { if (Math.hypot(dx, dy) * view.z < 4) return; drag.moved = true; pushUndo(); }
    const an = drag.start.find(s => s.id === drag.anchor);
    const sdx = snap(an.x + dx) - an.x, sdy = snap(an.y + dy) - an.y;
    drag.start.forEach(s => { nodes[s.id].x = s.x + sdx; nodes[s.id].y = s.y + sdy; });
    redraw(); return;
  }
  if (drag.type === 'resize') {
    const n = nodes[drag.id];
    if (!drag.moved) { drag.moved = true; pushUndo(); }
    n.manual = true;
    n.w = Math.max(60, snap(x - n.x)); n.h = Math.max(40, snap(y - n.y));
    redraw(); return;
  }
  if (drag.type === 'mid') {
    const a = arrows[drag.aid], mh = midHandle(arrowRoute(a));
    if (!mh) return;
    if (!drag.moved) { drag.moved = true; pushUndo(); }
    a.mid = Math.round((mh.vertical ? x : y) / 10) * 10;
    redraw(); return;
  }
  if (drag.type === 'conn') {
    drag.x = x; drag.y = y;
    if (Math.hypot(x - drag.sx, y - drag.sy) * view.z > 5) drag.moved = true;
    const t = hitTarget(x, y, drag.src);
    const p0 = anchorPt(nodes[drag.src], drag.sa);
    drag.over = t ? { id: t.id, a: targetAnchor(t, p0[0], p0[1], x, y, onBorder(t, x, y, BORDER_TOL + 2)) } : null;
    drag.kind = defaultKind !== 'auto' ? defaultKind : t ? autoKind(nodes[drag.src], t) : 'uebergabe';
    redraw(); return;
  }
  if (drag.type === 'end') {
    const a = arrows[drag.aid];
    if (!drag.moved) { drag.moved = true; pushUndo(); }
    const otherId = drag.which === 's' ? a.tgt : a.src;
    const other = nodes[otherId], oa = drag.which === 's' ? a.ta : a.sa, op = anchorPt(other, oa);
    const t = hitTarget(x, y, otherId);
    drag.over = t ? { id: t.id } : null;
    if (t) {
      const an = targetAnchor(t, op[0], op[1], x, y, onBorder(t, x, y, BORDER_TOL + 2));
      if (drag.which === 's') { a.src = t.id; a.sa = an; } else { a.tgt = t.id; a.ta = an; }
      delete a.mid;
    }
    redraw(); return;
  }
}

function pointerUp(e) {
  pointers.delete(e.pointerId);
  cancelLongPress();
  if (pinch) { if (pointers.size < 2) pinch = null; drag = null; return; }
  const d = drag; drag = null;
  if (!d) return;
  if (d.type === 'band') {
    const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
    if (x1 - x0 > 3 || y1 - y0 > 3) Object.values(nodes).forEach(n => { if (n.x >= x0 && n.x + n.w <= x1 && n.y >= y0 && n.y + n.h <= y1) selNodes.add(n.id); });
  } else if (d.type === 'conn') {
    if (d.over) {
      pushUndo();
      const a = addArrow(d.src, d.sa, d.over.id, d.over.a, d.kind);
      selArrow = a.id; selNodes = new Set();
      setStatus(`${ARROW_KINDS[a.kind].name} gezeichnet – Doppelklick zum Beschriften`);
    } else if (!d.moved) {      // nur geklickt: Baustein markieren
      selNodes = new Set([d.src]); selArrow = null;
    }
  }
  redraw();
}

function dblClick(x, y) {
  cancelLongPress();
  const a = hitArrow(x, y), n = hitNode(x, y);
  if (a && !(n && n.type !== 'funktion' && n.type !== 'zone')) { selArrow = a.id; selNodes = new Set(); redraw(); editArrow(a); return; }
  if (n) { selNodes = new Set([n.id]); selArrow = null; redraw(); editNode(n); }
}

// ── Kontextmenü ──────────────────────────────────────────────
let ctxMenuEl = null;
function closeCtxMenu() { if (ctxMenuEl) { ctxMenuEl.remove(); ctxMenuEl = null; } }
function showCtxMenu(cx, cy, items) {
  closeCtxMenu();
  const m = document.createElement('div');
  m.id = 'ctx-menu';
  items.forEach(it => {
    if (it === '-') { const hr = document.createElement('div'); hr.className = 'ctx-sep'; m.appendChild(hr); return; }
    const b = document.createElement('button');
    b.className = 'ctx-item' + (it.danger ? ' danger' : '') + (it.active ? ' active' : '');
    b.textContent = it.label;
    b.addEventListener('click', () => { closeCtxMenu(); it.fn(); });
    m.appendChild(b);
  });
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(4, Math.min(cx, window.innerWidth - r.width - 6)) + 'px';
  m.style.top = Math.max(4, Math.min(cy, window.innerHeight - r.height - 6)) + 'px';
  ctxMenuEl = m;
}
function contextAt(cx, cy, x, y) {
  const a = hitArrow(x, y), n = hitNode(x, y);
  if (a && !(n && !isContainer(n))) {
    selArrow = a.id; selNodes = new Set(); redraw();
    const items = KIND_ORDER.map(k => ({ label: (a.kind === k ? '● ' : '○ ') + ARROW_KINDS[k].name, active: a.kind === k, fn: () => setArrowKind(a, k) }));
    showCtxMenu(cx, cy, items.concat(['-',
      { label: 'Beschriften …', fn: () => editArrow(a) },
      { label: 'Richtung umkehren', fn: () => reverseArrow(a) },
      { label: 'Pfeil löschen', danger: true, fn: deleteSelected }]));
    return;
  }
  if (n) {
    if (!selNodes.has(n.id)) selNodes = new Set([n.id]);
    selArrow = null; redraw();
    showCtxMenu(cx, cy, [
      { label: 'Bearbeiten …', fn: () => editNode(n) },
      { label: 'Duplizieren', fn: () => { copySelection(); pasteSelection(); } },
      { label: 'Größe automatisch', fn: autoSizeSelected },
      '-',
      { label: selNodes.size > 1 ? 'Auswahl löschen' : 'Baustein löschen', danger: true, fn: deleteSelected }]);
  }
}
function startLongPress(cx, cy, x, y) {
  cancelLongPress();
  longPress = { cx, cy, timer: setTimeout(() => { longPress = null; drag = null; contextAt(cx, cy, x, y); }, 600) };
}
function cancelLongPress() { if (longPress) { clearTimeout(longPress.timer); longPress = null; } }

// ════════════════════════════════════════════════════════════
// Seitenleiste
// ════════════════════════════════════════════════════════════
function buildPalette() {
  const pal = byId('palette');
  pal.innerHTML = '';
  NODE_ORDER.forEach(type => {
    const T = NODE_TYPES[type];
    const g = { id: -1, type, text: type === 'zone' ? '' : type === 'bauteil' ? 'Bauteil' : type === 'funktion' ? 'eigene\nFunktion' : type === 'verarbeitung' ? 'Funktion' : 'wert', x: 2, y: 2, w: 66, h: 30, manual: true, fontSize: 10 };
    const card = document.createElement('div');
    card.className = 'palette-card';
    card.innerHTML = `<svg class="palette-shape" width="70" height="34" viewBox="0 0 70 34">${nodeSVG(g)}</svg><div class="palette-text"><div class="palette-name">${esc(T.name)}</div><div class="palette-hint">${esc(T.hint)}</div></div>`;
    card.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      card.setPointerCapture(e.pointerId);
      drag = { type: 'palette', ntype: type, wx: null, wy: null, t: Date.now(), cx: e.clientX, cy: e.clientY };
    });
    card.addEventListener('pointermove', e => {
      if (!drag || drag.type !== 'palette') return;
      const r = stage.getBoundingClientRect();
      const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      [drag.wx, drag.wy] = over ? worldPt(e) : [null, null];
      redraw();
    });
    const drop = e => {
      if (!drag || drag.type !== 'palette') return;
      const d = drag; drag = null;
      const quick = Date.now() - d.t < 400 && Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < 6;
      if (d.wx != null) placeNew(type, d.wx, d.wy);
      else if (quick) {          // angetippt: in die Mitte der Fläche legen
        const off = (Object.keys(nodes).length % 6) * 20;
        placeNew(type, (stage.clientWidth / 2 - view.x) / view.z + off, (stage.clientHeight / 2 - view.y) / view.z + off);
      } else redraw();
    };
    card.addEventListener('pointerup', drop);
    card.addEventListener('pointercancel', () => { drag = null; redraw(); });
    pal.appendChild(card);
  });

  const kp = byId('kinds');
  kp.innerHTML = '';
  const mk = (key, name, hint, icon) => {
    const b = document.createElement('button');
    b.className = 'kind-card'; b.dataset.kind = key;
    b.innerHTML = `<svg width="56" height="18" viewBox="0 0 56 18">${icon}</svg><span><b>${esc(name)}</b><i>${esc(hint)}</i></span>`;
    b.addEventListener('click', () => {
      if (selArrow && arrows[selArrow] && key !== 'auto') { setArrowKind(arrows[selArrow], key); return; }
      defaultKind = key; updateUI();
      setStatus(key === 'auto' ? 'Pfeiltyp wird automatisch gewählt' : 'Neue Pfeile: ' + name);
    });
    kp.appendChild(b);
  };
  mk('auto', 'Automatisch', 'passend zu den Bausteinen', '<text x="28" y="13" text-anchor="middle" font-size="11" font-family="Helvetica,Arial,sans-serif" fill="#cbd5e1">auto</text>');
  KIND_ORDER.forEach(k => mk(k, ARROW_KINDS[k].name, ARROW_KINDS[k].hint,
    `<rect width="56" height="18" rx="4" fill="#f8fafc"/>` + arrowSVG([[k === 'liste' ? 5 : 8, 9], [51, 9]], k, '')));
}
function placeNew(type, wx, wy) {
  pushUndo();
  const n = addNode(type, wx, wy);
  selNodes = new Set([n.id]); selArrow = null;
  redraw();
  setStatus(NODE_TYPES[type].name + ' eingefügt – Doppelklick zum Beschriften');
}
function updateUI() {
  const del = byId('btn-delete');
  if (del) del.disabled = !selNodes.size && !selArrow;
  const active = selArrow && arrows[selArrow] ? arrows[selArrow].kind : defaultKind;
  document.querySelectorAll('.kind-card').forEach(b => b.classList.toggle('active', b.dataset.kind === active));
  const z = byId('zoom-label'); if (z) z.textContent = Math.round(view.z * 100) + ' %';
}

// ── Dialoge ──────────────────────────────────────────────────
function showModal(title, body, html) {
  byId('modal-title').textContent = title;
  const el = byId('modal-body');
  if (html) el.innerHTML = body; else el.textContent = body;
  byId('modal').style.display = 'flex';
}
function showHelp() {
  const leg = byId('legend');
  if (leg && !leg.innerHTML) {
    const demo = { bauteil: 'LED', verarbeitung: 'f()', funktion: 'messen()', variable: 'wert' };
    const text = {
      bauteil: 'Informationsquelle (Taster, Sensor) oder -ziel (LED, Display, Konsole).',
      verarbeitung: 'Fertige Funktion, Methode oder Operation (z. B. > 2000). Aufgerufenes steht neben dem Aufrufer, nie darin.',
      funktion: 'Selbst geschrieben (Python: def, C/Java: Typ und Name, JavaScript: function). Nur sie ist ein Gültigkeitsbereich: Nur in ihr stehen Variablen.',
      variable: 'Ein abgelegter Wert. Name und optional Rolle im Kasten; Listen mit [ ].',
      uebergabe: 'Jede Information, die eine Verarbeitung benutzt, kommt als Pfeil an.',
      rueckgabe: 'Punkt am Anfang = Rückgabe (Python: return). Braucht ein Ziel: eine Variable oder eine weitere Verarbeitung.',
      signal: 'Direkt zwischen Bauteil und Verarbeitung. Bauteile sind keine Variablen.',
      global: 'Zwischen eigener Funktion und Variable, an Übergabe und Rückgabe vorbei. Braucht eine Begründung.',
      liste: 'Eine Funktion verändert eine übergebene Liste, auch ohne Rückgabe.',
    };
    let h = '';
    Object.keys(demo).forEach(t => {
      const g = { id: -1, type: t, text: demo[t], x: 2, y: 2, w: 84, h: 30, manual: true, fontSize: 11 };
      h += `<tr><td><svg width="88" height="34">${nodeSVG(g)}</svg></td><td><b>${esc(NODE_TYPES[t].name)}</b><br>${esc(text[t])}</td></tr>`;
    });
    KIND_ORDER.forEach(k => {
      h += `<tr><td><svg width="88" height="20">${arrowSVG([[k === 'liste' ? 4 : 8, 10], [84, 10]], k, '')}</svg></td><td><b>${esc(ARROW_KINDS[k].name)}</b><br>${esc(text[k])}</td></tr>`;
    });
    leg.innerHTML = h;
  }
  byId('help-modal').style.display = 'flex';
}
function closeHelp() { byId('help-modal').style.display = 'none'; }
function anyModalOpen() { return ['modal', 'help-modal', 'edit-modal', 'download-modal'].some(id => byId(id).style.display === 'flex'); }

// Desktop-Pakete: neuestes Release bei GitHub, sonst der Ordner downloads/
const DOWNLOADS = [
  ['macOS',   'IBD-Editor.dmg',                 'Apple Silicon & Intel · .dmg'],
  ['Windows', 'IBD-Editor-Setup.exe',           'Installer · .exe'],
  ['Linux',   'IBD-Editor-x86_64.AppImage',     'ausführbar machen & starten · AppImage'],
  ['Linux',   'IBD-Editor-linux-x86_64.tar.gz', 'nutzt GTK/WebKit des Systems · .tar.gz'],
];
function showDownloads() {
  const list = byId('download-list'), ver = byId('download-version');
  const row = (os, href, meta, missing) => `<a class="download-item${missing ? ' missing' : ''}" ${href ? `href="${esc(href)}"` : ''} download><span class="download-os">${esc(os)}</span><span class="download-meta">${esc(meta)}</span></a>`;
  list.innerHTML = DOWNLOADS.map(d => row(d[0], 'downloads/' + d[1], d[2], false)).join('');
  ver.textContent = '';
  byId('download-modal').style.display = 'flex';
  if (!GITHUB_REPO) return;
  ver.textContent = 'Suche das neueste Release …';
  fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
    .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then(rel => {
      ver.textContent = 'Version ' + (rel.tag_name || '');
      list.innerHTML = DOWNLOADS.map(d => {
        const as = (rel.assets || []).find(x => x.name === d[1]);
        return as ? row(d[0], as.browser_download_url, d[2] + ' · ' + (as.size / 1048576).toFixed(1) + ' MB', false) : row(d[0], '', 'noch nicht verfügbar', true);
      }).join('');
    })
    .catch(() => { ver.textContent = ''; });
}

// ════════════════════════════════════════════════════════════
// Einbettung in andere Apps (?embed=1) – wie beim PAP Editor
//
// Protokoll (window.postMessage, alle Nachrichten sind Objekte):
//   Editor -> Host:  {source:'ibd-editor', event:'ready'}
//   Host -> Editor:  {target:'ibd-editor', action:'load', diagram:<JSON wie "Speichern"|null>, title?, downloads?:true}
//   Editor -> Host:  {source:'ibd-editor', event:'save', diagram:<JSON>, svg:<SVG-Text>}
//   Editor -> Host:  {source:'ibd-editor', event:'exit'}
//   Editor -> Host:  {source:'ibd-editor', event:'download', name, mime, blob:<Blob>}
// Der Editor nimmt nur Nachrichten seines Eltern-Fensters an und antwortet
// ausschließlich an dessen Origin (aus der load-Nachricht).
// ════════════════════════════════════════════════════════════
const PARAMS = new URLSearchParams(location.search);
const EMBED = PARAMS.get('embed') === '1' && window.parent !== window;
const DESKTOP = PARAMS.get('desktop') === '1';
let embedOrigin = null, embedChanged = false, embedHostDownloads = false;

function embedSend(msg, origin) { window.parent.postMessage(Object.assign({ source: 'ibd-editor' }, msg), origin); }
function embedLoad(msg) {
  nodes = {}; arrows = {}; nextId = 1;
  if (msg.diagram && typeof msg.diagram === 'object') {
    try { loadPayload(msg.diagram); }
    catch (err) { alert('Das gespeicherte Diagramm konnte nicht geladen werden: ' + err.message); nodes = {}; arrows = {}; }
  }
  curFile = typeof msg.title === 'string' && msg.title ? msg.title.replace(/[^\w\-äöüÄÖÜß ]+/g, '_') + '.json' : null;
  selNodes = new Set(); selArrow = null; undoStack = []; redoStack = [];
  embedChanged = false; dirty = false;
  fitView(); setStatus('Diagramm geladen');
}
function embedSave() {
  if (!embedOrigin) { alert('Keine Verbindung zur einbettenden Seite.'); return; }
  const r = buildSVG();
  embedSend({ event: 'save', diagram: statePayload(), svg: r ? r.svg : '' }, embedOrigin);
  embedChanged = false; dirty = false;
  setStatus('An das Projekt übergeben …');
}
function embedExit() {
  if (embedChanged && !confirm('Nicht übernommene Änderungen verwerfen?')) return;
  if (embedOrigin) embedSend({ event: 'exit' }, embedOrigin);
}
function initEmbed() {
  if (!EMBED) return;
  document.body.classList.add('embed');
  const menubar = byId('menubar');
  const close = document.createElement('button');
  close.id = 'btn-embed-exit'; close.className = 'btn-menu'; close.textContent = 'Schließen';
  close.addEventListener('click', embedExit);
  const save = document.createElement('button');
  save.id = 'btn-embed-save'; save.className = 'btn-menu btn-accent'; save.textContent = 'In Projekt übernehmen';
  save.addEventListener('click', embedSave);
  menubar.prepend(close); menubar.prepend(save);
  window.addEventListener('message', e => {
    if (e.source !== window.parent) return;
    const m = e.data;
    if (!m || typeof m !== 'object' || m.target !== 'ibd-editor') return;
    if (m.action === 'load') { embedOrigin = e.origin; embedHostDownloads = m.downloads === true; embedLoad(m); }
  });
  embedSend({ event: 'ready' }, '*');   // enthält keine Daten
}

// ════════════════════════════════════════════════════════════
// Start
// ════════════════════════════════════════════════════════════
function init() {
  stage = byId('stage');
  buildPalette();
  stage.addEventListener('pointerdown', pointerDown);
  stage.addEventListener('pointermove', pointerMove);
  stage.addEventListener('pointerup', pointerUp);
  stage.addEventListener('pointercancel', pointerUp);
  stage.addEventListener('lostpointercapture', e => pointers.delete(e.pointerId));
  window.addEventListener('blur', resetPointers);
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetPointers(); });
  stage.addEventListener('pointerleave', () => { if (!drag && hoverAnchor) { hoverAnchor = null; redraw(); } });
  stage.addEventListener('contextmenu', e => { e.preventDefault(); const [x, y] = worldPt(e); contextAt(e.clientX, e.clientY, x, y); });
  stage.addEventListener('wheel', e => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    else { view.x -= e.shiftKey ? e.deltaY : e.deltaX; view.y -= e.shiftKey ? 0 : e.deltaY; redraw(); }
  }, { passive: false });
  window.addEventListener('resize', redraw);
  document.addEventListener('pointerdown', e => { if (ctxMenuEl && !ctxMenuEl.contains(e.target)) closeCtxMenu(); }, true);

  on('btn-check', 'click', checkDiagram);
  on('btn-new', 'click', newDiagram);
  on('btn-load', 'click', loadDiagram);
  on('btn-save', 'click', saveDiagram);
  on('btn-png', 'click', () => exportRaster('image/png', 'png'));
  on('btn-jpg', 'click', () => exportRaster('image/jpeg', 'jpg'));
  on('btn-svg', 'click', exportSVG);
  on('btn-example', 'click', exampleDiagram);
  on('btn-font-down', 'click', () => changeFontSize(-1));
  on('btn-font-up', 'click', () => changeFontSize(1));
  on('btn-zoom-out', 'click', () => zoomAt(1 / 1.2));
  on('btn-zoom-in', 'click', () => zoomAt(1.2));
  on('btn-zoom-fit', 'click', fitView);
  on('btn-undo', 'click', undo);
  on('btn-redo', 'click', redo);
  on('btn-delete', 'click', deleteSelected);
  on('btn-desktop', 'click', showDownloads);
  on('btn-help-side', 'click', showHelp);
  on('help-close', 'click', closeHelp);
  on('modal-close', 'click', () => { byId('modal').style.display = 'none'; });
  on('download-close', 'click', () => { byId('download-modal').style.display = 'none'; });
  on('edit-ok', 'click', () => closeEdit(true));
  on('edit-cancel', 'click', () => closeEdit(false));
  on('edit-modal', 'keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closeEdit(false); }
    else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.isComposing) { e.preventDefault(); closeEdit(true); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.tagName === 'TEXTAREA') {
      e.preventDefault();
      const el = e.target, p = el.selectionStart;
      el.value = el.value.slice(0, p) + '\n' + el.value.slice(el.selectionEnd); el.selectionStart = el.selectionEnd = p + 1;
    }
  });
  ['modal', 'help-modal', 'download-modal'].forEach(id => on(id, 'click', e => { if (e.target.id === id) e.target.style.display = 'none'; }));
  on('toggle-grid', 'change', e => { showGrid = e.target.checked; redraw(); });
  on('grid-size', 'change', e => { gridSize = clamp(parseInt(e.target.value, 10) || 20, 5, 200); e.target.value = gridSize; redraw(); });
  on('sidebar-toggle', 'click', () => byId('sidebar').classList.toggle('open'));
  on('sidebar-overlay', 'click', () => byId('sidebar').classList.remove('open'));
  on('menu-toggle', 'click', () => byId('menubar').classList.toggle('open'));
  on('menu-overlay', 'click', () => byId('menubar').classList.remove('open'));
  on('menubar', 'click', () => byId('menubar').classList.remove('open'));

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (editOpen()) return;
      ['modal', 'help-modal', 'download-modal'].forEach(id => { byId(id).style.display = 'none'; });
      closeCtxMenu();
      if (drag) { drag = null; redraw(); }
      return;
    }
    if (anyModalOpen() || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (e.key === ' ') { spaceDown = true; e.preventDefault(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
    else if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    else if (mod && k === 'c') { copySelection(); }
    else if (mod && k === 'v') { e.preventDefault(); pasteSelection(); }
    else if (mod && k === 'a') { e.preventDefault(); selectAll(); }
    else if (mod && k === 's') { e.preventDefault(); if (EMBED) embedSave(); else saveDiagram(); }
    else if (mod && k === 'd') { e.preventDefault(); copySelection(); pasteSelection(); }
    else if (/^Arrow/.test(e.key) && selNodes.size) {
      e.preventDefault();
      const st = e.shiftKey ? 1 : gridSize, dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
      pushUndo();
      const ids = new Set(selNodes);
      [...ids].forEach(id => { if (isContainer(nodes[id])) contentsOf(nodes[id]).forEach(m => ids.add(m.id)); });
      ids.forEach(id => { nodes[id].x += dx; nodes[id].y += dy; });
      redraw();
    }
  });
  document.addEventListener('keyup', e => { if (e.key === ' ') spaceDown = false; });
  window.addEventListener('beforeunload', e => { if (dirty && !EMBED && !DESKTOP && Object.keys(nodes).length) { e.preventDefault(); e.returnValue = ''; } });

  if (DESKTOP) document.body.classList.add('desktop');
  window.addEventListener('pywebviewready', () => document.body.classList.add('desktop'));
  initEmbed();
  redraw();
  setStatus('Bereit');
}

window.addEventListener('DOMContentLoaded', init);
