const welcomeName = document.getElementById('welcome-name');
const roleBadge = document.getElementById('role-badge');

const RUOLI_LABEL = {
  direttore: 'Direttore',
  responsabile_produzione: 'Responsabile Produzione',
  responsabile_confezionamento: 'Responsabile Confezionamento',
};

async function loadUser() {
  const utente = await requireAuth(); // nessuna restrizione di ruolo: la dashboard è per tutti
  if (!utente) return;

  welcomeName.textContent = `Ciao, ${utente.nome}`;
  roleBadge.textContent = RUOLI_LABEL[utente.ruolo] || utente.ruolo;
  initShell(utente);
}

loadUser();
