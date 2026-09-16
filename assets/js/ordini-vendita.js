let utenteCorrente = null;
let clienti = [];
let prodottiFiniti = [];
let unitaMisura = [];
let ordineInGestione = null;

const clienteSelect = document.getElementById('cliente-select');
const noteInput = document.getElementById('note-input');
const errorMessage = document.getElementById('error-message');
const tbody = document.getElementById('ordini-tbody');
const emptyState = document.getElementById('empty-state');

const gestionePanel = document.getElementById('gestione-panel');
const gestioneTitle = document.getElementById('gestione-title');
const gestioneContent = document.getElementById('gestione-content');

const STATO_LABEL = {
  bozza: 'Bozza',
  confermato: 'Confermato',
  evaso: 'Evaso',
  annullato: 'Annullato',
};

async function init() {
  utenteCorrente = await requireAuth(['direttore', 'responsabile_confezionamento']);
  if (!utenteCorrente) return;

  initShell(utenteCorrente);

  if (utenteCorrente.ruolo !== 'direttore') {
    document.getElementById('form-panel').hidden = true;
  }

  await caricaClienti();
  await caricaProdottiFiniti();
  await caricaUnitaMisura();
  await caricaOrdini();
}

async function caricaClienti() {
  const { data } = await supabaseClient.from('clienti').select('id, nome').order('nome');
  clienti = data || [];
  clienteSelect.innerHTML = clienti.map(c => `<option value="${c.id}">${c.nome}</option>`).join('') || '<option value="">Nessun cliente: creane uno prima</option>';
}

async function caricaProdottiFiniti() {
  const { data } = await supabaseClient.from('prodotti_finiti').select('id, nome, unita_misura_base_id').order('nome');
  prodottiFiniti = data || [];
}

async function caricaUnitaMisura() {
  const { data } = await supabaseClient.from('unita_misura').select('id, codice, nome').order('nome');
  unitaMisura = data || [];
}

function nomeUnita(id) {
  const u = unitaMisura.find(x => x.id === id);
  return u ? `${u.nome} (${u.codice})` : '—';
}

function nomeProdotto(id) {
  const p = prodottiFiniti.find(x => x.id === id);
  return p ? p.nome : '—';
}

