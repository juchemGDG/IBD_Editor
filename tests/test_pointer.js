// Regressionstest fuer die Zeiger-Bedienung (iPad: Doppeltipp, verlorene pointerup):  node tests/test_pointer.js
// Laedt ibd.js ohne Browser, ersetzt Zeichnen/Dialoge durch Attrappen und spielt Touch-Folgen ab.
const fs = require('fs'), vm = require('vm'), path = require('path');

let now = 1000, timers = [], timerId = 0;
const ctx = {
  window: { addEventListener() {}, parent: null }, location: { search: '' }, URLSearchParams, console, Math,
  document: { getElementById: () => null, createElement: () => ({ getContext: () => ({ measureText: t => ({ width: t.length * 8 }) }) }) },
  Date: { now: () => now },
  setTimeout: (fn, ms) => { timers.push({ id: ++timerId, at: now + (ms || 0), fn }); return timerId; },
  clearTimeout: id => { timers = timers.filter(t => t.id !== id); },
};
ctx.window.parent = ctx.window;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/static/ibd.js'), 'utf8'), ctx);

const run = code => vm.runInContext(code, ctx);
const tick = ms => {                       // Zeit vorstellen und faellige Timer ausfuehren
  const end = now + ms;
  for (;;) {
    const due = timers.filter(t => t.at <= end).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    timers = timers.filter(t => t !== due); now = Math.max(now, due.at); due.fn();
  }
  now = end;
};

// Attrappen: keine DOM-Zeichnung, Dialog nur mitzaehlen
const edits = [];
ctx.redraw = () => {};
ctx.closeCtxMenu = () => {};
ctx.setStatus = () => {};
ctx.editNode = n => { edits.push('node:' + n.id); };
ctx.editArrow = a => { edits.push('arrow:' + a.id); };
ctx.contextAt = () => { edits.push('context'); };
run(`stage = { setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => true, style: {},
               getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };`);

let failed = 0;
const check = (name, cond) => { console.log((cond ? 'ok    ' : 'FEHLER ') + name); if (!cond) failed++; };

function fresh() {
  edits.length = 0; timers = [];
  run(`nodes = { 1: { id: 1, type: 'verarbeitung', text: 'messen()', x: 100, y: 100, w: 160, h: 80 },
                 2: { id: 2, type: 'verarbeitung', text: 'print()',  x: 400, y: 100, w: 160, h: 80 } };
       arrows = {}; selNodes = new Set(); selArrow = null; drag = null; view = { x: 0, y: 0, z: 1 };
       pointers.clear(); pinch = null; lastTap = { t: 0, x: 0, y: 0 };`);
}
const ev = (type, id, x, y, kind = 'touch', primary = true) =>
  ({ type, pointerId: id, pointerType: kind, isPrimary: primary, clientX: x, clientY: y, button: 0, shiftKey: false });
const down = (id, x, y, kind, primary) => ctx.pointerDown(ev('pointerdown', id, x, y, kind, primary));
const move = (id, x, y, kind) => ctx.pointerMove(ev('pointermove', id, x, y, kind));
const up = (id, x, y, kind) => ctx.pointerUp(ev('pointerup', id, x, y, kind));
const sel = () => run('[...selNodes].join(",")');
const zoom = () => run('view.z');
const active = () => run('pointers.size');

// ── 1. iPad-Fehler: zweiter Tipp eines Doppeltipps, pointerup geht verloren ──
fresh();
down(1, 180, 140); up(1, 180, 140); tick(120);          // erster Tipp auf Baustein 1
down(2, 181, 141); up(2, 181, 141); tick(50);           // zweiter Tipp (kann ohne Verlust auch hier schon enden)
check('Doppeltipp oeffnet genau einen Dialog', edits.filter(e => e === 'node:1').length === 1);

