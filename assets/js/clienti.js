let utenteCorrente = null;

const form = document.getElementById('cliente-form');
const idInput = document.getElementById('cliente-id');
const nomeInput = document.getElementById('nome');
const telefonoInput = document.getElementById('telefono');
const emailInput = document.getElementById('email');
const noteInput = document.getElementById('note');
const errorMessage = document.getElementById('error-message');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-btn');
const tbody = document.getElementById('clienti-tbody');
const emptyState = document.getElementById('empty-state');
const mostraDisattivatiCheck = document.getElementById('mostra-disattivati-check');

async function init() {
  utenteCorrente = await requireAuth(['direttore']);
  if (!utenteCorrente) return;
  initShell(utenteCorrente);
  await caricaClienti();
}

async function caricaClienti() {
  let query = supabaseClient.from('clienti').select('id, nome, telefono, email, note, attivo').order('nome');
  if (!mostraDisattivatiCheck.checked) {
    query = query.eq('attivo', true);
  }
  const { data, error } = await query;

  if (error) {
    errorMessage.textContent = 'Errore nel caricamento clienti: ' + error.message;
    return;
  }

  tbody.innerHTML = '';
  emptyState.hidden = data.length > 0;

  for (const cliente of data) {
    const tr = document.createElement('tr');
    if (!cliente.attivo) tr.style.opacity = '0.55';

    const tdNome = document.createElement('td');
    tdNome.textContent = cliente.nome;
    tr.appendChild(tdNome);

    const tdTelefono = document.createElement('td');
    tdTelefono.textContent = cliente.telefono || '—';
    tr.appendChild(tdTelefono);

    const tdEmail = document.createElement('td');
    tdEmail.textContent = cliente.email || '—';
    tr.appendChild(tdEmail);

    const tdNote = document.createElement('td');
    tdNote.textContent = cliente.note || '—';
    tr.appendChild(tdNote);

    const tdStato = document.createElement('td');
    tdStato.textContent = cliente.attivo ? 'Attivo' : 'Disattivato';
    tr.appendChild(tdStato);

    const tdActions = document.createElement('td');
    tdActions.className = 'actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn-secondary';
    editBtn.textContent = 'Modifica';
    editBtn.addEventListener('click', () => avviaModifica(cliente));
    tdActions.appendChild(editBtn);

    if (cliente.attivo) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn-danger';
      deleteBtn.textContent = 'Elimina';
      deleteBtn.addEventListener('click', () => eliminaCliente(cliente));
      tdActions.appendChild(deleteBtn);
    } else {
      const riattivaBtn = document.createElement('button');
      riattivaBtn.type = 'button';
      riattivaBtn.className = 'btn-secondary';
      riattivaBtn.textContent = 'Riattiva';
      riattivaBtn.addEventListener('click', () => impostaAttivo(cliente, true));
      tdActions.appendChild(riattivaBtn);
    }

    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  }
}

function avviaModifica(cliente) {
  idInput.value = cliente.id;
  nomeInput.value = cliente.nome;
  telefonoInput.value = cliente.telefono || '';
  emailInput.value = cliente.email || '';
  noteInput.value = cliente.note || '';
  formTitle.textContent = 'Modifica cliente';
  submitBtn.textContent = 'Salva modifiche';
  cancelBtn.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function annullaModifica() {
  form.reset();
  idInput.value = '';
  formTitle.textContent = 'Nuovo cliente';
  submitBtn.textContent = 'Salva';
  cancelBtn.hidden = true;
  errorMessage.textContent = '';
}

async function eliminaCliente(cliente) {
  if (!confirm(`Eliminare il cliente "${cliente.nome}"?`)) return;

  const { error } = await supabaseClient.from('clienti').delete().eq('id', cliente.id);

  if (error) {
    if (error.code === '23503') {
      if (confirm(`Non puoi eliminare "${cliente.nome}" perché è già collegato ad altri dati (ordini di vendita...). Vuoi disattivarlo invece? Non comparirà più tra le scelte disponibili, ma la sua storia resterà intatta.`)) {
        await impostaAttivo(cliente, false);
      }
      return;
    }
    alert('Errore durante l\'eliminazione: ' + error.message);
    return;
  }

  await caricaClienti();
}

async function impostaAttivo(cliente, attivo) {
  const { error } = await supabaseClient.from('clienti').update({ attivo }).eq('id', cliente.id);
  if (error) {
    alert('Errore: ' + error.message);
    return;
  }
  await caricaClienti();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorMessage.textContent = '';
  submitBtn.disabled = true;

  const valori = {
    nome: nomeInput.value.trim(),
    telefono: telefonoInput.value.trim() || null,
    email: emailInput.value.trim() || null,
    note: noteInput.value.trim() || null,
  };

  let result;
  if (idInput.value) {
    result = await supabaseClient.from('clienti').update(valori).eq('id', idInput.value);
  } else {
    result = await supabaseClient.from('clienti').insert(valori);
  }

  submitBtn.disabled = false;

  if (result.error) {
    errorMessage.textContent = 'Errore: ' + result.error.message;
    return;
  }

  annullaModifica();
  await caricaClienti();
});

cancelBtn.addEventListener('click', annullaModifica);
mostraDisattivatiCheck.addEventListener('change', caricaClienti);

init();
