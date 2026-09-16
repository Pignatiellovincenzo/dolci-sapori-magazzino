let utenteCorrente = null;
let unitaMisura = [];
let allergeni = [];
let fornitori = [];

const form = document.getElementById('materia-form');
const idInput = document.getElementById('materia-id');
const nomeInput = document.getElementById('nome');
const fornitoreSelect = document.getElementById('fornitore-select');
const unita1Select = document.getElementById('unita1-select');
const unita2Select = document.getElementById('unita2-select');
const fattoreRow = document.getElementById('fattore-row');
const fattoreLabel = document.getElementById('fattore-label');
const fattoreInput = document.getElementById('fattore-input');
const unitaAcquistoSelect = document.getElementById('unita-acquisto-select');
const unitaMagazzinoSelect = document.getElementById('unita-magazzino-select');
const giorniPreavvisoInput = document.getElementById('giorni-preavviso');
const scortaMinimaInput = document.getElementById('scorta-minima');
const noteInput = document.getElementById('note');
const allergeniGrid = document.getElementById('allergeni-grid');
const errorMessage = document.getElementById('error-message');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-btn');
const tbody = document.getElementById('materie-tbody');
const emptyState = document.getElementById('empty-state');
const mostraDisattivatiCheck = document.getElementById('mostra-disattivati-check');

async function init() {
  utenteCorrente = await requireAuth(['direttore', 'responsabile_produzione']);
  if (!utenteCorrente) return;

  initShell(utenteCorrente);

  const soloLettura = utenteCorrente.ruolo !== 'direttore';
  if (soloLettura) {
    document.querySelector('#materia-form').closest('.panel').hidden = true;
  }

  await caricaUnitaMisura();
  await caricaAllergeni();
  await caricaFornitori();
  aggiornaSelectAcquistoMagazzino();
  await caricaMaterie();
}

async function caricaFornitori() {
  const { data, error } = await supabaseClient.from('fornitori').select('id, nome, attivo').order('nome');
  if (error) {
    errorMessage.textContent = 'Errore caricamento fornitori: ' + error.message;
    return;
  }
  fornitori = data;
  fornitoreSelect.innerHTML = '<option value="">— nessuno —</option>' +
    data.filter(f => f.attivo).map(f => `<option value="${f.id}">${f.nome}</option>`).join('');
}

function nomeFornitore(id) {
  const f = fornitori.find(x => x.id === id);
  return f ? f.nome : '—';
}

async function caricaUnitaMisura() {
  const { data, error } = await supabaseClient.from('unita_misura').select('id, codice, nome').order('nome');
  if (error) {
    errorMessage.textContent = 'Errore caricamento unità di misura: ' + error.message;
    return;
  }
  unitaMisura = data;
  const opzioni = data.map(u => `<option value="${u.id}">${u.nome} (${u.codice})</option>`).join('');
  unita1Select.innerHTML = opzioni;
  unita2Select.innerHTML = '<option value="">— nessuna —</option>' + opzioni;
}

async function caricaAllergeni() {
  const { data, error } = await supabaseClient.from('allergeni').select('id, nome').order('nome');
  if (error) {
    errorMessage.textContent = 'Errore caricamento allergeni: ' + error.message;
    return;
  }
  allergeni = data;
  allergeniGrid.innerHTML = data.map(a => `
    <label>
      <input type="checkbox" value="${a.id}" class="allergene-check">
      ${a.nome}
    </label>
  `).join('');
}

function nomeUnita(id) {
  const u = unitaMisura.find(x => x.id === id);
  return u ? `${u.nome} (${u.codice})` : '—';
}

// Le selezioni "acquisto" e "magazzino" possono essere solo UM1 o UM2 (se
// presente): le ricostruisco ogni volta che una delle due unità cambia.
function aggiornaSelectAcquistoMagazzino() {
  const um1 = Number(unita1Select.value) || null;
  const um2 = unita2Select.value ? Number(unita2Select.value) : null;
  const opzioni = [um1, um2].filter(Boolean);

  const acquistoPrec = unitaAcquistoSelect.value;
  const magazzinoPrec = unitaMagazzinoSelect.value;

  const html = opzioni.map(id => `<option value="${id}">${nomeUnita(id)}</option>`).join('');
  unitaAcquistoSelect.innerHTML = html;
  unitaMagazzinoSelect.innerHTML = html;

  if (opzioni.includes(Number(acquistoPrec))) unitaAcquistoSelect.value = acquistoPrec;
  if (opzioni.includes(Number(magazzinoPrec))) unitaMagazzinoSelect.value = magazzinoPrec;

  fattoreRow.hidden = !um2;
  if (um2 && um1) {
    fattoreLabel.textContent = `Conversione: 1 ${nomeUnita(um1)} = quanti/e ${nomeUnita(um2)}`;
  }
  if (!um2) {
    fattoreInput.value = '';
  }
}

