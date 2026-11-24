// Archivio: legge il topic "meteo" e salva ogni misura nella tabella "misure" di PostgreSQL.
//
// Il giro e' sempre lo stesso:
//   1. chiede a Kafka i messaggi nuovi (poll)
//   2. salva ogni messaggio nel database
//   3. solo dopo dice a Kafka "letti" (commitSync)
// L'ordine 2 -> 3 e' la cosa piu' importante del file: se il programma cade in mezzo,
// Kafka rimanda i messaggi e non si perde niente.
package meteo;

// java.io e java.nio: leggere il file meteo.env
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;
// java.sql (JDBC): parlare con un database; il driver di PostgreSQL e' nel pom.xml
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Duration;
import java.util.List;
import java.util.Properties;
// org.apache.kafka: la libreria di Kafka per Java, anche questa nel pom.xml
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.errors.WakeupException;
import org.apache.kafka.common.serialization.StringDeserializer;

public class Archivio {

    // private = visibile solo dentro la classe Archivio.
    // static  = appartiene alla classe, non ai singoli oggetti: ne esiste una sola copia,
    //           in comune tra tutti gli oggetti Archivio (qui non ne creiamo nessuno, usiamo solo la classe).
    // final   = una volta assegnata non si può più cambiare.
    // static final insieme = una costante (per convenzione il nome è tutto MAIUSCOLO).
    // String  = il tipo: è un testo.
    // """ ... """ = text block: una stringa su più righe, senza \n e senza +.
    
    // IF NOT EXISTS: al secondo avvio la tabella c'e' gia' e non succede niente.
    // TIMESTAMPTZ: data e ora che tiene conto del fuso.
    // PRIMARY KEY (citta, ora): non possono esistere due righe con la stessa citta' e la stessa ora.
    // CREATE TABLE IF NOT EXISTS è un'istruzione SQL per creare la tabella misure
    private static final String CREA_TABELLA = """
            CREATE TABLE IF NOT EXISTS misure (
                citta       TEXT NOT NULL,
                ora         TIMESTAMPTZ NOT NULL,
                temperatura DOUBLE PRECISION,
                vento       DOUBLE PRECISION,
                pioggia     DOUBLE PRECISION,
                tempo       INTEGER,
                giorno      BOOLEAN,
                PRIMARY KEY (citta, ora)
            )""";

    // Chi ha gia' la tabella vecchia non passa dalla CREATE qui sopra: le colonne nuove si aggiungono cosi'.
    // Nelle misure di prima restano NULL. IF NOT EXISTS: dalla seconda volta non fa niente.
    private static final String AGGIUNGI_COLONNE = """
            ALTER TABLE misure
                ADD COLUMN IF NOT EXISTS tempo INTEGER,
                ADD COLUMN IF NOT EXISTS giorno BOOLEAN""";

    // il ? e' il messaggio intero: il JSON lo legge PostgreSQL (->> prende un campo come testo)
    // la stessa misura puo' arrivare due volte: ON CONFLICT la salva una volta sola
    //
    // Come si legge, partendo dal fondo:
    //   ?::jsonb AS m          il testo del messaggio diventa JSON e si chiama m
    //   m->>'citta'            il campo citta di m, come testo
    //   ::timestamptz ::float8 conversione da testo a data e a numero
    private static final String INSERISCI = """
            INSERT INTO misure (citta, ora, temperatura, vento, pioggia, tempo, giorno)
            SELECT m->>'citta', (m->>'ora')::timestamptz, (m->>'temperatura')::float8,
                   (m->>'vento')::float8, (m->>'pioggia')::float8,
                   (m->>'tempo')::int, (m->>'giorno')::boolean
            FROM (SELECT ?::jsonb AS m) AS messaggio
            ON CONFLICT (citta, ora) DO NOTHING""";

