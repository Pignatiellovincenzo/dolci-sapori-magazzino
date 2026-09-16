// Struttura del menu laterale, raggruppata per area. Ogni voce e' visibile
// solo ai ruoli elencati — coerente con le policy RLS del database.
const MENU = [
  {
    area: 'Anagrafiche',
    voci: [
      { href: 'fornitori.html', label: 'Fornitori', ruoli: ['direttore', 'responsabile_produzione'] },
      { href: 'materie-prime.html', label: 'Materie Prime', ruoli: ['direttore', 'responsabile_produzione'] },
      { href: 'prodotti-finiti.html', label: 'Prodotti Finiti', ruoli: ['direttore', 'responsabile_confezionamento'] },
    ],
  },
  {
    area: 'Produzione',
    voci: [
      { href: 'ordini-produzione.html', label: 'Ordini di Produzione', ruoli: ['direttore', 'responsabile_produzione'] },
    ],
  },
  {
    area: 'Prodotti Finiti',
    voci: [
      { href: 'magazzino-prodotti-finiti.html', label: 'Magazzino Prodotti Finiti', ruoli: ['direttore', 'responsabile_confezionamento'] },
    ],
  },
];

function paginaCorrente() {
  return window.location.pathname.split('/').pop() || 'dashboard.html';
}

function renderSidebar(utente) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const attiva = paginaCorrente();
  let html = `<a href="dashboard.html" class="sidebar-link${attiva === 'dashboard.html' ? ' active' : ''}">Dashboard</a>`;

  for (const gruppo of MENU) {
    const vociVisibili = gruppo.voci.filter(v => v.ruoli.includes(utente.ruolo));
    if (vociVisibili.length === 0) continue;

    html += `<div class="sidebar-area">${gruppo.area}</div>`;
    for (const voce of vociVisibili) {
      const classeAttiva = attiva === voce.href ? ' active' : '';
      html += `<a href="${voce.href}" class="sidebar-link${classeAttiva}">${voce.label}</a>`;
    }
  }

  sidebar.innerHTML = html;
}

function apriSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('visible');
}

function chiudiSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
}

function initShell(utente) {
  renderSidebar(utente);

  const topbarUser = document.getElementById('topbar-user');
  if (topbarUser) topbarUser.textContent = utente.nome;

  const menuBtn = document.getElementById('menu-btn');
  if (menuBtn) menuBtn.addEventListener('click', apriSidebar);

  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) overlay.addEventListener('click', chiudiSidebar);

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await supabaseClient.auth.signOut();
      window.location.href = 'index.html';
    });
  }
}
