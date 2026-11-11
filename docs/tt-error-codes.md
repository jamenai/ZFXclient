# Territorial.io-Fehlercodes

Diese Übersicht ist mit dem lokal vorliegenden `build/game.js` sowie den aktuellen Dateien unter `src/adapter` und `patches` abgeglichen. Territorial verwendet diese Werte als Socket-/Spielcodes; sie sind keine HTTP-Statuscodes. Die vom Native-Client angezeigte Meldung, die ZFX-Behandlung und die vermutete Serverursache sind getrennte Dinge.

## Native Meldungen bei Socket-Fehlern

Die Texte stammen aus dem nativen Fehlertext-Handler `a4x` in `build/game.js`. Sie belegen, was der Client anzeigt, aber nicht zwingend die interne Serverursache.

| Code | Native Meldung | Einordnung |
| ---: | --- | --- |
| `1006` | No Internet / No Server Response / Server Restart | WebSocket-Abbruch ohne normalen Close-Code; der Native-Client fasst mehrere Ursachen in diesem Text zusammen. |
| `3249` | No Internet / No Server Response / Server Restart | Gleicher nativer Meldungstext wie `1006`. Die Adapter-Konstante `No server found` ist abweichend und wird im aktuellen Clientcode nicht als Übersetzung verwendet. |
| `4229` | Bad Internet / Unresponsive Client | Native Meldung für Netzwerk-/Clientreaktion. |
| `4495` | Account doesn't exist. | Native Meldung ohne angehängten Code im Text. |
| `4527` | Already logged in to the multiplayer lobby | Native Meldung bei bereits bestehender Multiplayer-Anmeldung. |
| `4528` | Lobby Kick: Another login detected. | Native Meldung für eine andere Anmeldung. |
| `4530` | Lobby Timeout | Native Lobby-Timeout-Meldung. |
| `4540` | You have been kicked. | Native Kick-Meldung; löst zusätzlich den nativen Kick-Pfad aus. |
| `4555` | This Account is blocked. | Native Meldung für ein blockiertes Konto. |
| `4557`–`4560` | Please try again later! | Gemeinsamer nativer Meldungstext. |
| `4577` | Your IP is banned. | Native Meldung. |
| `4580` | More Gold needed | Native Meldung bei nicht ausreichendem Gold. |
| `4589` | Please try again later! | Gleicher nativer Meldungstext wie für `4557`–`4560`. |
| `4591` | Bot Detection | Der Native-Client zeigt einen eigenen Dialog und bietet Reload an. |
| andere | Unknown error | Fallback des nativen Meldungshandlers. |

Der Native-Client filtert manche Codes je nach Verbindungs-/Spielzustand, bevor er diesen Meldungshandler aufruft. Ein fehlender Dialog bedeutet daher nicht automatisch, dass kein Close-Code empfangen wurde.

## ZFX-Behandlung und Adapter-Zuordnungen

| Code | Aktuelle ZFX-Behandlung | Quelle / Einschränkung |
| ---: | --- | --- |
| `4215` | Während des aktiven Multiplayer-Retry-Zeitfensters wird einmalig ein Reconnect gestartet. | Eingehängter Socket-Close-Handler in `patches/patches.js`; die native Serverbedeutung ist nicht bekannt. |
| `4527` | Bei Socket `0` wird der Fehler an `gameSdk.lobby.reportConnectionError` gemeldet. Doppelte Meldungen desselben Codes/Sockets werden im SDK innerhalb von 10 Sekunden unterdrückt. | `patches/patches.js`, `src/adapter/gameSdk.js`; außerdem zeigt Terri die native Meldung. |
| `3249` | Adapter-Wörterbuch enthält „No server found“. | `src/adapter/errorCodes.js`; im aktuellen Client nicht als aktiver Fehlertext-Mapper referenziert. Der Native-Text lautet anders, siehe oben. |
| `4530` | Adapter-Wörterbuch enthält „Lobby Timeout“. | `src/adapter/errorCodes.js`; im aktuellen Client nicht als aktiver Fehlertext-Mapper referenziert. |
| `4705` | Adapter-Wörterbuch enthält „Lobby not found“. | `src/adapter/errorCodes.js`; im aktuellen Clientcode keine Verwendung gefunden. |
| `4730` | Adapter-Wörterbuch enthält „Kicked from lobby“. | `src/adapter/errorCodes.js`; im aktuellen Clientcode keine Verwendung gefunden. |

