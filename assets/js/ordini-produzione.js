let utenteCorrente = null;
let unitaMisura = [];
let materiePrime = [];
let prodottiConRicetta = [];
let righeNuovoOrdine = []; // {prodottoFinitoId, nomeProdotto, numeroBatch}
let ordineInGestione = null;
let rigaInPrelievo = null;

const nuovaRigaProdottoSelect = document.getElementById('nuova-riga-prodotto');
const nuovaRigaBatchInput = document.getElementById('nuova-riga-batch');
const righeNuovoOrdineTbody = document.getElementById('righe-nuovo-ordine-tbody');
const noteInput = document.getElementById('note-input');
const errorMessage = document.getElementById('error-message');
const tbody = document.getElementById('ordini-tbody');
const emptyState = document.getElementById('empty-state');

const gestionePanel = document.getElementById('gestione-panel');
const gestioneTitle = document.getElementById('gestione-title');
const gestioneContent = document.getElementById('gestione-content');

const prelievoPanel = document.getElementById('prelievo-panel');
const prelievoTitle = document.getElementById('prelievo-title');
const prelievoContent = document.getElementById('prelievo-content');

const STATO_LABEL = {
  assegnato: 'Assegnato',
  prelievo_confermato: 'Prelievo confermato',
  completato: 'Completato',
  annullato: 'Annullato',
};

async function init() {
  utenteCorrente = await requireAuth(['direttore', 'responsabile_produzione', 'responsabile_confezionamento']);
  if (!utenteCorrente) return;

  initShell(utenteCorrente);

  if (utenteCorrente.ruolo !== 'direttore') {
    document.getElementById('form-panel').hidden = true;
  }

  await caricaUnitaMisura();
  await caricaMateriePrime();
  await caricaProdottiConRicetta();
  await caricaOrdini();
}

async function caricaUnitaMisura() {
  const { data, error } = await supabaseClient.from('unita_misura').select('id, codice, nome').order('nome');
  if (error) { errorMessage.textContent = 'Errore unità di misura: ' + error.message; return; }
  unitaMisura = data;
}

async function caricaMateriePrime() {
  const { data, error } = await supabaseClient
    .from('materie_prime')
    .select('id, nome, unita_misura_1_id, unita_misura_2_id, fattore_conversione, unita_magazzino_id')
    .order('nome');
  if (error) { errorMessage.textContent = 'Errore materie prime: ' + error.message; return; }
  materiePrime = data;
}

// Il magazzino (e le giacenze) ragionano sempre nell'unita' magazzino della
// materia prima; la ricetta puo' esprimere l'ingrediente nell'altra unita'
// (tipicamente per precisione), quindi va convertito prima di confrontarlo
// con la giacenza.
function convertiInUnitaMagazzino(materiaPrimaId, quantita, unitaMisuraId) {
  const m = materiePrime.find(x => x.id === materiaPrimaId);
  if (!m || unitaMisuraId === m.unita_magazzino_id) return quantita;
  if (unitaMisuraId === m.unita_misura_1_id && m.unita_magazzino_id === m.unita_misura_2_id) {
    return quantita * m.fattore_conversione;
  }
  if (unitaMisuraId === m.unita_misura_2_id && m.unita_magazzino_id === m.unita_misura_1_id) {
    return quantita / m.fattore_conversione;
  }
  return quantita;
}

async function caricaProdottiConRicetta() {
  const { data, error } = await supabaseClient
    .from('ricette_ingredienti')
    .select('prodotto_finito_id, prodotti_finiti(id, nome, attivo)');

  if (error) { errorMessage.textContent = 'Errore ricette: ' + error.message; return; }

  const visti = new Set();
  prodottiConRicetta = [];
  for (const r of data) {
    if (visti.has(r.prodotto_finito_id) || !r.prodotti_finiti.attivo) continue;
    visti.add(r.prodotto_finito_id);
    prodottiConRicetta.push({ prodottoFinitoId: r.prodotti_finiti.id, nomeProdotto: r.prodotti_finiti.nome });
  }
  prodottiConRicetta.sort((a, b) => a.nomeProdotto.localeCompare(b.nomeProdotto));

  nuovaRigaProdottoSelect.innerHTML = prodottiConRicetta
    .map(p => `<option value="${p.prodottoFinitoId}">${p.nomeProdotto}</option>`)
    .join('') || '<option value="">Nessun prodotto con ricetta definita</option>';
}

