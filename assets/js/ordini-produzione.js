let utenteCorrente = null;
let unitaMisura = [];
let materiePrime = [];
let prodottiConRicetta = [];
let ordineInGestione = null;

const prodottoSelect = document.getElementById('prodotto-select');
const unitaSelect = document.getElementById('unita-select');
const quantitaInput = document.getElementById('quantita-input');
const noteInput = document.getElementById('note-input');
const errorMessage = document.getElementById('error-message');
const tbody = document.getElementById('ordini-tbody');
const emptyState = document.getElementById('empty-state');

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
  utenteCorrente = await requireAuth(['direttore', 'responsabile_produzione']);
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
  unitaSelect.innerHTML = data.map(u => `<option value="${u.id}">${u.nome} (${u.codice})</option>`).join('');
}

async function caricaMateriePrime() {
  const { data, error } = await supabaseClient.from('materie_prime').select('id, nome, unita_misura_base_id').order('nome');
  if (error) { errorMessage.textContent = 'Errore materie prime: ' + error.message; return; }
  materiePrime = data;
}

async function caricaProdottiConRicetta() {
  const { data, error } = await supabaseClient
    .from('ricette')
    .select('id, resa_quantita, resa_unita_misura_id, prodotti_finiti(id, nome)')
    .is('valido_a', null);

  if (error) { errorMessage.textContent = 'Errore ricette: ' + error.message; return; }

  prodottiConRicetta = data.map(r => ({
    ricettaId: r.id,
    resaQuantita: r.resa_quantita,
    resaUnitaMisuraId: r.resa_unita_misura_id,
    prodottoFinitoId: r.prodotti_finiti.id,
    nomeProdotto: r.prodotti_finiti.nome,
  }));

  prodottoSelect.innerHTML = prodottiConRicetta
    .map(p => `<option value="${p.ricettaId}">${p.nomeProdotto}</option>`)
    .join('') || '<option value="">Nessun prodotto con ricetta attiva</option>';
}

function nomeUnita(id) {
  const u = unitaMisura.find(x => x.id === id);
  return u ? `${u.nome} (${u.codice})` : '—';
}

function nomeMateriaPrima(id) {
  const m = materiePrime.find(x => x.id === id);
  return m ? m.nome : '—';
}


