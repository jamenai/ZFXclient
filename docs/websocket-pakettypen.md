# WebSocket-Pakettypen des Native-Clients

Diese Übersicht ist gegen den lokal vorliegenden Native-Build `game/latest.js` (11.11.2026) und den daraus erzeugten Client-Build `build/game.js` abgeglichen. Die Einträge beschreiben beobachtbares Client-Verhalten, keine offizielle Protokollspezifikation. Feldbreiten stammen aus dem Bit-Reader/-Writer; Bezeichnungen wie „Abfrage“ oder „Join“ sind aus Handlern und Aufrufern abgeleitet.

## Rahmenformat

Jeder Paketkörper beginnt mit einem Richtungs-/Zweigbit:

- `0`: Kontroll-/Lobbyzweig. Danach folgen 6 Bits Opcode. Die Tabellen „Kontrollzweig“ beziehen sich auf diesen Zweig.
- `1`: Spielzweig. Danach folgt je nach Richtung ein eigener Untertyp (Client→Server: 4 Bits; Server→Client: variabler Aufbau). Das ist **kein** Opcode aus der 6-Bit-Kontrolltabelle.

Opcode-Nummern gelten nur innerhalb ihres Zweigs und ihrer Richtung. Gleiche Nummern in Client→Server und Server→Client müssen nicht dieselbe Bedeutung haben. Auch Verbindung und Spielzustand beeinflussen, ob ein Paket verarbeitet wird.

## Client → Server: Kontrollzweig (`0` + 6-Bit-Opcode)

| Opcode | Verhalten im Client | Erkennbarer Payload |
| ---: | --- | --- |
| 1 | Verbindung anmelden | Modus-ID (10 Bit), Username (bis 20 Zeichen im Aufrufer), RGB-Farbkanäle (je 6 Bit). |
| 2 | Lobby-Aktion | 3-Bit-Untertyp: `2` Entry-ID (30 Bit) setzen; `3` Chattext; `4` Entry auswählen (13-Bit Entry-ID + Contest-Bit); `5` Entry-Parameter; `6` weiterer Entry-Parameter. Der Writer unterstützt außerdem Untertypen ohne hier sichtbaren Payload. |
| 3 | Numerischen Wert setzen/melden | Feld-ID (6 Bit), Wert (30 Bit); Semantik über Feld-ID/Aufrufer. |
| 5 | Im untersuchten Build kein eindeutiger Writer gefunden | Nicht als unbenutzt interpretieren; möglicherweise server-/zustandsabhängig oder dynamisch erzeugt. |
| 6 | Text senden | String-Writer; Aufrufer `fB`, Zweck kontextabhängig. |
| 8 | CAPTCHA-Antwort senden | Challenge-Untertyp (3 Bit), Challenge-Wert (30 Bit), 32-Bit-Auswahlmaske/-Daten, 16-Bit Zusatzwert. Wird vom CAPTCHA-Dialog erzeugt. |
| 9 | Liste von Wertepaaren senden | Wiederholt Paare aus 16- und 10-Bit-Werten. |
| 10 | Liste von 32-Bit-Werten senden | Anzahl begrenzt auf 540; wird als Antwort im Account-/Social-Kontext verwendet. |
| 13 | Verbindungs-/Lobbyparameter senden | Modus-/Client-Metadaten, lokale Optionen und zusätzliche Daten; Payload variabel. |
| 15 | Befehl mit ID senden | 6-Bit Befehls-ID. Bedeutung abhängig vom Aufrufer. |
| 16 | Mehrere Verwendungen | Ein Writer sendet Lobby-/Spielparameter; ein weiterer sendet benutzerdefinierte Palettendaten (ID, 11 RGB-Farben, Zusatzwerte/Text). Payload und Bedeutung sind aufrufabhängig. |
| 17 | Einstellungen/Abfrage senden | Zwei kodierte Werte aus lokalen Einstellungen (5- und 15-Bit-Felder). |
| 18 | Einstellung/Abfrage senden | Kodierter Wert aus einem lokalen Einstellungsfeld (15 Bit). |
| 19 | Verbindungsstatus melden | 1-Bit Status und 12-Bit Zusatzwert. |
| 21 | Koordinatenabfrage | Untertyp (6 Bit), Vorzeichenbits und zwei 30-Bit Beträge. |
| 22 | Textabfrage | Untertyp (6 Bit), kodierter String, 30-Bit Zusatzwert/Offset. |
| 23 | Mehrere Textwerte abfragen | Untertyp (3 Bit), Anzahl und Gesamtlänge, danach Strings mit 3-Bit Längenfeldern. **Das ist Client→Server und kein CAPTCHA.** |
| 24 | Kompakte Koordinatenabfrage | Untertyp (3 Bit), zwei Vorzeichenbits und zwei 20-Bit Beträge. |
| 25 | Aktion mit ID und Wert | Aktions-ID (6 Bit), kodierter 5-Bit-Wert. |
| 26 | Textwert setzen/senden | Feld-ID (6 Bit), Länge (6 Bit), String. |
| 27 | Aktion mit ID, Wert und Zusatzdaten | Aktions-ID (6 Bit), kodierter 5-Bit-Wert, 32-Bit Zusatzwert. |
| 28 | Abfrage mit Kurzkennung | Untertyp (6 Bit), 5-Bit-kodierte Kennung, 30-Bit Zusatzwert/Offset. |
| 29 | Textaktion | Aktions-ID (6 Bit), Textlänge (8 Bit), String. |
| 30 | Aktion mit drei Parametern | Untertyp (3 Bit), zwei 30-Bit-Werte. |

