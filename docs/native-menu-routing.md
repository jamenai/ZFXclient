# Numerische Menü-Routen des Native-Clients

Diese Übersicht beschreibt die internen Menü-/View-Zustände aus dem lokal vorliegenden `build/game.js`. Die Nummern sind keine URL-Routen und nicht mit dem Spielzustand oder WebSocket-Opcode zu verwechseln. Der Build enthält ZFX-Patches; bei der Prüfung wurden deshalb auch die Konstruktoren im aktuellen Build und deren Aufrufer herangezogen.

## Wie der Router arbeitet

Der Manager ist `u` (Konstruktor `dK`). Sein Feld `uw` enthält die aktuelle Menü-Route. `u.v(state, returnState, payload)` wechselt die Ansicht; `returnState` ist optional und wird standardmäßig auf die aktuelle Route gesetzt. Die Ansichten liegen in `aSN` und können wiederverwendet werden. Für manche Zustände wird bei jedem Aufruf eine neue Ansicht erzeugt.

- `u.a4q()` kehrt zur gespeicherten Rücksprung-Route der aktuellen Ansicht zurück.
- `u.aSs(state)` öffnet eine bereits gespeicherte Ansicht erneut oder erzeugt sie.
- `u.y()` beendet die aktive Ansicht, leert den Ansichts-Cache und setzt `uw` auf `0`.
- Route `0` ist ein Sonderzustand ohne normale View-Konstruktion. Seine konkrete Bedeutung hängt vom App-/Spielkontext ab; im Multiplayer-Lobbyablauf signalisiert er die native Lobby.
- Zustände `4`, `8`, `9`, `10`, `11`, `13` und `33` erhalten in der Regel ein Objekt als `payload` und zeigen damit eine dynamische Ansicht/einen Dialog statt einer fest verdrahteten View.

Der ZFX-Observer umhüllt `u.v`, liest vorher/nachher `uw` und synchronisiert darauf basierend die eigene Navigation. Er ersetzt den Native-Manager nicht.

## Routenübersicht

„Sicherheit“ beschreibt, wie klar sich die Bedeutung aus Konstruktor und Aufrufern ergibt: **belegt** = direkt durch Menütext/Aufrufer oder Inhalt; **abgeleitet** = Inhalt erkennbar, genaue Produktbezeichnung unklar; **dynamisch** = Bedeutung kommt vom Aufrufer/Payload.

