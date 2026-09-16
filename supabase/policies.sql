-- Row Level Security — Gestionale Magazzino Dolci & Sapori (v2)
-- Da eseguire dopo schema.sql e seed.sql, e dopo aver creato almeno un
-- utente direttore nella tabella "utenti".
--
-- Logica generale:
-- - LETTURA: chiunque sia autenticato puo' leggere tutte le tabelle
--   (personale interno fidato, unico sito).
-- - SCRITTURA: limitata per ruolo secondo i flussi operativi decisi.
-- - I due registri movimenti (append-only) non hanno NESSUNA policy di
--   update/delete: significa che sono bloccati a livello di database,
--   non solo per convenzione applicativa.

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
-- UNITA' DI MISURA — aggiunta libera per tutti gli autenticati, modifica ed
-- eliminazione riservate al direttore.
-- =========================================================================
alter table unita_misura enable row level security;
create policy "lettura_autenticati" on unita_misura for select using (auth.role() = 'authenticated');
create policy "scrittura_autenticati" on unita_misura for insert with check (auth.role() = 'authenticated');
create policy "modifica_direttore" on unita_misura for update using (ruolo_utente() = 'direttore');
create policy "eliminazione_direttore" on unita_misura for delete using (ruolo_utente() = 'direttore');

-- =========================================================================
-- MATERIE PRIME (anagrafica, conversioni, allergeni)
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

alter table allergeni enable row level security;
create policy "lettura_autenticati" on allergeni for select using (auth.role() = 'authenticated');
create policy "scrittura_direttore" on allergeni for insert with check (ruolo_utente() = 'direttore');
create policy "modifica_direttore" on allergeni for update using (ruolo_utente() = 'direttore');
create policy "eliminazione_direttore" on allergeni for delete using (ruolo_utente() = 'direttore');

alter table materie_prime_allergeni enable row level security;
create policy "lettura_autenticati" on materie_prime_allergeni for select using (auth.role() = 'authenticated');
create policy "scrittura_direttore" on materie_prime_allergeni for insert with check (ruolo_utente() = 'direttore');
create policy "modifica_direttore" on materie_prime_allergeni for update using (ruolo_utente() = 'direttore');
create policy "eliminazione_direttore" on materie_prime_allergeni for delete using (ruolo_utente() = 'direttore');

-- =========================================================================
-- PRODOTTI FINITI (anagrafica, conversioni) e RICETTE
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
-- ORDINI DI PRODUZIONE — assegnati dal direttore, lo stato viene poi
-- avanzato anche dal responsabile produzione.
-- =========================================================================
alter table ordini_produzione enable row level security;
create policy "lettura_autenticati" on ordini_produzione for select using (auth.role() = 'authenticated');
create policy "scrittura_direttore" on ordini_produzione for insert with check (ruolo_utente() = 'direttore' and creato_da = auth.uid());
create policy "modifica_direttore_produzione_confezionamento" on ordini_produzione for update using (ruolo_utente() in ('direttore', 'responsabile_produzione', 'responsabile_confezionamento'));
create policy "eliminazione_direttore" on ordini_produzione for delete using (ruolo_utente() = 'direttore');

-- =========================================================================
-- MAGAZZINO MATERIE PRIME — lotti e causali gestiti da direttore o
-- responsabile produzione; movimenti append-only, nessun update/delete.
-- =========================================================================
alter table lotti_materie_prime enable row level security;
create policy "lettura_autenticati" on lotti_materie_prime for select using (auth.role() = 'authenticated');
create policy "scrittura_direttore_produzione" on lotti_materie_prime for insert with check (ruolo_utente() in ('direttore', 'responsabile_produzione') and creato_da = auth.uid());
create policy "modifica_direttore_produzione" on lotti_materie_prime for update using (ruolo_utente() in ('direttore', 'responsabile_produzione'));
create policy "eliminazione_direttore" on lotti_materie_prime for delete using (ruolo_utente() = 'direttore');

alter table causali_materie_prime enable row level security;
create policy "lettura_autenticati" on causali_materie_prime for select using (auth.role() = 'authenticated');
-- Nessuna policy di insert/update/delete: elenco fisso, gestito solo da SQL Editor.

alter table movimenti_materie_prime enable row level security;
create policy "lettura_autenticati" on movimenti_materie_prime for select using (auth.role() = 'authenticated');
create policy "scrittura_direttore_produzione" on movimenti_materie_prime for insert with check (ruolo_utente() in ('direttore', 'responsabile_produzione') and utente_id = auth.uid());
-- Nessuna policy di update/delete: registro append-only, immutabile per costruzione.

-- =========================================================================
-- MAGAZZINO PRODOTTI FINITI — lotti gestiti da direttore o responsabile
-- confezionamento; movimenti append-only con causale distinta per ruolo.
-- =========================================================================
alter table lotti_prodotti_finiti enable row level security;
create policy "lettura_autenticati" on lotti_prodotti_finiti for select using (auth.role() = 'authenticated');
create policy "scrittura_direttore_confezionamento" on lotti_prodotti_finiti for insert with check (ruolo_utente() in ('direttore', 'responsabile_confezionamento') and creato_da = auth.uid());
create policy "modifica_direttore_confezionamento" on lotti_prodotti_finiti for update using (ruolo_utente() in ('direttore', 'responsabile_confezionamento'));
create policy "eliminazione_direttore" on lotti_prodotti_finiti for delete using (ruolo_utente() = 'direttore');

alter table causali_prodotti_finiti enable row level security;
create policy "lettura_autenticati" on causali_prodotti_finiti for select using (auth.role() = 'authenticated');
-- Nessuna policy di insert/update/delete: elenco fisso, gestito solo da SQL Editor.

alter table movimenti_prodotti_finiti enable row level security;
create policy "lettura_autenticati" on movimenti_prodotti_finiti for select using (auth.role() = 'authenticated');
-- Il responsabile confezionamento puo' registrare solo l'uscita da produzione
-- (causale "confezionamento"); qualsiasi altra causale (scarico_vendita,
-- rettifiche, scarti) resta decisione del direttore, coerente col flusso
-- ordini di vendita gia' deciso.
create policy "scrittura_per_causale" on movimenti_prodotti_finiti for insert with check (
  utente_id = auth.uid()
  and exists (
    select 1 from causali_prodotti_finiti c
    where c.id = causale_id
      and (
        (c.codice = 'confezionamento' and ruolo_utente() in ('direttore', 'responsabile_confezionamento'))
        or (c.codice <> 'confezionamento' and ruolo_utente() = 'direttore')
      )
  )
);
-- Nessuna policy di update/delete: registro append-only, immutabile per costruzione.

-- =========================================================================
-- ORDINI DI VENDITA — creati e allocati solo dal direttore.
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
