let utenteCorrente = null;
let unitaMisura = [];
let materiePrime = [];
let allergeni = [];
let prodottoInModifica = null;

const form = document.getElementById('prodotto-form');
const idInput = document.getElementById('prodotto-id');
const nomeInput = document.getElementById('nome');
const unitaBaseSelect = document.getElementById('unita-base');
const giorniPreavvisoInput = document.getElementById('giorni-preavviso');
const noteInput = document.getElementById('note');
const errorMessage = document.getElementById('error-message');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-btn');
const tbody = document.getElementById('prodotti-tbody');
const emptyState = document.getElementById('empty-state');
const mostraDisattivatiCheck = document.getElementById('mostra-disattivati-check');

const ricettaPanel = document.getElementById('ricetta-panel');
const ricettaTitle = document.getElementById('ricetta-title');
const ricettaContent = document.getElementById('ricetta-content');

async function init() {
  utenteCorrente = await requireAuth(['direttore', 'responsabile_confezionamento']);
  if (!utenteCorrente) return;

  initShell(utenteCorrente);

  const soloLettura = utenteCorrente.ruolo !== 'direttore';
  if (soloLettura) {
    document.querySelector('#prodotto-form').closest('.panel').hidden = true;
  }

  await caricaUnitaMisura();
  await caricaMateriePrime();
  await caricaAllergeni();
  await caricaProdotti();
}

async function caricaUnitaMisura() {
  const { data, error } = await supabaseClient.from('unita_misura').select('id, codice, nome').order('nome');
  if (error) {
    errorMessage.textContent = 'Errore caricamento unità di misura: ' + error.message;
    return;
  }
  unitaMisura = data;
  unitaBaseSelect.innerHTML = data.map(u => `<option value="${u.id}">${u.nome} (${u.codice})</option>`).join('');
}

async function caricaMateriePrime() {
  const { data, error } = await supabaseClient.from('materie_prime').select('id, nome, attivo').order('nome');
  if (error) {
    errorMessage.textContent = 'Errore caricamento materie prime: ' + error.message;
    return;
  }
  materiePrime = data;
}

async function caricaAllergeni() {
  const { data, error } = await supabaseClient.from('allergeni').select('id, nome').order('nome');
  if (error) {
    errorMessage.textContent = 'Errore caricamento allergeni: ' + error.message;
    return;
  }
  allergeni = data;
}

function nomeUnita(id) {
  const u = unitaMisura.find(x => x.id === id);
  return u ? `${u.nome} (${u.codice})` : '—';
}

function nomeMateriaPrima(id) {
  const m = materiePrime.find(x => x.id === id);
  return m ? m.nome : '—';
}

function nomeAllergene(id) {
  const a = allergeni.find(x => x.id === id);
  return a ? a.nome : '—';
}

async function caricaProdotti() {
  let query = supabaseClient
    .from('prodotti_finiti')
    .select('id, nome, unita_misura_base_id, giorni_preavviso_scadenza, note, attivo')
    .order('nome');
  if (!mostraDisattivatiCheck.checked) {
    query = query.eq('attivo', true);
  }
  const { data, error } = await query;

  if (error) {
    errorMessage.textContent = 'Errore nel caricamento prodotti finiti: ' + error.message;
    return;
  }

  tbody.innerHTML = '';
  emptyState.hidden = data.length > 0;

  for (const prodotto of data) {
    const tr = document.createElement('tr');
    if (!prodotto.attivo) tr.style.opacity = '0.55';

    const tdNome = document.createElement('td');
    tdNome.textContent = prodotto.nome;
    tr.appendChild(tdNome);

    const tdUnita = document.createElement('td');
    tdUnita.textContent = nomeUnita(prodotto.unita_misura_base_id);
    tr.appendChild(tdUnita);

    const tdPreavviso = document.createElement('td');
    tdPreavviso.textContent = prodotto.giorni_preavviso_scadenza;
    tr.appendChild(tdPreavviso);

    const tdStato = document.createElement('td');
    tdStato.textContent = prodotto.attivo ? 'Attivo' : 'Disattivato';
    tr.appendChild(tdStato);

    const tdActions = document.createElement('td');
    tdActions.className = 'actions';

    const ricettaBtn = document.createElement('button');
    ricettaBtn.type = 'button';
    ricettaBtn.className = 'btn-secondary';
    ricettaBtn.textContent = 'Ricetta';
    ricettaBtn.addEventListener('click', () => apriRicetta(prodotto));
    tdActions.appendChild(ricettaBtn);

    if (utenteCorrente.ruolo === 'direttore') {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn-secondary';
      editBtn.textContent = 'Modifica';
      editBtn.addEventListener('click', () => avviaModifica(prodotto));
      tdActions.appendChild(editBtn);

      if (prodotto.attivo) {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn-danger';
        deleteBtn.textContent = 'Elimina';
        deleteBtn.addEventListener('click', () => eliminaProdotto(prodotto));
        tdActions.appendChild(deleteBtn);
      } else {
        const riattivaBtn = document.createElement('button');
        riattivaBtn.type = 'button';
        riattivaBtn.className = 'btn-secondary';
        riattivaBtn.textContent = 'Riattiva';
        riattivaBtn.addEventListener('click', () => impostaAttivo(prodotto, true));
        tdActions.appendChild(riattivaBtn);
      }
    }

    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  }
}

