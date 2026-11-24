package meteo.api;

import jakarta.ws.rs.ApplicationPath;
import jakarta.ws.rs.core.Application;

// Accende JAX-RS: tutti gli indirizzi dell'API iniziano con /api.
// La classe e' vuota: le risorse (@Path) le trova il server da solo.
@ApplicationPath("/api")
public class Applicazione extends Application {
}
