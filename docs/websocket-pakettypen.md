# WebSocket-Pakettypen (Native-Spielclient)

Diese Übersicht beschreibt die im lokalen Native-Build `game/latest.js` erkennbaren WebSocket-Nachrichten. Das Protokoll ist bitgepackt und verwendet keine JSON-Pakete. Die Nummern sind daher **Opcode-Werte im jeweiligen Protokollzweig**, keine HTTP-Statuscodes oder Lobby-IDs.

## Rahmenformat

Der Native-Decoder `aX3` liest zuerst ein Bit. Bei `0` folgt ein 6-Bit-Opcode (`aX4`); bei `1` wird ein anderer, spielbezogener Datenzweig verarbeitet (`aX5`). Die folgenden Opcode-Tabellen beziehen sich auf den `0`-Zweig. Ausgehende Kontrollnachrichten beginnen ebenfalls mit `0` und danach mit sechs Opcode-Bits. Felder danach sind je nach Nachricht unterschiedlich breit.

Die Bedeutungen beruhen auf den Native-Handlern und den Stellen, an denen der Client die Nachrichten erzeugt oder verarbeitet. Wo der Build keine eindeutige Semantik erkennen lässt, ist das ausdrücklich markiert.

## Client → Server

| Opcode | Bedeutung | Erkennbarer Payload / Hinweise |
| ---: | --- | --- |
| 1 | Verbindung anmelden / initialisieren | Spielmodus-ID, Benutzername und RGB-Farbe. Wird beim Öffnen der Verbindung gesendet. |
| 2 | Lobby-Aktion | 3-Bit-Untertyp: `0` Chatverlauf anfordern, `1` Chatansicht deaktivieren, `3` Textnachricht senden, `4` Lobby-Entry auswählen, `5` weitere Entry-Aktion. |
| 3 | Numerischen Wert melden | 6-Bit-Feld-ID und 30-Bit-Wert. Die Bedeutung hängt von der Feld-ID und dem Aufrufer ab. |
| 6 | Text/Payload senden | Der Writer kodiert einen String mit 16-Bit-Zeichen. Verwendungszweck abhängig vom Aufrufer; keine eindeutige globale Bedeutung aus dem Opcode allein. |
| 8 | Spielaktion | Untertyp, 30-Bit-Wert, 32-Bit-Wert und 16-Bit-Wert. Wird im Spielzweig verwendet. |
| 9 | Liste von Wertepaaren senden | Wiederholte Paare aus 16- und 10-Bit-Werten. Verwendungszweck kontextabhängig. |
| 13 | Lobby-/Spielbeitrittsparameter senden | Enthält unter anderem Modus-/Clientdaten und Zusatzdaten aus dem Lobby-Parameter-Writer. |
| 15 | Befehl mit 6-Bit-ID | Der konkrete Befehl ergibt sich aus der ID und dem Aufrufer. |
| 19 | Einzelne Chat-/Benachrichtigungsmeldung | Dekodiert einen einzelnen Record und übergibt ihn an `bq.message.aGi`; Text-Record: `id: 0`, Sender-ID, kodierter Text. |
| 21 | Koordinaten-/Bereichsabfrage | 6-Bit Untertyp und zwei vorzeichenbehaftet kodierte Koordinaten (je Vorzeichenbit + 30-Bit Betrag). |
| 22 | Textbasierte Abfrage | 6-Bit Untertyp, kodierter String und 30-Bit Zusatzwert/Offset. |
| 23 | Mehrere Textwerte abfragen | 3-Bit Untertyp und eine Liste kodierter Strings. |
| 24 | Koordinaten-/Bereichsabfrage (kompakte Variante) | 3-Bit Untertyp und zwei vorzeichenbehaftete 20-Bit Koordinaten. |
| 26 | Textwert setzen/senden | 6-Bit Feld-ID, 6-Bit Textlänge und Text. Die Feld-ID bestimmt die genaue Semantik. |
| 28 | Abfrage mit Kurzkennung | 6-Bit Untertyp, 30-Bit kodierte Kennung und 30-Bit Zusatzwert/Offset. |
| 30 | Aktion mit drei Parametern | 3-Bit Typ sowie zwei 30-Bit Werte. Bedeutung kontextabhängig. |

## Server → Client

Diese Tabelle folgt dem eingehenden Dispatcher `aX4`. Ein Opcode kann je nach Verbindung (`oN`) und aktuellem Spielzustand unterschiedlich reagieren.

