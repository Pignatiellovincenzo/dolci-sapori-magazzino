-- Schema — Gestionale Magazzino Dolci & Sapori (v2)
-- Sostituisce integralmente la v1: giacenza calcolata da un registro
-- movimenti append-only (mai UPDATE/DELETE), stato del lotto, allergeni per
-- esplosione da distinta base, chiavi intere (tranne "utenti", legata a
-- Supabase Auth). La ricetta e' fissa e unica per prodotto: la tracciabilita'
-- storica dei lotti passa dal registro movimenti, non dalla ricetta.
--
-- Da eseguire nell'SQL Editor di Supabase su un progetto vuoto (o dopo
-- aver eseguito reset.sql per ripulire la v1).

create type stato_lotto as enum ('disponibile', 'quarantena', 'bloccato', 'scaduto', 'esaurito');

-- =========================================================================
-- UTENTI E RUOLI (id = auth.users.id, resta uuid per costruzione)
-- =========================================================================
create table utenti (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  ruolo text not null check (ruolo in ('direttore', 'responsabile_produzione', 'responsabile_confezionamento')),
  creato_il timestamptz not null default now()
);

-- =========================================================================
-- ANAGRAFICHE BASE
-- =========================================================================
create table fornitori (
  id integer generated always as identity primary key,
  nome text not null,
  telefono text,
  email text,
  note text,
  attivo boolean not null default true -- disattivabile invece di eliminabile, se ha gia' storico collegato
);

create table clienti (
  id integer generated always as identity primary key,
  nome text not null,
  telefono text,
  email text,
  note text,
  attivo boolean not null default true
);

create table unita_misura (
  id integer generated always as identity primary key,
  codice text not null unique,
  nome text not null
);

-- =========================================================================
-- MATERIE PRIME
-- =========================================================================
-- Ogni materia prima si esprime in una o due unita' di misura (UM1 sempre
-- presente, UM2 facoltativa) legate da un unico fattore di conversione
-- (1 UM1 = fattore_conversione UM2). Non dipende dal fornitore: se la stessa
-- materia prima arriva davvero da piu' fornitori con confezioni diverse, se
-- ne crea una seconda scheda invece di modellare la variabilita' qui.
-- unita_acquisto/unita_magazzino scelgono, tra le due, quale mostrare di
-- default in fase di carico e quale per la giacenza; l'altra resta
-- comunque utilizzabile (tipicamente nelle ricette, per la precisione).
create table materie_prime (
  id integer generated always as identity primary key,
  nome text not null,
  unita_misura_1_id integer not null references unita_misura (id),
  unita_misura_2_id integer references unita_misura (id),
  fattore_conversione numeric check (fattore_conversione > 0), -- 1 unita_misura_1 = fattore_conversione unita_misura_2
  unita_acquisto_id integer not null references unita_misura (id),
  unita_magazzino_id integer not null references unita_misura (id),
  fornitore_id integer references fornitori (id),
  giorni_preavviso_scadenza integer not null default 0,
  scorta_minima numeric not null default 0, -- soglia di riordino, nell'unita' magazzino
  note text,
  attivo boolean not null default true,
  check (unita_acquisto_id in (unita_misura_1_id, unita_misura_2_id)),
  check (unita_magazzino_id in (unita_misura_1_id, unita_misura_2_id)),
  check ((unita_misura_2_id is null) = (fattore_conversione is null))
);

-- =========================================================================
-- PRODOTTI FINITI
-- =========================================================================
-- Ricetta fissa e unica per prodotto (resa + ingredienti sotto): non e'
-- versionata. La tracciabilita' storica di un lotto gia' prodotto non passa
-- dalla ricetta ma dai movimenti materie prime realmente registrati per
-- l'ordine di produzione che lo ha generato (vedi
-- v_lotti_prodotti_finiti_allergeni in fondo al file) — quindi modificare la
-- ricetta oggi non altera la tracciabilita' di quanto gia' prodotto.
create table prodotti_finiti (
  id integer generated always as identity primary key,
  codice text,
  nome text not null,
  unita_misura_base_id integer not null references unita_misura (id),
  resa_quantita numeric check (resa_quantita > 0), -- quanto prodotto finito produce 1 batch della ricetta
  resa_unita_misura_id integer references unita_misura (id),
  giorni_preavviso_scadenza integer not null default 0,
  note text,
  attivo boolean not null default true,
  check ((resa_quantita is null) = (resa_unita_misura_id is null))
);

create table prodotti_finiti_conversioni (
  id integer generated always as identity primary key,
  prodotto_finito_id integer not null references prodotti_finiti (id) on delete cascade,
  unita_misura_id integer not null references unita_misura (id),
  fattore_conversione numeric not null check (fattore_conversione > 0),
  unique (prodotto_finito_id, unita_misura_id)
);