function nomeUnita(id) {
  const u = unitaMisura.find(x => x.id === id);
  return u ? `${u.nome} (${u.codice})` : '—';
}

function nomeMateriaPrima(id) {
  const m = materiePrime.find(x => x.id === id);
  return m ? m.nome : '—';
}

function nomeProdotto(id) {
  const p = prodottiConRicetta.find(x => x.prodottoFinitoId === id);
  return p ? p.nomeProdotto : '—';
}

// ---- Costruzione nuovo ordine (piu' righe) ----

function renderRigheNuovoOrdine() {
  righeNuovoOrdineTbody.innerHTML = '';
  righeNuovoOrdine.forEach((riga, indice) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${riga.nomeProdotto}</td><td>${riga.numeroBatch}</td>`;
    const tdActions = document.createElement('td');
    tdActions.className = 'actions';
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn-danger';
    delBtn.textContent = 'Rimuovi';
    delBtn.addEventListener('click', () => {
      righeNuovoOrdine.splice(indice, 1);
      renderRigheNuovoOrdine();
    });
    tdActions.appendChild(delBtn);
    tr.appendChild(tdActions);
    righeNuovoOrdineTbody.appendChild(tr);
  });
}

document.getElementById('aggiungi-riga-nuovo-ordine-btn').addEventListener('click', () => {
  const prodottoFinitoId = Number(nuovaRigaProdottoSelect.value);
  const numeroBatch = Number(nuovaRigaBatchInput.value);
  const prodotto = prodottiConRicetta.find(p => p.prodottoFinitoId === prodottoFinitoId);

  if (!prodotto) {
    alert('Seleziona un prodotto (serve una ricetta definita).');
    return;
  }
  if (!numeroBatch || numeroBatch <= 0) {
    alert('Inserisci un numero di batch maggiore di zero.');
    return;
  }
  if (righeNuovoOrdine.some(r => r.prodottoFinitoId === prodottoFinitoId)) {
    alert('Questo prodotto è già nell\'ordine: rimuovilo e riaggiungilo per cambiare la quantità.');
    return;
  }

  righeNuovoOrdine.push({ prodottoFinitoId, nomeProdotto: prodotto.nomeProdotto, numeroBatch });
  renderRigheNuovoOrdine();
  nuovaRigaBatchInput.value = '';
});

document.getElementById('crea-ordine-btn').addEventListener('click', async () => {
  errorMessage.textContent = '';

  if (righeNuovoOrdine.length === 0) {
    errorMessage.textContent = 'Aggiungi almeno un prodotto all\'ordine.';
    return;
  }

  const { data: ordine, error } = await supabaseClient
    .from('ordini_produzione')
    .insert({ creato_da: utenteCorrente.id, note: noteInput.value.trim() || null })
    .select('id')
    .single();

  if (error) {
    errorMessage.textContent = 'Errore: ' + error.message;
    return;
  }

  const righe = righeNuovoOrdine.map(r => ({
    ordine_produzione_id: ordine.id,
    prodotto_finito_id: r.prodottoFinitoId,
    numero_batch: r.numeroBatch,
  }));

  const { error: errRighe } = await supabaseClient.from('ordini_produzione_righe').insert(righe);
  if (errRighe) {
    errorMessage.textContent = 'Ordine creato, ma errore nelle righe: ' + errRighe.message;
    return;
  }

  righeNuovoOrdine = [];
  renderRigheNuovoOrdine();
  noteInput.value = '';
  await caricaOrdini();
});

// ---- Elenco ordini ----

async function caricaOrdini() {
  const { data: ordini, error } = await supabaseClient
    .from('ordini_produzione')
    .select('id, creato_il, note')
    .order('creato_il', { ascending: false });

  if (error) { errorMessage.textContent = 'Errore caricamento ordini: ' + error.message; return; }

  const idOrdini = ordini.map(o => o.id);
  let righePerOrdine = {};
  if (idOrdini.length > 0) {
    const { data: righe } = await supabaseClient
      .from('ordini_produzione_righe')
      .select('ordine_produzione_id, prodotto_finito_id, numero_batch, prodotti_finiti(nome)')
      .in('ordine_produzione_id', idOrdini);
    for (const r of (righe || [])) {
      if (!righePerOrdine[r.ordine_produzione_id]) righePerOrdine[r.ordine_produzione_id] = [];
      righePerOrdine[r.ordine_produzione_id].push(`${r.prodotti_finiti.nome} (×${r.numero_batch})`);
    }
  }

  tbody.innerHTML = '';
  emptyState.hidden = ordini.length > 0;

  for (const ordine of ordini) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(ordine.creato_il).toLocaleString('it-IT')}</td>
      <td>${(righePerOrdine[ordine.id] || []).join(', ') || '—'}</td>
      <td>${ordine.note || '—'}</td>
    `;
    const tdActions = document.createElement('td');
    tdActions.className = 'actions';
    const gestBtn = document.createElement('button');
    gestBtn.type = 'button';
    gestBtn.className = 'btn-secondary';
    gestBtn.textContent = 'Gestisci';
    gestBtn.addEventListener('click', () => apriGestione(ordine));
    tdActions.appendChild(gestBtn);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  }
}

