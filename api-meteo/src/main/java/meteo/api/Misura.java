package meteo.api;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.Instant;

// Entita' JPA: un oggetto Misura corrisponde a una riga della tabella misure.
// JPA legge la riga e riempie i campi; JSON-B usa i metodi get per fare il JSON.
@Entity
@Table(name = "misure")
@IdClass(MisuraId.class)
public class Misura {

    @Id
    private String citta;

    // Instant e' un momento preciso, sempre in UTC: nel JSON diventa 2026-11-24T14:00:00Z
    @Id
    private Instant ora;

    // Double con la maiuscola: puo' essere null (misura mancante); double minuscolo no
    private Double temperatura;
    private Double vento;
    private Double pioggia;

    // JPA crea gli oggetti con il costruttore vuoto
    protected Misura() {
    }

    public String getCitta() {
        return citta;
    }

    public Instant getOra() {
        return ora;
    }

    public Double getTemperatura() {
        return temperatura;
    }

    public Double getVento() {
        return vento;
    }

    public Double getPioggia() {
        return pioggia;
    }

    // niente metodi set: l'API legge soltanto
}
