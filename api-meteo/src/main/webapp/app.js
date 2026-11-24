// La pagina: chiede le misure all'API e riempie la tabella.
// Non conosce Kafka ne' il database: parla solo con /api.

const AGGIORNA_OGNI = 5 * 60 * 1000;   // 5 minuti, in millisecondi
const VECCHIA_DOPO = 2 * 60 * 60 * 1000; // 2 ore: il raccoglitore fa un giro all'ora

let misure = [];       // l'ultima risposta buona dell'API
let nomi = new Map();  // codice -> { nome, regione, latitudine, longitudine }, dal file citta.csv

const stato = document.getElementById("stato");
const righe = document.getElementById("righe");
const vuoto = document.getElementById("vuoto");
const cerca = document.getElementById("cerca");
const regione = document.getElementById("regione");
const ordine = document.getElementById("ordine");

// fetch non da' errore se la risposta e' 404 o 500: per questo si controlla risposta.ok
// AbortSignal.timeout: se l'API non risponde entro 15 secondi si rinuncia
async function chiedi(indirizzo) {
    const risposta = await fetch(indirizzo, { signal: AbortSignal.timeout(15000), cache: "no-store" });
    if (!risposta.ok) {
        throw new Error("risposta " + risposta.status);
    }
    return risposta;
}

// citta.csv e' lo stesso file del raccoglitore: Maven lo copia nel war
async function leggiNomi() {
    const testo = await (await chiedi("citta.csv")).text();
    // la prima riga contiene i titoli: si salta
    for (const riga of testo.trim().split(/\r?\n/).slice(1)) {
        const [codice, nome, reg, lat, lon] = riga.split(",");
        nomi.set(codice, { nome, regione: reg, latitudine: parseFloat(lat), longitudine: parseFloat(lon) });
    }
    const regioni = [...new Set([...nomi.values()].map(c => c.regione))].sort();
    for (const r of regioni) {
        regione.add(new Option(r, r));
    }
}

async function aggiorna() {
    try {
        if (nomi.size === 0) {
            await leggiNomi();
        }
        misure = await (await chiedi("api/meteo")).json();
        stato.className = "";
        stato.textContent = misure.length + " città, aggiornato alle " + ora(new Date());
    } catch (errore) {
        // non si svuota la tabella: restano visibili gli ultimi dati, ciascuno con la sua ora
        console.error(errore);
        stato.className = "errore";
        stato.textContent = misure.length > 0
            ? "API non raggiungibile: questi sono gli ultimi dati ricevuti. Riprovo da solo."
            : "API non raggiungibile. Riprovo da solo.";
    }
    disegna();
}

function nomeDi(codice) {
    return nomi.get(codice)?.nome ?? codice;
}

// minuscole e senza accenti: cosi' "forli" trova "Forlì"
function semplifica(testo) {
    return testo.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function disegna() {
    const testo = semplifica(cerca.value.trim());
    const scelte = misure
        .filter(m => semplifica(nomeDi(m.citta)).includes(testo))
        .filter(m => regione.value === "" || nomi.get(m.citta)?.regione === regione.value)
        .sort(confronta);

    righe.replaceChildren(...scelte.map(creaRiga));
    vuoto.hidden = scelte.length > 0 || misure.length === 0;
    disegnaMappa(misure, new Set(scelte.map(m => m.citta)));
}

// nome: dalla A alla Z; numeri: dal piu' grande, con quelli mancanti in fondo
function confronta(a, b) {
    if (ordine.value !== "nome") {
        const differenza = (b[ordine.value] ?? -Infinity) - (a[ordine.value] ?? -Infinity);
        if (differenza) { // 0 (uguali) e NaN (mancano tutti e due) proseguono con il nome
            return differenza;
        }
    }
    return nomeDi(a.citta).localeCompare(nomeDi(b.citta), "it");
}

// textContent e mai innerHTML: quello che arriva dall'API resta testo, non diventa codice
function creaRiga(m) {
    const momento = new Date(m.ora);
    const tr = document.createElement("tr");
    if (Date.now() - momento > VECCHIA_DOPO) {
        tr.className = "vecchia";
    }

    const citta = document.createElement("td");
    // un pulsante: con un clic (o con Invio) mostra la citta' sulla cartina
    const pulsante = document.createElement("button");
    pulsante.type = "button";
    pulsante.textContent = nomeDi(m.citta);
    pulsante.addEventListener("click", () => fissa(m.citta));
    citta.append(pulsante);
    const sotto = document.createElement("small");
    sotto.textContent = nomi.get(m.citta)?.regione ?? "";
    citta.append(sotto);

    tr.append(citta, numero(m.temperatura), numero(m.vento), numero(m.pioggia), cella(ora(momento)));
    return tr;
}

function cella(testo) {
    const td = document.createElement("td");
    td.className = "numero";
    td.textContent = testo;
    return td;
}

function numero(valore) {
    return cella(testoNumero(valore));
}

// ?? : se il valore manca (null o assente) si mostra un trattino
function testoNumero(valore) {
    return valore?.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) ?? "–";
}

// l'API risponde in UTC: il browser converte nel fuso di chi guarda
function ora(data) {
    const oggi = data.toDateString() === new Date().toDateString();
    return data.toLocaleString("it-IT", oggi
        ? { hour: "2-digit", minute: "2-digit" }
        : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

cerca.addEventListener("input", disegna);
regione.addEventListener("change", disegna);
ordine.addEventListener("change", disegna);

aggiorna();
setInterval(aggiorna, AGGIORNA_OGNI);
