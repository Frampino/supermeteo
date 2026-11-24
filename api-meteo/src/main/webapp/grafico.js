// Il grafico della temperatura nelle ultime 24 ore, per la citta' fissata con un clic.
// I dati arrivano da /api/meteo/{citta}/storico; il disegno e' un SVG fatto a mano.

const ORE = 24;
const BUCO = 2 * 60 * 60 * 1000; // oltre 2 ore tra due misure la linea si interrompe: li' non sappiamo
const ALTEZZA = 190;
const MARGINE = { sopra: 14, destra: 14, sotto: 26, sinistra: 34 };

const dettaglio = document.getElementById("dettaglio");
const titoloGrafico = document.getElementById("titolo-grafico");
const grafico = document.getElementById("grafico");
const lettura = document.getElementById("lettura");
const valoriGrafico = document.getElementById("valori-grafico");

let cittaGrafico = null; // la citta' richiesta per ultima
let storico = [];        // le misure con la temperatura: { momento, gradi }

async function mostraGrafico(codice) {
    cittaGrafico = codice;
    dettaglio.hidden = codice === null;
    if (codice === null) {
        return;
    }
    titoloGrafico.textContent = nomeDi(codice) + ", temperatura nelle ultime 24 ore";
    if (dettaglio.dataset.citta !== codice) {
        // citta' nuova: via subito il disegno di quella di prima
        dettaglio.dataset.citta = codice;
        storico = [];
        grafico.replaceChildren();
        valoriGrafico.replaceChildren();
        lettura.textContent = "Caricamento...";
    }
    try {
        const indirizzo = "api/meteo/" + encodeURIComponent(codice) + "/storico?ore=" + ORE;
        const dati = await (await chiedi(indirizzo)).json();
        // mentre si aspettava la risposta l'utente puo' aver scelto un'altra citta': in quel caso si butta
        if (codice !== cittaGrafico) {
            return;
        }
        storico = dati
            .filter(m => m.temperatura != null)
            .map(m => ({ momento: new Date(m.ora), gradi: m.temperatura }));
        disegnaGrafico();
    } catch (errore) {
        if (codice === cittaGrafico) {
            console.error(errore);
            lettura.textContent = "Storico non disponibile.";
        }
    }
}

function elemento(nome, attributi, testo) {
    const e = document.createElementNS(SVG, nome);
    for (const [chiave, valore] of Object.entries(attributi)) {
        e.setAttribute(chiave, valore);
    }
    if (testo !== undefined) {
        e.textContent = testo;
    }
    return e;
}

// Come si passa dai dati al disegno: il tempo diventa x, i gradi diventano y.
function scale() {
    const larghezza = grafico.clientWidth;
    const fine = Date.now();
    const inizio = fine - ORE * 60 * 60 * 1000;
    const gradi = storico.map(p => p.gradi);
    // arrotondate ai 5 gradi: i numeri sull'asse restano tondi
    const minimo = Math.floor((Math.min(...gradi) - 1) / 5) * 5;
    const massimo = Math.ceil((Math.max(...gradi) + 1) / 5) * 5;
    const spazioX = larghezza - MARGINE.sinistra - MARGINE.destra;
    const spazioY = ALTEZZA - MARGINE.sopra - MARGINE.sotto;
    return {
        larghezza, inizio, fine, minimo, massimo,
        x: momento => MARGINE.sinistra + (momento - inizio) / (fine - inizio) * spazioX,
        y: g => MARGINE.sopra + (massimo - g) / (massimo - minimo) * spazioY,
    };
}

