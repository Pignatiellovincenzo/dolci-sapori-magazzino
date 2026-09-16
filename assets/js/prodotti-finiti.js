let utenteCorrente = null;
let unitaMisura = [];
let materiePrime = [];
let allergeniPerMateria = {}; // materia_prima_id -> [nomi allergeni]
let ingredientiRighe = []; // {materiaPrimaId, unitaMisuraId, quantita}

const form = document.getElementById('prodotto-form');
const idInput = document.getElementById('prodotto-id');
const codiceInput = document.getElementById('codice');
const nomeInput = document.getElementById('nome');
const unitaBaseSelect = document.getElementById('unita-base');
const giorniPreavvisoInput = document.getElementById('giorni-preavviso');
const resaQuantitaInput = document.getElementById('resa-quantita');
const resaUnitaSelect = document.getElementById('resa-unita');
const noteInput = document.getElementById('note');
const errorMessage = document.getElementById('error-message');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-btn');
const tbody = document.getElementById('prodotti-tbody');
const emptyState = document.getElementById('empty-state');
const mostraDisattivatiCheck = document.getElementById('mostra-disattivati-check');

const ingredientiTbody = document.getElementById('ingredienti-tbody');
const ingredienteMateriaSelect = document.getElementById('ingrediente-materia');
const ingredienteUnitaSelect = document.getElementById('ingrediente-unita');
const ingredienteQuantitaInput = document.getElementById('ingrediente-quantita');
const allergeniAnteprima = document.getElementById('allergeni-anteprima');

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
  await caricaAllergeniPerMateria();
  await caricaProdotti();
}

async function caricaUnitaMisura() {
  const { data, error } = await supabaseClient.from('unita_misura').select('id, codice, nome').order('nome');
  if (error) { errorMessage.textContent = 'Errore unità di misura: ' + error.message; return; }
  unitaMisura = data;
  const opzioni = data.map(u => `<option value="${u.id}">${u.nome} (${u.codice})</option>`).join('');
  unitaBaseSelect.innerHTML = opzioni;
  resaUnitaSelect.innerHTML = opzioni;
  ingredienteUnitaSelect.innerHTML = opzioni;
}

async function caricaMateriePrime() {
  const { data, error } = await supabaseClient.from('materie_prime').select('id, nome, attivo').order('nome');
  if (error) { errorMessage.textContent = 'Errore materie prime: ' + error.message; return; }
  materiePrime = data;
  ingredienteMateriaSelect.innerHTML = data.filter(m => m.attivo).map(m => `<option value="${m.id}">${m.nome}</option>`).join('');
}

async function caricaAllergeniPerMateria() {
  const { data, error } = await supabaseClient
    .from('materie_prime_allergeni')
    .select('materia_prima_id, allergeni(nome)');
  if (error) { errorMessage.textContent = 'Errore allergeni: ' + error.message; return; }
  allergeniPerMateria = {};
  for (const riga of data) {
    if (!allergeniPerMateria[riga.materia_prima_id]) allergeniPerMateria[riga.materia_prima_id] = [];
    allergeniPerMateria[riga.materia_prima_id].push(riga.allergeni.nome);
  }
}

function nomeUnita(id) {
  const u = unitaMisura.find(x => x.id === id);
  return u ? `${u.nome} (${u.codice})` : '—';
}

function nomeMateriaPrima(id) {
  const m = materiePrime.find(x => x.id === id);
  return m ? m.nome : '—';
}

// ---- Ingredienti nel form ----

