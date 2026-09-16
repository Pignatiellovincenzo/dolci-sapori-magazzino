-- Sostituisce il modello di conversione per fornitore con un modello piu'
-- semplice a livello di materia prima: fino a due unita' di misura (UM1
-- sempre presente, UM2 facoltativa) legate da un unico fattore, con scelta
-- di quale delle due mostrare in acquisto e quale in magazzino. Se la stessa
-- materia arriva davvero da piu' fornitori con confezioni diverse, si crea
-- una seconda scheda invece di modellare la variabilita' qui.

drop table if exists materie_prime_conversioni cascade;
drop table if exists materie_prime_fornitori cascade;

alter table materie_prime rename column unita_misura_base_id to unita_misura_1_id;
alter table materie_prime add column unita_misura_2_id integer references unita_misura (id);
alter table materie_prime add column fattore_conversione numeric check (fattore_conversione > 0);
alter table materie_prime add column unita_acquisto_id integer references unita_misura (id);
alter table materie_prime add column unita_magazzino_id integer references unita_misura (id);
alter table materie_prime add column fornitore_id integer references fornitori (id);

-- Righe gia' esistenti: nessuna seconda unita', acquisto e magazzino restano
-- quella che gia' avevano.
update materie_prime
  set unita_acquisto_id = unita_misura_1_id, unita_magazzino_id = unita_misura_1_id
  where unita_acquisto_id is null;

alter table materie_prime alter column unita_acquisto_id set not null;
alter table materie_prime alter column unita_magazzino_id set not null;

alter table materie_prime add constraint materie_prime_unita_acquisto_check
  check (unita_acquisto_id in (unita_misura_1_id, unita_misura_2_id));
alter table materie_prime add constraint materie_prime_unita_magazzino_check
  check (unita_magazzino_id in (unita_misura_1_id, unita_misura_2_id));
alter table materie_prime add constraint materie_prime_um2_fattore_check
  check ((unita_misura_2_id is null) = (fattore_conversione is null));

create index on materie_prime (fornitore_id);

-- Trigger dei movimenti: conversione bidirezionale tra UM1/UM2 in base a
-- quale delle due e' l'unita' magazzino.
create or replace function imposta_segno_e_quantita_movimento_materie_prime()
returns trigger
language plpgsql
as $$
declare
  v_um1 integer;
  v_um2 integer;
  v_fattore numeric;
  v_unita_magazzino integer;
begin
  select segno into new.segno from causali_materie_prime where id = new.causale_id;

  select mp.unita_misura_1_id, mp.unita_misura_2_id, mp.fattore_conversione, mp.unita_magazzino_id
    into v_um1, v_um2, v_fattore, v_unita_magazzino
    from lotti_materie_prime l
    join materie_prime mp on mp.id = l.materia_prima_id
    where l.id = new.lotto_id;

  if new.unita_misura_id = v_unita_magazzino then
    new.quantita := new.quantita_originale;
  elsif new.unita_misura_id = v_um1 and v_unita_magazzino = v_um2 then
    new.quantita := new.quantita_originale * v_fattore;
  elsif new.unita_misura_id = v_um2 and v_unita_magazzino = v_um1 then
    new.quantita := new.quantita_originale / v_fattore;
  else
    raise exception 'Unita'' di misura non valida per questa materia prima';
  end if;

  return new;
end;
$$;

create or replace function registra_prelievo_produzione(
  p_ordine_produzione_id bigint,
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

    insert into movimenti_materie_prime (lotto_id, causale_id, unita_misura_id, quantita_originale, ordine_produzione_id, utente_id)
    values (
      v_lotto_id,
      v_causale_id,
      (select mp.unita_magazzino_id from lotti_materie_prime l join materie_prime mp on mp.id = l.materia_prima_id where l.id = v_lotto_id),
      (v_riga ->> 'quantita')::numeric,
      p_ordine_produzione_id,
      auth.uid()
    );
  end loop;

  update ordini_produzione set stato = 'prelievo_confermato' where id = p_ordine_produzione_id;
end;
$$;
