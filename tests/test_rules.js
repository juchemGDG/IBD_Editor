// Regressionstest fuer die Fehlerpruefung:  node tests/test_rules.js
// Laedt ibd.js ohne Browser und prueft die Beispiele aus dem Konzept.
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = { window: { addEventListener() {}, parent: null }, location: { search: '' }, URLSearchParams, console,
              document: { getElementById: () => null, createElement: () => ({ getContext: () => ({ measureText: t => ({ width: t.length * 8 }) }) }) } };
ctx.window.parent = ctx.window;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/static/ibd.js'), 'utf8') + '\nthis.evaluateDiagram = evaluateDiagram;', ctx);

let id = 0, N, A, failed = 0;
const reset = () => { id = 0; N = {}; A = {}; };
const node = (type, text, x, y, w, h, extra) => { const n = Object.assign({ id: ++id, type, text, x, y, w: w || 120, h: h || 40 }, extra); N[n.id] = n; return n; };
const arrow = (s, t, kind, label) => { const a = { id: ++id, src: s.id, tgt: t.id, kind, label: label || '', sa: { side: 'r', t: .5 }, ta: { side: 'l', t: .5 } }; A[a.id] = a; return a; };
const check = (name, expected) => {
  const got = ctx.evaluateDiagram(N, A).map(f => f.rule).sort().join(',');
  const ok = got === expected.slice().sort().join(',');
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FEHLT') + ' ' + name + (ok ? '' : `\n      erwartet: ${expected}\n      erhalten: ${got}`));
};

// Folie 24: Reaktionszeittester – ohne Befund
reset();
{ node('funktion', 'def main()', 0, 0, 340, 480);
  const zeit = node('variable', 'zeit', 40, 80, 260, 60, { role: 'Aktueller Wert' });
  const zeiten = node('variable', 'reaktionszeiten', 40, 300, 260, 60, { list: true, role: 'Sammler' });
  const messen = node('funktion', 'def reaktionszeit_messen()', 540, 0, 340, 180);
  const median = node('funktion', 'def median()', 540, 260, 340, 100);
  const print = node('verarbeitung', 'print()', 600, 420, 160, 60);
  const led = node('bauteil', 'LED', 1040, 0), taster = node('bauteil', 'Taster', 1040, 120), kons = node('bauteil', 'Konsole', 880, 420);
  arrow(messen, zeit, 'rueckgabe', 'Reaktionszeit in ms'); arrow(zeit, zeiten, 'uebergabe', 'append()');
  arrow(zeiten, median, 'uebergabe', 'alle Runden [ ]'); arrow(median, print, 'rueckgabe', 'Median in ms');
  arrow(print, kons, 'signal'); arrow(messen, led, 'signal', 'Startsignal'); arrow(taster, messen, 'signal', 'gedrückt'); }
check('Folie 24 Reaktionszeittester', []);

// Folie 19: veränderte Liste – ohne Befund
reset();
{ node('funktion', 'def main()', 0, 0, 280, 240);
  const punkte = node('variable', 'punkte', 20, 80, 220, 60, { list: true });
  const geben = node('funktion', 'def punkt_geben()', 400, 0, 220, 240);
  arrow(punkte, geben, 'liste', 'Punktestände [ ]');
  const main = N[1]; arrow(main, geben, 'uebergabe', 'Spieler'); }
check('Folie 19 veränderte Liste', []);

// Folie 30: Hauptprogramm ohne def, Wirkung auf ein Bauteil – ohne Befund
reset();
{ const hp = node('funktion', 'Haupt-\nprogramm', 0, 0, 140, 100), ph = node('funktion', 'def phase_rot()', 300, 0, 160, 100), led = node('bauteil', 'LED rot', 320, 180);
  arrow(hp, ph, 'uebergabe', 'Dauer der Rotphase in s'); arrow(ph, led, 'signal', 'an'); }
check('Folie 30 Funktion wirkt auf Bauteil', []);