Nicht gelistete Kontroll-Opcode-Writer wurden im untersuchten Build nicht eindeutig gefunden. Das ist kein Beleg dafür, dass der Server diese Nummern nie sendet.

## Server → Client: Kontrollzweig (`0` + 6-Bit-Opcode)

Der eingehende Kontroll-Dispatcher ist `aXz.aYa`. Bei einigen Opcodes prüft der Handler zusätzlich die Socket-ID oder den aktuellen Spiel-/Lobbyzustand.

| Opcode | Verhalten im aktuellen Build | Erkennbarer Payload / Einschränkung |
| ---: | --- | --- |
| 0 | Allgemeine Werte aktualisieren | Bei Socket 0 und passendem Spielzustand: Anzahl (12 Bit), Feldbreite (6 Bit), anschließend Werte dieser Breite. |
| 1 | Kein expliziter Handler | Kein Zweig im Dispatcher. |
| 2 | Lobby-Snapshot / Roster | Status und Spielerliste; nur auf dem erwarteten Lobby-Socket und im Lobbyzustand. Danach werden Lobby-Entries dekodiert. Details siehe unten. |
| 3, 4 | Lobby-Kontext schließen/zurücksetzen | Kein weiterer Payload-Decoder im Dispatcher sichtbar. |
| 5 | Palettendaten | ID (20 Bit), elf RGB-Farben (je drei 8-Bit-Kanäle) und kodierter Zusatztext/-wert. |
| 6–8 | Kein expliziter Handler | Im Kontroll-Dispatcher nicht belegt. |
| 9 | Join-/Verbindungsfortschritt | Liest Join-/Spielinformationen, aktualisiert Status und kann weitere Initialisierung auslösen. Payload ist zustandsabhängig. |
| 10 | Lokale Lobby-/Account-Voreinstellungen zurücksetzen | Kein erkennbarer Payload. |
| 11 | Join-/Serverantwort | Untertyp (6 Bit); behandelt bestimmte Join-Antworten und Statusmeldungen. |
| 12 | Match-/Spielmetadaten | Umfangreicher, validierter Datensatz mit Spieler-/Matchfeldern. Kein einzelnes festes Kurzformat. |
| 13 | Ranglisten-/Statistikdaten | Untertyp, Anzahl und je nach Untertyp unterschiedlich breite Records. |
| 14 | Ranglisten-Metadaten | Gruppen-/Namensdaten sowie Listen von 16-Bit-Werten. |
| 15 | Verbindungs-Handshake bestätigt | Startet anschließende Lobby-/Verbindungsinitialisierung. |
| 16 | Lobby-Snapshot-Delta | Änderungen an Spielern/Entries und anschließend aktualisierte Entry-Liste. Siehe unten. |
| 17 | Chatverlauf | Zeit-/Sequenzwert (20 Bit), Anzahl (6 Bit), dann Chat-/Event-Records. Nicht jeder Record ist normaler Text. |
| 18 | Kein expliziter Handler | Im Kontroll-Dispatcher nicht belegt. |
| 19 | Einzelner Live-Chat-/Event-Record | Ein Record; wird in die Lobby-Chatverarbeitung und den Nachrichtenhandler gegeben. Record-Untertypen umfassen mehr als einfachen Text. |
| 20 | Spiel-/Territoriumsstatus | Status-/Wertfelder werden dekodiert und an den Spielstatus weitergereicht. Bedeutung der Werte ist zustandsabhängig. |
| 21, 22 | Leere Zweige | Der Dispatcher verarbeitet hier keinen Payload. |
| 23 | CAPTCHA-Challenge | Challenge-Metadaten, 32-Bit Referenzdaten und 17 Bildblöcke; öffnet den nativen CAPTCHA-Dialog. **Nur Server→Client im Kontrollzweig.** |
| 24 | Lobby-Entry-Auswahl bestätigen | Entry-ID (13 Bit), wird als ausgewählte Lobby gesetzt. |
| 25 | Account-/Social-Statusmeldung | 8-Bit Status und kodierter Name; bestimmte Antwort zeigt eine native Meldung. |
| 26–63 | Kein expliziter Handler | Im aktuellen Kontroll-Dispatcher nicht belegt. |