function avviaModifica(prodotto) {
  idInput.value = prodotto.id;
  nomeInput.value = prodotto.nome;
  unitaBaseSelect.value = prodotto.unita_misura_base_id;
  giorniPreavvisoInput.value = prodotto.giorni_preavviso_scadenza;
  noteInput.value = prodotto.note || '';

  formTitle.textContent = 'Modifica prodotto finito';
  submitBtn.textContent = 'Salva modifiche';
  cancelBtn.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function annullaModifica() {
  form.reset();
  idInput.value = '';
  formTitle.textContent = 'Nuovo prodotto finito';
  submitBtn.textContent = 'Salva';
  cancelBtn.hidden = true;
  errorMessage.textContent = '';
}

async function eliminaProdotto(prodotto) {
  if (!confirm(`Eliminare il prodotto finito "${prodotto.nome}"?`)) return;

  const { error } = await supabaseClient.from('prodotti_finiti').delete().eq('id', prodotto.id);

  if (error) {
    if (error.code === '23503') {
      if (confirm(`Non puoi eliminare "${prodotto.nome}" perché è già collegato ad altri dati (ricette, ordini, lotti...). Vuoi disattivarlo invece? Non comparirà più tra le scelte disponibili, ma la sua storia resterà intatta.`)) {
        await impostaAttivo(prodotto, false);
      }
      return;
    }
    alert('Errore durante l\'eliminazione: ' + error.message);
    return;
  }

  await caricaProdotti();
}

async function impostaAttivo(prodotto, attivo) {
  const { error } = await supabaseClient.from('prodotti_finiti').update({ attivo }).eq('id', prodotto.id);
  if (error) {
    alert('Errore: ' + error.message);
    return;
  }
  await caricaProdotti();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorMessage.textContent = '';
  submitBtn.disabled = true;

  const valori = {
    nome: nomeInput.value.trim(),
    unita_misura_base_id: Number(unitaBaseSelect.value),
    giorni_preavviso_scadenza: Number(giorniPreavvisoInput.value) || 0,
    note: noteInput.value.trim() || null,
  };

  let result;
  if (idInput.value) {
    result = await supabaseClient.from('prodotti_finiti').update(valori).eq('id', idInput.value);
  } else {
    result = await supabaseClient.from('prodotti_finiti').insert(valori);
  }

  submitBtn.disabled = false;

  if (result.error) {
    errorMessage.textContent = 'Errore: ' + result.error.message;
    return;
  }

  annullaModifica();
  await caricaProdotti();
});

cancelBtn.addEventListener('click', annullaModifica);

// ---- Ricetta ----

async function apriRicetta(prodotto) {
  prodottoInModifica = prodotto;
  ricettaTitle.textContent = `Ricetta — ${prodotto.nome}`;
  ricettaPanel.hidden = false;
  await renderRicetta();
  ricettaPanel.scrollIntoView({ behavior: 'smooth' });
}

