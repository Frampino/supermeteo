# Raccoglitore: chiede il meteo a Open-Meteo e lo pubblica sul topic "meteo".
#
# Il giro è sempre lo stesso:
#   1. per ogni città chiama Open-Meteo su internet
#   2. prende solo i campi che servono e ne fa un messaggio
#   3. manda il messaggio a Kafka
#   4. aspetta e ricomincia
# Non sa niente di Java e del database: conosce solo Open-Meteo e Kafka.

import json, os, time #os è operation system
# json: trasforma un dizionario Python in testo JSON e viceversa
# os:   parla con il sistema operativo (operating system); qui serve per leggere le variabili d'ambiente
# time: serve per la pausa tra un giro e l'altro
from urllib.parse import urlencode      # prepara la parte dell'indirizzo dopo il ?
from urllib.request import urlopen      # apre un indirizzo internet e legge la risposta
from confluent_kafka import Producer    # la libreria di Kafka: qui serve solo chi pubblica

# os.environ.get(nome, predefinito): se la variabile d'ambiente non esiste usa il secondo valore.
# Così si cambia configurazione senza toccare il codice (per esempio dentro Docker).
KAFKA_SERVER = os.environ.get("KAFKA_SERVER", "localhost:9092") #accede a kafka
# questa riga prende solo l'indirizzo: il collegamento vero lo apre Producer, più sotto
INTERVALLO_SECONDI = int(os.environ.get("INTERVALLO_SECONDI", "900"))
# le variabili d'ambiente sono sempre testo, per questo int(); 900 secondi = 15 minuti

# citta: (latitudine, longitudine)
# è un dizionario: la chiave è il nome, il valore è una coppia (tupla) di coordinate
CITTA = {
    "siena": (43.3188, 11.3308),
    "firenze": (43.7696, 11.2558),
    "pisa": (43.7228, 10.4017),
    "grosseto": (42.7603, 11.1136),
    "colle_val_delsa": (43.4203, 11.1264),
}

# Riceve il nome di una città e restituisce il messaggio da pubblicare (un dizionario).
def leggi_meteo(citta):
    # la coppia viene divisa in due variabili
    latitudine, longitudine = CITTA[citta]
    # urlencode trasforma il dizionario in: latitude=43.3188&longitude=11.3308&current=...
    parametri = urlencode({
        "latitude": latitudine,
        "longitude": longitudine,
        "current": "temperature_2m,wind_speed_10m,precipitation",  # solo i dati attuali che ci servono
        "timezone": "UTC",  # un solo fuso per tutti: niente problemi con l'ora legale
    })
    # with chiude da solo il collegamento, anche se c'è un errore
    # timeout=10: se Open-Meteo non risponde entro 10 secondi si rinuncia, invece di aspettare per sempre
    with urlopen(f"https://api.open-meteo.com/v1/forecast?{parametri}", timeout=10) as risposta:
        # json.load: da testo JSON a dizionario Python; ["current"] prende solo la parte dei dati attuali
        attuale = json.load(risposta)["current"]
    # I nomi qui a sinistra sono il "contratto" con l'archivio Java: se ne cambi uno, l'archivio non lo trova più.
    return {
        "citta": citta,
        "ora": attuale["time"] + ":00Z",  # arriva come 2026-11-24T09:15, la Z vuol dire UTC
        "temperatura": attuale["temperature_2m"],  # gradi °C
        "vento": attuale["wind_speed_10m"],        # km/h
        "pioggia": attuale["precipitation"],       # mm
    }

# Callback: non la chiamiamo noi. La chiama la libreria per ogni messaggio,
# quando Kafka risponde che l'ha ricevuto (o che non c'è riuscito).
def consegnato(err, msg):
    if err:
        print("Errore Kafka:", err)
    else:
        # la chiave viaggia come byte: decode() la riporta a testo
        print(f"inviato {msg.key().decode()} -> partizione {msg.partition()}, offset {msg.offset()}")

def main():
    # il producer: gli basta l'indirizzo di Kafka
    p = Producer({"bootstrap.servers": KAFKA_SERVER})
    try:
        # ciclo infinito: un servizio resta sempre acceso
        while True:
            # un giro su tutte le città (for su un dizionario scorre le chiavi)
            for citta in CITTA:
                # try dentro il for: se una citta fallisce, le altre continuano
                try:
                    misura = leggi_meteo(citta)
                    # key=citta: i messaggi della stessa città vanno nella stessa partizione, quindi restano in ordine
                    # json.dumps: da dizionario a testo, perché Kafka trasporta byte
                    # produce non spedisce subito: mette il messaggio in coda e va avanti
                    p.produce("meteo", key=citta, value=json.dumps(misura), callback=consegnato)
                except Exception as e:
                    # per esempio: internet assente, risposta strana, coordinate sbagliate
                    print(f"{citta}: saltata ({e})")
            # flush: aspetta (massimo 10 secondi) che la coda sia spedita davvero, e fa scattare le callback.
            # Senza, i messaggi potrebbero restare in coda per tutta la pausa.
            p.flush(10)
            time.sleep(INTERVALLO_SECONDI)
    except KeyboardInterrupt:
        # è il Ctrl+C: non è un errore, si esce in silenzio
        pass
    finally:
        # finally si esegue sempre, anche dopo Ctrl+C: si spedisce quello che è rimasto in coda
        p.flush(10)

# Vero solo se il file viene avviato direttamente (python raccoglitore.py).
# Se un altro file fa "import raccoglitore", per esempio un test, main() non parte da solo.
if __name__ == "__main__":
    main()