| ID | Bedeutung im aktuellen Build | View / Hinweise | Sicherheit |
| ---: | --- | --- | --- |
| `0` | Sonderzustand: native Lobby bzw. kein aktives Menü | Keine feste View. Wird auch zum Leeren/Verlassen des Menü-Stacks verwendet. Im Multiplayerablauf signalisiert `0` den Rückweg in den nativen Lobbykontext. | Kontextabhängig |
| `1` | Native Haupt-/Navigationsansicht | Enthält unter anderem Konto-/Profilaktionen, Ranglisten, Logs, Replays und Hilfelinks. | Belegt |
| `2` | Native Spieleinstellungen | Hauptseite der nativen Einstellungen. | Belegt |
| `3` | Replay-Ansicht | Replay öffnen/auswählen; wird auch beim Ende eines Matches erreicht. | Belegt |
| `4` | Dynamischer Dialog | Beispielsweise native Meldungen, Warnungen und Bestätigungen. Payload liefert den Dialog. | Dynamisch |
| `5` | Native Start-/Home-Ansicht | Einstieg mit nativen Spielaktionen. ZFX nutzt diesen Zustand als Native-Home-Zustand. | Belegt |
| `6` | Native Login-Ansicht | Kontoanmeldung. | Belegt |
| `7` | Account-/Profilansicht | Wird mit nativen Accountdaten als Payload geöffnet. | Belegt |
| `8` | Dynamischer Anfrage-/Aktionsdialog | `ux`-Ansicht für unter anderem Account-, Ranglisten- und Serveranfragen; die Anfrage-ID steckt im Payload. | Dynamisch |
| `9` | Dynamische View | Vom Aufrufer übergebenes Objekt. | Dynamisch |
| `10` | Dynamische View | Vom Aufrufer übergebenes Objekt; wird auch aus Spiel-UI-Abläufen geöffnet. | Dynamisch |
| `11` | Dynamische View | Vom Aufrufer übergebenes Objekt. | Dynamisch |
| `12` | Farbauswahl | Interaktiver nativer RGB-Farbwähler. | Belegt |
| `13` | Dynamische View | Vom Aufrufer übergebenes Objekt. | Dynamisch |
| `14` | Native Options-/Datenansicht | Die View liest unter anderem Werte aus Native-Einstellungsfeldern; die genaue fachliche Bezeichnung ist aus den lokalen Symbolen nicht gesichert. | Abgeleitet |
| `15` | Account-/Profilansicht | Alternative Datenquelle/Ansicht zur Route `7`; wird mit einem anderen nativen Accountdatenobjekt erzeugt. | Abgeleitet |
| `16` | Ranglisten | Native Ranglistenansicht. | Belegt |
| `17` | Logs/Spielhistorie | Native Log-/Statistikansicht. | Belegt |
| `18` | Goldtransfer | Native Überweisungsansicht; ZFX hängt hier eine eigene Funktion an. | Belegt |
| `19` | Spiel-/Szenario-Konfiguration | Native Ansicht mit Spielmodus- und Startoptionen vor dem Spielstart. | Abgeleitet |
| `20` | Kartenoptionen | Native Kartenauswahl/-konfiguration. | Belegt |
| `21` | Farb-/Teamoptionen | Native Farbkonfiguration für das Szenario. | Abgeleitet |
| `22` | Einkommenoptionen | Bearbeitet die zusätzlichen Einkommenoptionen und zugehörige Daten. | Abgeleitet |
| `23` | Spielernamenoptionen | Native Einstellung für angezeigte/auswählbare Namen. | Belegt |
| `24` | Spawnoptionen | Native Start-/Spawnkonfiguration. | Belegt |
| `25` | Bot-Schwierigkeit | Native Konfiguration der Botstärke/-teams. | Belegt |
| `26` | Steuer-/Einkommenoptionen | Native Konfiguration des entsprechenden Einkommenstyps. | Abgeleitet |
| `27` | Einfluss-/Einkommenoptionen | Native Konfiguration des entsprechenden Einkommenstyps. | Abgeleitet |
| `28` | Ressourcenoptionen | Native Ressourcenoptionen für das Szenario. | Belegt |
| `29` | Native Lobbyansicht | Wird nach dem Lobby-Roster geöffnet; enthält Lobbyinteraktion sowie Chat-Tabs. Das Anzeigen dieser View allein fordert den Chatverlauf nicht an. | Belegt |
| `30` | Native Nachrichten-/Verlaufsansicht | Zeigt zeitgestempelte Texte/Einträge. Die genaue Menübezeichnung ist aus dem minifizierten lokalen Build nicht eindeutig. | Abgeleitet |
| `31` | Benutzerdefinierte Palette | Bearbeitet eine Palette mit mehreren Farben. | Belegt |
| `32` | Geschützte/gesperrte Ansicht | Schloss-Symbol und eigener nativer View-Konstruktor; die genaue fachliche Bezeichnung ist nicht gesichert. | Abgeleitet |
| `33` | Dynamische View | Wie `4`/`9`–`13`: View wird vom Aufrufer übergeben. | Dynamisch |

## Route, Socket und Feed sind getrennte Zustände

Die Menüroute `u.uw`, der Status der WebSocket-Verbindungen und die Aktivierung eines Datenfeeds sind drei verschiedene Dinge. `u.v(...)` wechselt die View; die Funktion öffnet nicht automatisch eine Verbindung und abonniert nicht automatisch alle Daten. Umgekehrt kann eine Socket-Verbindung im Hintergrund offen sein, während eine andere Menüroute angezeigt wird.