// ---- Gestione ordine (righe) ----

async function apriGestione(ordine) {
  ordineInGestione = ordine;
  gestioneTitle.textContent = `Ordine del ${new Date(ordine.creato_il).toLocaleDateString('it-IT')}`;
  gestionePanel.hidden = false;
  await renderGestione();
  gestionePanel.scrollIntoView({ behavior: 'smooth' });
}

async function caricaRigheOrdine(ordineId) {
  const { data, error } = await supabaseClient
    .from('ordini_produzione_righe')
    .select('id, prodotto_finito_id, numero_batch, stato, prodotti_finiti(nome)')
    .eq('ordine_produzione_id', ordineId)
    .order('id');
  if (error) return [];
  return data;
}

async function renderGestione() {
  const righe = await caricaRigheOrdine(ordineInGestione.id);

  let html = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Prodotto</th><th>Batch</th><th>Stato</th><th></th></tr></thead>
        <tbody id="gestione-righe-tbody"></tbody>
      </table>
    </div>
  `;

  if (utenteCorrente.ruolo === 'direttore') {
    html += `
      <div class="form-row" style="margin-top:16px;">
        <div>
          <label for="gestione-nuova-riga-prodotto">Prodotto</label>
          <select id="gestione-nuova-riga-prodotto">${prodottiConRicetta.map(p => `<option value="${p.prodottoFinitoId}">${p.nomeProdotto}</option>`).join('')}</select>
        </div>
        <div>
          <label for="gestione-nuova-riga-batch">Numero batch</label>
          <input type="number" id="gestione-nuova-riga-batch" min="0" step="any">
        </div>
      </div>
      <button type="button" id="gestione-aggiungi-riga-btn">Aggiungi prodotto a questo ordine</button>
    `;
  }

  gestioneContent.innerHTML = html;

  const righeTbody = document.getElementById('gestione-righe-tbody');
  for (const riga of righe) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${riga.prodotti_finiti.nome}</td><td>${riga.numero_batch}</td><td>${STATO_LABEL[riga.stato] || riga.stato}</td>`;
    const tdActions = document.createElement('td');
    tdActions.className = 'actions';

    if (riga.stato === 'assegnato') {
      const prelievoBtn = document.createElement('button');
      prelievoBtn.type = 'button';
      prelievoBtn.textContent = 'Conferma prelievo';
      prelievoBtn.addEventListener('click', () => apriPrelievo(riga));
      tdActions.appendChild(prelievoBtn);

      if (utenteCorrente.ruolo === 'direttore') {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn-danger';
        delBtn.textContent = 'Elimina';
        delBtn.addEventListener('click', async () => {
          if (!confirm(`Eliminare la riga "${riga.prodotti_finiti.nome}"?`)) return;
          await supabaseClient.from('ordini_produzione_righe').delete().eq('id', riga.id);
          await renderGestione();
          await caricaOrdini();
        });
        tdActions.appendChild(delBtn);
      }
    } else {
      const dettagliBtn = document.createElement('button');
      dettagliBtn.type = 'button';
      dettagliBtn.className = 'btn-secondary';
      dettagliBtn.textContent = 'Dettagli';
      dettagliBtn.addEventListener('click', () => apriPrelievo(riga));
      tdActions.appendChild(dettagliBtn);
    }

    tr.appendChild(tdActions);
    righeTbody.appendChild(tr);
  }

  if (utenteCorrente.ruolo === 'direttore') {
    document.getElementById('gestione-aggiungi-riga-btn').addEventListener('click', async () => {
      const prodottoFinitoId = Number(document.getElementById('gestione-nuova-riga-prodotto').value);
      const numeroBatch = Number(document.getElementById('gestione-nuova-riga-batch').value);
      if (!numeroBatch || numeroBatch <= 0) {
        alert('Inserisci un numero di batch maggiore di zero.');
        return;
      }
      const { error } = await supabaseClient.from('ordini_produzione_righe').insert({
        ordine_produzione_id: ordineInGestione.id,
        prodotto_finito_id: prodottoFinitoId,
        numero_batch: numeroBatch,
      });
      if (error) {
        alert('Errore: ' + error.message);
        return;
      }
      await renderGestione();
      await caricaOrdini();
    });
  }
}