`src/adapter/errorCodes.js` wird im aktuellen `src`-/`patches`-Code nicht importiert. Die dort vorhandenen Einträge sind deshalb derzeit nur Konstanten und verändern weder native Meldungen noch das Lobbyverhalten.

## Weitere beobachtete Socket-Codes

| Code | Beobachtetes Verhalten | Status |
| ---: | --- | --- |
| `4321` | Der native Socket-Close-Handler stellt gespeicherten Accountnamen und Passwort aus dem lokalen Account-Speicher wieder her. | Verhalten im Client belegt; Ursache des Server-Close-Codes unbekannt. Zugangsdaten werden dabei nicht als Codebedeutung interpretiert. |
| `4403` | In einer früheren Sitzung nach einer Spielauswahl beobachtet. | Im aktuellen Build keine spezielle Textzuordnung oder gezielte ZFX-Behandlung gefunden; Bedeutung ungeklärt. |
| `4516`, `4533`, `4576` | Im Multiplayer-/Account-Zustand von einem bestimmten generischen nativen Fehlerpfad ausgenommen. | Das belegt eine Sonderbehandlung dieses UI-Pfads, aber keine lesbare Bedeutung. |

## Interne Client-Codes

Diese Werte entstehen im Client beim Parsen, Validieren oder Schließen einer Verbindung. Sie sollten nicht als bestätigte serverseitige Fehlercodes dokumentiert werden.

| Code | Verwendung im aktuellen Build |
| ---: | --- |
| `3205`, `3244` | Fehlerpfade des eingehenden Paketdecoders (`aYV`); Parse-/Protokollfehler, nicht als Nutzertext übersetzt. |
| `3254`, `3259`, `3260`, `3265`, `3266`, `3270` | Decoder-Validierungs-/Payloadfehler, die beim Prüfen eingehender Ranglisten-/Datenantworten gesetzt werden. |
| `3256` | Native Lobby-/Verbindungsbereinigung schließt einen Socket mit diesem lokalen Grund. |
| `3239`, `3251`, `3271`–`3277` | Native Handler schließen eine Verbindung, wenn Socket-ID oder erwarteter Spiel-/Lobbyzustand nicht passt. |
| `3260` | Zusätzlich von ZFX beim Retry/Reconnect als lokaler Socket-Schließgrund verwendet. |
| `3240` | In den aktuellen `src`-/`patches`-Dateien nicht mehr verwendet; eine frühere Zuordnung zum Verlassen der Custom Lobby ist nicht aktuell belegt. |

## Diagnose

- Beim Socket-Close protokolliert der Client `socket close index <socketId> error <code>`. Socket-ID und unmittelbar vorausgehender Ablauf sind wichtig, weil dieselbe Zahl je nach Zustand anders behandelt werden kann.
- `4527` wird von ZFX nur auf Lobby-Socket `0` an das SDK weitergereicht; die native Meldung kann unabhängig davon erscheinen.
- `3249` ist in der aktuellen nativen UI kein eindeutiger „Lobby nicht gefunden“-Code. Der Native-Text fasst Netzwerkfehler und Serverneustart zusammen.
- Neue Bedeutungen erst als gesichert eintragen, wenn sie durch aktuellen Handlercode, einen eindeutigen nativen Text oder wiederholbare Beobachtung belegt sind.

## Repository-Referenzen

- `build/game.js`: nativer Meldungshandler `a4x` und Socket-Close-Handler `a4o` (nahe Zeile 3656).
- `patches/patches.js`: ZFX-Retry für `4215` und Meldungsweitergabe für `4527`.
- `src/adapter/gameSdk.js`: Meldungstext und 10-Sekunden-Deduplizierung für `4527`.
- `src/adapter/errorCodes.js`: derzeit nicht eingebundene Fehlertext-Konstanten.
