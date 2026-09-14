---
title: Authentifizierung
description: Die API nutzt Bearer-Tokens, die bei der Anmeldung ausgestellt werden. CLI und iOS-App holen eines über den Browser; Skripte verwenden es weiter.
order: 1
updated: 2026-09-10
---

## Bearer-Tokens

Jede Anfrage an `/api/v1` trägt ein Sitzungs-Token:

```http
GET /api/v1/me HTTP/1.1
Host: app.trackr.dev
Authorization: Bearer <token>
```

Es sind dieselben Sitzungs-Tokens, die die Web-App im Cookie nutzt, das Berechtigungsmodell ist identisch. Ein `401` bedeutet: Token weg, neu anmelden.

> [!NOTE]
> **API-Keys und OAuth**
>
> Neben Sitzungs-Tokens gibt es persönliche API-Keys (`trk_…`). Admins stellen sie unter **Admin → Verzeichnis → Nutzer** oder **Admin → Einstellungen → API-Keys** aus; Nutzer, die es dürfen, legen eigene unter **Konto → Verbundene Apps** an, wo sich jeder Key auch widerrufen lässt. Ein Key wird einmal angezeigt und handelt als sein Nutzer auf `/api/v1`, bei Anhang-Downloads und am [MCP-Server](/docs/developers/mcp). MCP-Clients können sich auch per OAuth anmelden. Das `trackr`-CLI speichert ein Sitzungs-Token im Schlüsselbund und erneuert es automatisch.

## Token-Rotation

Antworten können einen `set-auth-token`-Header mit einem neuen Token enthalten. Clients müssen ihn übernehmen und das alte Token verwerfen. CLI und iOS-App tun das transparent; wer einen eigenen Client schreibt, speichert den Header-Wert, sobald er auftaucht.

## Anmeldung aus einem Client

Die Login-Seite kennt zwei Client-Modi, damit native Apps und Terminals ein Token bekommen, ohne Passwörter anzufassen:

| Client         | Ablauf                                                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CLI**        | `trackr login` startet einen Loopback-Listener, öffnet `/login?client=cli&port=<port>&state=<nonce>` im Browser und empfängt das Token unter `http://127.0.0.1:<port>/callback`. Der State wird zeitkonstant verglichen. |
| **Native App** | Die App öffnet `/login?client=native`; nach der Anmeldung leitet der Browser mit dem Token auf das URL-Schema der App (`dev.kilicer.trackr://auth?token=…`) weiter.                                                      |

Für Umgebungen ohne Browser gibt es `trackr login --no-browser` (URL wird ausgegeben; SSH-Sitzungen wechseln automatisch in diesen Modus) oder `trackr login --token`, das ein anderswo erhaltenes Token aus einer verdeckten Eingabe oder von stdin liest (`pbpaste | trackr login --token`).

## Instanz prüfen

Vor der Anmeldung prüfen Clients, ob eine URL wirklich ein Trackr-Server ist:

```bash
curl https://app.trackr.dev/api/v1/instance
# { "name": "trackr", "version": "0.0.1", "api": 1, "branding": { "name": "…", "logoUrl": "…" } }
```

Clients prüfen `name === "trackr"`. Das ist der einzige Endpunkt unter `/api/v1`, der ohne Token funktioniert; er beantwortet auch `OPTIONS` für Cross-Origin-Prüfungen.
