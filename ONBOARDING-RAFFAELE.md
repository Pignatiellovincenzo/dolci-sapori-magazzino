# Onboarding per Raffaele (e per il suo Claude)

Questo file è pensato per essere letto da Claude Code nella sessione di
Raffaele. Contiene il contesto del progetto, le scelte fatte finora (e il
perché), le convenzioni da rispettare, e i passi per avere accesso autonomo
a GitHub e Supabase. Leggilo per intero prima di modificare qualsiasi file:
molte scelte non ovvie sono spiegate qui, non nel codice.

## Il progetto in una frase

Gestionale magazzino per Dolci & Sapori (pasticceria surgelati, sito unico):
due magazzini (materie prime e prodotti finiti), due flussi operativi
(produzione consuma materie prime FEFO, vendita consuma prodotti finiti
FEFO), tre ruoli utente, tutto a costo zero.

## Perché questo stack (costo zero, deciso con Vincenzo)

- **Database**: Supabase (Postgres + Auth + RLS), piano free.
- **Frontend**: HTML/CSS/JS statico, nessun framework, nessun build step —
  ospitato su GitHub Pages (gratis). Le pagine chiamano Supabase
  direttamente via `@supabase/supabase-js` da CDN.
- **Codice**: Git/GitHub.
- **Documenti di decisione e tracciamento attività**: Google Drive (Docs/
  Sheets) — non nel repository, per restare leggibili a chi non legge
  codice. Trovi i link nel `README.md`.

Non introdurre framework, build tool o servizi a pagamento senza
discuterne prima: è un vincolo esplicito del progetto, non una svista.

## Modello dei ruoli (RLS)

Tre ruoli in `utenti.ruolo`, letti da `ruolo_utente()` (funzione SQL usata
in tutte le policy RLS):

- `direttore` — controllo completo.
- `responsabile_produzione` — materie prime: carico da fornitore, prelievo
  per produzione.
- `responsabile_confezionamento` — prodotti finiti: stoccaggio dopo
  confezionamento, evasione vendite (stessa persona che fa entrambe le
  cose).

La lettura è aperta a tutti gli autenticati (personale interno fidato,
sito unico). La scrittura è ristretta per ruolo secondo i flussi decisi
— guarda `supabase/policies.sql` per il dettaglio, non indovinarlo.

## Convenzioni architetturali da rispettare

Queste non sono stile personale: risolvono problemi reali già incontrati.
Se una modifica sembra richiedere di romperle, fermati e discutine con
Vincenzo prima.

1. **Registri append-only**: `movimenti_materie_prime` e
   `movimenti_prodotti_finiti` non hanno policy di UPDATE/DELETE — è
   voluto, sono ledger immutabili. Non aggiungerle.
2. **Operazioni multi-step → funzione RPC `plpgsql` atomica**, mai più
   INSERT/UPDATE separati dal frontend. Motivo: un frontend che fa 3
   scritture di fila può fallire a metà e lasciare record orfani. Vedi
   `registra_prelievo_produzione`, `registra_confezionamento` in
   `supabase/schema.sql`.
3. **FEFO (First-Expired-First-Out)**: calcolato in JS lato client per
   proporre un'allocazione, sempre mostrata e modificabile prima della
   conferma, che poi viene inviata in un'unica chiamata RPC.
4. **Doppia unità di misura per materia prima** (es. acquisti in kg,
   magazzino in pezzi): la conversione bidirezionale è in un trigger
   Postgres (`imposta_segno_e_quantita_movimento_materie_prime`), mai
   fidarsi del frontend per farla.
5. **Soft delete** per le anagrafiche (`attivo boolean`): eliminare
   davvero un fornitore/materia prima/prodotto romperebbe lo storico. Il
   pattern frontend standard: se un DELETE fallisce con
   `error.code === '23503'` (violazione FK), proponi di disattivare
   invece.
6. **Tracciabilità allergeni storica dal registro movimenti, non dalla
   ricetta**: `v_lotti_prodotti_finiti_allergeni` risale agli allergeni
   *realmente usati* per un lotto tramite i movimenti materie prime
   collegati alla riga d'ordine di produzione — non alla ricetta attuale,
   che può essere cambiata dopo. `v_prodotti_finiti_allergeni` invece è
   la ricetta corrente (per la scheda prodotto).
7. **Pattern testata + righe** per ordini multi-linea: vedi
   `ordini_vendita`/`ordini_vendita_righe` e
   `ordini_produzione`/`ordini_produzione_righe`. Un ordine di produzione
   può avere più prodotti; la quantità è sempre "numero di batch" della
   ricetta, mai kg.
8. `[hidden] { display: none !important; }` in `assets/css/style.css`
   esiste perché le classi `.form-row`/`.checkbox-grid` (che impostano
   `display` esplicito) altrimenti vincono sulla regola UA di `[hidden]`.
   Non rimuoverlo.

## Struttura del repository

```
supabase/
  schema.sql            ← schema completo AGGIORNATO (fonte di verità)
  policies.sql           ← RLS aggiornate
  reset.sql, seed.sql    ← ambiente di test da zero
  patch-*.sql             ← storico delle migrazioni applicate in ordine
assets/js/
  supabase-client.js     ← URL + anon key (pubblica, protetta da RLS)
  auth-guard.js          ← requireAuth(['ruolo1', 'ruolo2']) per pagina
  nav.js                 ← menu laterale
  <pagina>.js             ← logica della pagina omonima
*.html                    ← una pagina per area funzionale
```