fresh();
down(1, 180, 140); up(1, 180, 140); tick(120);
down(2, 181, 141);                                       // zweiter Tipp ...
/* ... pointerup/pointercancel kommen auf dem iPad nie an (Dialog oeffnet sich unter dem Finger) */
tick(300);
// naechste Beruehrung: einzelner Finger auf Baustein 2
tick(1500);
down(3, 480, 140);
check('nach verlorenem pointerup zaehlt ein Finger als ein Finger', active() === 1);
move(3, 520, 150);
check('Finger zieht den Baustein, statt zu zoomen', zoom() === 1);
up(3, 520, 150);
check('Baustein 2 ist ausgewaehlt', sel() === '2');

// ── 2. Wiederholung: nach dem Fehler bleibt die Bedienung dauerhaft nutzbar ──
tick(1500);
down(4, 180, 140); up(4, 180, 140);
check('weiterer Tipp waehlt Baustein 1 aus', sel() === '1');
tick(1500);
down(5, 480, 140); up(5, 480, 140);
check('und danach wieder Baustein 2', sel() === '2');
check('es bleibt kein Zeiger haengen', active() === 0);

// ── 3. Normale Faelle duerfen sich nicht aendern ──
fresh();
down(1, 180, 140); up(1, 180, 140); tick(200);
down(1, 180, 140); check('Doppeltipp oeffnet erst nach dem Loslassen', edits.length === 0); up(1, 180, 140);
check('Doppeltipp: Dialog fuer Baustein 1', edits.join() === 'node:1');

fresh();                                                  // zwei Tipps mit langer Pause sind kein Doppeltipp
down(1, 180, 140); up(1, 180, 140); tick(900);
down(1, 180, 140); up(1, 180, 140);
check('Pause von 900 ms ist kein Doppeltipp', edits.length === 0);

fresh();                                                  // Ziehen und gleich danach tippen ist kein Doppeltipp
down(1, 180, 140); move(1, 230, 160); move(1, 260, 180); up(1, 260, 180); tick(100);
down(1, 180, 140); up(1, 180, 140);
check('Ziehen + Tipp ist kein Doppeltipp', edits.length === 0);

fresh();                                                  // Zwei-Finger-Zoom funktioniert weiter
down(1, 300, 300); down(2, 400, 300, 'touch', false);
move(2, 500, 300);
check('Zwei-Finger-Geste zoomt', zoom() > 1.5);
up(2, 500, 300); up(1, 300, 300);
check('nach der Geste ist alles frei', active() === 0);

fresh();                                                  // Maus: Doppelklick wie bisher
down(1, 180, 140, 'mouse'); up(1, 180, 140, 'mouse'); tick(150);
down(1, 180, 140, 'mouse'); up(1, 180, 140, 'mouse');
check('Maus: Doppelklick oeffnet Dialog', edits.join() === 'node:1');

fresh();                                                  // Doppeltipp auf leere Flaeche: nichts passiert, nichts haengt
down(1, 650, 450); up(1, 650, 450); tick(100); down(1, 650, 450); up(1, 650, 450);
check('Doppeltipp ins Leere oeffnet nichts', edits.length === 0 && active() === 0);

fresh();                                                  // langes Druecken: Kontextmenue, danach kein Doppeltipp-Rest
down(1, 180, 140); tick(650);
check('langes Druecken oeffnet das Kontextmenue', edits.join() === 'context');
up(1, 180, 140); tick(100);
down(1, 180, 140); up(1, 180, 140);
check('Tipp nach dem Kontextmenue ist kein Doppeltipp', edits.join() === 'context' && active() === 0);

fresh();                                                  // verlorener Zeiger bei Maus (Taste ausserhalb losgelassen)
down(1, 180, 140, 'mouse');
down(2, 480, 140, 'mouse');
check('neuer Mauszeiger ersetzt haengenden alten', active() === 1);

console.log(failed ? `\n${failed} Test(s) fehlgeschlagen` : '\nalle Tests bestanden');
process.exit(failed ? 1 : 0);
