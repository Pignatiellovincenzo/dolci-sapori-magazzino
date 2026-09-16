let utenteCorrente = null;
let unitaMisura = [];
let prodottiFiniti = [];
let ordineInConfezionamento = null;

const daConfezionareTbody = document.getElementById('da-confezionare-tbody');
const emptyDaConfezionare = document.getElementById('empty-da-confezionare');
const confezionaPanel = document.getElementById('confeziona-panel');
const confezionaTitle = document.getElementById('confeziona-title');
const numeroLottoInput = document.getElementById('numero-lotto-input');
const quantitaConfezionataInput = document.getElementById('quantita-confezionata-input');
const dataProduzioneInput = document.getElementById('data-produzione-input');
const dataScadenzaInput = document.getElementById('data-scadenza-input');
const confezionaError = document.getElementById('confeziona-error');
const giacenzaTbody = document.getElementById('giacenza-tbody');
const emptyGiacenza = document.getElementById('empty-giacenza');

async function init() {
  utenteCorrente = await requireAuth(['direttore', 'responsabile_confezionamento']);
  if (!utenteCorrente) return;

  initShell(utenteCorrente);

  await caricaUnitaMisura();
  await caricaProdottiFiniti();
  await caricaOrdiniDaConfezionare();
  await caricaGiacenza();
}

async function caricaUnitaMisura() {
  const { data } = await supabaseClient.from('unita_misura').select('id, codice, nome');
  unitaMisura = data || [];
}

async function caricaProdottiFiniti() {
  const { data } = await supabaseClient.from('prodotti_finiti').select('id, nome, unita_misura_base_id, giorni_preavviso_scadenza');
  prodottiFiniti = data || [];
}

function nomeUnita(id) {
  const u = unitaMisura.find(x => x.id === id);
  return u ? `${u.nome} (${u.codice})` : '—';
}

function prodottoDaId(id) {
  return prodottiFiniti.find(p => p.id === id);
}

async function caricaOrdiniDaConfezionare() {
  const { data, error } = await supabaseClient
    .from('ordini_produzione')
    .select('id, quantita_richiesta, unita_misura_id, creato_il, prodotti_finiti(id, nome)')
    .eq('stato', 'prelievo_confermato')
    .order('creato_il', { ascending: true });

  if (error) { confezionaError.textContent = 'Errore caricamento ordini: ' + error.message; return; }

  daConfezionareTbody.innerHTML = '';
  emptyDaConfezionare.hidden = data.length > 0;

  for (const ordine of data) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${ordine.prodotti_finiti.nome}</td>
      <td>${ordine.quantita_richiesta} ${nomeUnita(ordine.unita_misura_id)}</td>
      <td>${new Date(ordine.creato_il).toLocaleDateString('it-IT')}</td>
    `;
    const tdActions = document.createElement('td');
    tdActions.className = 'actions';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Registra confezionamento';
    btn.addEventListener('click', () => apriConfezionamento(ordine));
    tdActions.appendChild(btn);
    tr.appendChild(tdActions);
    daConfezionareTbody.appendChild(tr);
  }
}

function apriConfezionamento(ordine) {
  ordineInConfezionamento = ordine;
  confezionaTitle.textContent = `Registra confezionamento — ${ordine.prodotti_finiti.nome}`;
  numeroLottoInput.value = '';
  quantitaConfezionataInput.value = '';
  dataProduzioneInput.value = new Date().toISOString().slice(0, 10);
  dataScadenzaInput.value = '';
  confezionaError.textContent = '';
  confezionaPanel.hidden = false;
  confezionaPanel.scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('annulla-confezionamento-btn').addEventListener('click', () => {
  confezionaPanel.hidden = true;
  ordineInConfezionamento = null;
});

document.getElementById('salva-confezionamento-btn').addEventListener('click', async () => {
  confezionaError.textContent = '';

  const numeroLotto = numeroLottoInput.value.trim();
  const quantita = Number(quantitaConfezionataInput.value);

  if (!numeroLotto) {
    confezionaError.textContent = 'Inserisci il numero di lotto.';
    return;
  }
  if (!quantita || quantita <= 0) {
    confezionaError.textContent = 'Inserisci una quantità maggiore di zero.';
    return;
  }

  const { error } = await supabaseClient.rpc('registra_confezionamento', {
    p_ordine_produzione_id: ordineInConfezionamento.id,
    p_numero_lotto: numeroLotto,
    p_quantita: quantita,
    p_data_produzione: dataProduzioneInput.value || new Date().toISOString().slice(0, 10),
    p_data_scadenza: dataScadenzaInput.value || null,
  });

  if (error) {
    confezionaError.textContent = 'Errore: ' + error.message;
    return;
  }

  confezionaPanel.hidden = true;
  ordineInConfezionamento = null;
  await caricaOrdiniDaConfezionare();
  await caricaGiacenza();
});

async function caricaGiacenza() {
  const { data: lotti, error } = await supabaseClient
    .from('lotti_prodotti_finiti')
    .select('id, numero_lotto, data_scadenza, stato, prodotto_finito_id');

  if (error) { confezionaError.textContent = 'Errore caricamento giacenza: ' + error.message; return; }

  const idLotti = lotti.map(l => l.id);
  let giacenzePerLotto = {};
  if (idLotti.length > 0) {
    const { data: giacenze } = await supabaseClient
      .from('v_giacenza_prodotti_finiti')
      .select('lotto_id, giacenza')
      .in('lotto_id', idLotti);
    giacenzePerLotto = Object.fromEntries((giacenze || []).map(g => [g.lotto_id, g.giacenza]));
  }

  const righe = lotti
    .map(l => ({ ...l, giacenza: giacenzePerLotto[l.id] || 0 }))
    .filter(l => l.giacenza > 0);

  giacenzaTbody.innerHTML = '';
  emptyGiacenza.hidden = righe.length > 0;

  const oggi = new Date();

  for (const riga of righe) {
    const prodotto = prodottoDaId(riga.prodotto_finito_id);
    const tr = document.createElement('tr');

    let scadenzaTesto = riga.data_scadenza || '—';
    if (riga.data_scadenza && prodotto) {
      const giorniMancanti = Math.round((new Date(riga.data_scadenza) - oggi) / 86400000);
      if (giorniMancanti < 0) {
        tr.style.color = 'var(--error)';
        scadenzaTesto += ' (scaduto)';
      } else if (giorniMancanti <= prodotto.giorni_preavviso_scadenza) {
        tr.style.color = 'var(--error)';
        scadenzaTesto += ` (tra ${giorniMancanti} giorni)`;
      }
    }

    tr.innerHTML = `
      <td>${prodotto ? prodotto.nome : '—'}</td>
      <td>${riga.numero_lotto}</td>
      <td>${riga.giacenza} ${prodotto ? nomeUnita(prodotto.unita_misura_base_id) : ''}</td>
      <td>${scadenzaTesto}</td>
      <td>${riga.stato}</td>
    `;
    giacenzaTbody.appendChild(tr);
  }
}

init();
