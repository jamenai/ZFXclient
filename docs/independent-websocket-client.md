# Independent WebSocket Client

## Ziel

Der ZFX-Client soll seine Views, Navigation und Anwendungslogik selbst verwalten und direkt über einen eigenen Territorial.io-WebSocket-Adapter mit dem Spielserver kommunizieren. Der native Client bleibt während der Migration als spielbarer Rückfallpfad verfügbar.

## Ist-Zustand

- `src/gameSdk.js` ist eine normalisierte Datenfassade. Sie erhält Lobby-, Spieler- und Matchdaten aus Hooks im nativen Spielcode.
- `patches/gameSdk.js` hängt diese Hooks an den nativen Decoder und delegiert Aktionen wie Entry-Auswahl und Chat an native Methoden.
- `docs/websocket-pakettypen.md` beschreibt bekannte bitgepackte Nachrichten des nativen Protokolls. Es ist noch keine vollständige Protokollspezifikation.
- Der Account-Login ist noch nicht als eigenständige Socket-Sequenz dokumentiert. Die bekannte Sequenz läuft über native Account-Felder und den nativen Socket-Manager.

Damit ist das heutige `gameSdk` noch kein direkter WebSocket-Adapter. Es kann später als stabile API für die Views dienen, wenn Datenquellen und Befehle aus dem nativen Spiel herausgelöst werden.

## Zielarchitektur

```text
ZFX Views und Route Manager
             |
     Territorial Client API
       /              \
Native Adapter      Direct Adapter
       |                 |
Native Game Hooks    WebSocket + Protocol Codec
                         |
                  Territorial.io Servers
```

Die beiden Adapter implementieren denselben Anwendungsvertrag. Pro Sitzung ist genau ein Adapter für schreibende Aktionen aktiv. Während der Migration bleibt `Native Adapter` der Standard; `Direct Adapter` wird nur für vollständig verstandene Abläufe aktiviert.

## Verantwortlichkeiten

### Route Manager

Verwaltet `home`, `lobby`, `login`, `match` und `replay`. Native Ereignisse dürfen Fakten wie „Match gestartet“ melden. Die Entscheidung, welche View darauf folgt, liegt beim ZFX-Route-Manager.

### Territorial Client API

Bietet transportneutrale Methoden und Events, zum Beispiel:

- `connect()` / `disconnect()` / `getConnectionState()`
- `login(credentials)` / `logout()`
- `getLobbySnapshot()` / `selectEntry(id)` / `sendLobbyMessage(text)`
- `on(event, listener)` für Verbindungs-, Lobby-, Chat-, Account- und Match-Updates

Die API gibt normalisierte Daten zurück. Views greifen weder direkt auf Socket-Frames noch auf native Minified-Objekte zu.

### Direct Adapter

Kapselt Verbindung, Serverauswahl, Bit-Reader/Writer, Authentifizierung, Paketsequenzen, Antworten, Wiederverbindung und Fehlerdiagnose. Der Protokollcode bleibt unabhängig von Vue und dem Route Manager.

## Migrationsschritte

1. **Vertrag festlegen:** Die vorhandenen Daten- und Befehlsmethoden aus `src/gameSdk.js` als transportneutrale API definieren. Native Hooks werden in einen eigenen `NativeAdapter` verschoben.
2. **Protocol Core isolieren:** Bit-Reader, Bit-Writer, Paket-Dispatcher und Sequenz-Traces ohne Browser-UI oder native globale Variablen kapseln.
3. **Abläufe vervollständigen:** Für jeden Flow Request, Antwort, Zustandsänderung und Fehler dokumentieren. Lobby-Snapshot, Deltas, Auswahl und Chat zuerst; Authentifizierung separat untersuchen.
4. **Direct Adapter im Lesemodus:** Den Direct Adapter verbinden und eingehende Daten mit dem nativen Snapshot vergleichen. Er sendet in dieser Phase keine konkurrierenden Aktionen.
5. **Befehle einzeln migrieren:** Einen Flow nach dem anderen hinter einem Adapter-Schalter aktivieren. Bei fehlender Antwort oder unerwartetem Zustand auf den nativen Adapter zurückfallen.
6. **Native UI-Routen ablösen:** ZFX übernimmt die Navigation, während die native Engine zunächst weiterhin tatsächliche Partien rendert und simuliert.

## Spielbarkeitsregeln

- Keine native und direkte Verbindung gleichzeitig für dieselbe Aktion schreiben lassen.
- Den nativen Pfad erst abschalten, wenn der entsprechende Direct-Flow reproduzierbar funktioniert.
- Unbekannte oder veraltete Pakete dürfen nicht stillschweigend als Erfolg gelten.
- Änderungen am Direct Adapter müssen ohne Änderung des Native Adapters zurücknehmbar sein.
- Pro Flow eine Diagnosespur mit Socket-Index, Richtung, Opcode, Sequenz und normalisiertem Ergebnis führen; Passwörter und andere Geheimnisse niemals protokollieren.

## Offene Protokollbereiche

- Login: Verbindungsauswahl, Auth-Payload, Handshake, Erfolgs- und Fehlerantworten.
- Konto: Profil, E-Mail-Aktionen und gespeicherte Identität.
- Lobby: Vollständige Bedeutungen der Untertypen und aller Delta-Änderungen.
- Match: Eintritt, Start, laufende Spielnachrichten, Ergebnis und Rückkehr in die Lobby.
- Transport: Socket-Hosts, Socket-Indizes, Session-Lebensdauer und Wiederverbindung.

Die Einträge in `docs/websocket-pakettypen.md` sind die derzeitige Evidenzbasis. Ungeklärte Felder bleiben dort und hier ausdrücklich als offen markiert, bis der Native-Code oder wiederholbare Paket-Traces sie bestätigen.