### Chat-Record-Untertypen (Server → Client, Opcode 17/19)

Die Record-Dekodierung liest zuerst einen 3-Bit Untertyp. Daher bedeutet „Nachricht“ nicht automatisch „User-Text“:

| Untertyp | Erkennbare Daten |
| ---: | --- |
| 0 | Record-ID (30 Bit), optionale Metadaten, kodierter Text. Normaler Text-Record. |
| 1 | Record-ID, Metadaten, Aktions-/Statusfeld und Werte/Empfänger. |
| 2 | Record-ID, Metadaten und Aktions-/Statusfeld. |
| 3 | Record-ID, Metadaten, kurze Kennung, Ziel und Zusatzmetadaten. |
| 4 | Record-ID, Metadaten, Ziel und Zusatzmetadaten. |
| 5 | Nur Untertyp und kleines Statusfeld; kein normaler Chattext. |
| 6 | Numerischer Wert (17 Bit); kein normaler Chattext. |
| 7 | Im Decoder kein Record-Objekt erkennbar. |

Die einzelnen Felder und Texte werden teilweise durch native Hilfsdecoder kodiert. Die Tabelle nennt nur das, was aus dem aktuellen Reader sicher erkennbar ist. Opcode 17 hängt Records an den Verlauf; Opcode 19 leitet einen einzelnen Record an die Live-Verarbeitung weiter.

## Spielzweig (`1`)

Der Spielzweig ist von den Kontrolltabellen getrennt. Client→Server verwendet nach dem Zweigbit einen 4-Bit Untertyp:

| Untertyp | Verhalten | Payload laut Writer |
| ---: | --- | --- |
| 0 | Spielaktion | 22-Bit Wert. |
| 1 | Spielaktion mit zwei Parametern | Zwei 10-Bit Werte. |
| 2 | Spielaktion mit zwei Parametern | 10- und 9-Bit Werte. |
| 3 | Spielaktion mit großem Zusatzwert | 10- und 27-Bit Werte. |
| 4 | Spielaktion mit Text-/Wertparameter | 10- und 16-Bit Werte. |
| 5 | Spielaktion | 10-Bit Wert. |
| 6 | Spielaktion | 10-Bit Wert. |
| 7 | Spielaktion | 1-Bit Wert. |
| 8, 9, 11 | Im untersuchten Writer nicht belegt. | Keine eindeutige Zuordnung. |
| 10 | Spielaktion mit zwei Werten und Text/Passphrase | Zwei 10-Bit Werte und 22-Bit Wert. |
| 12 | Spielresultat/Score übermitteln | Anzahl, Ergebnisoptionen, Map-/Bereichskennungen und Wert je Bereich. |
| 13 | Spielaktion mit Liste | Zielkennung (9 Bit) plus Liste aus 9-Bit Kennungen. |
| 14 | Spielaktion | 9-Bit Wert. |
| 15 | Spielaktion mit zwei Parametern | 9- und 10-Bit Werte. |