function disegnaGrafico() {
    grafico.replaceChildren();
    valoriGrafico.replaceChildren();
    if (storico.length === 0) {
        lettura.textContent = "Nessuna misura nelle ultime 24 ore.";
        return;
    }
    const s = scale();
    grafico.setAttribute("viewBox", "0 0 " + s.larghezza + " " + ALTEZZA);

    // asse dei gradi: una riga sottile ogni 5 gradi (ogni 10 se sarebbero troppe)
    const passo = s.massimo - s.minimo > 20 ? 10 : 5;
    for (let g = Math.ceil(s.minimo / passo) * passo; g <= s.massimo; g += passo) {
        grafico.append(
            elemento("line", { class: "griglia", x1: MARGINE.sinistra, x2: s.larghezza - MARGINE.destra, y1: s.y(g), y2: s.y(g) }),
            elemento("text", { class: "asse", x: MARGINE.sinistra - 6, y: s.y(g) + 4, "text-anchor": "end" }, g + "°"));
    }
    // asse delle ore: un'etichetta ogni 6 ore intere (0, 6, 12, 18)
    const tacca = new Date(s.inizio);
    tacca.setMinutes(0, 0, 0);
    for (tacca.setHours(tacca.getHours() + 1); tacca <= s.fine; tacca.setHours(tacca.getHours() + 1)) {
        if (tacca.getHours() % 6 === 0) {
            grafico.append(elemento("text", { class: "asse", x: s.x(tacca), y: ALTEZZA - 6, "text-anchor": "middle" }, ora2(tacca)));
        }
    }

    // la linea: M = alza la penna e spostati, L = disegna fino a. Dopo un buco si alza la penna.
    let disegno = "";
    storico.forEach((p, i) => {
        const continua = i > 0 && p.momento - storico[i - 1].momento <= BUCO;
        disegno += (continua ? "L" : "M") + s.x(p.momento).toFixed(1) + " " + s.y(p.gradi).toFixed(1);
    });
    grafico.append(elemento("path", { class: "linea", d: disegno }));
    // con poche misure si vedono anche i punti (una misura da sola non fa una linea)
    if (storico.length <= 30) {
        for (const p of storico) {
            grafico.append(elemento("circle", { class: "punto", cx: s.x(p.momento), cy: s.y(p.gradi), r: 4 }));
        }
    }
    // il segno che segue il cursore
    grafico.append(
        elemento("line", { id: "mirino", class: "mirino", y1: MARGINE.sopra, y2: ALTEZZA - MARGINE.sotto, visibility: "hidden" }),
        elemento("circle", { id: "mirino-punto", class: "punto scelto", r: 6, visibility: "hidden" }));

    riassunto();
    for (const p of storico) {
        const voce = document.createElement("li");
        voce.textContent = ora(p.momento) + ": " + testoNumero(p.gradi) + " °C";
        valoriGrafico.append(voce);
    }
}

// Con il cursore fuori dal grafico si leggono minimo e massimo
function riassunto() {
    const gradi = storico.map(p => p.gradi);
    lettura.textContent = storico.length === 1
        ? "Una sola misura finora: " + testoNumero(gradi[0]) + " °C."
        : "Minima " + testoNumero(Math.min(...gradi)) + " °C, massima " + testoNumero(Math.max(...gradi))
            + " °C, su " + storico.length + " misure.";
}

// solo ore e minuti, per l'asse
function ora2(data) {
    return data.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

grafico.addEventListener("pointermove", e => {
    if (storico.length === 0) {
        return;
    }
    const s = scale();
    const px = e.clientX - grafico.getBoundingClientRect().left;
    // la misura piu' vicina in orizzontale: basta stare sopra l'ora giusta
    const p = storico.reduce((a, b) => Math.abs(s.x(b.momento) - px) < Math.abs(s.x(a.momento) - px) ? b : a);
    const linea = document.getElementById("mirino");
    const punto = document.getElementById("mirino-punto");
    linea.setAttribute("x1", s.x(p.momento));
    linea.setAttribute("x2", s.x(p.momento));
    punto.setAttribute("cx", s.x(p.momento));
    punto.setAttribute("cy", s.y(p.gradi));
    linea.setAttribute("visibility", "visible");
    punto.setAttribute("visibility", "visible");
    lettura.textContent = ora(p.momento) + ": " + testoNumero(p.gradi) + " °C";
});
grafico.addEventListener("pointerleave", () => {
    if (storico.length > 0) {
        document.getElementById("mirino").setAttribute("visibility", "hidden");
        document.getElementById("mirino-punto").setAttribute("visibility", "hidden");
        riassunto();
    }
});
window.addEventListener("resize", () => {
    if (!dettaglio.hidden && storico.length > 0) {
        disegnaGrafico();
    }
});