async function caricaOrdini() {
  const { data, error } = await supabaseClient
    .from('ordini_vendita')
    .select('id, stato, creato_il, clienti(nome)')
    .order('creato_il', { ascending: false });

  if (error) { errorMessage.textContent = 'Errore caricamento ordini: ' + error.message; return; }

  tbody.innerHTML = '';
  emptyState.hidden = data.length > 0;

  for (const ordine of data) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${ordine.clienti.nome}</td>
      <td>${STATO_LABEL[ordine.stato] || ordine.stato}</td>
      <td>${new Date(ordine.creato_il).toLocaleString('it-IT')}</td>
    `;
    const tdActions = document.createElement('td');
    tdActions.className = 'actions';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-secondary';
    btn.textContent = 'Gestisci';
    btn.addEventListener('click', () => apriGestione(ordine));
    tdActions.appendChild(btn);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  }
}

document.getElementById('crea-ordine-btn').addEventListener('click', async () => {
  errorMessage.textContent = '';

  const clienteId = Number(clienteSelect.value);
  if (!clienteId) {
    errorMessage.textContent = 'Seleziona un cliente (creane uno nella pagina Clienti se la lista è vuota).';
    return;
  }

  const { data, error } = await supabaseClient
    .from('ordini_vendita')
    .insert({ cliente_id: clienteId, creato_da: utenteCorrente.id, note: noteInput.value.trim() || null })
    .select('id, stato, creato_il, clienti(nome)')
    .single();

  if (error) {
    errorMessage.textContent = 'Errore: ' + error.message;
    return;
  }

  noteInput.value = '';
  await caricaOrdini();
  apriGestione(data);
});

// ---- Gestione ordine ----

async function apriGestione(ordine) {
  ordineInGestione = ordine;
  gestioneTitle.textContent = `Ordine — ${ordine.clienti.nome}`;
  gestionePanel.hidden = false;

  if (ordine.stato === 'bozza') {
    await renderBozza();
  } else {
    await renderRiepilogo();
  }

  gestionePanel.scrollIntoView({ behavior: 'smooth' });
}

async function caricaRighe(ordineId) {
  const { data } = await supabaseClient
    .from('ordini_vendita_righe')
    .select('id, prodotto_finito_id, quantita_richiesta, unita_misura_id')
    .eq('ordine_vendita_id', ordineId)
    .order('id');
  return data || [];
}

async function renderBozza() {
  const righe = await caricaRighe(ordineInGestione.id);

  gestioneContent.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Prodotto</th><th>Quantità</th><th></th></tr></thead>
        <tbody id="righe-tbody"></tbody>
      </table>
    </div>
    <div class="form-row" style="margin-top:16px;">
      <div>
        <label for="riga-prodotto">Prodotto</label>
        <select id="riga-prodotto">${prodottiFiniti.map(p => `<option value="${p.id}">${p.nome}</option>`).join('')}</select>
      </div>
      <div>
        <label for="riga-unita">Unità</label>
        <select id="riga-unita">${unitaMisura.map(u => `<option value="${u.id}">${u.nome} (${u.codice})</option>`).join('')}</select>
      </div>
    </div>
    <label for="riga-quantita">Quantità</label>
    <input type="number" id="riga-quantita" min="0" step="any">
    <button type="button" id="aggiungi-riga-btn">Aggiungi prodotto all'ordine</button>
    <div id="allocazione-container"></div>
  `;

  const righeTbody = document.getElementById('righe-tbody');
  for (const riga of righe) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${nomeProdotto(riga.prodotto_finito_id)}</td><td>${riga.quantita_richiesta} ${nomeUnita(riga.unita_misura_id)}</td>`;
    const tdActions = document.createElement('td');
    tdActions.className = 'actions';
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn-danger';
    delBtn.textContent = 'Elimina';
    delBtn.addEventListener('click', async () => {
      await supabaseClient.from('ordini_vendita_righe').delete().eq('id', riga.id);
      await renderBozza();
    });
    tdActions.appendChild(delBtn);
    tr.appendChild(tdActions);
    righeTbody.appendChild(tr);
  }

  document.getElementById('aggiungi-riga-btn').addEventListener('click', async () => {
    const quantita = Number(document.getElementById('riga-quantita').value);
    if (!quantita || quantita <= 0) {
      alert('Inserisci una quantità maggiore di zero.');
      return;
    }
    const { error } = await supabaseClient.from('ordini_vendita_righe').insert({
      ordine_vendita_id: ordineInGestione.id,
      prodotto_finito_id: Number(document.getElementById('riga-prodotto').value),
      quantita_richiesta: quantita,
      unita_misura_id: Number(document.getElementById('riga-unita').value),
    });
    if (error) {
      alert('Errore: ' + error.message);
      return;
    }
    await renderBozza();
  });

  if (righe.length > 0) {
    const calcolaBtn = document.createElement('button');
    calcolaBtn.type = 'button';
    calcolaBtn.textContent = 'Calcola allocazione FEFO';
    calcolaBtn.style.marginTop = '16px';
    calcolaBtn.addEventListener('click', () => calcolaAllocazione(righe));
    gestioneContent.appendChild(calcolaBtn);
  }
}

async function calcolaAllocazione(righe) {
  const container = document.getElementById('allocazione-container');
  container.innerHTML = '<p class="empty-state">Calcolo in corso…</p>';

  const sezioni = [];

  for (const riga of righe) {
    const { data: lotti } = await supabaseClient
      .from('lotti_prodotti_finiti')
      .select('id, numero_lotto, data_scadenza')
      .eq('prodotto_finito_id', riga.prodotto_finito_id)
      .eq('stato', 'disponibile')
      .order('data_scadenza', { ascending: true, nullsFirst: false });

    const idLotti = (lotti || []).map(l => l.id);
    let giacenzePerLotto = {};
    if (idLotti.length > 0) {
      const { data: giacenze } = await supabaseClient
        .from('v_giacenza_prodotti_finiti')
        .select('lotto_id, giacenza')
        .in('lotto_id', idLotti);
      giacenzePerLotto = Object.fromEntries((giacenze || []).map(g => [g.lotto_id, g.giacenza]));
    }

    let daAllocare = riga.quantita_richiesta;
    const allocazioni = [];
    for (const lotto of (lotti || [])) {
      if (daAllocare <= 0) break;
      const disponibile = giacenzePerLotto[lotto.id] || 0;
      if (disponibile <= 0) continue;
      const presa = Math.min(disponibile, daAllocare);
      allocazioni.push({ lottoId: lotto.id, numeroLotto: lotto.numero_lotto, scadenza: lotto.data_scadenza, disponibile, presa });
      daAllocare -= presa;
    }

    sezioni.push({ rigaId: riga.id, prodottoFinitoId: riga.prodotto_finito_id, unitaMisuraId: riga.unita_misura_id, necessario: riga.quantita_richiesta, allocazioni, mancante: daAllocare });
  }

  container.innerHTML = sezioni.map((sez, sezIdx) => `
    <div class="panel" style="background: var(--bg); margin-top:16px;">
      <h2 style="font-size:0.95rem;">${nomeProdotto(sez.prodottoFinitoId)} — necessario: ${sez.necessario} ${nomeUnita(sez.unitaMisuraId)}</h2>
      ${sez.allocazioni.length === 0 ? '<p class="empty-state">Nessun lotto disponibile.</p>' : `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Lotto</th><th>Scadenza</th><th>Disponibile</th><th>Da allocare</th></tr></thead>
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
      ${sez.mancante > 0 ? `<p class="error">Attenzione: mancano ${sez.mancante} ${nomeUnita(sez.unitaMisuraId)} rispetto al richiesto.</p>` : ''}
    </div>
  `).join('') + `<div class="btn-row" style="margin-top:16px;"><button type="button" id="conferma-ordine-btn">Conferma ordine</button></div>`;

  document.getElementById('conferma-ordine-btn').addEventListener('click', () => confermaOrdine(sezioni));
}

