-- Ripulisce completamente il database (v1) prima di eseguire schema.sql (v2).
-- Sicuro da eseguire: al momento della riscrittura il database non contiene
-- lotti/movimenti/ordini reali.

drop view if exists v_lotti_prodotti_finiti_allergeni cascade;
drop view if exists v_prodotti_finiti_allergeni cascade;
drop view if exists v_giacenza_prodotti_finiti cascade;
drop view if exists v_giacenza_materie_prime cascade;

drop table if exists ordini_vendita_allocazioni cascade;
drop table if exists ordini_vendita_righe cascade;
drop table if exists ordini_vendita cascade;
drop table if exists lotti_prodotti_finiti cascade;
drop table if exists ordini_produzione_prelievi cascade;
drop table if exists ordini_produzione cascade;
drop table if exists ricette_ingredienti cascade;
drop table if exists ricette cascade;
drop table if exists materie_prime_allergeni cascade;
drop table if exists allergeni cascade;
drop table if exists prodotti_finiti_conversioni cascade;
drop table if exists prodotti_finiti cascade;
drop table if exists lotti_materie_prime cascade;
drop table if exists materie_prime_conversioni cascade;
drop table if exists materie_prime cascade;
drop table if exists unita_misura cascade;
drop table if exists clienti cascade;
drop table if exists fornitori cascade;
drop table if exists utenti cascade;

drop table if exists causali_prodotti_finiti cascade;
drop table if exists causali_materie_prime cascade;
drop table if exists movimenti_prodotti_finiti cascade;
drop table if exists movimenti_materie_prime cascade;

drop function if exists imposta_segno_movimento_prodotti_finiti() cascade;
drop function if exists imposta_segno_movimento_materie_prime() cascade;
drop function if exists ruolo_utente() cascade;

drop type if exists stato_lotto cascade;