document.getElementById('chiudi-gestione-btn').addEventListener('click', () => {
  gestionePanel.hidden = true;
  ordineInGestione = null;
});

// ---- Gestione prelievo (per singola riga) ----

async function apriPrelievo(riga) {
  rigaInPrelievo = riga;
  prelievoTitle.textContent = `${riga.prodotti_finiti.nome} — ${riga.numero_batch} batch`;
  prelievoPanel.hidden = false;

  if (riga.stato === 'assegnato') {
    await renderFormBatch();
  } else {
    await renderRiepilogoMovimenti();
  }

  prelievoPanel.scrollIntoView({ behavior: 'smooth' });
}

async function caricaIngredientiRicetta(prodottoFinitoId) {
  const { data, error } = await supabaseClient
    .from('ricette_ingredienti')
    .select('materia_prima_id, quantita, unita_misura_id')
    .eq('prodotto_finito_id', prodottoFinitoId);
  if (error) return [];
  return data;
}

async function renderFormBatch() {
  const ingredienti = await caricaIngredientiRicetta(rigaInPrelievo.prodotto_finito_id);

  prelievoContent.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Materia prima</th><th>Per 1 batch</th><th>Per ${rigaInPrelievo.numero_batch} batch</th></tr></thead>
        <tbody>
          ${ingredienti.map(i => `<tr><td>${nomeMateriaPrima(i.materia_prima_id)}</td><td>${i.quantita} ${nomeUnita(i.unita_misura_id)}</td><td>${i.quantita * rigaInPrelievo.numero_batch} ${nomeUnita(i.unita_misura_id)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
    <button type="button" id="calcola-fabbisogno-btn">Calcola fabbisogno (FEFO)</button>
    <div id="allocazione-container"></div>
  `;

  document.getElementById('calcola-fabbisogno-btn').addEventListener('click', () => calcolaFabbisogno(ingredienti));
}

async function calcolaFabbisogno(ingredienti) {
  const container = document.getElementById('allocazione-container');
  container.innerHTML = '<p class="empty-state">Calcolo in corso…</p>';

  const sezioni = [];

  for (const ing of ingredienti) {
    const necessarioRicetta = ing.quantita * rigaInPrelievo.numero_batch;
    const necessario = convertiInUnitaMagazzino(ing.materia_prima_id, necessarioRicetta, ing.unita_misura_id);
    const materia = materiePrime.find(m => m.id === ing.materia_prima_id);
    const unitaMagazzinoId = materia ? materia.unita_magazzino_id : ing.unita_misura_id;

    const { data: lotti } = await supabaseClient
      .from('lotti_materie_prime')
      .select('id, numero_lotto, data_scadenza')
      .eq('materia_prima_id', ing.materia_prima_id)
      .eq('stato', 'disponibile')
      .order('data_scadenza', { ascending: true, nullsFirst: false });

    const idLotti = (lotti || []).map(l => l.id);
    let giacenzePerLotto = {};
    if (idLotti.length > 0) {
      const { data: giacenze } = await supabaseClient
        .from('v_giacenza_materie_prime')
        .select('lotto_id, giacenza')
        .in('lotto_id', idLotti);
      giacenzePerLotto = Object.fromEntries((giacenze || []).map(g => [g.lotto_id, g.giacenza]));
    }

    let daAllocare = necessario;
    const allocazioni = [];
    for (const lotto of (lotti || [])) {
      if (daAllocare <= 0) break;
      const disponibile = giacenzePerLotto[lotto.id] || 0;
      if (disponibile <= 0) continue;
      const presa = Math.min(disponibile, daAllocare);
      allocazioni.push({ lottoId: lotto.id, numeroLotto: lotto.numero_lotto, scadenza: lotto.data_scadenza, disponibile, presa });
      daAllocare -= presa;
    }

    sezioni.push({
      materiaPrimaId: ing.materia_prima_id,
      unitaRicettaId: ing.unita_misura_id,
      necessarioRicetta,
      unitaMagazzinoId,
      necessario,
      allocazioni,
      mancante: daAllocare,
    });
  }

  container.innerHTML = sezioni.map((sez, sezIdx) => `
    <div class="panel" style="background: var(--bg); margin-top:16px;">
      <h2 style="font-size:0.95rem;">${nomeMateriaPrima(sez.materiaPrimaId)} — necessario: ${sez.necessarioRicetta} ${nomeUnita(sez.unitaRicettaId)}${sez.unitaRicettaId !== sez.unitaMagazzinoId ? ` (${sez.necessario} ${nomeUnita(sez.unitaMagazzinoId)})` : ''}</h2>
      ${sez.allocazioni.length === 0 ? '<p class="empty-state">Nessun lotto disponibile.</p>' : `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Lotto</th><th>Scadenza</th><th>Disponibile (${nomeUnita(sez.unitaMagazzinoId)})</th><th>Da prelevare</th></tr></thead>
            <tbody>
              ${sez.allocazioni.map((a, aIdx) => `
                <tr>
                  <td>${a.numeroLotto}</td>
                  <td>${a.scadenza || '—'}</td>
                  <td>${a.disponibile}</td>
                  <td><input type="number" min="0" max="${a.disponibile}" step="any" value="${a.presa}" class="allocazione-input" data-sez="${sezIdx}" data-alloc="${aIdx}" style="margin-bottom:0;"></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
      ${sez.mancante > 0 ? `<p class="error">Attenzione: mancano ${sez.mancante} ${nomeUnita(sez.unitaMagazzinoId)} rispetto al fabbisogno.</p>` : ''}
    </div>
  `).join('') + `<div class="btn-row" style="margin-top:16px;"><button type="button" id="conferma-prelievo-btn">Conferma prelievo</button></div>`;

  document.getElementById('conferma-prelievo-btn').addEventListener('click', () => confermaPrelievo(sezioni));
}

async function confermaPrelievo(sezioni) {
  if (!confirm('Confermare il prelievo? Il movimento non potrà più essere modificato.')) return;

  const inputs = document.querySelectorAll('.allocazione-input');
  inputs.forEach(input => {
    const sezIdx = Number(input.dataset.sez);
    const allocIdx = Number(input.dataset.alloc);
    sezioni[sezIdx].allocazioni[allocIdx].presa = Number(input.value) || 0;
  });

  const allocazioni = [];
  for (const sez of sezioni) {
    for (const alloc of sez.allocazioni) {
      if (alloc.presa > 0) {
        allocazioni.push({ lotto_id: alloc.lottoId, quantita: alloc.presa });
      }
    }
  }

  if (allocazioni.length === 0) {
    alert('Nessuna quantità da prelevare.');
    return;
  }

  const { error } = await supabaseClient.rpc('registra_prelievo_produzione', {
    p_ordine_produzione_riga_id: rigaInPrelievo.id,
    p_allocazioni: allocazioni,
  });

  if (error) {
    alert('Errore nella registrazione del prelievo: ' + error.message);
    return;
  }

  prelievoPanel.hidden = true;
  if (ordineInGestione) await renderGestione();
  await caricaOrdini();
}

async function renderRiepilogoMovimenti() {
  const { data, error } = await supabaseClient
    .from('movimenti_materie_prime')
    .select('quantita, lotti_materie_prime(numero_lotto, materia_prima_id), data_movimento')
    .eq('ordine_produzione_riga_id', rigaInPrelievo.id);

  if (error || !data || data.length === 0) {
    prelievoContent.innerHTML = '<p class="empty-state">Nessun movimento registrato per questa riga.</p>';
    return;
  }

  prelievoContent.innerHTML = `
    <p><strong>Stato:</strong> ${STATO_LABEL[rigaInPrelievo.stato] || rigaInPrelievo.stato}</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Materia prima</th><th>Lotto</th><th>Quantità prelevata</th><th>Data</th></tr></thead>
        <tbody>
          ${data.map(m => `
            <tr>
              <td>${nomeMateriaPrima(m.lotti_materie_prime.materia_prima_id)}</td>
              <td>${m.lotti_materie_prime.numero_lotto}</td>
              <td>${m.quantita}</td>
              <td>${new Date(m.data_movimento).toLocaleString('it-IT')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

document.getElementById('chiudi-prelievo-btn').addEventListener('click', () => {
  prelievoPanel.hidden = true;
  rigaInPrelievo = null;
});

init();
