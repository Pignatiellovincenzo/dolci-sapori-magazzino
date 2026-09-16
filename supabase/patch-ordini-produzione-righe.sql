-- Un ordine di produzione diventa una testata con piu' righe (piu' linee di
-- produzione lo stesso giorno, un prodotto per riga), sul modello degli
-- ordini di vendita. La quantita' e' sempre espressa in numero di batch
-- della ricetta (risolve la questione kg/numero ricette lasciata aperta).

drop view if exists v_lotti_prodotti_finiti_allergeni;

create table ordini_produzione_righe (
  id bigint generated always as identity primary key,
  ordine_produzione_id bigint not null references ordini_produzione (id) on delete cascade,
  prodotto_finito_id integer not null references prodotti_finiti (id),
  numero_batch numeric not null check (numero_batch > 0),
  stato text not null default 'assegnato'
    check (stato in ('assegnato', 'prelievo_confermato', 'completato', 'annullato')),
  creato_il timestamptz not null default now()
);

-- Migra ogni ordine esistente (finora una testata = un prodotto) in una
-- singola riga corrispondente.
insert into ordini_produzione_righe (ordine_produzione_id, prodotto_finito_id, numero_batch, stato, creato_il)
select id, prodotto_finito_id, quantita_richiesta, stato, creato_il from ordini_produzione;

alter table movimenti_materie_prime add column ordine_produzione_riga_id bigint references ordini_produzione_righe (id);
update movimenti_materie_prime m
  set ordine_produzione_riga_id = (select r.id from ordini_produzione_righe r where r.ordine_produzione_id = m.ordine_produzione_id)
  where m.ordine_produzione_id is not null;
alter table movimenti_materie_prime drop column ordine_produzione_id;

alter table lotti_prodotti_finiti add column ordine_produzione_riga_id bigint references ordini_produzione_righe (id);
update lotti_prodotti_finiti l
  set ordine_produzione_riga_id = (select r.id from ordini_produzione_righe r where r.ordine_produzione_id = l.ordine_produzione_id);
alter table lotti_prodotti_finiti alter column ordine_produzione_riga_id set not null;
alter table lotti_prodotti_finiti drop column ordine_produzione_id;

alter table movimenti_prodotti_finiti drop constraint if exists movimenti_prodotti_finiti_check;
alter table movimenti_prodotti_finiti add column ordine_produzione_riga_id bigint references ordini_produzione_righe (id);
update movimenti_prodotti_finiti m
  set ordine_produzione_riga_id = (select r.id from ordini_produzione_righe r where r.ordine_produzione_id = m.ordine_produzione_id)
  where m.ordine_produzione_id is not null;
alter table movimenti_prodotti_finiti drop column ordine_produzione_id;
alter table movimenti_prodotti_finiti add constraint movimenti_prodotti_finiti_check
  check (num_nonnulls(ordine_produzione_riga_id, ordine_vendita_riga_id) <= 1);

-- La testata perde i campi che ora vivono sulla riga.
alter table ordini_produzione drop column prodotto_finito_id;
alter table ordini_produzione drop column quantita_richiesta;
alter table ordini_produzione drop column unita_misura_id;
alter table ordini_produzione drop column stato;

create index on ordini_produzione_righe (ordine_produzione_id);
create index on ordini_produzione_righe (prodotto_finito_id);
create index on movimenti_materie_prime (ordine_produzione_riga_id);
create index on lotti_prodotti_finiti (ordine_produzione_riga_id);
create index on movimenti_prodotti_finiti (ordine_produzione_riga_id);

alter table ordini_produzione_righe enable row level security;
create policy "lettura_autenticati" on ordini_produzione_righe for select using (auth.role() = 'authenticated');
create policy "scrittura_direttore" on ordini_produzione_righe for insert with check (ruolo_utente() = 'direttore');
create policy "modifica_direttore_produzione_confezionamento" on ordini_produzione_righe for update using (ruolo_utente() in ('direttore', 'responsabile_produzione', 'responsabile_confezionamento'));
create policy "eliminazione_direttore" on ordini_produzione_righe for delete using (ruolo_utente() = 'direttore');

create view v_lotti_prodotti_finiti_allergeni as
select distinct lpf.id as lotto_prodotto_finito_id, mpa.allergene_id
from lotti_prodotti_finiti lpf
join movimenti_materie_prime mmp on mmp.ordine_produzione_riga_id = lpf.ordine_produzione_riga_id
join lotti_materie_prime lmp on lmp.id = mmp.lotto_id
join materie_prime_allergeni mpa on mpa.materia_prima_id = lmp.materia_prima_id;

-- "create or replace" non permette di rinominare un parametro esistente:
-- va tolta prima la vecchia versione della funzione.
drop function if exists registra_prelievo_produzione(bigint, jsonb);

create function registra_prelievo_produzione(
  p_ordine_produzione_riga_id bigint,
  p_allocazioni jsonb
) returns void
language plpgsql
as $$
declare
  v_causale_id integer;
  v_riga jsonb;
  v_lotto_id bigint;
begin
  select id into v_causale_id from causali_materie_prime where codice = 'scarico_produzione';

  for v_riga in select * from jsonb_array_elements(p_allocazioni)
  loop
    v_lotto_id := (v_riga ->> 'lotto_id')::bigint;

    insert into movimenti_materie_prime (lotto_id, causale_id, unita_misura_id, quantita_originale, ordine_produzione_riga_id, utente_id)
    values (
      v_lotto_id,
      v_causale_id,
      (select mp.unita_magazzino_id from lotti_materie_prime l join materie_prime mp on mp.id = l.materia_prima_id where l.id = v_lotto_id),
      (v_riga ->> 'quantita')::numeric,
      p_ordine_produzione_riga_id,
      auth.uid()
    );
  end loop;

  update ordini_produzione_righe set stato = 'prelievo_confermato' where id = p_ordine_produzione_riga_id;
end;
$$;

grant execute on function registra_prelievo_produzione(bigint, jsonb) to authenticated;

drop function if exists registra_confezionamento(bigint, text, numeric, date, date);

create function registra_confezionamento(
  p_ordine_produzione_riga_id bigint,
  p_numero_lotto text,
  p_quantita numeric,
  p_data_produzione date,
  p_data_scadenza date
) returns bigint
language plpgsql
as $$
declare
  v_prodotto_finito_id integer;
  v_causale_id integer;
  v_lotto_id bigint;
begin
  select prodotto_finito_id into v_prodotto_finito_id
    from ordini_produzione_righe where id = p_ordine_produzione_riga_id;

  select id into v_causale_id from causali_prodotti_finiti where codice = 'confezionamento';

  insert into lotti_prodotti_finiti (prodotto_finito_id, ordine_produzione_riga_id, numero_lotto, data_produzione, data_scadenza, creato_da)
  values (v_prodotto_finito_id, p_ordine_produzione_riga_id, p_numero_lotto, p_data_produzione, p_data_scadenza, auth.uid())
  returning id into v_lotto_id;

  insert into movimenti_prodotti_finiti (lotto_id, causale_id, quantita, ordine_produzione_riga_id, utente_id)
  values (v_lotto_id, v_causale_id, p_quantita, p_ordine_produzione_riga_id, auth.uid());

  update ordini_produzione_righe set stato = 'completato' where id = p_ordine_produzione_riga_id;

  return v_lotto_id;
end;
$$;

grant execute on function registra_confezionamento(bigint, text, numeric, date, date) to authenticated;
