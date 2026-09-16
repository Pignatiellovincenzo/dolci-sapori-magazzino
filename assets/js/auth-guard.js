// Verifica sessione e ruolo prima di mostrare una pagina protetta.
// Uso: const utente = await requireAuth(['direttore']);
async function requireAuth(ruoliConsentiti) {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (!session) {
    window.location.href = 'index.html';
    return null;
  }

  const { data: utente, error } = await supabaseClient
    .from('utenti')
    .select('nome, ruolo')
    .eq('id', session.user.id)
    .single();

  if (error || !utente) {
    window.location.href = 'index.html';
    return null;
  }

  if (ruoliConsentiti && !ruoliConsentiti.includes(utente.ruolo)) {
    alert('Non hai i permessi per accedere a questa pagina.');
    window.location.href = 'dashboard.html';
    return null;
  }

  return { id: session.user.id, nome: utente.nome, ruolo: utente.ruolo };
}