`schema.sql` e `policies.sql` sono tenuti sincronizzati con ogni patch
applicata: se apri il progetto Supabase e lo schema reale non corrisponde
a questi due file, uno dei due è disallineato — segnalalo, non assumere
quale sia corretto.

## Stato attuale (settembre 2026)

Già costruito e testato: anagrafiche (fornitori, clienti, materie prime
con doppia unità, prodotti finiti con ricetta unica), ordini di
produzione multi-riga con FEFO e correzione errori, magazzino prodotti
finiti con confezionamento, ordini di vendita con evasione FEFO,
soft-delete su tutte le anagrafiche.

Ancora da fare (non iniziato):
- Pagina "Magazzino Materie Prime" per registrare i carichi in arrivo dai
  fornitori tramite UI (finora fatto solo via SQL/JS di test).
- Flusso frontend per creare nuovi utenti (serve una Supabase Edge
  Function con service-role key, che non deve mai arrivare al frontend).
- Alcuni punti aperti su volumi/giornata, catch weight, barcode/etichette,
  temperature/HACCP, DDT/fatture — sono sul documento Drive delle
  decisioni, non ancora tradotti in schema.

## Setup per lavorare in autonomia

Vincenzo deve mandarti due inviti — solo lui può farlo, sono legati al
suo account (GitHub) e al suo progetto (Supabase):

1. Invito come **collaboratore GitHub** sul repository.
2. Invito come **membro del progetto Supabase** (ruolo "Developer" basta).

Una volta accettati entrambi, da qui in poi sei autonomo — non serve
richiedere altro a Vincenzo. Segui questi passi in ordine:

### 1. Clona il repo e avvia l'app in locale

```bash
git clone <url-del-repo>
cd <cartella-del-repo>
npx http-server .
```

Apri il browser sull'URL che stampa `http-server` (es.
`http://localhost:8080`). Non serve altra configurazione: la anon key di
Supabase è già in `assets/js/supabase-client.js` ed è pensata per essere
pubblica (la sicurezza è tutta nelle policy RLS lato database).

### 2. Crea il tuo utente applicativo (non usare le credenziali di Vincenzo)

L'app registra `utente_id`/`creato_da` su ogni movimento e ordine leggendo
`auth.uid()`: se accedi con le credenziali di Vincenzo, ogni tua azione
risulterebbe attribuita a lui, rompendo la tracciabilità che il sistema
esiste per garantire. Crea invece un tuo utente, dalla dashboard Supabase
del progetto (una volta accettato l'invito come membro):

1. **Authentication → Users → Add user**: inserisci la tua email e una
   password. Supabase crea la riga in `auth.users` e ti mostra il suo
   `id` (un UUID) — copialo.
2. **SQL Editor**, esegui (sostituendo l'UUID e scegliendo il ruolo che
   ti serve — vedi la sezione "Modello dei ruoli" sopra):

   ```sql
   insert into utenti (id, nome, ruolo)
   values ('<uuid-copiato-al-passo-1>', 'Raffaele', 'direttore');
   ```

   Il SQL Editor gira come superuser (bypassa le RLS), quindi questo
   insert funziona anche se non hai ancora un utente `direttore` da cui
   farlo. Puoi creare più utenti di test con ruoli diversi allo stesso
   modo, se ti serve provare i flussi da più prospettive.
3. Torna sull'app in locale e fai login con l'email/password appena
   create.

Da qui hai accesso completo: puoi leggere/modificare `schema.sql` e
`policies.sql`, applicare patch SQL dal SQL Editor, modificare il
frontend e testarlo in locale, e pushare su GitHub (dopo conferma con
Vincenzo, vedi sotto).

**Prima di scrivere codice**: leggi `supabase/schema.sql` e
`supabase/policies.sql` per lo stato attuale, e questo file per il
perché. Se una patch SQL va applicata, create un nuovo
`supabase/patch-<nome-cambiamento>.sql` (mai modificare `reset.sql` o i
patch già applicati), poi riportate `schema.sql`/`policies.sql` in linea
col nuovo stato — è il pattern che ha usato Claude finora.

## Come lavoriamo (regole di collaborazione)

Siamo in due a toccare lo stesso repo (`main`, niente branch/PR: per due
persone sarebbe overhead inutile). Le regole che sostituiscono quella
protezione sono semplici ma vanno rispettate sempre:

- **`git pull` a inizio di ogni sessione**, prima di leggere o modificare
  qualsiasi file — potresti partire da una versione vecchia di
  `schema.sql` senza saperlo.
- Prima di ogni `git commit`/`push`, conferma con l'umano della sessione
  (Vincenzo o Raffaele) — è una regola esplicita di questo progetto, non
  solo buona pratica.
- Prima di modificare `schema.sql`, `policies.sql`, o un file JS su cui
  sai che sta lavorando anche l'altro, avvisatevi a vicenda (messaggio
  diretto, o una riga sul foglio Drive di tracciamento attività). È
  l'unico meccanismo che avete per non sovrascrivervi il lavoro, quindi
  non è opzionale.
- Se capita un vero conflitto (due modifiche incompatibili alla stessa
  parte di schema fatte in parallelo), risolvetelo parlandone — non
  scegliere automaticamente "l'ultimo che pusha vince".