async function confermaOrdine(sezioni) {
  if (!confirm('Confermare l\'ordine? L\'allocazione dei lotti non potrà più essere modificata.')) return;

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
        allocazioni.push({ ordine_vendita_riga_id: sez.rigaId, lotto_id: alloc.lottoId, quantita: alloc.presa });
      }
    }
  }

  if (allocazioni.length === 0) {
    alert('Nessuna quantità da allocare.');
    return;
  }

  const { error } = await supabaseClient.rpc('registra_allocazione_vendita', {
    p_ordine_vendita_id: ordineInGestione.id,
    p_allocazioni: allocazioni,
  });

  if (error) {
    alert('Errore nella conferma dell\'ordine: ' + error.message);
    return;
  }

  gestionePanel.hidden = true;
  await caricaOrdini();
}

async function renderRiepilogo() {
  const righe = await caricaRighe(ordineInGestione.id);
  const idRighe = righe.map(r => r.id);

  let movimenti = [];
  if (idRighe.length > 0) {
    const { data } = await supabaseClient
      .from('movimenti_prodotti_finiti')
      .select('quantita, ordine_vendita_riga_id, lotti_prodotti_finiti(numero_lotto, prodotto_finito_id)')
      .in('ordine_vendita_riga_id', idRighe);
    movimenti = data || [];
  }

  gestioneContent.innerHTML = `
    <p><strong>Stato:</strong> ${STATO_LABEL[ordineInGestione.stato] || ordineInGestione.stato}</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Prodotto</th><th>Lotto</th><th>Quantità</th></tr></thead>
        <tbody>
          ${movimenti.map(m => `
            <tr>
              <td>${nomeProdotto(m.lotti_prodotti_finiti.prodotto_finito_id)}</td>
              <td>${m.lotti_prodotti_finiti.numero_lotto}</td>
              <td>${m.quantita}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  if (ordineInGestione.stato === 'confermato') {
    const evadiBtn = document.createElement('button');
    evadiBtn.type = 'button';
    evadiBtn.textContent = 'Segna come evaso';
    evadiBtn.style.marginTop = '16px';
    evadiBtn.addEventListener('click', async () => {
      const { error } = await supabaseClient.from('ordini_vendita').update({ stato: 'evaso' }).eq('id', ordineInGestione.id);
      if (error) {
        alert('Errore: ' + error.message);
        return;
      }
      gestionePanel.hidden = true;
      await caricaOrdini();
    });
    gestioneContent.appendChild(evadiBtn);
  }
}

document.getElementById('chiudi-gestione-btn').addEventListener('click', () => {
  gestionePanel.hidden = true;
  ordineInGestione = null;
});

init();
