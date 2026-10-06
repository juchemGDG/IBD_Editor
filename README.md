# IBD Editor

Editor fuer **Informations-Blockdiagramme**: Er zeigt, *wo eine Information
herkommt und wo sie hingeht* – als Ergaenzung zum Programmablaufplan, der nur
zeigt, *wann* etwas passiert. Schwesterprojekt zum
[PAP Editor](https://github.com/juchemGDG/PAP_Editor), gleiche Bedienung,
gleiches Aussehen.

Notation und Pruefregeln folgen dem Konzept „Informationsfluss in der
µC-Programmierung" (Klasse 9, ESP32 mit MicroPython).

## Notation

| Baustein | Darstellung | Bedeutung |
|---|---|---|
| Bauteil | orange, eckig | Informationsquelle (Taster, Sensor) oder -ziel (LED, Display, Konsole) |
| Verarbeitung | grau, abgerundet | fertige Funktion, Methode oder Operation |
| eigene Funktion | blau, abgerundet, `def` | einziger Gueltigkeitsbereich: nur in ihr stehen Variablen |
| Variable | doppelter Rand | abgelegter Wert, optional mit Rolle; Listen mit `[ ]` |
| globale Zone | gestrichelter Rahmen | nur Festwerte und Bauteile |

| Pfeil | Darstellung | Bedeutung |
|---|---|---|
| Uebergabewert | dunkel, schmal | was eine Verarbeitung benutzt |
| Rueckgabewert | blau, breit, Punkt am Anfang | `return` – braucht ein Ziel |
| Bauteilsignal | orange | direkt zwischen Bauteil und Verarbeitung |
| globaler Zugriff | gestrichelt | an Uebergabe und Rueckgabe vorbei – braucht eine Begruendung |
| veraenderte Liste | blau, breit, zwei Spitzen | Funktion veraendert eine uebergebene Liste |

## Funktionen

- Bausteine aus der linken Leiste auf die Flaeche ziehen (oder antippen)
- Beschriften per Doppelklick; bei Variablen zusaetzlich Liste `[ ]` und Rolle
  (Festwert, Zaehler, Sammler, Merker, Aktueller Wert)
- Variablen in eine eigene Funktion schieben – der Kasten ist ihr
  Gueltigkeitsbereich; beim Verschieben der Funktion wandert der Inhalt mit
- Pfeile vom **Rand** eines Bausteins zum Ziel ziehen; Anschluss an beliebiger
  Stelle des Rands. Der Pfeiltyp wird passend vorgeschlagen und laesst sich in
  der Leiste oder per Rechtsklick aendern
- Pfeilenden umhaengen, Knick verschieben, Richtung umkehren
- Groesse je Baustein (Griff rechts unten), Schriftgroesse `A−` / `A+`
- Mehrfachauswahl, Kopieren/Einfuegen/Duplizieren, Rueckgaengig/Wiederholen
- Zoom und Verschieben der Flaeche, Raster
- Speichern und Laden als JSON, Export als PNG, JPG und SVG
- Fehlerpruefung (Button „Diagramm pruefen")
- Einbettung per iframe mit `?embed=1`
- Touch-Bedienung (iPad): doppelt tippen = bearbeiten, lange tippen =
  Kontextmenue, zwei Finger = verschieben/zoomen

## Fehlerpruefung

„Diagramm pruefen" wendet einen Regelkatalog an. Jede Regel hat eine ID, einen
Schweregrad (Fehler/Hinweis) und eine Meldung an die Schuelerin/den Schueler;
die betroffenen Bausteine und Pfeile werden markiert (rot/gelb). Die Gruppen
entsprechen den **vier Pruefregeln** des Konzepts, dazu kommen die
Darstellungskonvention (K) und Beschriftungen (B).

| Regel | Art | Gruppe | Inhalt |
|---|---|---|---|
| `I02` | Fehler | 1 | Was eine Verarbeitung liefert, hat kein Ziel |
| `I03` | Hinweis | 1 | Baustein ohne Pfeil / Variable wird nie benutzt |
| `I05` | Fehler | 1 | Rueckgabewert beginnt nicht an einer Verarbeitung/Funktion |
| `I10` | Fehler | 2 | Pfeil von Variable zu Variable ueber Funktionsgrenzen |
| `I04` | Hinweis | 3 | In eine eigene Funktion kommt etwas hinein, nichts verlaesst sie (fehlt `return`?) |
| `I06` | Fehler | 3 | Verarbeitung → Variable als Uebergabewert statt Rueckgabewert |
| `I15` | Fehler | 3 | „veraenderte Liste" an einer Variablen, die keine Liste ist |
| `I16` | Fehler | 3 | „veraenderte Liste" ohne beteiligte Funktion |
| `I17` | Hinweis | 3 | Rueckgabewert landet in einer Variablen derselben Funktion |
| `I30` | Hinweis | 4 | globaler Zugriff: Begruendung verlangt |
| `I31` | Fehler | 4 | gestrichelter Pfeil nicht zwischen eigener Funktion und Variable |
| `I32` | Hinweis | 4 | gestrichelter Pfeil unnoetig (Festwert / eigene Variable) |
| `I11` | Fehler | K | Variable ausserhalb einer eigenen Funktion, die kein Festwert ist |
| `I12` | Fehler | K | Bauteil in einer eigenen Funktion |
| `I13` | Fehler | K | Verarbeitung/Funktion in einer eigenen Funktion („nie darin") |
| `I14` | Hinweis | K | Baustein liegt auf einem Rand / Kaesten ueberdecken sich |
| `I20` | Fehler | K | Pfeil an einem Bauteil ist kein Bauteilsignal |
| `I21` | Fehler | K | Bauteil direkt mit Variable oder Bauteil verbunden |
| `I22` | Fehler | K | Bauteilsignal ohne Bauteil |
| `I47` | Fehler | K | In einen Festwert fuehrt ein Pfeil |
| `I48` | Hinweis | K | derselbe Pfeil doppelt |
| `I49` | Hinweis | K | mehrere eigene Funktionen, aber kein `main()`/Hauptprogramm |
| `I40` | Fehler | B | Baustein ohne Beschriftung |
| `I41` | Hinweis | B | Pfeil ohne Beschriftung (Bauteilsignale ausgenommen) |
| `I42` | Hinweis | B | eigene Funktion ohne `def` / graue Verarbeitung mit `def` |
| `I43` | Fehler | B | Funktionsname doppelt |
| `I44` | Fehler | B | Variablenname im selben Gueltigkeitsbereich doppelt |
| `I45` | Hinweis | B | ungueltiger Variablenname |
| `I46` | Hinweis | B | Festwert nicht in Grossbuchstaben |

Bewusste Festlegungen:

- **Einstiegsdiagramme ohne eigene Funktion** (Sensor → `adc.read()` → `wert`
  → `print()` → Konsole) sind erlaubt: `I11` greift erst, sobald es mindestens
  eine eigene Funktion gibt.
- Als **Festwert** gilt eine Variable mit Rolle „Festwert" oder einem Namen
  ganz in Grossbuchstaben.
- Als **Hauptprogramm** gilt `def main()` oder ein Kasten „Hauptprogramm".
- Was das Diagramm nicht zeigt, kann die Pruefung nicht finden – etwa eine
  Funktion, die im Code heimlich eine globale Variable liest. Pruefregel 2
  bleibt deshalb Aufgabe der Lernenden; der Editor prueft nur, ob das
  Gezeichnete in sich stimmig ist.

Die Logik steht in `web/static/ibd.js` (`RULES`, `evaluateDiagram`). Eine neue
Regel: Eintrag in `RULES`, Pruefung in `evaluateInner`, Testfall in
`tests/test_rules.js`.

```bash
node tests/test_rules.js     # Beispiele aus dem Konzept als Regressionstest
```

## Start

```bash
bash web/start_web.sh        # Web-Version lokal: http://localhost:5001
bash start_ibd.sh            # Desktop-Version
```

## Web-Version auf den Server bringen

Die Web-Version besteht nur aus statischen Dateien. Aus `web/static/`
hochladen:

```
index.html
ibd.js
ibd.css
favicon.svg
.htaccess        <- versteckte Datei! im FTP-Programm sichtbar schalten
```

Nach jedem Update in `index.html` den Cache-Buster hochzaehlen
(`ibd.css?v=N`, `ibd.js?v=N`) und alle drei Dateien zusammen hochladen.

Der Menuepunkt „Desktop-Version" fragt das neueste GitHub-Release ab
(`GITHUB_REPO` oben in `ibd.js`, nur bei oeffentlichem Repository) und faellt
sonst auf Dateien im Ordner `downloads/` zurueck.

## Desktop-Version

Die Desktop-Version zeigt dieselbe Oberflaeche in einem eigenen Fenster
(`desktop/ibd_desktop.py`, [pywebview](https://pywebview.flowrl.com)) – ohne
Internet, mit nativem Speichern-Dialog. Anders als beim PAP Editor gibt es
damit nur **eine** Implementierung von Editor und Fehlerpruefung; Web und
Desktop koennen nicht auseinanderlaufen. Dateien sind in beiden Richtungen
kompatibel.

```bash
pip install -r requirements.txt
python3 desktop/ibd_desktop.py            # eigenes Fenster
python3 desktop/ibd_desktop.py --browser  # ohne pywebview: im Browser
```

Pakete (`.dmg`, Setup-`.exe`, `.tar.gz`) baut der Workflow
`.github/workflows/build-packages.yml`: Actions → „Pakete bauen" → Run
workflow, oder einen Tag `v1.0.0` pushen – dann haengen die Dateien am
Release. Lokal: `pyinstaller ibd_editor.spec`. Icons (`assets/icon.ico`,
`assets/icon.icns`) sind optional; Quelle ist `assets/icon.svg`.

## Einbettung in andere Web-Apps (`?embed=1`)

Wie beim PAP Editor: Mit `?embed=1` im iframe erscheinen die Buttons „In
Projekt uebernehmen" und „Schliessen", der Hinweis auf die Desktop-Version
entfaellt. Protokoll ueber `window.postMessage`:

| Richtung | Nachricht |
|---|---|
| Editor -> Host | `{source:'ibd-editor', event:'ready'}` |
| Host -> Editor | `{target:'ibd-editor', action:'load', diagram:<JSON wie "Speichern" oder null>, title, downloads:true}` |
| Editor -> Host | `{source:'ibd-editor', event:'save', diagram:<JSON>, svg:<SVG-Text>}` |
| Editor -> Host | `{source:'ibd-editor', event:'exit'}` |
| Editor -> Host | `{source:'ibd-editor', event:'download', name, mime, blob:<Blob>}` |

Schickt der Host in `load` den Schalter `downloads:true`, uebergibt der Editor
Dateien (Speichern, PNG, JPG, SVG) per `download`-Nachricht an den Host statt
selbst herunterzuladen – Browser blockieren Downloads im iframe oft.

Der Editor nimmt nur Nachrichten seines Eltern-Fensters an und schickt
Diagrammdaten nur an dessen Origin. Der Host sollte umgekehrt `event.origin`
und `event.source` pruefen. Einziger Unterschied zum PAP Editor ist die
Kennung `ibd-editor` statt `pap-editor`.

## Dateiformat

```json
{
  "format": "ibd-editor", "version": 1, "grid": 20,
  "nodes":  [{ "id": 1, "type": "variable", "x": 80, "y": 110, "w": 260, "h": 60,
               "text": "zeit", "role": "Aktueller Wert", "list": false }],
  "arrows": [{ "id": 9, "src": 4, "tgt": 1, "kind": "rueckgabe", "label": "Reaktionszeit in ms",
               "sa": { "side": "l", "t": 0.56 }, "ta": { "side": "r", "t": 0.5 } }]
}
```

`type`: `bauteil`, `verarbeitung`, `funktion`, `variable`, `zone` ·
`kind`: `uebergabe`, `rueckgabe`, `signal`, `global`, `liste` ·
`sa`/`ta`: Anschluss an Quelle/Ziel (Seite `l`/`r`/`t`/`b`, Lage 0…1).
Welche Variable zu welcher Funktion gehoert, ergibt sich aus der Lage
(Mittelpunkt im Kasten).
