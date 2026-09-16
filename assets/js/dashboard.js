const welcomeName = document.getElementById('welcome-name');
const roleBadge = document.getElementById('role-badge');
const statusMessage = document.getElementById('status-message');
const logoutBtn = document.getElementById('logout-btn');

const RUOLI_LABEL = {
  direttore: 'Direttore',
  responsabile_produzione: 'Responsabile Produzione',
  responsabile_confezionamento: 'Responsabile Confezionamento',
};

async function loadUser() {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (!session) {
    window.location.href = 'index.html';
    return;
  }

  const { data: utente, error } = await supabaseClient
    .from('utenti')
    .select('nome, ruolo')
    .eq('id', session.user.id)
    .single();

  if (error || !utente) {
    statusMessage.textContent = 'Accesso effettuato, ma nessun profilo trovato nella tabella "utenti" per questo account.';
    welcomeName.textContent = session.user.email;
    return;
  }

  welcomeName.textContent = `Ciao, ${utente.nome}`;
  roleBadge.textContent = RUOLI_LABEL[utente.ruolo] || utente.ruolo;
}

loadUser();

logoutBtn.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});