Server→Client wird im selben Spielzweig durch zusätzliche Bits und den Spielzustand aufgeteilt. Der aktuelle Build enthält dort dynamische Match-/Tick-Daten und mehrere interne Untertypen. Diese sind nicht mit den 6-Bit Kontroll-Opcodes gleichzusetzen; eine vollständige semantische Tabelle wäre ohne kontrollierte Paketmitschnitte und Zuordnung zum Simulationszustand spekulativ.

## Datenströme und ihre Aktivierung

Es gibt im aktuellen Client keinen einzelnen globalen „Streams aktivieren“-Befehl. Die Daten kommen über mehrere Abläufe:

| Datenstrom | Wie er beginnt | Danach erkennbare Serverdaten | Einordnung |
| --- | --- | --- | --- |
| Verbindung/Handshake | Der Client öffnet die Verbindung, sendet Kontroll-Opcode `1` und verarbeitet die Handshake-/Fortschrittsantworten. | Kontroll-Opcode `15`, danach abhängig vom Status weitere Antworten. | Verbindungs-Lifecycle, kein fachlicher Datenfeed. |
| Lobby-Roster und Entry-Liste | Multiplayer-Lobby beitreten; der native Join-/Handshake-Ablauf startet die Initialisierung. | Kontroll-Opcode `2` als Snapshot, `16` als Änderungen. | Laufender Push-Stream während der Lobby-Sitzung; im Client ist kein separater allgemeiner Subscribe-Opcode dafür sichtbar. |
| Lobby-Chat | Wird nach dem Lobby-Fortschritt separat initialisiert. Der aktuelle Patch nutzt den nativen Aufruf `setNativeLobbyChatMode`; je nach Kontozustand sendet der Native-Client dabei Kontroll-Opcode `17` oder Opcode `15` mit Unter-ID `0`. | Kontroll-Opcode `17` für Verlauf und `19` für einzelne Live-Records. | Das ist der klarste explizite Stream-Aktivierungsablauf. Die genaue Serversemantik der beiden Aktivierungsvarianten ist aus dem minifizierten Client allein nicht vollständig benennbar. |
| Match-/Spielzustand | Erst durch Auswahl/Beitritt zu einem Spiel und die native Matchinitialisierung. | Kontroll-Opcode `12`/`20` sowie Daten im separaten Spielzweig (`1`). | Matchgebundener Datenstrom; er wird nicht allein durch Öffnen der Lobby aktiviert. |
| Ranglisten und Logs | Einzelne Anfrage je Kategorie, Bereich oder Suche; die UI sendet z. B. Kontroll-Opcode `21`, `22`, `23`, `24` oder `28`. | Kontroll-Opcode `13`/`14` und je nach Anfrage die entsprechenden Ergebnisdaten. | Anfrage/Antwort statt dauerhafter Subscription. Beim Öffnen oder Wechseln der Kategorie wird erneut angefragt. |
| Account-/Profilabfragen | Die native Account-Detailansicht startet über Anfrage-ID `16`; deren Handler sendet Kontroll-Opcode `15` mit Unter-ID `2`. | Die passende umfangreiche Antwort kommt über Kontroll-Opcode `12` und wird im Account-Dialog verarbeitet. | Die Anfrage trägt keine sichtbare Ziel-ID im Payload. Andere Accountaktionen haben eigene Anfrage-IDs und sind davon zu unterscheiden. Eine allgemeine Account-Subscription ist nicht belegt. |

Für Diagnosezwecke daher zuerst klären, ob eine **Verbindung**, eine **Lobby-Sitzung**, ein **Chatfeed**, ein **Match** oder eine **einzelne Abfrage** fehlt. Eine offene WebSocket-Verbindung allein bedeutet nicht, dass alle diese Datenströme aktiviert sind.

