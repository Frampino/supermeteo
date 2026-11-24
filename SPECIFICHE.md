# App meteo: specifiche

Esercizio a microservizi: Python, Kafka, Java, PostgreSQL, Jakarta EE, web app.
Prima la web app; l'app per telefono è una seconda fase (sezione 5).

```
Open-Meteo -> raccoglitore (Python) -> Kafka, topic "meteo" -> archivio (Java) -> PostgreSQL
                                                                                     |
                              browser <- web (HTML/JS) <- HTTP/JSON <- api-meteo (Jakarta EE)
```

La pagina parla solo con `api-meteo`: non conosce Kafka né il database.

## Cartelle

```
meteo-app/
  raccoglitore/   Python: produttore
  archivio/       Java: consumatore e salvataggio
  api-meteo/      Jakarta EE: API
  web/            HTML, CSS, JavaScript
```

## Contratto: il messaggio sul topic "meteo"

Topic `meteo`, 3 partizioni. Chiave: la città (così i dati di una città restano in ordine).
Valore JSON, UTF-8:

| campo | tipo | significato |
|---|---|---|
| `citta` | testo | minuscolo, senza accenti, parole unite da `_` (es. `colle_val_delsa`) |
| `ora` | testo | ora della misura in UTC, ISO 8601 con `Z` (es. `2026-11-24T09:15:00Z`) |
| `temperatura` | numero o null | °C |
| `vento` | numero o null | km/h |
| `pioggia` | numero o null | mm nell'intervallo della misura |

Chi aggiunge un campo non rompe gli altri: chi legge ignora i campi che non conosce.

## 1. Raccoglitore (Python)

- Ogni 15 minuti, per ogni città:
  `https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current=temperature_2m,wind_speed_10m,precipitation&timezone=UTC`
- Campi della risposta: `current.time` (senza secondi né `Z`: vanno aggiunti), `current.temperature_2m`,
  `current.wind_speed_10m`, `current.precipitation`.
- Se una città dà errore: stampa l'errore e passa alla successiva. Non si ferma.
- Configurazione da variabili d'ambiente: `KAFKA_SERVER` (predefinito `localhost:9092`), `INTERVALLO_SECONDI` (900).

| citta | latitudine | longitudine |
|---|---|---|
| `siena` | 43.3188 | 11.3308 |
| `firenze` | 43.7696 | 11.2558 |
| `pisa` | 43.7228 | 10.4017 |
| `grosseto` | 42.7603 | 11.1136 |
| `colle_val_delsa` | 43.4203 | 11.1264 |

Coordinate da ricontrollare prima dell'uso.

**Finito quando:** un consumatore di prova vede 5 messaggi a ogni giro, e con un indirizzo sbagliato per una città ne vede 4.

## 2. Archivio (Java)

- Gruppo `archivio`, `auto.offset.reset=earliest`, `enable.auto.commit=false`.
- Per ogni messaggio: INSERT con PreparedStatement (il JSON lo legge PostgreSQL con `jsonb`, senza librerie in piu), poi `commitSync()` dopo tutto il blocco.
- JSON illeggibile: lo stampa e lo salta, altrimenti un messaggio rotto blocca tutto.
- Database spento: si ferma con errore e non conferma. Al riavvio riparte da lì.

```sql
CREATE TABLE IF NOT EXISTS misure (
    citta       TEXT NOT NULL,
    ora         TIMESTAMPTZ NOT NULL,
    temperatura DOUBLE PRECISION,
    vento       DOUBLE PRECISION,
    pioggia     DOUBLE PRECISION,
    PRIMARY KEY (citta, ora)
);
-- INSERT ... ON CONFLICT (citta, ora) DO NOTHING
```

La chiave è (città, ora) e non (partizione, offset): Open-Meteo aggiorna ogni 15 minuti, quindi la stessa misura
può arrivare due volte con offset diversi.

**Finito quando:** spegni l'archivio, passano due giri, lo riaccendi e le misure ci sono tutte, senza doppioni.

## 3. API (Jakarta EE)

| richiesta | risposta |
|---|---|
| `GET /api/citta` | `["siena", "firenze", ...]` |
| `GET /api/meteo/{citta}` | l'ultima misura, con gli stessi campi del messaggio |
| `GET /api/meteo/{citta}/storico?ore=24` | lista di misure, dalla più vecchia |

Città sconosciuta: 404. `ore` fuori da 1-168: 400. Legge soltanto, non scrive mai.

## 4. Web (HTML, CSS, JavaScript)

- Una pagina sola, senza framework. Si vede bene anche a larghezza telefono (360 px).
- Elenco città con temperatura, vento e pioggia; clic su una città: grafico delle ultime 24 ore.
- Dati con `fetch("/api/...")`, aggiornati ogni 5 minuti. Ore mostrate nel fuso del browser (nei dati sono UTC).
- Se l'API non risponde: messaggio chiaro, e restano visibili gli ultimi dati con la loro ora.
- Testo dall'API inserito con `textContent`, mai con `innerHTML`.
- In fondo: `Dati meteo: Open-Meteo.com (CC BY 4.0)`.
- Servita da un container web (nginx) che gira `/api/` verso `api-meteo`: stesso indirizzo, quindi niente CORS.

**Finito quando:** spegni `api-meteo` e la pagina lo dice senza rompersi; lo riaccendi e si aggiorna da sola.

## 5. Dopo: telefono

Da decidere a web app finita. L'API non cambia, quindi si aggiunge senza toccare il resto:
- PWA: la stessa pagina installabile sulla Home di Android e iPhone (serve https);
- Android: app Kivy o simile che chiama la stessa API;
- iPhone: app vera solo con Mac e account Apple.

## Fonte dei dati

Open-Meteo, uso non commerciale: meno di 10.000 chiamate al giorno, nessuna chiave, citazione obbligatoria.
5 città ogni 15 minuti sono 480 chiamate al giorno.