function renderIngredienti() {
  ingredientiTbody.innerHTML = '';
  ingredientiRighe.forEach((riga, indice) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${nomeMateriaPrima(riga.materiaPrimaId)}</td>
      <td>${riga.quantita}</td>
      <td>${nomeUnita(riga.unitaMisuraId)}</td>
    `;
    const tdActions = document.createElement('td');
    tdActions.className = 'actions';
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn-danger';
    delBtn.textContent = 'Rimuovi';
    delBtn.addEventListener('click', () => {
      ingredientiRighe.splice(indice, 1);
      renderIngredienti();
    });
    tdActions.appendChild(delBtn);
    tr.appendChild(tdActions);
    ingredientiTbody.appendChild(tr);
  });

  const nomiAllergeni = new Set();
  ingredientiRighe.forEach(riga => {
    (allergeniPerMateria[riga.materiaPrimaId] || []).forEach(nome => nomiAllergeni.add(nome));
  });
  allergeniAnteprima.textContent = `Allergeni (calcolati dagli ingredienti): ${nomiAllergeni.size ? [...nomiAllergeni].join(', ') : 'nessuno'}`;
}

document.getElementById('aggiungi-ingrediente-btn').addEventListener('click', () => {
  const materiaPrimaId = Number(ingredienteMateriaSelect.value);
  const quantita = Number(ingredienteQuantitaInput.value);

  if (!materiaPrimaId) {
    alert('Seleziona una materia prima.');
    return;
  }
  if (!quantita || quantita <= 0) {
    alert('Inserisci una quantità maggiore di zero.');
    return;
  }
  if (ingredientiRighe.some(r => r.materiaPrimaId === materiaPrimaId)) {
    alert('Questa materia prima è già negli ingredienti.');
    return;
  }

  ingredientiRighe.push({ materiaPrimaId, unitaMisuraId: Number(ingredienteUnitaSelect.value), quantita });
  renderIngredienti();
  ingredienteQuantitaInput.value = '';
});

// ---- Elenco prodotti ----

async function caricaProdotti() {
  let query = supabaseClient
    .from('prodotti_finiti')
    .select('id, codice, nome, unita_misura_base_id, giorni_preavviso_scadenza, resa_quantita, resa_unita_misura_id, note, attivo')
    .order('nome');
  if (!mostraDisattivatiCheck.checked) {
    query = query.eq('attivo', true);
  }
  const { data, error } = await query;

  if (error) {
    errorMessage.textContent = 'Errore nel caricamento prodotti finiti: ' + error.message;
    return;
  }

  const idProdotti = data.map(p => p.id);
  let allergeniPerProdotto = {};
  if (idProdotti.length > 0) {
    const { data: allergeniData } = await supabaseClient
      .from('v_prodotti_finiti_allergeni')
      .select('prodotto_finito_id, allergeni(nome)')
      .in('prodotto_finito_id', idProdotti);
    for (const riga of (allergeniData || [])) {
      if (!allergeniPerProdotto[riga.prodotto_finito_id]) allergeniPerProdotto[riga.prodotto_finito_id] = [];
      allergeniPerProdotto[riga.prodotto_finito_id].push(riga.allergeni.nome);
    }
  }

  tbody.innerHTML = '';
  emptyState.hidden = data.length > 0;

  for (const prodotto of data) {
    const tr = document.createElement('tr');
    if (!prodotto.attivo) tr.style.opacity = '0.55';

    tr.innerHTML = `
      <td>${prodotto.codice || '—'}</td>
      <td>${prodotto.nome}</td>
      <td>${nomeUnita(prodotto.unita_misura_base_id)}</td>
      <td>${(allergeniPerProdotto[prodotto.id] || []).join(', ') || '—'}</td>
      <td>${prodotto.attivo ? 'Attivo' : 'Disattivato'}</td>
    `;

    const tdActions = document.createElement('td');
    tdActions.className = 'actions';

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

async function avviaModifica(prodotto) {
  idInput.value = prodotto.id;
  codiceInput.value = prodotto.codice || '';
  nomeInput.value = prodotto.nome;
  unitaBaseSelect.value = prodotto.unita_misura_base_id;
  giorniPreavvisoInput.value = prodotto.giorni_preavviso_scadenza;
  resaQuantitaInput.value = prodotto.resa_quantita || '';
  if (prodotto.resa_unita_misura_id) resaUnitaSelect.value = prodotto.resa_unita_misura_id;
  noteInput.value = prodotto.note || '';

  const { data: ingredienti } = await supabaseClient
    .from('ricette_ingredienti')
    .select('materia_prima_id, quantita, unita_misura_id')
    .eq('prodotto_finito_id', prodotto.id);

  ingredientiRighe = (ingredienti || []).map(i => ({
    materiaPrimaId: i.materia_prima_id,
    unitaMisuraId: i.unita_misura_id,
    quantita: i.quantita,
  }));
  renderIngredienti();

  formTitle.textContent = 'Modifica prodotto';
  submitBtn.textContent = 'Salva modifiche';
  cancelBtn.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function annullaModifica() {
  form.reset();
  idInput.value = '';
  ingredientiRighe = [];
  renderIngredienti();
  formTitle.textContent = 'Nuovo prodotto';
  submitBtn.textContent = 'Salva';
  cancelBtn.hidden = true;
  errorMessage.textContent = '';
}

async function eliminaProdotto(prodotto) {
  if (!confirm(`Eliminare il prodotto "${prodotto.nome}"?`)) return;

  const { error } = await supabaseClient.from('prodotti_finiti').delete().eq('id', prodotto.id);

  if (error) {
    if (error.code === '23503') {
      if (confirm(`Non puoi eliminare "${prodotto.nome}" perché è già collegato ad altri dati (ordini, lotti...). Vuoi disattivarlo invece? Non comparirà più tra le scelte disponibili, ma la sua storia resterà intatta.`)) {
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

  const resaQuantita = resaQuantitaInput.value ? Number(resaQuantitaInput.value) : null;
  if ((resaQuantita && !resaUnitaSelect.value)) {
    errorMessage.textContent = 'Manca l\'unità della resa.';
    submitBtn.disabled = false;
    return;
  }

  const valori = {
    codice: codiceInput.value.trim() || null,
    nome: nomeInput.value.trim(),
    unita_misura_base_id: Number(unitaBaseSelect.value),
    giorni_preavviso_scadenza: Number(giorniPreavvisoInput.value) || 0,
    resa_quantita: resaQuantita,
    resa_unita_misura_id: resaQuantita ? Number(resaUnitaSelect.value) : null,
    note: noteInput.value.trim() || null,
  };

  let prodottoId = idInput.value ? Number(idInput.value) : null;

  if (prodottoId) {
    const { error } = await supabaseClient.from('prodotti_finiti').update(valori).eq('id', prodottoId);
    if (error) {
      errorMessage.textContent = 'Errore: ' + error.message;
      submitBtn.disabled = false;
      return;
    }
    await supabaseClient.from('ricette_ingredienti').delete().eq('prodotto_finito_id', prodottoId);
  } else {
    const { data, error } = await supabaseClient.from('prodotti_finiti').insert(valori).select('id').single();
    if (error) {
      errorMessage.textContent = 'Errore: ' + error.message;
      submitBtn.disabled = false;
      return;
    }
    prodottoId = data.id;
  }

  if (ingredientiRighe.length > 0) {
    const righe = ingredientiRighe.map(r => ({
      prodotto_finito_id: prodottoId,
      materia_prima_id: r.materiaPrimaId,
      quantita: r.quantita,
      unita_misura_id: r.unitaMisuraId,
    }));
    const { error: errIngredienti } = await supabaseClient.from('ricette_ingredienti').insert(righe);
    if (errIngredienti) {
      errorMessage.textContent = 'Prodotto salvato, ma errore negli ingredienti: ' + errIngredienti.message;
      submitBtn.disabled = false;
      await caricaProdotti();
      return;
    }
  }

  submitBtn.disabled = false;
  annullaModifica();
  await caricaProdotti();
});

cancelBtn.addEventListener('click', annullaModifica);
mostraDisattivatiCheck.addEventListener('change', caricaProdotti);

init();
