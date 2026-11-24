package meteo.api;

import jakarta.enterprise.context.RequestScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

// Gli indirizzi dell'API. @RequestScoped (CDI): un oggetto nuovo per ogni richiesta.
@Path("/")
@Produces(MediaType.APPLICATION_JSON)
@RequestScoped
public class MeteoRisorsa {

    // il server crea l'EntityManager e ce lo consegna (injection): con questo si interroga il database
    @PersistenceContext
    private EntityManager em;

    // GET /api/ciao: serve solo a vedere che il server risponde, non usa il database
    @GET
    @Path("ciao")
    public Map<String, String> ciao() {
        return Map.of("messaggio", "ciao");
    }

    // GET /api/citta
    @GET
    @Path("citta")
    public List<String> citta() {
        // JPQL: si scrive con i nomi delle classi e dei campi Java, non delle tabelle
        return em.createQuery("SELECT DISTINCT m.citta FROM Misura m ORDER BY m.citta", String.class)
                .getResultList();
    }

    // GET /api/meteo: l'ultima misura di ogni citta (una richiesta sola per tutta la pagina)
    @GET
    @Path("meteo")
    public List<Misura> ultime() {
        // la query tra parentesi trova l'ora piu' recente di quella citta
        return em.createQuery("""
                        SELECT m FROM Misura m
                        WHERE m.ora = (SELECT MAX(n.ora) FROM Misura n WHERE n.citta = m.citta)
                        ORDER BY m.citta""", Misura.class)
                .getResultList();
    }

    // GET /api/meteo/siena: l'ultima misura
    @GET
    @Path("meteo/{citta}")
    public Misura ultima(@PathParam("citta") String citta) {
        // :citta e' un parametro, come il ? del PreparedStatement: niente SQL injection
        return em.createQuery("SELECT m FROM Misura m WHERE m.citta = :citta ORDER BY m.ora DESC", Misura.class)
                .setParameter("citta", citta)
                .setMaxResults(1)
                .getResultStream()
                .findFirst()
                .orElseThrow(() -> errore(404, "citta sconosciuta"));
    }

    // GET /api/meteo/siena/storico?ore=24: le misure delle ultime ore, dalla piu' vecchia
    @GET
    @Path("meteo/{citta}/storico")
    public List<Misura> storico(@PathParam("citta") String citta,
                                @QueryParam("ore") @DefaultValue("24") String ore) {
        Instant da = Instant.now().minus(Duration.ofHours(leggiOre(ore)));
        ultima(citta); // se la citta non esiste lancia il 404
        return em.createQuery(
                        "SELECT m FROM Misura m WHERE m.citta = :citta AND m.ora >= :da ORDER BY m.ora", Misura.class)
                .setParameter("citta", citta)
                .setParameter("da", da)
                .getResultList();
    }

    // "ore" arriva come testo, cosi' decidiamo noi la risposta se non e' un numero
    private static int leggiOre(String testo) {
        try {
            int ore = Integer.parseInt(testo);
            if (ore >= 1 && ore <= 168) {
                return ore;
            }
        } catch (NumberFormatException e) {
            // non e' un numero: stessa risposta qui sotto
        }
        throw errore(400, "ore deve essere un numero da 1 a 168");
    }

    private static WebApplicationException errore(int codice, String messaggio) {
        return new WebApplicationException(Response.status(codice)
                .type(MediaType.APPLICATION_JSON)
                .entity(Map.of("errore", messaggio))
                .build());
    }
}