async function caricaOrdini() {
  const { data, error } = await supabaseClient
    .from('ordini_produzione')
    .select('id, quantita_richiesta, unita_misura_id, stato, creato_il, ricetta_id, prodotti_finiti(nome)')
    .order('creato_il', { ascending: false });

  if (error) { errorMessage.textContent = 'Errore caricamento ordini: ' + error.message; return; }

  tbody.innerHTML = '';
  emptyState.hidden = data.length > 0;

  for (const ordine of data) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${ordine.prodotti_finiti.nome}</td>
      <td>${ordine.quantita_richiesta} ${nomeUnita(ordine.unita_misura_id)}</td>
      <td>${STATO_LABEL[ordine.stato] || ordine.stato}</td>
      <td>${new Date(ordine.creato_il).toLocaleString('it-IT')}</td>
    `;
    const tdActions = document.createElement('td');
    tdActions.className = 'actions';
    const gestBtn = document.createElement('button');
    gestBtn.type = 'button';
    gestBtn.className = 'btn-secondary';
    gestBtn.textContent = ordine.stato === 'assegnato' ? 'Conferma prelievo' : 'Dettagli';
    gestBtn.addEventListener('click', () => apriPrelievo(ordine));
    tdActions.appendChild(gestBtn);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  }
}

document.getElementById('crea-ordine-btn').addEventListener('click', async () => {
  errorMessage.textContent = '';

  const ricettaId = Number(prodottoSelect.value);
  const prodotto = prodottiConRicetta.find(p => p.ricettaId === ricettaId);
  const quantita = Number(quantitaInput.value);

  if (!prodotto) {
    errorMessage.textContent = 'Nessun prodotto selezionabile: crea prima una ricetta attiva per almeno un prodotto finito.';
    return;
  }
  if (!quantita || quantita <= 0) {
    errorMessage.textContent = 'Inserisci una quantità maggiore di zero.';
    return;
  }

  const { error } = await supabaseClient.from('ordini_produzione').insert({
    prodotto_finito_id: prodotto.prodottoFinitoId,
    ricetta_id: prodotto.ricettaId,
    quantita_richiesta: quantita,
    unita_misura_id: Number(unitaSelect.value),
    creato_da: utenteCorrente.id,
    note: noteInput.value.trim() || null,
  });

  if (error) {
    errorMessage.textContent = 'Errore: ' + error.message;
    return;
  }

  quantitaInput.value = '';
  noteInput.value = '';
  await caricaOrdini();
});

// ---- Gestione prelievo ----

async function apriPrelievo(ordine) {
  ordineInGestione = ordine;
  prelievoTitle.textContent = `${ordine.prodotti_finiti.nome} — ${ordine.quantita_richiesta} ${nomeUnita(ordine.unita_misura_id)}`;
  prelievoPanel.hidden = false;

  if (ordine.stato === 'assegnato') {
    await renderFormBatch();
  } else {
    await renderRiepilogoMovimenti();
  }

  prelievoPanel.scrollIntoView({ behavior: 'smooth' });
}

async function caricaIngredientiRicetta(ricettaId) {
  const { data, error } = await supabaseClient
    .from('ricette_ingredienti')
    .select('materia_prima_id, quantita, unita_misura_id')
    .eq('ricetta_id', ricettaId);
  if (error) return [];
  return data;
}

async function renderFormBatch() {
  const ingredienti = await caricaIngredientiRicetta(ordineInGestione.ricetta_id);

  prelievoContent.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Materia prima</th><th>Per 1 batch</th></tr></thead>
        <tbody>
          ${ingredienti.map(i => `<tr><td>${nomeMateriaPrima(i.materia_prima_id)}</td><td>${i.quantita} ${nomeUnita(i.unita_misura_id)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
    <label for="numero-batch-input">Quanti batch/infornate produci per questo ordine?</label>
    <input type="number" id="numero-batch-input" min="0" step="any">
    <button type="button" id="calcola-fabbisogno-btn">Calcola fabbisogno (FEFO)</button>
    <div id="allocazione-container"></div>
  `;

  document.getElementById('calcola-fabbisogno-btn').addEventListener('click', () => calcolaFabbisogno(ingredienti));
}

async function calcolaFabbisogno(ingredienti) {
  const numeroBatch = Number(document.getElementById('numero-batch-input').value);
  if (!numeroBatch || numeroBatch <= 0) {
    alert('Inserisci un numero di batch maggiore di zero.');
    return;
  }

  const container = document.getElementById('allocazione-container');
  container.innerHTML = '<p class="empty-state">Calcolo in corso…</p>';

  const sezioni = [];

  for (const ing of ingredienti) {
    const necessario = ing.quantita * numeroBatch;

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

    sezioni.push({ materiaPrimaId: ing.materia_prima_id, unitaMisuraId: ing.unita_misura_id, necessario, allocazioni, mancante: daAllocare });
  }

  container.innerHTML = sezioni.map((sez, sezIdx) => `
    <div class="panel" style="background: var(--bg); margin-top:16px;">
      <h2 style="font-size:0.95rem;">${nomeMateriaPrima(sez.materiaPrimaId)} — necessario: ${sez.necessario} ${nomeUnita(sez.unitaMisuraId)}</h2>
      ${sez.allocazioni.length === 0 ? '<p class="empty-state">Nessun lotto disponibile.</p>' : `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Lotto</th><th>Scadenza</th><th>Disponibile</th><th>Da prelevare</th></tr></thead>
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
      ${sez.mancante > 0 ? `<p class="error">Attenzione: mancano ${sez.mancante} ${nomeUnita(sez.unitaMisuraId)} rispetto al fabbisogno.</p>` : ''}
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
    p_ordine_produzione_id: ordineInGestione.id,
    p_allocazioni: allocazioni,
  });

  if (error) {
    alert('Errore nella registrazione del prelievo: ' + error.message);
    return;
  }

  prelievoPanel.hidden = true;
  await caricaOrdini();
}

async function renderRiepilogoMovimenti() {
  const { data, error } = await supabaseClient
    .from('movimenti_materie_prime')
    .select('quantita, lotti_materie_prime(numero_lotto, materia_prima_id), data_movimento')
    .eq('ordine_produzione_id', ordineInGestione.id);

  if (error || !data || data.length === 0) {
    prelievoContent.innerHTML = '<p class="empty-state">Nessun movimento registrato per questo ordine.</p>';
    return;
  }

  prelievoContent.innerHTML = `
    <p><strong>Stato:</strong> ${STATO_LABEL[ordineInGestione.stato] || ordineInGestione.stato}</p>
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
  ordineInGestione = null;
});

init();