unita1Select.addEventListener('change', aggiornaSelectAcquistoMagazzino);
unita2Select.addEventListener('change', aggiornaSelectAcquistoMagazzino);

function descrizioneUnita(materia) {
  if (materia.unita_misura_2_id) {
    return `${nomeUnita(materia.unita_misura_1_id)} = ${materia.fattore_conversione} ${nomeUnita(materia.unita_misura_2_id)}`;
  }
  return nomeUnita(materia.unita_misura_1_id);
}

async function caricaMaterie() {
  let query = supabaseClient
    .from('materie_prime')
    .select('id, nome, unita_misura_1_id, unita_misura_2_id, fattore_conversione, unita_acquisto_id, unita_magazzino_id, fornitore_id, giorni_preavviso_scadenza, scorta_minima, note, attivo, materie_prime_allergeni(allergene_id, allergeni(nome))')
    .order('nome');
  if (!mostraDisattivatiCheck.checked) {
    query = query.eq('attivo', true);
  }
  const { data, error } = await query;

  if (error) {
    errorMessage.textContent = 'Errore nel caricamento materie prime: ' + error.message;
    return;
  }

  tbody.innerHTML = '';
  emptyState.hidden = data.length > 0;

  for (const materia of data) {
    const tr = document.createElement('tr');
    if (!materia.attivo) tr.style.opacity = '0.55';

    const tdNome = document.createElement('td');
    tdNome.textContent = materia.nome;
    tr.appendChild(tdNome);

    const tdUnita = document.createElement('td');
    tdUnita.textContent = descrizioneUnita(materia);
    tr.appendChild(tdUnita);

    const tdFornitore = document.createElement('td');
    tdFornitore.textContent = materia.fornitore_id ? nomeFornitore(materia.fornitore_id) : '—';
    tr.appendChild(tdFornitore);

    const tdScorta = document.createElement('td');
    tdScorta.textContent = `${materia.scorta_minima} ${nomeUnita(materia.unita_magazzino_id)}`;
    tr.appendChild(tdScorta);

    const tdAllergeni = document.createElement('td');
    const nomiAllergeni = (materia.materie_prime_allergeni || []).map(a => a.allergeni.nome);
    tdAllergeni.textContent = nomiAllergeni.length ? nomiAllergeni.join(', ') : '—';
    tr.appendChild(tdAllergeni);

    const tdStato = document.createElement('td');
    tdStato.textContent = materia.attivo ? 'Attiva' : 'Disattivata';
    tr.appendChild(tdStato);

    const tdActions = document.createElement('td');
    tdActions.className = 'actions';

    if (utenteCorrente.ruolo === 'direttore') {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn-secondary';
      editBtn.textContent = 'Modifica';
      editBtn.addEventListener('click', () => avviaModifica(materia));
      tdActions.appendChild(editBtn);

      if (materia.attivo) {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn-danger';
        deleteBtn.textContent = 'Elimina';
        deleteBtn.addEventListener('click', () => eliminaMateria(materia));
        tdActions.appendChild(deleteBtn);
      } else {
        const riattivaBtn = document.createElement('button');
        riattivaBtn.type = 'button';
        riattivaBtn.className = 'btn-secondary';
        riattivaBtn.textContent = 'Riattiva';
        riattivaBtn.addEventListener('click', () => impostaAttiva(materia, true));
        tdActions.appendChild(riattivaBtn);
      }
    }

    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  }
}

