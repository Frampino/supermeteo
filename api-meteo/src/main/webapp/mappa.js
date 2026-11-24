// La cartina: un punto per ogni citta', colorato in base alla temperatura.
// Con il cursore vicino a un punto (o toccandolo) si vedono i suoi dati; con un clic restano fissi.
// I dati arrivano da app.js, che chiama disegnaMappa ogni volta che cambia qualcosa.

const SVG = "http://www.w3.org/2000/svg";
const PASSI = [5, 10, 15, 20, 25, 30]; // i confini tra un colore e l'altro, in gradi
const VICINO = 24;                     // distanza massima tra cursore e punto, in pixel

const contenitore = document.getElementById("contenitore-mappa");
const mappa = document.getElementById("mappa");
const gruppoPunti = document.getElementById("punti");
const scheda = document.getElementById("scheda");
const legenda = document.getElementById("legenda");

let posizioni = [];   // { misura, x, y, cerchio } per ogni punto disegnato
let fissata = null;   // codice della citta' scelta con un clic, oppure null

// Da latitudine e longitudine a un punto del disegno (largo 726, alto 952).
// Un grado di longitudine, alle nostre latitudini, e' piu' corto di uno di latitudine:
// per questo si moltiplica per il coseno di 42 gradi (circa 0,743).
// La y del disegno cresce verso il basso, la latitudine verso l'alto: da qui la sottrazione.
const GRADO = 80;
function proietta(latitudine, longitudine) {
    return {
        x: (longitudine - 6.5) * Math.cos(42 * Math.PI / 180) * GRADO,
        y: (47.2 - latitudine) * GRADO,
    };
}

// da 0 (sotto i 5 gradi) a 6 (da 30 in su); i colori sono nel CSS
function classeColore(temperatura) {
    if (temperatura == null) {
        return "t-manca";
    }
    return "t" + PASSI.filter(p => temperatura >= p).length;
}

// visibili: i codici delle citta' che passano i filtri; le altre restano, ma sbiadite
function disegnaMappa(misure, visibili) {
    posizioni = [];
    for (const m of misure) {
        const dati = nomi.get(m.citta);
        if (!dati || Number.isNaN(dati.latitudine) || Number.isNaN(dati.longitudine)) {
            continue; // senza coordinate non si puo' mettere sulla cartina: resta nella tabella
        }
        const { x, y } = proietta(dati.latitudine, dati.longitudine);
        const cerchio = document.createElementNS(SVG, "circle");
        cerchio.setAttribute("cx", x);
        cerchio.setAttribute("cy", y);
        cerchio.setAttribute("r", 9);
        cerchio.setAttribute("class", classeColore(m.temperatura));
        cerchio.classList.toggle("sbiadito", !visibili.has(m.citta));
        posizioni.push({ misura: m, x, y, cerchio, visibile: visibili.has(m.citta) });
    }
    gruppoPunti.replaceChildren(...posizioni.map(p => p.cerchio));
    mostra(trova(fissata));
}

function trova(codice) {
    return posizioni.find(p => p.misura.citta === codice) ?? null;
}

// Il punto visibile piu' vicino al cursore. Cosi' non serve centrare un cerchietto,
// e dove le citta' sono fitte vince sempre la piu' vicina.
function piuVicino(evento) {
    // getScreenCTM: come si passa dal disegno allo schermo; inverse fa il contrario
    const p = new DOMPoint(evento.clientX, evento.clientY).matrixTransform(mappa.getScreenCTM().inverse());
    const massimo = VICINO / mappa.getScreenCTM().a; // da pixel a unita' del disegno
    let migliore = null;
    let distanza = massimo;
    for (const punto of posizioni) {
        const d = Math.hypot(punto.x - p.x, punto.y - p.y);
        if (punto.visibile && d < distanza) {
            migliore = punto;
            distanza = d;
        }
    }
    return migliore;
}

// Riempie la scheda e la mette accanto al punto, senza uscire dalla cartina
function mostra(punto) {
    for (const p of posizioni) {
        p.cerchio.classList.toggle("scelto", p === punto);
    }
    scheda.hidden = !punto;
    mappa.style.cursor = punto ? "pointer" : "";
    if (!punto) {
        return;
    }
    gruppoPunti.append(punto.cerchio); // in fondo al gruppo = disegnato sopra gli altri

    const m = punto.misura;
    const dati = nomi.get(m.citta);
    const titolo = document.createElement("strong");
    titolo.textContent = dati.nome;
    const dove = document.createElement("small");
    dove.textContent = dati.regione;
    const valori = document.createElement("dl");
    for (const [nome, valore] of [
        ["Temperatura", testoNumero(m.temperatura) + " °C"],
        ["Vento", testoNumero(m.vento) + " km/h"],
        ["Pioggia", testoNumero(m.pioggia) + " mm"],
        ["Misura delle", ora(new Date(m.ora))],
    ]) {
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");
        dt.textContent = nome;
        dd.textContent = valore;
        valori.append(dt, dd);
    }
    scheda.replaceChildren(titolo, dove, valori);

    // dove si trova il punto sullo schermo, rispetto al contenitore
    const schermo = new DOMPoint(punto.x, punto.y).matrixTransform(mappa.getScreenCTM());
    const base = contenitore.getBoundingClientRect();
    const x = schermo.x - base.left;
    const y = schermo.y - base.top;
    const aDestra = x + 16 + scheda.offsetWidth <= base.width;
    const sinistra = aDestra ? x + 16 : x - 16 - scheda.offsetWidth;
    const sopra = y - scheda.offsetHeight / 2;
    scheda.style.left = Math.max(0, Math.min(sinistra, base.width - scheda.offsetWidth)) + "px";
    scheda.style.top = Math.max(0, Math.min(sopra, base.height - scheda.offsetHeight)) + "px";
}

// Fissa una citta' (clic sul punto o sul nome nella tabella). Di nuovo la stessa: la toglie.
function fissa(codice) {
    fissata = codice === fissata ? null : codice;
    mostra(trova(fissata));
    mostraGrafico(fissata);
}

mappa.addEventListener("pointermove", e => {
    if (e.pointerType === "mouse") {
        mostra(piuVicino(e) ?? trova(fissata));
    }
});
mappa.addEventListener("pointerleave", () => mostra(trova(fissata)));
mappa.addEventListener("click", e => fissa(piuVicino(e)?.misura.citta ?? null));
document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
        fissa(null);
    }
});
window.addEventListener("resize", () => mostra(trova(fissata)));

// I confini si disegnano una volta sola: una figura (path) per regione
for (const disegno of Object.values(CONFINI)) {
    const figura = document.createElementNS(SVG, "path");
    figura.setAttribute("d", disegno);
    document.getElementById("confini").append(figura);
}

// La legenda: un quadratino per colore, con i gradi scritti
for (let i = 0; i <= PASSI.length; i++) {
    const voce = document.createElement("li");
    const colore = document.createElement("span");
    colore.className = "campione t" + i;
    const testo = i === 0 ? "sotto " + PASSI[0]
        : i === PASSI.length ? "da " + PASSI[i - 1]
        : PASSI[i - 1] + "–" + PASSI[i];
    voce.append(colore, testo + " °C");
    legenda.append(voce);
}