### Account-Detailabfrage im Ablauf

Beim Öffnen der nativen Account-Detailansicht sendet der UI-Handler `ux(16)` die Abfrage über `b1.ej.ek(2)`: Kontrollzweig `0`, Opcode `15`, Unter-ID `2`. Im Writer folgt danach kein weiterer sichtbarer Payload. Die Serverantwort kommt als Kontroll-Opcode `12`; dessen Handler liest einen großen, typabhängigen Datensatz und übergibt ihn an die Accountansicht. Die gespeicherten Login-Daten werden dabei lokal für die native Anmeldung verwendet; sie sind nicht Teil dieses Opcode-15/Unter-ID-2-Abfragepayloads.

Der gleiche UI-Handler kennt auch Anfrage-ID `17`, die Opcode `15` mit Unter-ID `3` sendet. Aus dem aktuellen Handlerpfad lässt sich deren konkrete Accountfunktion nicht sicher benennen. Daher sollte man die beiden IDs nicht pauschal als dieselbe Accountabfrage zusammenfassen.

## Lobby-Payloads im Detail

### Snapshot (Server → Client, Kontroll-Opcode 2)

Der Snapshot wird nur auf dem erwarteten Lobby-Socket und im Lobbyzustand verarbeitet. Der Decoder liest der Reihe nach:

1. Lobby-/Roster-Status (10 Bit).
2. Spieleranzahl (16 Bit), dann pro Spieler: ID (30 Bit), Name (kodierter String), danach Felder mit Breiten `4, 30, 7, 16, 18, 11, 12, 6, 13, 1` Bit.
3. Entry-/Lobbystatus (10 Bit).
4. Anzahl der Entries (10 Bit), danach pro Entry: Entry-ID (13 Bit), zwei 10-Bit Werte und Entry-Felder mit Breiten `10, 10, 6, 14, 4, 1, 14, 30` Bit. Bei Moduskennung `8` folgt zusätzlich eine Liste von 9-Bit Werten, deren Länge durch den zweiten 10-Bit Entry-Wert bestimmt wird.
5. Eine 13-Bit ausgewählte Entry-ID; `0` bedeutet hier keine ID.

Einige Werte werden an native Lobby-/Entry-Handler übergeben und ihre fachliche Bedeutung lässt sich allein aus dem Reader nicht zuverlässig benennen. Die früher hier dokumentierte 4-Bit Entry-Anzahl und die pauschale Zuordnung einzelner Werte zu Countdown, Spielerzahl oder Contest waren falsch und sind entfernt.

### Delta (Server → Client, Kontroll-Opcode 16)

Das Delta enthält zwei 20-Bit Statuswerte, eine 20-Bit Anzahl von Änderungen und 3-Bit Mutationscodes. Typ `0` fügt einen Spieler hinzu; weitere Typen aktualisieren oder entfernen Spieler-/Lobbydaten. Am Ende folgt die aktualisierte Entry-Liste. Diese Mutationscodes sind keine Top-Level-Opcodes.

### Entry-Auswahl

Client→Server Kontroll-Opcode 2 / Untertyp 4 sendet die 13-Bit Entry-ID plus ein Contest-Bit. Server→Client Kontroll-Opcode 24 bestätigt die ausgewählte 13-Bit Entry-ID. Die Auswahl bedeutet nicht automatisch, dass der Nutzer für ein Match bereit ist.

## Pflegehinweise

- Diese Datei muss nach einem Native-Game-Update erneut gegen `game/latest.js` geprüft werden; `build/game.js` enthält zusätzlich Client-Patches und eignet sich zum Auffinden der aktiven Dispatcher-/Handler-Zuordnungen.
- Aktuelle relevante Stellen im generierten Clientbuild: Dispatcher `aXz.aYa` um Zeile 12518, eingehende Handler `aY1`/`aY3`/`aY5`/`aY7` ab etwa Zeile 12627, ausgehende Writer `aXt`/`aXw`/`aXx`/`aXy`/`aXu`/`aXv` ab etwa Zeile 12836.
- Minifizierte Funktionsnamen und Nummern können sich jederzeit ändern. Opcode-Werte sind keine stabile öffentliche API.
