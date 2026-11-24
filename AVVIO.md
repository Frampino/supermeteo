# Come accendere e spegnere tutto

Comandi dalla cartella `meteo-app`.

## Accendere
1. Docker Desktop aperto, poi: `docker start kafka postgres`
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
2. `docker stop kafka postgres`

Mai `docker rm`: cancella i dati (fino al passo 3 del piano).

## Se cambia il codice Java
VS Code ricompila da solo. Da terminale, nella cartella `archivio`: `mvn compile`
Serve Java 25.
