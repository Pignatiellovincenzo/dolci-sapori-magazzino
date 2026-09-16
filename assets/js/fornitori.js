let utenteCorrente = null;

const form = document.getElementById('fornitore-form');
const idInput = document.getElementById('fornitore-id');
const nomeInput = document.getElementById('nome');
const telefonoInput = document.getElementById('telefono');
const emailInput = document.getElementById('email');
const noteInput = document.getElementById('note');
const errorMessage = document.getElementById('error-message');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-btn');
const tbody = document.getElementById('fornitori-tbody');
const emptyState = document.getElementById('empty-state');
const logoutBtn = document.getElementById('logout-btn');

async function init() {
  utenteCorrente = await requireAuth(['direttore', 'responsabile_produzione']);
  if (!utenteCorrente) return;
  await caricaFornitori();
}

async function caricaFornitori() {
  const { data, error } = await supabaseClient
    .from('fornitori')
    .select('id, nome, telefono, email, note')
    .order('nome');

  if (error) {
    errorMessage.textContent = 'Errore nel caricamento fornitori: ' + error.message;
    return;
  }

  tbody.innerHTML = '';
  emptyState.hidden = data.length > 0;

  for (const fornitore of data) {
    const tr = document.createElement('tr');

    const tdNome = document.createElement('td');
    tdNome.textContent = fornitore.nome;
    tr.appendChild(tdNome);

    const tdTelefono = document.createElement('td');
    tdTelefono.textContent = fornitore.telefono || '—';
    tr.appendChild(tdTelefono);

    const tdEmail = document.createElement('td');
    tdEmail.textContent = fornitore.email || '—';
    tr.appendChild(tdEmail);

    const tdNote = document.createElement('td');
    tdNote.textContent = fornitore.note || '—';
    tr.appendChild(tdNote);

    const tdActions = document.createElement('td');
    tdActions.className = 'actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn-secondary';
    editBtn.textContent = 'Modifica';
    editBtn.addEventListener('click', () => avviaModifica(fornitore));
    tdActions.appendChild(editBtn);

    if (utenteCorrente.ruolo === 'direttore') {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn-danger';
      deleteBtn.textContent = 'Elimina';
      deleteBtn.addEventListener('click', () => eliminaFornitore(fornitore));
      tdActions.appendChild(deleteBtn);
    }

    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  }
}

function avviaModifica(fornitore) {
  idInput.value = fornitore.id;
  nomeInput.value = fornitore.nome;
  telefonoInput.value = fornitore.telefono || '';
  emailInput.value = fornitore.email || '';
  noteInput.value = fornitore.note || '';
  formTitle.textContent = 'Modifica fornitore';
  submitBtn.textContent = 'Salva modifiche';
  cancelBtn.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function annullaModifica() {
  form.reset();
  idInput.value = '';
  formTitle.textContent = 'Nuovo fornitore';
  submitBtn.textContent = 'Salva';
  cancelBtn.hidden = true;
  errorMessage.textContent = '';
}

async function eliminaFornitore(fornitore) {
  if (!confirm(`Eliminare il fornitore "${fornitore.nome}"?`)) return;

  const { error } = await supabaseClient.from('fornitori').delete().eq('id', fornitore.id);

  if (error) {
    alert('Errore durante l\'eliminazione: ' + error.message);
    return;
  }

  await caricaFornitori();
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
    result = await supabaseClient.from('fornitori').update(valori).eq('id', idInput.value);
  } else {
    result = await supabaseClient.from('fornitori').insert(valori);
  }

  submitBtn.disabled = false;

  if (result.error) {
    errorMessage.textContent = 'Errore: ' + result.error.message;
    return;
  }

  annullaModifica();
  await caricaFornitori();
});

cancelBtn.addEventListener('click', annullaModifica);

logoutBtn.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});

init();