-- =========================================================================
-- ALLERGENI (Reg. UE 1169/2011) — assegnati alle materie prime, MAI digitati
-- sul prodotto finito: si calcolano per esplosione dalla ricetta (viste in
-- fondo al file).
-- =========================================================================
create table allergeni (
  id integer generated always as identity primary key,
  codice text not null unique,
  nome text not null
);

create table materie_prime_allergeni (
  materia_prima_id integer not null references materie_prime (id) on delete cascade,
  allergene_id integer not null references allergeni (id),
  primary key (materia_prima_id, allergene_id)
);

-- =========================================================================
-- RICETTA — ingredienti del prodotto (una sola ricetta per prodotto, vedi
-- commento su prodotti_finiti).
-- =========================================================================
create table ricette_ingredienti (
  id integer generated always as identity primary key,
  prodotto_finito_id integer not null references prodotti_finiti (id) on delete cascade,
  materia_prima_id integer not null references materie_prime (id),
  quantita numeric not null check (quantita > 0), -- quantita per 1 batch
  unita_misura_id integer not null references unita_misura (id),
  unique (prodotto_finito_id, materia_prima_id)
);

-- =========================================================================
-- FLUSSO PRODUZIONE — una testata puo' avere piu' righe (piu' linee di
-- produzione lo stesso giorno, un prodotto per riga). Ogni riga ha il suo
-- ciclo di vita indipendente: la testata e' solo un raggruppamento.
-- =========================================================================
create table ordini_produzione (
  id bigint generated always as identity primary key,
  creato_da uuid not null references utenti (id),
  creato_il timestamptz not null default now(),
  note text
);

create table ordini_produzione_righe (
  id bigint generated always as identity primary key,
  ordine_produzione_id bigint not null references ordini_produzione (id) on delete cascade,
  prodotto_finito_id integer not null references prodotti_finiti (id),
  numero_batch numeric not null check (numero_batch > 0), -- quantita' = numero di batch della ricetta
  stato text not null default 'assegnato'
    check (stato in ('assegnato', 'prelievo_confermato', 'completato', 'annullato')),
  creato_il timestamptz not null default now()
);

-- =========================================================================
-- MAGAZZINO MATERIE PRIME: lotti (identita' e stato) + movimenti (fatti)
-- =========================================================================
create table lotti_materie_prime (
  id bigint generated always as identity primary key,
  materia_prima_id integer not null references materie_prime (id),
  fornitore_id integer not null references fornitori (id),
  numero_lotto text not null,
  data_arrivo date not null default current_date,
  data_scadenza date,
  stato stato_lotto not null default 'disponibile',
  creato_da uuid not null references utenti (id),
  creato_il timestamptz not null default now(),
  unique (materia_prima_id, numero_lotto)
);

create table causali_materie_prime (
  id integer generated always as identity primary key,
  codice text not null unique,
  descrizione text not null,
  segno smallint not null check (segno in (-1, 1))
);

insert into causali_materie_prime (codice, descrizione, segno) values
  ('carico_fornitore', 'Arrivo materia prima da fornitore', 1),
  ('scarico_produzione', 'Prelievo per produzione', -1),
  ('rettifica_positiva', 'Rettifica inventariale in aumento', 1),
  ('rettifica_negativa', 'Rettifica inventariale in diminuzione', -1),
  ('scarto', 'Scarto/rottura', -1),
  ('reso_a_fornitore', 'Reso al fornitore', -1),
  ('distruzione_scaduto', 'Distruzione per scadenza', -1);

-- Registro movimenti: append-only, mai UPDATE ne' DELETE (vedi policies.sql:
-- nessuna policy di update/delete = bloccato a livello di database).
-- La giacenza NON e' un campo: e' la vista v_giacenza_materie_prime in fondo
-- al file, sempre espressa nell'unita' magazzino della materia prima.
create table movimenti_materie_prime (
  id bigint generated always as identity primary key,
  lotto_id bigint not null references lotti_materie_prime (id),
  causale_id integer not null references causali_materie_prime (id),
  unita_misura_id integer not null references unita_misura (id), -- unita' in cui e' stata inserita la quantita' (UM1 o UM2 della materia)
  quantita_originale numeric not null check (quantita_originale > 0), -- quantita' cosi' come inserita
  quantita numeric not null check (quantita > 0), -- calcolata dal trigger: quantita_originale nell'unita' magazzino
  segno smallint not null check (segno in (-1, 1)), -- impostato automaticamente da un trigger in base alla causale
  ordine_produzione_riga_id bigint references ordini_produzione_righe (id), -- valorizzato solo per scarico_produzione
  utente_id uuid not null references utenti (id),
  data_movimento timestamptz not null default now(),
  note text
);