| Ablauf / Route | Was das Öffnen der Route macht | Was Verbindung/Feed tatsächlich startet |
| --- | --- | --- |
| `5` Native Home → Multiplayer | Zeigt das Native-Home-Menü. | Der Klick auf „Multiplayer“ führt über einen nativen Start-/Connect-Ablauf. Das Setzen von Route `5` allein verbindet nicht. Der Socket-Manager verwaltet vier Socket-Slots unabhängig von `u.uw`. |
| `29` Lobbyansicht | Zeigt die Lobby, nachdem der native Lobby-Snapshot (Server-Kontrollopcode `2`) verarbeitet wurde. | Die Lobbyverbindung und das Roster stammen aus dem vorherigen Join-/Handshake. Für den nativen Chat sendet ein **Tabwechsel** in `aSo.aWk`: Beim Wechsel in Chat `b1.aHn.aHo(0)` (Client-Kontrollopcode `2`, Untertyp `0`, Verlauf anfordern); beim Verlassen `aHo(1)` (Untertyp `1`, Chatansicht deaktivieren). Server-Kontrollopcode `17` liefert den Verlauf, `19` einzelne Live-Records. Der Routenwechsel auf `29` allein sendet diese Chatanforderung nicht. |
| ZFX-eigener Lobbychat | Vue zeigt ihren Chatfeed; das ist kein Native-Menüroute-Wechsel. | Der aktuelle ZFX-Hook `setNativeLobbyChatMode(0)` sendet abhängig vom Kontozustand entweder Kontrollopcode `15`/Unter-ID `0` oder Kontrollopcode `17` mit Einstellungswerten. Das unterscheidet sich vom nachweisbaren nativen Chat-Tabwechsel über Opcode `2`. Der Hook setzt lokal den Status „native-stream-active“, sobald das Senden angestoßen wurde; daraus folgt kein Server-ACK. Die Gleichwertigkeit dieser ZFX-Nachrichten mit der nativen Chat-Anforderung ist im Clientcode nicht belegt. |
| `16` Ranglisten / `17` Logs | Öffnet die jeweilige Ansicht; der `show()`-Pfad stellt noch keine Kategorieanfrage. | Erst die Auswahl einer Kategorie löst `ux(21)` aus; der Anfrage-Handler sendet eine Abfrage (Kontrollopcode `21`). Weitere Such-/Bereichsaktionen verwenden die entsprechenden Query-Handler. |
| `7`/`15` Accountansicht | Zeigt ein bereits vorhandenes Account-Datenobjekt. | Die Account-Detailabfrage wird durch einen separaten Aktionsdialog ausgelöst: Anfrage-ID `16` sendet Kontrollopcode `15`, Unter-ID `2`; die Antwort wird als Kontrollopcode `12` verarbeitet. Das bloße Öffnen einer bereits gefüllten Accountansicht ist keine neue Anfrage. |
| `19`–`28` Spielkonfiguration | Zeigt lokale Szenario-/Spieloptionen. | Änderungen aktualisieren überwiegend lokale Konfigurationsdaten. Erst ein anschließender nativer Start-/Join-Ablauf baut bzw. nutzt den Spielkanal und übermittelt die Startparameter. |

Damit ein Feed als aktiv gilt, sollte die Diagnose getrennt festhalten: **Route geöffnet**, **Socket verbunden**, **Anfrage gesendet** und **passende Serverdaten empfangen**. Die aktuelle ZFX-Chatstatusvariable bestätigt nur den Sendeversuch, nicht den letzten Schritt.

## Wichtige Abgrenzungen

- Die Route sagt, **welche native Menüansicht** aktiv ist. Sie sagt nicht automatisch, ob ein WebSocket verbunden ist oder ob ein Datenfeed abonniert wurde.
- `uw` ist die Native-Menüroute. Spielzustände wie laufendes Match, Replay oder Singleplayer werden separat verwaltet.
- Dass eine Zahl im `u.v(...)`-Aufruf auftaucht, beweist allein nicht die Bedeutung: Bei dynamischen Routen bestimmt das übergebene Objekt die Ansicht.
- Die IDs und Bezeichnungen sind interne Native-Implementierungsdetails und können sich mit einem Spielupdate ändern.

## Quellen im Build

- `build/game.js:9595` – Manager `dK`, Route `uw`, Zustandswechsel und Ansichts-Cache.
- `build/game.js:9610` – Zuordnung der IDs zu View-Konstruktoren.
- `build/game.js:12441` – Socket-Manager mit vier unabhängigen Verbindungsslots.
- `build/game.js:12168` – Native Navigationsansicht und ihre Menüeinträge.
- `build/game.js:11168` und `11639` – Ranglisten-/Log-Ansichten; Kategorieauswahl löst die Anfrage aus.
- `build/game.js:11533` – Native Lobby-Chat-Tabwechsel und Kontrollopcode-2-Untertypen `0`/`1`.
- `build/game.js:12736` – Lobby-Snapshot-Verarbeitung und Übergang zu Route `29`.
- `patches/lobbyReminders.js` und `src/components/shared/lobby/lobbyChat.js` – ZFX-eigener Chat-Aktivierungsversuch und dessen Status.
- `src/components/views/lobby/customLobbyView.js:2502` – ZFX-Observer für native Routenwechsel.