| Opcode | Bedeutung | Erkennbarer Payload / Hinweise |
| ---: | --- | --- |
| 0 | Allgemeine Werte aktualisieren | Anzahl, Bitbreite und Folge von Werten; wird an einen allgemeinen Werte-Handler weitergereicht. |
| 2 | Lobby-Snapshot | Initialisiert Lobby-Daten: Lobby-Status, Liste von Entries und initiale Spielerliste. Siehe „Lobby-Daten“ unten. |
| 3, 4 | Im Kontroll-Dispatcher ignoriert | Der Client verwirft den aktuellen Lobby-Kontext; im Handler ist kein weiterer Payload-Decoder erkennbar. |
| 5 | Farb-/Palette-Daten | ID, 11 RGB-Farbwerte und ein kodiertes Zusatzfeld. |
| 9 | Verbindungs-/Spielbeitrittsfortschritt | Aktualisiert Join-Informationen und stößt abhängig vom Zustand weitere Initialisierung an. |
| 10 | Lobby-/Spielzustand zurücksetzen | Setzt lokale Lobby-/Account-Voreinstellungen zurück. |
| 11 | Join-/Serverantwort | Verarbeitet die Join-Antwort und aktualisiert abhängig von Verbindung und Zustand weitere Daten. |
| 12 | Spiel-/Matchdaten | Dekodiert einen umfangreichen Datensatz mit Spieler-/Matchinformationen. |
| 13 | Ranglisten-/Statistikdaten | Antwort mit Untertyp, Anzahl und typabhängigen Datensätzen. |
| 14 | Ranglisten-Metadaten | Antwort mit Gruppen-/Namensdaten und Listen von 16-Bit-Werten. |
| 15 | Verbindungs-Handshake bestätigt | Wird vor weiteren lobbybezogenen Initialisierungsschritten behandelt. |
| 16 | Lobby-Änderungen (Delta) | Aktualisiert geänderte Spieler- und Lobbydaten, danach wird die Lobby-Liste erneut dekodiert. |
| 17 | Chatverlauf / Nachrichtenliste | Liest eine 6-Bit Anzahl von Records und reiht dekodierte Textnachrichten in `bq.z.tN` ein. Text-Record: `id: 0`, Sender-ID (30 Bit), kodierter Text. |
| 19 | Einzelne Chat-/Benachrichtigungsmeldung | Dekodiert einen einzelnen Record und übergibt ihn an `bq.message.aGi`; Text-Record: `id: 0`, Sender-ID, kodierter Text. |
| 20 | Join-/Spielzustandsantwort | Verarbeitet Join-Informationen und kann eine Initialisierung auslösen. |
| 21, 22 | Im Kontroll-Dispatcher ohne Handler | Die Opcode-Zweige sind leer; daraus lässt sich keine Bedeutung ableiten. |
| 23 | Join-/Spielzustandsantwort | Verarbeitet Join-Informationen und kann eine Initialisierung auslösen. |
| 24 | Bestätigung der ausgewählten Lobby | Liest eine 13-Bit Entry-ID und setzt diese als aktuell ausgewählte Lobby. |

Nicht aufgeführte Opcode-Werte besitzen in diesem Dispatcher keinen expliziten Handler. Das beweist nicht, dass sie im alternativen Spiel-Datenzweig oder in einem anderen Verbindungsmodus unbenutzt sind.

## Lobby-Daten im Detail

### Snapshot (Server → Client, Opcode 2)

Der Snapshot enthält eine Liste von bis zu 15 Lobby-Entries (4-Bit Anzahl). Jeder Entry hat folgende Felder:

| Feld | Breite | Bedeutung im Client |
| --- | ---: | --- |
| `id` | 13 Bit | Entry-ID; wird zum Auswählen an den Server zurückgesendet. |
| `wK` | 12 Bit | Zeit-/Countdown-Wert; die native UI formatiert ihn als `MM:SS`. |
| `h2` | 16 Bit | Anzahl-/Kapazitätswert, den die UI als Spielerzahl darstellt. |
| `fF` | 6 Bit | Karten-/Map-Kennung. |
| `mapSeed` | 14 Bit | Map-Seed. |
| `vz` | 4 Bit | Modus-/Team-Kennung. |
| `wN` | 1 Bit | Contest-Markierung. |

Anschließend folgen die initialen Spielerdaten. Die native Lobby zeichnet daraus die Spielerliste; der Snapshot bezieht sich auf den aktuellen Lobbyzustand und liefert nicht beliebige historische oder kommende Entries mit einer separaten Roster-Abfrage.

### Delta (Server → Client, Opcode 16)

Das Delta beginnt mit zwei 20-Bit Lobby-Statuswerten und einer 20-Bit Anzahl von Änderungen. Jede Änderung hat einen 3-Bit Typ. Typ `0` fügt einen Spieler hinzu; weitere Typen aktualisieren oder entfernen Spieler-/Lobbydaten. Am Ende wird die Entry-Liste erneut dekodiert. Die konkreten Typen sind interne Mutationscodes innerhalb des Deltas, keine eigenständigen Top-Level-WebSocket-Opcodes.

### Entry-Auswahl (Client → Server, Opcode 2 / Untertyp 4)

Die Auswahl sendet die 13-Bit Entry-ID. Die Bestätigung kommt als eingehender Opcode `24` mit derselben 13-Bit ID. Das Feld `selected` in den SDK-Traces ist damit die lokal ausgewählte Entry-ID; es bedeutet für sich allein nicht, dass der User als Spieler für das nächste Spiel „ready“ ist.

## Grenzen und Pflege

- `game/latest.js` ist minimierter Native-Code mit internen, wechselnden Funktionsnamen. Die Tabelle beschreibt den lokal vorliegenden Build und kann sich mit einem Spielupdate ändern.
- Viele Nachrichten tragen Untertypen oder Feld-IDs. Der Top-Level-Opcode allein reicht deshalb nicht immer, um eine konkrete Aktion zu benennen.
- Die Semantik einiger Payloads ist nur aus Feldbreiten und Aufrufern abgeleitet. Diese Einträge sind als kontextabhängig oder allgemein beschrieben und sollten nicht als stabile öffentliche Protokollspezifikation behandelt werden.
- Für Änderungen zuerst den eingehenden Dispatcher `aX4`/`aX5` und die Writer `aWN`, `aWO`, `aWR` in `game/latest.js` prüfen. Die Bit-Reader-/Writer-Implementierungen sind `d8`/`a7`.