-- La conversione da quantita' inserita a quantita' in unita' magazzino non e'
-- mai delegata al frontend: la materia prima ha al massimo due unita' (UM1,
-- UM2) legate da un fattore unico, e va convertita nella direzione giusta a
-- seconda di quale delle due e' l'unita' inserita.
create or replace function imposta_segno_e_quantita_movimento_materie_prime()
returns trigger
language plpgsql
as $$
declare
  v_um1 integer;
  v_um2 integer;
  v_fattore numeric; -- 1 UM1 = v_fattore UM2
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

create trigger trg_segno_e_quantita_movimenti_materie_prime
before insert on movimenti_materie_prime
for each row execute function imposta_segno_e_quantita_movimento_materie_prime();

-- =========================================================================
-- MAGAZZINO PRODOTTI FINITI: lotti + movimenti
-- =========================================================================
create table lotti_prodotti_finiti (
  id bigint generated always as identity primary key,
  prodotto_finito_id integer not null references prodotti_finiti (id),
  ordine_produzione_riga_id bigint not null references ordini_produzione_righe (id),
  numero_lotto text not null, -- assegnato manualmente dal responsabile confezionamento
  data_produzione date not null default current_date,
  data_scadenza date,
  stato stato_lotto not null default 'disponibile',
  creato_da uuid not null references utenti (id),
  creato_il timestamptz not null default now(),
  unique (prodotto_finito_id, numero_lotto)
);

-- =========================================================================
-- FLUSSO ORDINI DI VENDITA
-- =========================================================================
create table ordini_vendita (
  id bigint generated always as identity primary key,
  cliente_id integer not null references clienti (id),
  stato text not null default 'bozza'
    check (stato in ('bozza', 'confermato', 'evaso', 'annullato')),
  creato_da uuid not null references utenti (id),
  creato_il timestamptz not null default now(),
  note text
);

create table ordini_vendita_righe (
  id bigint generated always as identity primary key,
  ordine_vendita_id bigint not null references ordini_vendita (id) on delete cascade,
  prodotto_finito_id integer not null references prodotti_finiti (id),
  quantita_richiesta numeric not null check (quantita_richiesta > 0),
  unita_misura_id integer not null references unita_misura (id)
);

create table causali_prodotti_finiti (
  id integer generated always as identity primary key,
  codice text not null unique,
  descrizione text not null,
  segno smallint not null check (segno in (-1, 1))
);

insert into causali_prodotti_finiti (codice, descrizione, segno) values
  ('confezionamento', 'Prodotto confezionato in uscita da produzione', 1),
  ('scarico_vendita', 'Prelievo per evasione ordine cliente', -1),
  ('rettifica_positiva', 'Rettifica inventariale in aumento', 1),
  ('rettifica_negativa', 'Rettifica inventariale in diminuzione', -1),
  ('reso_cliente', 'Reso da cliente', 1),
  ('scarto', 'Scarto/rottura', -1),
  ('distruzione_scaduto', 'Distruzione per scadenza', -1);

create table movimenti_prodotti_finiti (
  id bigint generated always as identity primary key,
  lotto_id bigint not null references lotti_prodotti_finiti (id),
  causale_id integer not null references causali_prodotti_finiti (id),
  quantita numeric not null check (quantita > 0),
  segno smallint not null check (segno in (-1, 1)), -- impostato automaticamente da un trigger
  ordine_produzione_riga_id bigint references ordini_produzione_righe (id), -- valorizzato solo per confezionamento
  ordine_vendita_riga_id bigint references ordini_vendita_righe (id), -- valorizzato solo per scarico_vendita
  utente_id uuid not null references utenti (id),
  data_movimento timestamptz not null default now(),
  note text,
  check (num_nonnulls(ordine_produzione_riga_id, ordine_vendita_riga_id) <= 1)
);

create or replace function imposta_segno_movimento_prodotti_finiti()
returns trigger
language plpgsql
as $$
begin
  select segno into new.segno from causali_prodotti_finiti where id = new.causale_id;
  return new;
end;
$$;

create trigger trg_segno_movimenti_prodotti_finiti
before insert on movimenti_prodotti_finiti
for each row execute function imposta_segno_movimento_prodotti_finiti();

