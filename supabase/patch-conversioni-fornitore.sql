-- Aggiornamento: le conversioni di unita' di misura dipendono da materia
-- prima + fornitore (non solo dalla materia prima), e la quantita' in unita'
-- base dei movimenti viene sempre calcolata dal database, mai dal frontend.
-- Le due tabelle coinvolte sono ancora vuote: nessun dato reale da migrare.

drop table if exists materie_prime_conversioni cascade;

create table materie_prime_conversioni (
  id integer generated always as identity primary key,
  materia_prima_id integer not null references materie_prime (id) on delete cascade,
  fornitore_id integer not null references fornitori (id),
  unita_misura_id integer not null references unita_misura (id),
  fattore_conversione numeric not null check (fattore_conversione > 0),
  predefinita_per_acquisto boolean not null default false,
  unique (materia_prima_id, fornitore_id, unita_misura_id)
);

create unique index materie_prime_conversioni_una_predefinita
  on materie_prime_conversioni (materia_prima_id, fornitore_id)
  where predefinita_per_acquisto = true;

create index on materie_prime_conversioni (fornitore_id);

-- La tabella è stata ricreata: le policy RLS di prima sono andate perse
-- insieme ad essa, vanno riattivate.
alter table materie_prime_conversioni enable row level security;
create policy "lettura_autenticati" on materie_prime_conversioni for select using (auth.role() = 'authenticated');
create policy "scrittura_direttore" on materie_prime_conversioni for insert with check (ruolo_utente() = 'direttore');
create policy "modifica_direttore" on materie_prime_conversioni for update using (ruolo_utente() = 'direttore');
create policy "eliminazione_direttore" on materie_prime_conversioni for delete using (ruolo_utente() = 'direttore');

drop trigger if exists trg_segno_movimenti_materie_prime on movimenti_materie_prime;
drop function if exists imposta_segno_movimento_materie_prime();

alter table movimenti_materie_prime add column unita_misura_id integer references unita_misura (id);
alter table movimenti_materie_prime add column quantita_originale numeric check (quantita_originale > 0);
-- (Tabella vuota: nessuna riga da valorizzare prima di rendere le colonne obbligatorie.)
alter table movimenti_materie_prime alter column unita_misura_id set not null;
alter table movimenti_materie_prime alter column quantita_originale set not null;

create or replace function imposta_segno_e_quantita_movimento_materie_prime()
returns trigger
language plpgsql
as $$
declare
  v_materia_prima_id integer;
  v_fornitore_id integer;
  v_unita_base_id integer;
  v_fattore numeric;
begin
  select segno into new.segno from causali_materie_prime where id = new.causale_id;

  select l.materia_prima_id, l.fornitore_id, mp.unita_misura_base_id
    into v_materia_prima_id, v_fornitore_id, v_unita_base_id
    from lotti_materie_prime l
    join materie_prime mp on mp.id = l.materia_prima_id
    where l.id = new.lotto_id;

  if new.unita_misura_id = v_unita_base_id then
    new.quantita := new.quantita_originale;
  else
    select fattore_conversione into v_fattore
      from materie_prime_conversioni
      where materia_prima_id = v_materia_prima_id
        and fornitore_id = v_fornitore_id
        and unita_misura_id = new.unita_misura_id;

    if v_fattore is null then
      raise exception 'Nessuna conversione definita per questa materia prima, questo fornitore e questa unita'' di misura';
    end if;

    new.quantita := new.quantita_originale * v_fattore;
  end if;

  return new;
end;
$$;

create trigger trg_segno_e_quantita_movimenti_materie_prime
before insert on movimenti_materie_prime
for each row execute function imposta_segno_e_quantita_movimento_materie_prime();

create index on movimenti_materie_prime (unita_misura_id);
