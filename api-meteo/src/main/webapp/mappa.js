// La cartina: per ogni citta' l'icona del tempo oppure un punto colorato in base alla temperatura.
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
const vista = document.getElementById("vista");
const anello = document.getElementById("anello");
const gruppoSopra = document.getElementById("sopra");

const ICONA = 38; // grandezza delle icone, in unita' del disegno
// dove le icone si coprono, stanno sopra i capoluoghi di regione
const CAPOLUOGHI = new Set(["ancona", "aosta", "bari", "bologna", "cagliari", "campobasso", "catanzaro", "firenze",
    "genova", "l_aquila", "milano", "napoli", "palermo", "perugia", "potenza", "roma", "torino", "trento", "trieste", "venezia"]);

let posizioni = [];   // { misura, x, y, visibile, segno }: segno e' l'icona o il cerchio disegnato
let fissata = null;   // codice della citta' scelta con un clic, oppure null

// Da latitudine e longitudine a un punto del disegno (l'Italia sta in 726 x 952).
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
        posizioni.push({ misura: m, x, y, visibile: visibili.has(m.citta) });
    }
    scegliSegni();
    gruppoPunti.replaceChildren(...posizioni.map(p => p.segno));
    disegnaLegenda();
    mostra(trova(fissata));
}

// Disegna ogni citta': l'icona del tempo, oppure il cerchio colorato.
// Le icone vicine si coprono in parte. Dentro un SVG lo z-index del CSS non ha effetto:
// sta sopra chi e' disegnato dopo. Quindi si mettono in fila dalla meno alla piu' importante.
function scegliSegni() {
    // peso: prima le citta' che passano i filtri, poi i capoluoghi di regione
    const peso = p => (p.visibile ? 2 : 0) + (CAPOLUOGHI.has(p.misura.citta) ? 1 : 0);
    posizioni.sort((a, b) => peso(a) - peso(b));
    for (const p of posizioni) {
        const tempo = vista.value === "tempo" ? descriviTempo(p.misura) : null;
        if (tempo) {
            p.segno = document.createElementNS(SVG, "use");
            p.segno.setAttribute("href", "#i-" + tempo.icona);
            p.segno.setAttribute("x", p.x - ICONA / 2);
            p.segno.setAttribute("y", p.y - ICONA / 2);
            p.segno.setAttribute("width", ICONA);
            p.segno.setAttribute("height", ICONA);
        } else {
            p.segno = document.createElementNS(SVG, "circle");
            p.segno.setAttribute("cx", p.x);
            p.segno.setAttribute("cy", p.y);
            p.segno.setAttribute("r", 10);
            p.segno.setAttribute("class", classeColore(p.misura.temperatura));
        }
        p.segno.classList.toggle("sbiadito", !p.visibile);
    }
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
    anello.setAttribute("visibility", punto ? "visible" : "hidden");
    // una copia della citta' indicata, nel gruppo disegnato per ultimo: cosi' si vede intera
    gruppoSopra.replaceChildren(...(punto ? [punto.segno.cloneNode()] : []));
    scheda.hidden = !punto;
    mappa.style.cursor = punto ? "pointer" : "";
    if (!punto) {
        return;
    }
    anello.setAttribute("cx", punto.x);
    anello.setAttribute("cy", punto.y);

    const m = punto.misura;
    const dati = nomi.get(m.citta);
    const titolo = document.createElement("strong");
    titolo.textContent = dati.nome;
    const dove = document.createElement("small");
    dove.textContent = dati.regione;
    const valori = document.createElement("dl");
    const tempo = descriviTempo(m);
    for (const [nome, valore] of [
        ["Tempo", tempo?.testo ?? "–"],
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
    if (tempo) {
        scheda.prepend(creaIcona(tempo.icona));
    }

    // dove si trova il punto sullo schermo, rispetto al contenitore
    const schermo = new DOMPoint(punto.x, punto.y).matrixTransform(mappa.getScreenCTM());
    const base = contenitore.getBoundingClientRect();
    const x = schermo.x - base.left;
    const y = schermo.y - base.top;
    const aDestra = x + 22 + scheda.offsetWidth <= base.width;
    const sinistra = aDestra ? x + 22 : x - 22 - scheda.offsetWidth;
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

vista.addEventListener("change", () => disegna()); // disegna sta in app.js, che si carica dopo: per questo la funzione freccia

// I contorni si disegnano una volta sola: una figura (path) per Paese e una per regione
function disegnaContorni(contorni, gruppo) {
    for (const disegno of Object.values(contorni)) {
        const figura = document.createElementNS(SVG, "path");
        figura.setAttribute("d", disegno);
        document.getElementById(gruppo).append(figura);
    }
}
disegnaContorni(PAESI, "paesi");
disegnaContorni(CONFINI, "confini");

// La legenda dipende dalla vista: le icone del tempo oppure i colori della temperatura
function disegnaLegenda() {
    const voci = [];
    if (vista.value === "tempo") {
        for (const t of TEMPI) {
            const voce = document.createElement("li");
            voce.append(creaIcona(t.icona), t.testo);
            voci.push(voce);
        }
    } else {
        for (let i = 0; i <= PASSI.length; i++) {
            const voce = document.createElement("li");
            const colore = document.createElement("span");
            colore.className = "campione t" + i;
            const testo = i === 0 ? "sotto " + PASSI[0]
                : i === PASSI.length ? "da " + PASSI[i - 1]
                : PASSI[i - 1] + "–" + PASSI[i];
            voce.append(colore, testo + " °C");
            voci.push(voce);
        }
    }
    legenda.replaceChildren(...voci);
}
