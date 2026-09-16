-- Row Level Security — Gestionale Magazzino Dolci Sapori
-- Da eseguire nell'SQL Editor di Supabase DOPO schema.sql e dopo aver creato
-- almeno un utente direttore nella tabella "utenti".
--
-- Logica generale:
-- - LETTURA: chiunque sia autenticato puo' leggere tutte le tabelle (azienda
--   piccola, un solo sito, tutti i ruoli sono personale interno fidato).
-- - SCRITTURA (insert/update/delete): limitata in base al ruolo, secondo i
--   flussi operativi decisi (vedi Doc Decisioni su Drive).

create or replace function ruolo_utente()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select ruolo from utenti where id = auth.uid()
$$;

-- =========================================================================
-- UTENTI
-- =========================================================================
alter table utenti enable row level security;
create policy "lettura_autenticati" on utenti for select using (auth.role() = 'authenticated');
create policy "scrittura_direttore" on utenti for insert with check (ruolo_utente() = 'direttore');
create policy "modifica_direttore" on utenti for update using (ruolo_utente() = 'direttore');
create policy "eliminazione_direttore" on utenti for delete using (ruolo_utente() = 'direttore');

-- =========================================================================
-- ANAGRAFICHE: fornitori, clienti
-- =========================================================================
alter table fornitori enable row level security;
create policy "lettura_autenticati" on fornitori for select using (auth.role() = 'authenticated');
create policy "scrittura_direttore_produzione" on fornitori for insert with check (ruolo_utente() in ('direttore', 'responsabile_produzione'));
create policy "modifica_direttore_produzione" on fornitori for update using (ruolo_utente() in ('direttore', 'responsabile_produzione'));
create policy "eliminazione_direttore" on fornitori for delete using (ruolo_utente() = 'direttore');

alter table clienti enable row level security;
create policy "lettura_autenticati" on clienti for select using (auth.role() = 'authenticated');
create policy "scrittura_direttore" on clienti for insert with check (ruolo_utente() = 'direttore');
create policy "modifica_direttore" on clienti for update using (ruolo_utente() = 'direttore');
create policy "eliminazione_direttore" on clienti for delete using (ruolo_utente() = 'direttore');

-- =========================================================================
-- UNITA' DI MISURA — aggiunta libera per tutti gli utenti autenticati,
-- modifica/eliminazione riservata al direttore per evitare di rompere
-- riferimenti gia' in uso.
-- =========================================================================
alter table unita_misura enable row level security;
create policy "lettura_autenticati" on unita_misura for select using (auth.role() = 'authenticated');
create policy "scrittura_autenticati" on unita_misura for insert with check (auth.role() = 'authenticated');
create policy "modifica_direttore" on unita_misura for update using (ruolo_utente() = 'direttore');
create policy "eliminazione_direttore" on unita_misura for delete using (ruolo_utente() = 'direttore');

-- =========================================================================
-- MATERIE PRIME (anagrafica + conversioni)
-- =========================================================================
alter table materie_prime enable row level security;
create policy "lettura_autenticati" on materie_prime for select using (auth.role() = 'authenticated');
create policy "scrittura_direttore" on materie_prime for insert with check (ruolo_utente() = 'direttore');
create policy "modifica_direttore" on materie_prime for update using (ruolo_utente() = 'direttore');
create policy "eliminazione_direttore" on materie_prime for delete using (ruolo_utente() = 'direttore');

alter table materie_prime_conversioni enable row level security;
create policy "lettura_autenticati" on materie_prime_conversioni for select using (auth.role() = 'authenticated');
create policy "scrittura_direttore" on materie_prime_conversioni for insert with check (ruolo_utente() = 'direttore');
create policy "modifica_direttore" on materie_prime_conversioni for update using (ruolo_utente() = 'direttore');
create policy "eliminazione_direttore" on materie_prime_conversioni for delete using (ruolo_utente() = 'direttore');

-- =========================================================================
-- LOTTI MATERIE PRIME — carico/gestione da direttore o responsabile produzione
-- =========================================================================
alter table lotti_materie_prime enable row level security;
create policy "lettura_autenticati" on lotti_materie_prime for select using (auth.role() = 'authenticated');
create policy "scrittura_direttore_produzione" on lotti_materie_prime for insert with check (ruolo_utente() in ('direttore', 'responsabile_produzione') and creato_da = auth.uid());
create policy "modifica_direttore_produzione" on lotti_materie_prime for update using (ruolo_utente() in ('direttore', 'responsabile_produzione'));
create policy "eliminazione_direttore_produzione" on lotti_materie_prime for delete using (ruolo_utente() in ('direttore', 'responsabile_produzione'));

-- =========================================================================
-- PRODOTTI FINITI (anagrafica + conversioni) e RICETTE
-- =========================================================================
alter table prodotti_finiti enable row level security;
create policy "lettura_autenticati" on prodotti_finiti for select using (auth.role() = 'authenticated');
create policy "scrittura_direttore" on prodotti_finiti for insert with check (ruolo_utente() = 'direttore');
create policy "modifica_direttore" on prodotti_finiti for update using (ruolo_utente() = 'direttore');
create policy "eliminazione_direttore" on prodotti_finiti for delete using (ruolo_utente() = 'direttore');