    // throws Exception: gli errori che non gestiamo fermano il programma e si vedono sul terminale
    public static void main(String[] args) throws Exception {
        // Properties e' una lista chiave=valore. Utente e password stanno nel file, mai nel codice.
        // Il file si cerca nella cartella da cui si avvia il programma (meteo-app).
        Properties env = new Properties();
        try (Reader file = Files.newBufferedReader(Path.of("meteo.env"))) {
            env.load(file);
        }

        Properties config = new Properties();
        // dov'e' Kafka (se nel file non c'e', usa localhost:9092)
        config.put("bootstrap.servers", env.getProperty("KAFKA_SERVER", "localhost:9092"));
        // il nome della squadra: due archivi con lo stesso group.id si dividono le partizioni
        config.put("group.id", "archivio");
        // se il gruppo e' nuovo, parte dal primo messaggio e non solo da quelli futuri
        config.put("auto.offset.reset", "earliest");
        config.put("enable.auto.commit", "false"); // confermiamo noi, dopo aver salvato
        // Kafka trasporta byte: i deserializer li trasformano in String (in Python era .decode())
        config.put("key.deserializer", StringDeserializer.class.getName());
        config.put("value.deserializer", StringDeserializer.class.getName());

        // try con risorse: consumer, insert e database si chiudono da soli, in questo ordine
        // (si chiudono sempre al contrario di come sono stati aperti, anche se c'e' un errore)
        try (Connection db = DriverManager.getConnection(
                     env.getProperty("DB_URL"), env.getProperty("DB_USER"), env.getProperty("DB_PASSWORD"));
             Statement st = db.createStatement()) {
            // Statement semplice: va bene perche' il testo SQL e' fisso, senza dati dall'esterno
            st.execute(CREA_TABELLA);
            st.execute(AGGIUNGI_COLONNE);

            // PreparedStatement: il comando si prepara una volta e si riusa per ogni messaggio.
            // Il dato entra al posto del ? e non si mescola mai al comando: niente SQL injection.
            try (PreparedStatement insert = db.prepareStatement(INSERISCI);
                 // <String, String>: tipo della chiave e tipo del valore
                 KafkaConsumer<String, String> consumer = new KafkaConsumer<>(config)) {
                chiudiConCtrlC(consumer);
                consumer.subscribe(List.of("meteo"));
                // ciclo infinito: un servizio resta sempre acceso
                while (true) {
                    // poll restituisce un gruppo di messaggi (anche vuoto), aspettando al massimo 1 secondo
                    for (ConsumerRecord<String, String> msg : consumer.poll(Duration.ofSeconds(1))) {
                        salva(insert, msg);
                    }
                    consumer.commitSync(); // tutti salvati: diciamo a Kafka che sono stati letti
                }
            } catch (WakeupException e) {
                // normale: e' arrivato Ctrl+C
            }
        }
    }

    // Salva un messaggio. Se il messaggio e' sbagliato lo salta, se c'e' un problema vero si ferma.
    private static void salva(PreparedStatement insert, ConsumerRecord<String, String> msg) throws SQLException {
        try {
            // il messaggio va al posto del primo (e unico) ?: in JDBC si conta da 1, non da 0
            insert.setString(1, msg.value());
            // executeUpdate dice quante righe ha scritto: 1 = salvata, 0 = c'era gia' (ON CONFLICT)
            int righe = insert.executeUpdate();
            // condizione ? valore se vera : valore se falsa
            System.out.println((righe == 1 ? "salvata " : "gia' presente ") + msg.value());
        } catch (SQLException e) {
            // codici 22 e 23: messaggio sbagliato (JSON rotto, campo mancante). Si salta, o bloccherebbe tutto.
            // ogni altro errore (database spento...) ferma il programma senza confermare a Kafka
            //
            // SQLState e' un codice di 5 caratteri e i primi due dicono il tipo di errore:
            //   22 = dato non valido     (22P02 JSON rotto, 22007 data sbagliata)
            //   23 = vincolo non rispettato (23502 campo obbligatorio mancante)
            // Riprovare non servirebbe: un messaggio sbagliato resta sbagliato.
            String codice = e.getSQLState();
            if (codice == null || !(codice.startsWith("22") || codice.startsWith("23"))) {
                throw e; // rilancia l'errore: esce dal ciclo prima di commitSync, quindi niente conferma
            }
            System.out.println("scartata " + msg.value() + " (" + codice + ")");
        }
    }

    // Ctrl+C: wakeup() interrompe la poll, poi si aspetta che il main chiuda tutto
    //
    // In Java non c'e' il KeyboardInterrupt di Python. Con Ctrl+C Java esegue gli "shutdown hook":
    // thread preparati prima, che partono mentre il programma si sta chiudendo.
    private static void chiudiConCtrlC(KafkaConsumer<String, String> consumer) {
        Thread main = Thread.currentThread(); // il thread che sta eseguendo il main
        // () -> { ... } e' una lambda: il codice da eseguire alla chiusura
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            // wakeup e' l'unico metodo del consumer che si puo' chiamare da un altro thread:
            // fa uscire la poll con una WakeupException
            consumer.wakeup();
            try {
                // join aspetta che il main finisca; senza, Java si chiuderebbe prima del consumer
                main.join();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt(); // rimette il segnale di interruzione, e' la buona abitudine
            }
        }));
    }
}
