// Dal codice del tempo all'icona e alla descrizione.
// I codici sono quelli internazionali WMO usati da Open-Meteo (campo weather_code).
// I disegni sono in index.html: <symbol id="i-sereno"> e gli altri.

const TEMPI = [
    { icona: "sereno", testo: "Sereno", codici: [0] },
    { icona: "poco", testo: "Poco nuvoloso", codici: [1, 2] },
    { icona: "coperto", testo: "Coperto", codici: [3] },
    { icona: "nebbia", testo: "Nebbia", codici: [45, 48] },
    { icona: "pioggia", testo: "Pioggia", codici: [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82] },
    { icona: "neve", testo: "Neve", codici: [71, 73, 75, 77, 85, 86] },
    { icona: "temporale", testo: "Temporale", codici: [95, 96, 99] },
];

// Di notte il sole diventa luna. Se il codice manca o non si conosce restituisce null.
function descriviTempo(misura) {
    const tempo = TEMPI.find(t => t.codici.includes(misura.tempo));
    if (!tempo) {
        return null;
    }
    const notte = misura.giorno === false && (tempo.icona === "sereno" || tempo.icona === "poco");
    return { icona: tempo.icona + (notte ? "-notte" : ""), testo: tempo.testo };
}

// Un'icona da mettere nella pagina: <use> copia il disegno che ha quell'id
function creaIcona(nome) {
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("class", "icona");
    svg.setAttribute("aria-hidden", "true");
    const uso = document.createElementNS(SVG, "use");
    uso.setAttribute("href", "#i-" + nome);
    svg.append(uso);
    return svg;
}
