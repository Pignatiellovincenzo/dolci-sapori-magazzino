-- Schema — Gestionale Magazzino Dolci & Sapori (v2)
-- Sostituisce integralmente la v1: giacenza calcolata da un registro
-- movimenti append-only (mai UPDATE/DELETE), stato del lotto, ricette
-- versionate, allergeni per esplosione da distinta base, chiavi intere
-- (tranne "utenti", legata a Supabase Auth).
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
  note text
);

create table clienti (
  id integer generated always as identity primary key,
  nome text not null,
  telefono text,
  email text,
  note text
);

create table unita_misura (
  id integer generated always as identity primary key,
  codice text not null unique,
  nome text not null
);

-- =========================================================================
-- MATERIE PRIME
-- =========================================================================
create table materie_prime (
  id integer generated always as identity primary key,
  nome text not null,
  unita_misura_base_id integer not null references unita_misura (id),
  giorni_preavviso_scadenza integer not null default 0,
  note text
);

create table materie_prime_conversioni (
  id integer generated always as identity primary key,
  materia_prima_id integer not null references materie_prime (id) on delete cascade,
  unita_misura_id integer not null references unita_misura (id),
  fattore_conversione numeric not null check (fattore_conversione > 0),
  unique (materia_prima_id, unita_misura_id)
);

-- =========================================================================
-- PRODOTTI FINITI
-- =========================================================================
create table prodotti_finiti (
  id integer generated always as identity primary key,
  nome text not null,
  unita_misura_base_id integer not null references unita_misura (id),
  giorni_preavviso_scadenza integer not null default 0,
  note text
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
-- RICETTE — versionate: una nuova versione non riscrive la storia dei lotti
-- gia' prodotti con la versione precedente.
-- =========================================================================
create table ricette (
  id integer generated always as identity primary key,
  prodotto_finito_id integer not null references prodotti_finiti (id),
  versione integer not null,
  resa_quantita numeric not null check (resa_quantita > 0), -- quanto prodotto finito produce 1 batch
  resa_unita_misura_id integer not null references unita_misura (id),
  valido_da date not null default current_date,
  valido_a date, -- null = versione attualmente in uso
  note text,
  unique (prodotto_finito_id, versione)
);

-- Al massimo una versione "attiva" (valido_a is null) per prodotto.
create unique index ricette_una_attiva_per_prodotto on ricette (prodotto_finito_id) where valido_a is null;

create table ricette_ingredienti (
  id integer generated always as identity primary key,
  ricetta_id integer not null references ricette (id) on delete cascade,
  materia_prima_id integer not null references materie_prime (id),
  quantita numeric not null check (quantita > 0), -- quantita per 1 batch
  unita_misura_id integer not null references unita_misura (id),
  unique (ricetta_id, materia_prima_id)
);

-- =========================================================================
-- FLUSSO PRODUZIONE
-- =========================================================================
-- NB: unita_misura_id resta generico (kg, pezzi, batch...) perche' non e'
-- ancora stato deciso in che unita il direttore esprime la quantita
-- richiesta (vedi "Punti da Chiarire" su Drive).
create table ordini_produzione (
  id bigint generated always as identity primary key,
  prodotto_finito_id integer not null references prodotti_finiti (id),
  ricetta_id integer not null references ricette (id), -- versione della ricetta attiva al momento dell'ordine
  quantita_richiesta numeric not null check (quantita_richiesta > 0),
  unita_misura_id integer not null references unita_misura (id),
  stato text not null default 'assegnato'
    check (stato in ('assegnato', 'prelievo_confermato', 'completato', 'annullato')),
  creato_da uuid not null references utenti (id),
  creato_il timestamptz not null default now(),
  note text
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
-- al file.
create table movimenti_materie_prime (
  id bigint generated always as identity primary key,
  lotto_id bigint not null references lotti_materie_prime (id),
  causale_id integer not null references causali_materie_prime (id),
  quantita numeric not null check (quantita > 0), -- sempre positiva, il verso lo da' "segno"
  segno smallint not null check (segno in (-1, 1)), -- impostato automaticamente da un trigger in base alla causale
  ordine_produzione_id bigint references ordini_produzione (id), -- valorizzato solo per scarico_produzione
  utente_id uuid not null references utenti (id),
  data_movimento timestamptz not null default now(),
  note text
);

create or replace function imposta_segno_movimento_materie_prime()
returns trigger
language plpgsql
as $$
begin
  select segno into new.segno from causali_materie_prime where id = new.causale_id;
  return new;
end;
$$;

create trigger trg_segno_movimenti_materie_prime
before insert on movimenti_materie_prime
for each row execute function imposta_segno_movimento_materie_prime();

-- =========================================================================
-- MAGAZZINO PRODOTTI FINITI: lotti + movimenti
-- =========================================================================
create table lotti_prodotti_finiti (
  id bigint generated always as identity primary key,
  prodotto_finito_id integer not null references prodotti_finiti (id),
  ordine_produzione_id bigint not null references ordini_produzione (id),
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
  ordine_produzione_id bigint references ordini_produzione (id), -- valorizzato solo per confezionamento
  ordine_vendita_riga_id bigint references ordini_vendita_righe (id), -- valorizzato solo per scarico_vendita
  utente_id uuid not null references utenti (id),
  data_movimento timestamptz not null default now(),
  note text,
  check (num_nonnulls(ordine_produzione_id, ordine_vendita_riga_id) <= 1)
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
create index on ricette (prodotto_finito_id);
create index on ricette_ingredienti (materia_prima_id);
create index on ordini_produzione (prodotto_finito_id);
create index on ordini_produzione (ricetta_id);
create index on ordini_produzione (creato_da);
create index on movimenti_materie_prime (lotto_id, data_movimento);
create index on movimenti_materie_prime (causale_id);
create index on movimenti_materie_prime (ordine_produzione_id);
create index on movimenti_materie_prime (utente_id);
create index on lotti_prodotti_finiti (prodotto_finito_id);
create index on lotti_prodotti_finiti (ordine_produzione_id);
create index on ordini_vendita (cliente_id);
create index on ordini_vendita (creato_da);
create index on ordini_vendita_righe (ordine_vendita_id);
create index on ordini_vendita_righe (prodotto_finito_id);
create index on movimenti_prodotti_finiti (lotto_id, data_movimento);
create index on movimenti_prodotti_finiti (causale_id);
create index on movimenti_prodotti_finiti (ordine_produzione_id);
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

-- Allergeni correnti per prodotto (ricetta attualmente in uso).
create view v_prodotti_finiti_allergeni as
select distinct r.prodotto_finito_id, mpa.allergene_id
from ricette r
join ricette_ingredienti ri on ri.ricetta_id = r.id
join materie_prime_allergeni mpa on mpa.materia_prima_id = ri.materia_prima_id
where r.valido_a is null;

-- Allergeni storici per uno specifico lotto di prodotto finito, in base alla
-- versione di ricetta usata realmente per produrlo (non quella attuale).
create view v_lotti_prodotti_finiti_allergeni as
select distinct lpf.id as lotto_prodotto_finito_id, mpa.allergene_id
from lotti_prodotti_finiti lpf
join ordini_produzione op on op.id = lpf.ordine_produzione_id
join ricette_ingredienti ri on ri.ricetta_id = op.ricetta_id
join materie_prime_allergeni mpa on mpa.materia_prima_id = ri.materia_prima_id;