// Folie 29: Einstieg ohne eigene Funktionen – Variable darf frei stehen
reset();
{ const s = node('bauteil', 'Sensor', 0, 0), adc = node('verarbeitung', 'adc.read()', 160, 0), w = node('variable', 'wert', 340, 0), pr = node('verarbeitung', 'print()', 500, 0), k = node('bauteil', 'Konsole', 660, 0);
  arrow(s, adc, 'signal', 'Potential'); arrow(adc, w, 'rueckgabe', 'Messwert'); arrow(w, pr, 'uebergabe', 'Messwert'); arrow(pr, k, 'signal'); }
check('Folie 29 Einstieg', []);

// Folie 5 links: Rückgabewert ohne Ziel
reset();
{ const s = node('bauteil', 'Sensor', 0, 0), adc = node('verarbeitung', 'adc.read()', 160, 0);
  arrow(s, adc, 'signal'); }
check('Folie 5 Rückgabewert ohne Ziel', ['I02']);

// Folie 4: messwert bleibt in der Funktion, hell bekommt nichts
reset();
{ const s = node('bauteil', 'Sensor', 0, 0), adc = node('verarbeitung', 'adc.read()', 160, 0);
  const f = node('funktion', 'def helligkeit_messen()', 340, -40, 240, 140); const m = node('variable', 'messwert', 380, 20, 160, 40);
  node('variable', 'hell', 400, 140);
  arrow(s, adc, 'signal', 'Potential'); arrow(adc, m, 'rueckgabe', 'Messwert'); }
check('Folie 4 Messwert ohne return', ['I03', 'I04', 'I11']);

// Einzelregeln
reset();
{ const t = node('bauteil', 'Taster', 0, 0); node('funktion', 'def main()', 200, -40, 240, 140); const v = node('variable', 'x', 240, 20, 160, 40);
  arrow(t, v, 'signal', 'gedrückt'); }
check('Bauteil direkt an Variable', ['I21']);

reset();
{ node('funktion', 'def main()', 0, 0, 200, 120); const a = node('variable', 'a', 20, 50, 160, 40);
  node('funktion', 'def f()', 300, 0, 200, 120); const b = node('variable', 'b', 320, 50, 160, 40);
  arrow(a, b, 'uebergabe', 'Wert'); }
check('Variable → Variable über Funktionsgrenze', ['I04', 'I10']);

reset();
{ node('funktion', 'def main()', 0, 0, 200, 120); const a = node('variable', 'zaehler', 20, 50, 160, 40);
  const f = node('funktion', 'def erhoehen()', 300, 0, 200, 120);
  arrow(a, f, 'global', 'Zählerstand'); }
check('globaler Zugriff braucht Begründung', ['I30']);

reset();
{ node('funktion', 'def main()', 0, 0, 200, 120); const a = node('variable', 'punkte', 20, 50, 160, 40);
  const f = node('funktion', 'def geben()', 300, 0, 200, 120);
  arrow(a, f, 'liste', 'Punkte'); }
check('veränderte Liste an einer Zahl', ['I15']);

reset();
{ node('funktion', 'def main()', 0, 0, 200, 120); const a = node('variable', 'wert', 20, 50, 160, 40);
  const f = node('funktion', 'def messen()', 300, 0, 200, 120);
  arrow(f, a, 'uebergabe', 'Messwert'); }
check('Ergebnis ohne return in eine Variable', ['I06']);

reset();
{ node('funktion', 'def main()', 0, 0, 400, 200); node('bauteil', 'LED', 20, 60); node('verarbeitung', 'print()', 200, 60);
  node('variable', 'x', 20, 130); }
check('Bauteil und Verarbeitung in einer Funktion', ['I03', 'I03', 'I03', 'I03', 'I12', 'I13']);

console.log(failed ? `\n${failed} Test(s) fehlgeschlagen` : '\nalle Tests bestanden');
process.exit(failed ? 1 : 0);
