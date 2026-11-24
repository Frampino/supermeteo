package meteo.api;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

// La chiave primaria e' doppia (citta, ora): JPA vuole una classe che la rappresenti.
// Servono equals e hashCode, perche' JPA confronta le chiavi per capire se due righe sono la stessa.
public class MisuraId implements Serializable {

    private String citta;
    private Instant ora;

    public MisuraId() {
    }

    @Override
    public boolean equals(Object altro) {
        return altro instanceof MisuraId m && Objects.equals(citta, m.citta) && Objects.equals(ora, m.ora);
    }

    @Override
    public int hashCode() {
        return Objects.hash(citta, ora);
    }
}