async function ricettaAttiva(prodottoFinitoId) {
  const { data } = await supabaseClient
    .from('ricette')
    .select('id, versione, resa_quantita, resa_unita_misura_id')
    .eq('prodotto_finito_id', prodottoFinitoId)
    .is('valido_a', null)
    .maybeSingle();
  return data;
}

async function ricettaUsataInProduzione(ricettaId) {
  const { count } = await supabaseClient
    .from('ordini_produzione')
    .select('id', { count: 'exact', head: true })
    .eq('ricetta_id', ricettaId);
  return (count || 0) > 0;
}

async function allergeniProdotto(prodottoFinitoId) {
  const { data, error } = await supabaseClient
    .from('v_prodotti_finiti_allergeni')
    .select('allergene_id')
    .eq('prodotto_finito_id', prodottoFinitoId);
  if (error || !data) return [];
  return data.map(r => nomeAllergene(r.allergene_id));
}

async function renderRicetta() {
  const ricetta = await ricettaAttiva(prodottoInModifica.id);
  const puoModificare = utenteCorrente.ruolo === 'direttore';

  if (!ricetta) {
    ricettaContent.innerHTML = puoModificare ? `
      <p class="empty-state">Nessuna ricetta impostata per questo prodotto.</p>
      <div class="form-row">
        <div>
          <label for="nuova-resa-quantita">Resa (quanto produce 1 batch/infornata)</label>
          <input type="number" id="nuova-resa-quantita" min="0" step="any">
        </div>
        <div>
          <label for="nuova-resa-unita">Unità</label>
          <select id="nuova-resa-unita">${unitaMisura.map(u => `<option value="${u.id}">${u.nome} (${u.codice})</option>`).join('')}</select>
        </div>
      </div>
      <button type="button" id="crea-ricetta-btn">Crea prima versione della ricetta</button>
    ` : `<p class="empty-state">Nessuna ricetta impostata per questo prodotto.</p>`;
    if (puoModificare) {
      document.getElementById('crea-ricetta-btn').addEventListener('click', creaPrimaRicetta);
    }
    return;
  }

  const bloccata = await ricettaUsataInProduzione(ricetta.id);
  const ingredienti = await caricaIngredienti(ricetta.id);
  const nomiAllergeni = await allergeniProdotto(prodottoInModifica.id);

  let html = `
    <p><strong>Versione ${ricetta.versione}</strong> — resa: ${ricetta.resa_quantita} ${nomeUnita(ricetta.resa_unita_misura_id)} per batch</p>
    <p class="empty-state">Allergeni (calcolati dagli ingredienti): ${nomiAllergeni.length ? nomiAllergeni.join(', ') : 'nessuno'}</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Materia prima</th><th>Quantità per batch</th><th>Unità</th><th></th></tr></thead>
        <tbody id="ingredienti-tbody"></tbody>
      </table>
    </div>
  `;

  if (bloccata && puoModificare) {
    html += `
      <p class="empty-state">Questa versione è già stata usata in un ordine di produzione: non è più modificabile.</p>
      <button type="button" id="nuova-versione-btn">Crea nuova versione della ricetta</button>
    `;
  } else if (!bloccata && puoModificare) {
    html += `
      <div class="form-row" style="margin-top:16px;">
        <div>
          <label for="ingrediente-materia">Materia prima</label>
          <select id="ingrediente-materia">${materiePrime.filter(m => m.attivo).map(m => `<option value="${m.id}">${m.nome}</option>`).join('')}</select>
        </div>
        <div>
          <label for="ingrediente-unita">Unità</label>
          <select id="ingrediente-unita">${unitaMisura.map(u => `<option value="${u.id}">${u.nome} (${u.codice})</option>`).join('')}</select>
        </div>
      </div>
      <label for="ingrediente-quantita">Quantità per batch</label>
      <input type="number" id="ingrediente-quantita" min="0" step="any">
      <button type="button" id="aggiungi-ingrediente-btn">Aggiungi ingrediente</button>
    `;
  }

  ricettaContent.innerHTML = html;

  const ingredientiTbody = document.getElementById('ingredienti-tbody');
  for (const ing of ingredienti) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${nomeMateriaPrima(ing.materia_prima_id)}</td><td>${ing.quantita}</td><td>${nomeUnita(ing.unita_misura_id)}</td>`;
    if (!bloccata && utenteCorrente.ruolo === 'direttore') {
      const tdActions = document.createElement('td');
      tdActions.className = 'actions';
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn-danger';
      delBtn.textContent = 'Elimina';
      delBtn.addEventListener('click', async () => {
        await supabaseClient.from('ricette_ingredienti').delete().eq('id', ing.id);
        await renderRicetta();
      });
      tdActions.appendChild(delBtn);
      tr.appendChild(tdActions);
    } else {
      tr.appendChild(document.createElement('td'));
    }
    ingredientiTbody.appendChild(tr);
  }

  if (!bloccata && puoModificare) {
    document.getElementById('aggiungi-ingrediente-btn').addEventListener('click', async () => {
      const quantita = Number(document.getElementById('ingrediente-quantita').value);
      if (!quantita || quantita <= 0) {
        alert('Inserisci una quantità maggiore di zero.');
        return;
      }
      const { error } = await supabaseClient.from('ricette_ingredienti').insert({
        ricetta_id: ricetta.id,
        materia_prima_id: Number(document.getElementById('ingrediente-materia').value),
        quantita,
        unita_misura_id: Number(document.getElementById('ingrediente-unita').value),
      });
      if (error) {
        alert('Errore: ' + error.message);
        return;
      }
      await renderRicetta();
    });
  } else if (bloccata && puoModificare) {
    document.getElementById('nuova-versione-btn').addEventListener('click', () => creaNuovaVersione(ricetta, ingredienti));
  }
}

async function caricaIngredienti(ricettaId) {
  const { data, error } = await supabaseClient
    .from('ricette_ingredienti')
    .select('id, materia_prima_id, quantita, unita_misura_id')
    .eq('ricetta_id', ricettaId)
    .order('id');
  if (error) return [];
  return data;
}

async function creaPrimaRicetta() {
  const resaQuantita = Number(document.getElementById('nuova-resa-quantita').value);
  if (!resaQuantita || resaQuantita <= 0) {
    alert('Inserisci una resa maggiore di zero.');
    return;
  }
  const resaUnitaId = Number(document.getElementById('nuova-resa-unita').value);

  const { error } = await supabaseClient.from('ricette').insert({
    prodotto_finito_id: prodottoInModifica.id,
    versione: 1,
    resa_quantita: resaQuantita,
    resa_unita_misura_id: resaUnitaId,
  });

  if (error) {
    alert('Errore: ' + error.message);
    return;
  }

  await renderRicetta();
}

async function creaNuovaVersione(vecchiaRicetta, vecchiIngredienti) {
  if (!confirm('Creare una nuova versione della ricetta? La versione precedente resterà collegata ai lotti già prodotti.')) return;

  const { error: errChiusura } = await supabaseClient
    .from('ricette')
    .update({ valido_a: new Date().toISOString().slice(0, 10) })
    .eq('id', vecchiaRicetta.id);

  if (errChiusura) {
    alert('Errore: ' + errChiusura.message);
    return;
  }

  const { data: nuovaRicetta, error: errCreazione } = await supabaseClient
    .from('ricette')
    .insert({
      prodotto_finito_id: prodottoInModifica.id,
      versione: vecchiaRicetta.versione + 1,
      resa_quantita: vecchiaRicetta.resa_quantita,
      resa_unita_misura_id: vecchiaRicetta.resa_unita_misura_id,
    })
    .select('id')
    .single();

  if (errCreazione) {
    alert('Errore: ' + errCreazione.message);
    return;
  }

  if (vecchiIngredienti.length > 0) {
    const righe = vecchiIngredienti.map(ing => ({
      ricetta_id: nuovaRicetta.id,
      materia_prima_id: ing.materia_prima_id,
      quantita: ing.quantita,
      unita_misura_id: ing.unita_misura_id,
    }));
    await supabaseClient.from('ricette_ingredienti').insert(righe);
  }

  await renderRicetta();
}

document.getElementById('chiudi-ricetta-btn').addEventListener('click', () => {
  ricettaPanel.hidden = true;
  prodottoInModifica = null;
});

mostraDisattivatiCheck.addEventListener('change', caricaProdotti);

init();
