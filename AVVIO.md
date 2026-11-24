# SuperMeteo: come accendere e spegnere tutto

Comandi dalla cartella `meteo-app`.

## Accendere
1. Docker Desktop aperto, poi: `docker start kafka postgres api-meteo`
2. Archivio: VS Code, Ctrl+Shift+D, "Archivio". Da terminale:
   `java -cp "archivio\target\classes;archivio\target\lib\*" meteo.Archivio`
3. Raccoglitore: VS Code, "Raccoglitore (ogni ora)". Da terminale con l'ambiente Python attivo:
   `python raccoglitore\raccoglitore.py`
   Fa subito un giro, poi uno all'ora.

## Controllare
- Contenitori: `docker ps`
- Dati: `docker exec postgres psql -U meteo -d meteo -c "SELECT * FROM misure ORDER BY ora DESC LIMIT 10"`
- Messaggi in attesa (LAG deve essere 0):
  `docker exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group archivio`

Open-Meteo aggiorna ogni 15 minuti: se riaccendi prima, l'archivio stampa "gia' presente". È normale.
Dopo `docker start` aspetta 15-20 secondi che Kafka sia pronto.
In DBeaver, dopo un riavvio: clic destro sulla connessione, Invalidate/Reconnect.

## Spegnere
1. Ctrl+C sul raccoglitore, poi sull'archivio
2. `docker stop api-meteo kafka postgres`

Mai `docker rm`: cancella i dati (fino al passo 3 del piano).

## Se cambia il codice Java
VS Code ricompila da solo. Da terminale, nella cartella `archivio`: `mvn compile`
Serve Java 25.

## API (Jakarta EE)
- Pagina: `http://localhost:8080/`
- Indirizzi: `http://localhost:8080/api/ciao`, `/api/citta`, `/api/meteo`, `/api/meteo/siena`, `/api/meteo/siena/storico?ore=24`
- Dopo una modifica: nella cartella `api-meteo` `mvn package`, poi `docker restart api-meteo` (circa 20 secondi)
- Errori del server: `docker logs --tail 50 api-meteo`
- La prima volta, da `meteo-app` (una riga sola; serve `api.env`, vedi `api.env.example`):
  `docker run -d --name api-meteo --network meteo --env-file api.env -p 127.0.0.1:8080:8080 -v "${PWD}/api-meteo/target/api-meteo.war:/opt/payara/deployments/api-meteo.war:ro" payara/micro:7.2026.11-jdk25 --deploy /opt/payara/deployments/api-meteo.war --contextroot /`
- `api-meteo` e `postgres` sono nella stessa rete Docker, `meteo`: per questo il database si chiama `postgres` e non `localhost`.