function avviaModifica(materia) {
  idInput.value = materia.id;
  nomeInput.value = materia.nome;
  fornitoreSelect.value = materia.fornitore_id || '';
  unita1Select.value = materia.unita_misura_1_id;
  unita2Select.value = materia.unita_misura_2_id || '';
  aggiornaSelectAcquistoMagazzino();
  unitaAcquistoSelect.value = materia.unita_acquisto_id;
  unitaMagazzinoSelect.value = materia.unita_magazzino_id;
  fattoreInput.value = materia.fattore_conversione || '';
  giorniPreavvisoInput.value = materia.giorni_preavviso_scadenza;
  scortaMinimaInput.value = materia.scorta_minima;
  noteInput.value = materia.note || '';

  const idAllergeniAttivi = new Set((materia.materie_prime_allergeni || []).map(a => a.allergene_id));
  document.querySelectorAll('.allergene-check').forEach(chk => {
    chk.checked = idAllergeniAttivi.has(Number(chk.value));
  });

  formTitle.textContent = 'Modifica materia prima';
  submitBtn.textContent = 'Salva modifiche';
  cancelBtn.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function annullaModifica() {
  form.reset();
  idInput.value = '';
  document.querySelectorAll('.allergene-check').forEach(chk => { chk.checked = false; });
  aggiornaSelectAcquistoMagazzino();
  formTitle.textContent = 'Nuova materia prima';
  submitBtn.textContent = 'Salva';
  cancelBtn.hidden = true;
  errorMessage.textContent = '';
}

async function eliminaMateria(materia) {
  if (!confirm(`Eliminare la materia prima "${materia.nome}"?`)) return;

  const { error } = await supabaseClient.from('materie_prime').delete().eq('id', materia.id);

  if (error) {
    if (error.code === '23503') {
      if (confirm(`Non puoi eliminare "${materia.nome}" perché è già collegata ad altri dati (lotti, ricette...). Vuoi disattivarla invece? Non comparirà più tra le scelte disponibili, ma la sua storia resterà intatta.`)) {
        await impostaAttiva(materia, false);
      }
      return;
    }
    alert('Errore durante l\'eliminazione: ' + error.message);
    return;
  }

  await caricaMaterie();
}

async function impostaAttiva(materia, attivo) {
  const { error } = await supabaseClient.from('materie_prime').update({ attivo }).eq('id', materia.id);
  if (error) {
    alert('Errore: ' + error.message);
    return;
  }
  await caricaMaterie();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorMessage.textContent = '';
  submitBtn.disabled = true;

  const um2 = unita2Select.value ? Number(unita2Select.value) : null;
  const fattore = um2 ? Number(fattoreInput.value) : null;

  if (um2 && (!fattore || fattore <= 0)) {
    errorMessage.textContent = 'Inserisci un fattore di conversione maggiore di zero.';
    submitBtn.disabled = false;
    return;
  }

  const valori = {
    nome: nomeInput.value.trim(),
    fornitore_id: fornitoreSelect.value ? Number(fornitoreSelect.value) : null,
    unita_misura_1_id: Number(unita1Select.value),
    unita_misura_2_id: um2,
    fattore_conversione: fattore,
    unita_acquisto_id: Number(unitaAcquistoSelect.value),
    unita_magazzino_id: Number(unitaMagazzinoSelect.value),
    giorni_preavviso_scadenza: Number(giorniPreavvisoInput.value) || 0,
    scorta_minima: Number(scortaMinimaInput.value) || 0,
    note: noteInput.value.trim() || null,
  };

  const idAllergeniSelezionati = [...document.querySelectorAll('.allergene-check:checked')].map(chk => Number(chk.value));

  let materiaId = idInput.value ? Number(idInput.value) : null;

  if (materiaId) {
    const { error } = await supabaseClient.from('materie_prime').update(valori).eq('id', materiaId);
    if (error) {
      errorMessage.textContent = 'Errore: ' + error.message;
      submitBtn.disabled = false;
      return;
    }
    await supabaseClient.from('materie_prime_allergeni').delete().eq('materia_prima_id', materiaId);
  } else {
    const { data, error } = await supabaseClient.from('materie_prime').insert(valori).select('id').single();
    if (error) {
      errorMessage.textContent = 'Errore: ' + error.message;
      submitBtn.disabled = false;
      return;
    }
    materiaId = data.id;
  }

  if (idAllergeniSelezionati.length > 0) {
    const righe = idAllergeniSelezionati.map(allergeneId => ({ materia_prima_id: materiaId, allergene_id: allergeneId }));
    const { error: errAllergeni } = await supabaseClient.from('materie_prime_allergeni').insert(righe);
    if (errAllergeni) {
      errorMessage.textContent = 'Materia prima salvata, ma errore negli allergeni: ' + errAllergeni.message;
      submitBtn.disabled = false;
      await caricaMaterie();
      return;
    }
  }

  submitBtn.disabled = false;
  annullaModifica();
  await caricaMaterie();
});

cancelBtn.addEventListener('click', annullaModifica);
mostraDisattivatiCheck.addEventListener('change', caricaMaterie);

init();
