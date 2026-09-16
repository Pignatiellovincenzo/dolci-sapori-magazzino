const welcomeName = document.getElementById('welcome-name');
const roleBadge = document.getElementById('role-badge');
const statusMessage = document.getElementById('status-message');
const logoutBtn = document.getElementById('logout-btn');

const RUOLI_LABEL = {
  direttore: 'Direttore',
  responsabile_produzione: 'Responsabile Produzione',
  responsabile_confezionamento: 'Responsabile Confezionamento',
};

const VOCI_MENU = [
  { href: 'fornitori.html', label: 'Fornitori', ruoli: ['direttore', 'responsabile_produzione'] },
  { href: 'materie-prime.html', label: 'Materie Prime', ruoli: ['direttore', 'responsabile_produzione'] },
];

function renderMenu(ruolo) {
  const menu = document.getElementById('menu');
  for (const voce of VOCI_MENU) {
    if (!voce.ruoli.includes(ruolo)) continue;
    const link = document.createElement('a');
    link.href = voce.href;
    link.textContent = voce.label;
    menu.appendChild(link);
  }
}

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
  renderMenu(utente.ruolo);
}

loadUser();

logoutBtn.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});
