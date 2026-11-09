# Territorial.io-Fehlercodes

Diese Liste sammelt Fehlercodes, die der ZFX-Client im nativen Spielcode behandelt oder die in der laufenden Client-Sitzung beobachtet wurden. Die Socket-Fehlercodes sind spielinterne Werte; sie sind keine HTTP-Statuscodes. Wo der Native-Code keine Bedeutung erkennen lässt, ist der Code ausdrücklich als ungeklärt markiert.

## Bekannte Codes

| Code | Bekannte Bedeutung / Verhalten | Evidenz und Einschränkung |
| ---: | --- | --- |
| `3249` | „No servers found“ (Keine Server gefunden) | Wird im Custom-Lobby-Patch als native Fehlermeldung gesetzt, wenn kein Server erreichbar ist. |
| `4215` | Verbindungsfehler mit automatischem Wiederverbindungsversuch | Der ZFX-Client startet bei diesem Socket-Code innerhalb des aktiven Retry-Zeitfensters einen erneuten Multiplayer-Verbindungsversuch. Die eigentliche Serverbedeutung ist im Client nicht dokumentiert. |
| `4321` | Ungeklärt | Wird vom nativen Socket-Close-Handler protokolliert. Der Client enthält dafür keine belastbare Fehlerbeschreibung. In einer Sitzung trat der Code beim Öffnen von „My Account“ auf; das belegt den Zusammenhang mit diesem Ablauf, aber nicht die Ursache. |
| `4403` | Ungeklärt | Wurde in einer Sitzung kurz nach dem Auswählen eines Spiels gemeldet. Der Client ordnet dem Code keine Bedeutung zu. |
| `4705` | „Lobby not found“ (Lobby nicht gefunden) | Explizite Fehlertext-Zuordnung im Custom-Lobby-Patch. |
| `4730` | „Kicked from lobby“ (Aus der Lobby entfernt) | Explizite Fehlertext-Zuordnung im Custom-Lobby-Patch. |

## Interne Verbindungswerte

Diese Werte werden vom Client beim Schließen oder Zurücksetzen einer Verbindung verwendet. Sie sind keine bestätigten Server-Fehlercodes.

| Code | Verwendung |
| ---: | --- |
| `3240` | Verbindungsabschluss beim Verlassen einer Custom Lobby. |
| `3260` | Vom Client ausgelöster Socket-Abschluss, unter anderem für Multiplayer-Neustart und Reconnect. |

## Diagnosehinweise

- Im nativen Close-Handler protokolliert das Spiel `socket close index <socketId> error <code>`. Der Socket-Index hilft einzugrenzen, welche Verbindung betroffen ist.
- Ein Code allein verrät nicht, ob Anmeldung, Kontoabfrage, Lobbybeitritt oder Spielstart fehlgeschlagen ist. Zeitpunkt, Socket-Index und unmittelbar vorausgehende Aktion mitprotokollieren.
- Die Meldung „No servers found“ für `3249` stammt aus einer ZFX-Patch-Zuordnung; sie ist keine vollständige öffentliche Spezifikation des Territorial.io-Protokolls.
- Neue Bedeutungen erst als bestätigt eintragen, wenn sie durch nativen Handlercode, einen eindeutig zugeordneten Servertext oder wiederholbare Beobachtungen belegt sind.

## Quellen im Repository

- `patches/customLobby.js`: Fehlertext-Zuordnungen für `3249`, `4705` und `4730`; Verwendung von `3240` beim Verlassen.
- `patches/patches.js`: Retry-Verhalten für `4215` und vom Client ausgelöste Verbindungsabschlüsse mit `3260`.
- `patches/customLobby.js`: nativer Socket-Close-Handler protokolliert Fehlercodes; der vorhandene `4321`-Zweig enthält keine Fehlerbehandlung oder Beschreibung.
