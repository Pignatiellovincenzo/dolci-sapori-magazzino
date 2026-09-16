let utenteCorrente = null;
let unitaMisura = [];
let allergeni = [];
let materiaInModifica = null; // per il pannello conversioni

const form = document.getElementById('materia-form');
const idInput = document.getElementById('materia-id');
const nomeInput = document.getElementById('nome');
const unitaBaseSelect = document.getElementById('unita-base');
const giorniPreavvisoInput = document.getElementById('giorni-preavviso');
const noteInput = document.getElementById('note');
const allergeniGrid = document.getElementById('allergeni-grid');
const errorMessage = document.getElementById('error-message');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-btn');
const tbody = document.getElementById('materie-tbody');
const emptyState = document.getElementById('empty-state');
const logoutBtn = document.getElementById('logout-btn');

const conversioniPanel = document.getElementById('conversioni-panel');
const conversioniTitle = document.getElementById('conversioni-title');
const conversioniTbody = document.getElementById('conversioni-tbody');
const conversioneUnitaSelect = document.getElementById('conversione-unita');
const conversioneFattoreInput = document.getElementById('conversione-fattore');

async function init() {
  utenteCorrente = await requireAuth(['direttore', 'responsabile_produzione']);
  if (!utenteCorrente) return;

  const soloLettura = utenteCorrente.ruolo !== 'direttore';
  if (soloLettura) {
    document.querySelector('#materia-form').closest('.panel').hidden = true;
  }

  await caricaUnitaMisura();
  await caricaAllergeni();
  await caricaMaterie();
}

async function caricaUnitaMisura() {
  const { data, error } = await supabaseClient.from('unita_misura').select('id, codice, nome').order('nome');
  if (error) {
    errorMessage.textContent = 'Errore caricamento unità di misura: ' + error.message;
    return;
  }
  unitaMisura = data;
  unitaBaseSelect.innerHTML = data.map(u => `<option value="${u.id}">${u.nome} (${u.codice})</option>`).join('');
  conversioneUnitaSelect.innerHTML = data.map(u => `<option value="${u.id}">${u.nome} (${u.codice})</option>`).join('');
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

async function caricaMaterie() {
  const { data, error } = await supabaseClient
    .from('materie_prime')
    .select('id, nome, unita_misura_base_id, giorni_preavviso_scadenza, note, materie_prime_allergeni(allergene_id, allergeni(nome))')
    .order('nome');

  if (error) {
    errorMessage.textContent = 'Errore nel caricamento materie prime: ' + error.message;
    return;
  }

  tbody.innerHTML = '';
  emptyState.hidden = data.length > 0;

  for (const materia of data) {
    const tr = document.createElement('tr');

    const tdNome = document.createElement('td');
    tdNome.textContent = materia.nome;
    tr.appendChild(tdNome);

    const tdUnita = document.createElement('td');
    tdUnita.textContent = nomeUnita(materia.unita_misura_base_id);
    tr.appendChild(tdUnita);

    const tdPreavviso = document.createElement('td');
    tdPreavviso.textContent = materia.giorni_preavviso_scadenza;
    tr.appendChild(tdPreavviso);

    const tdAllergeni = document.createElement('td');
    const nomiAllergeni = (materia.materie_prime_allergeni || []).map(a => a.allergeni.nome);
    tdAllergeni.textContent = nomiAllergeni.length ? nomiAllergeni.join(', ') : '—';
    tr.appendChild(tdAllergeni);

    const tdActions = document.createElement('td');
    tdActions.className = 'actions';

    const convBtn = document.createElement('button');
    convBtn.type = 'button';
    convBtn.className = 'btn-secondary';
    convBtn.textContent = 'Conversioni';
    convBtn.addEventListener('click', () => apriConversioni(materia));
    tdActions.appendChild(convBtn);

    if (utenteCorrente.ruolo === 'direttore') {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn-secondary';
      editBtn.textContent = 'Modifica';
      editBtn.addEventListener('click', () => avviaModifica(materia));
      tdActions.appendChild(editBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn-danger';
      deleteBtn.textContent = 'Elimina';
      deleteBtn.addEventListener('click', () => eliminaMateria(materia));
      tdActions.appendChild(deleteBtn);
    }

    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  }
}

function avviaModifica(materia) {
  idInput.value = materia.id;
  nomeInput.value = materia.nome;
  unitaBaseSelect.value = materia.unita_misura_base_id;
  giorniPreavvisoInput.value = materia.giorni_preavviso_scadenza;
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
  formTitle.textContent = 'Nuova materia prima';
  submitBtn.textContent = 'Salva';
  cancelBtn.hidden = true;
  errorMessage.textContent = '';
}

async function eliminaMateria(materia) {
  if (!confirm(`Eliminare la materia prima "${materia.nome}"?`)) return;

  const { error } = await supabaseClient.from('materie_prime').delete().eq('id', materia.id);

  if (error) {
    alert('Errore durante l\'eliminazione: ' + error.message);
    return;
  }

  await caricaMaterie();
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

// ---- Conversioni unità di misura ----

async function apriConversioni(materia) {
  materiaInModifica = materia;
  conversioniTitle.textContent = `Conversioni — ${materia.nome}`;
  conversioniPanel.hidden = false;
  await caricaConversioni();
  conversioniPanel.scrollIntoView({ behavior: 'smooth' });
}

async function caricaConversioni() {
  const { data, error } = await supabaseClient
    .from('materie_prime_conversioni')
    .select('id, unita_misura_id, fattore_conversione')
    .eq('materia_prima_id', materiaInModifica.id)
    .order('id');

  if (error) {
    errorMessage.textContent = 'Errore caricamento conversioni: ' + error.message;
    return;
  }

  conversioniTbody.innerHTML = '';
  for (const conv of data) {
    const tr = document.createElement('tr');

    const tdUnita = document.createElement('td');
    tdUnita.textContent = nomeUnita(conv.unita_misura_id);
    tr.appendChild(tdUnita);

    const tdFattore = document.createElement('td');
    tdFattore.textContent = `${conv.fattore_conversione} ${nomeUnita(materiaInModifica.unita_misura_base_id)}`;
    tr.appendChild(tdFattore);

    const tdActions = document.createElement('td');
    tdActions.className = 'actions';
    if (utenteCorrente.ruolo === 'direttore') {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn-danger';
      delBtn.textContent = 'Elimina';
      delBtn.addEventListener('click', async () => {
        await supabaseClient.from('materie_prime_conversioni').delete().eq('id', conv.id);
        await caricaConversioni();
      });
      tdActions.appendChild(delBtn);
    }
    tr.appendChild(tdActions);

    conversioniTbody.appendChild(tr);
  }
}

document.getElementById('aggiungi-conversione-btn').addEventListener('click', async () => {
  const fattore = Number(conversioneFattoreInput.value);
  if (!fattore || fattore <= 0) {
    alert('Inserisci un fattore di conversione maggiore di zero.');
    return;
  }

  const { error } = await supabaseClient.from('materie_prime_conversioni').insert({
    materia_prima_id: materiaInModifica.id,
    unita_misura_id: Number(conversioneUnitaSelect.value),
    fattore_conversione: fattore,
  });

  if (error) {
    alert('Errore: ' + error.message);
    return;
  }

  conversioneFattoreInput.value = '';
  await caricaConversioni();
});

document.getElementById('chiudi-conversioni-btn').addEventListener('click', () => {
  conversioniPanel.hidden = true;
  materiaInModifica = null;
});

logoutBtn.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});

init();
