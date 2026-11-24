# Come accendere e spegnere tutto

Comandi dalla cartella `meteo-app`.

## Accendere
1. Docker Desktop aperto, poi: `docker start kafka postgres`
2. Archivio: VS Code, Ctrl+Shift+D, "Archivio". Da terminale:
   `java -cp "archivio\target\classes;archivio\target\lib\*" meteo.Archivio`
3. Raccoglitore, da terminale con l'ambiente Python attivo: `python raccoglitore\raccoglitore.py`
   (ogni 15 minuti; l'avvio di VS Code usa 30 secondi ed è solo per le prove)

## Controllare
- Contenitori: `docker ps`
- Dati: `docker exec postgres psql -U meteo -d meteo -c "SELECT * FROM misure ORDER BY ora DESC LIMIT 10"`
- Messaggi in attesa (LAG deve essere 0):
  `docker exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group archivio`

## Spegnere
1. Ctrl+C sul raccoglitore, poi sull'archivio
2. `docker stop kafka postgres`

Mai `docker rm`: cancella i dati (fino al passo 3 del piano).

## Se cambia il codice Java
VS Code ricompila da solo. Da terminale, nella cartella `archivio`: `mvn compile`
Serve Java 25.