-- =========================================================================
-- INDICI — Postgres non crea indici sulle colonne di chiave esterna
-- =========================================================================
create index on lotti_materie_prime (materia_prima_id);
create index on lotti_materie_prime (fornitore_id);
create index on ricette_ingredienti (materia_prima_id);
create index on ordini_produzione (creato_da);
create index on ordini_produzione_righe (ordine_produzione_id);
create index on ordini_produzione_righe (prodotto_finito_id);
create index on movimenti_materie_prime (lotto_id, data_movimento);
create index on movimenti_materie_prime (causale_id);
create index on movimenti_materie_prime (ordine_produzione_riga_id);
create index on movimenti_materie_prime (utente_id);
create index on movimenti_materie_prime (unita_misura_id);
create index on materie_prime (fornitore_id);
create index on lotti_prodotti_finiti (prodotto_finito_id);
create index on lotti_prodotti_finiti (ordine_produzione_riga_id);
create index on ordini_vendita (cliente_id);
create index on ordini_vendita (creato_da);
create index on ordini_vendita_righe (ordine_vendita_id);
create index on ordini_vendita_righe (prodotto_finito_id);
create index on movimenti_prodotti_finiti (lotto_id, data_movimento);
create index on movimenti_prodotti_finiti (causale_id);
create index on movimenti_prodotti_finiti (ordine_produzione_riga_id);
create index on movimenti_prodotti_finiti (ordine_vendita_riga_id);
create index on movimenti_prodotti_finiti (utente_id);

-- =========================================================================
-- VISTE — la giacenza e' sempre calcolata, mai un campo
-- =========================================================================
create view v_giacenza_materie_prime as
select lotto_id, sum(quantita * segno) as giacenza
from movimenti_materie_prime
group by lotto_id
having sum(quantita * segno) <> 0;

create view v_giacenza_prodotti_finiti as
select lotto_id, sum(quantita * segno) as giacenza
from movimenti_prodotti_finiti
group by lotto_id
having sum(quantita * segno) <> 0;

-- Allergeni della ricetta attuale (anteprima per un prodotto non ancora
-- prodotto, o in generale "cosa contiene oggi questo prodotto").
create view v_prodotti_finiti_allergeni as
select distinct ri.prodotto_finito_id, mpa.allergene_id
from ricette_ingredienti ri
join materie_prime_allergeni mpa on mpa.materia_prima_id = ri.materia_prima_id;

-- Allergeni storici REALI di uno specifico lotto di prodotto finito: non
-- derivano dalla ricetta (che puo' essere cambiata nel frattempo), ma dai
-- movimenti di materie prime effettivamente registrati per l'ordine di
-- produzione che ha generato quel lotto. Questo e' cio' che rende sicura la
-- ricetta non versionata: la tracciabilita' vera vive nel registro
-- movimenti, immutabile per costruzione.
create view v_lotti_prodotti_finiti_allergeni as
select distinct lpf.id as lotto_prodotto_finito_id, mpa.allergene_id
from lotti_prodotti_finiti lpf
join movimenti_materie_prime mmp on mmp.ordine_produzione_riga_id = lpf.ordine_produzione_riga_id
join lotti_materie_prime lmp on lmp.id = mmp.lotto_id
join materie_prime_allergeni mpa on mpa.materia_prima_id = lmp.materia_prima_id;

-- =========================================================================
-- OPERAZIONI ATOMICHE — piu' tabelle insieme in una sola transazione, cosi'
-- il frontend non puo' lasciare a meta' un'operazione (es. un lotto creato
-- senza il movimento che lo riguarda). Girano con i permessi di chi le
-- chiama: le policy RLS restano valide.
-- =========================================================================
create or replace function registra_prelievo_produzione(
  p_ordine_produzione_riga_id bigint,
  p_allocazioni jsonb -- array di oggetti {"lotto_id": ..., "quantita": ...}
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

create or replace function registra_confezionamento(
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

create or replace function registra_allocazione_vendita(
  p_ordine_vendita_id bigint,
  p_allocazioni jsonb -- array di {"ordine_vendita_riga_id":..., "lotto_id":..., "quantita":...}
) returns void
language plpgsql
as $$
declare
  v_causale_id integer;
  v_riga jsonb;
begin
  select id into v_causale_id from causali_prodotti_finiti where codice = 'scarico_vendita';

  for v_riga in select * from jsonb_array_elements(p_allocazioni)
  loop
    insert into movimenti_prodotti_finiti (lotto_id, causale_id, quantita, ordine_vendita_riga_id, utente_id)
    values (
      (v_riga ->> 'lotto_id')::bigint,
      v_causale_id,
      (v_riga ->> 'quantita')::numeric,
      (v_riga ->> 'ordine_vendita_riga_id')::bigint,
      auth.uid()
    );
  end loop;

  update ordini_vendita set stato = 'confermato' where id = p_ordine_vendita_id;
end;
$$;

grant execute on function registra_allocazione_vendita(bigint, jsonb) to authenticated;