alter table prodotti_finiti_conversioni enable row level security;
create policy "lettura_autenticati" on prodotti_finiti_conversioni for select using (auth.role() = 'authenticated');
create policy "scrittura_direttore" on prodotti_finiti_conversioni for insert with check (ruolo_utente() = 'direttore');
create policy "modifica_direttore" on prodotti_finiti_conversioni for update using (ruolo_utente() = 'direttore');
create policy "eliminazione_direttore" on prodotti_finiti_conversioni for delete using (ruolo_utente() = 'direttore');

alter table ricette enable row level security;
create policy "lettura_autenticati" on ricette for select using (auth.role() = 'authenticated');
create policy "scrittura_direttore" on ricette for insert with check (ruolo_utente() = 'direttore');
create policy "modifica_direttore" on ricette for update using (ruolo_utente() = 'direttore');
create policy "eliminazione_direttore" on ricette for delete using (ruolo_utente() = 'direttore');

alter table ricette_ingredienti enable row level security;
create policy "lettura_autenticati" on ricette_ingredienti for select using (auth.role() = 'authenticated');
create policy "scrittura_direttore" on ricette_ingredienti for insert with check (ruolo_utente() = 'direttore');
create policy "modifica_direttore" on ricette_ingredienti for update using (ruolo_utente() = 'direttore');
create policy "eliminazione_direttore" on ricette_ingredienti for delete using (ruolo_utente() = 'direttore');

-- =========================================================================
-- FLUSSO PRODUZIONE
-- =========================================================================
alter table ordini_produzione enable row level security;
create policy "lettura_autenticati" on ordini_produzione for select using (auth.role() = 'authenticated');
create policy "scrittura_direttore" on ordini_produzione for insert with check (ruolo_utente() = 'direttore' and creato_da = auth.uid());
create policy "modifica_direttore_produzione" on ordini_produzione for update using (ruolo_utente() in ('direttore', 'responsabile_produzione'));
create policy "eliminazione_direttore" on ordini_produzione for delete using (ruolo_utente() = 'direttore');

alter table ordini_produzione_prelievi enable row level security;
create policy "lettura_autenticati" on ordini_produzione_prelievi for select using (auth.role() = 'authenticated');
create policy "scrittura_direttore_produzione" on ordini_produzione_prelievi for insert with check (ruolo_utente() in ('direttore', 'responsabile_produzione') and confermato_da = auth.uid());
create policy "modifica_direttore_produzione" on ordini_produzione_prelievi for update using (ruolo_utente() in ('direttore', 'responsabile_produzione'));
create policy "eliminazione_direttore_produzione" on ordini_produzione_prelievi for delete using (ruolo_utente() in ('direttore', 'responsabile_produzione'));

-- =========================================================================
-- LOTTI PRODOTTI FINITI — creati dal responsabile confezionamento
-- =========================================================================
alter table lotti_prodotti_finiti enable row level security;
create policy "lettura_autenticati" on lotti_prodotti_finiti for select using (auth.role() = 'authenticated');
create policy "scrittura_direttore_confezionamento" on lotti_prodotti_finiti for insert with check (ruolo_utente() in ('direttore', 'responsabile_confezionamento') and creato_da = auth.uid());
create policy "modifica_direttore_confezionamento" on lotti_prodotti_finiti for update using (ruolo_utente() in ('direttore', 'responsabile_confezionamento'));
create policy "eliminazione_direttore_confezionamento" on lotti_prodotti_finiti for delete using (ruolo_utente() in ('direttore', 'responsabile_confezionamento'));

-- =========================================================================
-- FLUSSO ORDINI DI VENDITA — creati e allocati solo dal direttore
-- =========================================================================
alter table ordini_vendita enable row level security;
create policy "lettura_autenticati" on ordini_vendita for select using (auth.role() = 'authenticated');
create policy "scrittura_direttore" on ordini_vendita for insert with check (ruolo_utente() = 'direttore' and creato_da = auth.uid());
create policy "modifica_direttore" on ordini_vendita for update using (ruolo_utente() = 'direttore');
create policy "eliminazione_direttore" on ordini_vendita for delete using (ruolo_utente() = 'direttore');

alter table ordini_vendita_righe enable row level security;
create policy "lettura_autenticati" on ordini_vendita_righe for select using (auth.role() = 'authenticated');
create policy "scrittura_direttore" on ordini_vendita_righe for insert with check (ruolo_utente() = 'direttore');
create policy "modifica_direttore" on ordini_vendita_righe for update using (ruolo_utente() = 'direttore');
create policy "eliminazione_direttore" on ordini_vendita_righe for delete using (ruolo_utente() = 'direttore');

alter table ordini_vendita_allocazioni enable row level security;
create policy "lettura_autenticati" on ordini_vendita_allocazioni for select using (auth.role() = 'authenticated');
create policy "scrittura_direttore" on ordini_vendita_allocazioni for insert with check (ruolo_utente() = 'direttore' and confermato_da = auth.uid());
create policy "modifica_direttore" on ordini_vendita_allocazioni for update using (ruolo_utente() = 'direttore');
create policy "eliminazione_direttore" on ordini_vendita_allocazioni for delete using (ruolo_utente() = 'direttore');
