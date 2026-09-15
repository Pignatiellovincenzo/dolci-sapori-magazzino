-- Schema iniziale — Gestionale Magazzino Dolci Sapori
-- Da eseguire nell'SQL Editor di Supabase (Database > SQL Editor > New query)

create extension if not exists pgcrypto;

-- =========================================================================
-- UTENTI E RUOLI
-- =========================================================================
-- Estende auth.users (gestito da Supabase Auth) con ruolo applicativo.
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
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefono text,
  email text,
  note text
);

create table clienti (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefono text,
  email text,
  note text
);

create table unita_misura (
  id uuid primary key default gen_random_uuid(),
  codice text not null unique, -- es. 'kg', 'l', 'pz', 'cartone', 'pedana'
  nome text not null           -- es. 'Chilogrammo', 'Litro', 'Pezzo', 'Cartone', 'Pedana'
);

-- =========================================================================
-- MATERIE PRIME (magazzino 1)
-- =========================================================================
create table materie_prime (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  unita_misura_base_id uuid not null references unita_misura (id),
  giorni_preavviso_scadenza integer not null default 0,
  note text
);

-- Fattori di conversione specifici per materia prima: quante unita_misura_base
-- equivalgono a 1 unita di questa riga (es. materia="Farina", unita="cartone", fattore=25 => 1 cartone = 25 kg).
create table materie_prime_conversioni (
  id uuid primary key default gen_random_uuid(),
  materia_prima_id uuid not null references materie_prime (id) on delete cascade,
  unita_misura_id uuid not null references unita_misura (id),
  fattore_conversione numeric not null check (fattore_conversione > 0),
  unique (materia_prima_id, unita_misura_id)
);

create table lotti_materie_prime (
  id uuid primary key default gen_random_uuid(),
  materia_prima_id uuid not null references materie_prime (id),
  fornitore_id uuid not null references fornitori (id),
  numero_lotto text not null,
  quantita numeric not null check (quantita >= 0), -- espressa in unita_misura_base della materia prima
  data_arrivo date not null default current_date,
  data_scadenza date,
  creato_il timestamptz not null default now()
);

-- =========================================================================
-- PRODOTTI FINITI (magazzino 2 / cella di stoccaggio)
-- =========================================================================
create table prodotti_finiti (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  unita_misura_base_id uuid not null references unita_misura (id),
  giorni_preavviso_scadenza integer not null default 0,
  note text
);

create table prodotti_finiti_conversioni (
  id uuid primary key default gen_random_uuid(),
  prodotto_finito_id uuid not null references prodotti_finiti (id) on delete cascade,
  unita_misura_id uuid not null references unita_misura (id),
  fattore_conversione numeric not null check (fattore_conversione > 0),
  unique (prodotto_finito_id, unita_misura_id)
);

-- =========================================================================
-- RICETTE (fisse per prodotto, nessuno storico versioni)
-- =========================================================================
create table ricette (
  id uuid primary key default gen_random_uuid(),
  prodotto_finito_id uuid not null unique references prodotti_finiti (id),
  resa_quantita numeric not null check (resa_quantita > 0), -- quanto prodotto finito produce 1 batch
  resa_unita_misura_id uuid not null references unita_misura (id),
  note text
);

create table ricette_ingredienti (
  id uuid primary key default gen_random_uuid(),
  ricetta_id uuid not null references ricette (id) on delete cascade,
  materia_prima_id uuid not null references materie_prime (id),
  quantita numeric not null check (quantita > 0), -- quantita necessaria per 1 batch
  unita_misura_id uuid not null references unita_misura (id),
  unique (ricetta_id, materia_prima_id)
);

-- =========================================================================
-- FLUSSO PRODUZIONE
-- =========================================================================
-- NB: unita_misura_id qui resta generico (kg, pezzi, batch...) perche' non e'
-- ancora stato deciso in che unita il direttore esprime la quantita richiesta
-- (vedi "Punti da Chiarire" nel foglio Drive).
create table ordini_produzione (
  id uuid primary key default gen_random_uuid(),
  prodotto_finito_id uuid not null references prodotti_finiti (id),
  quantita_richiesta numeric not null check (quantita_richiesta > 0),
  unita_misura_id uuid not null references unita_misura (id),
  stato text not null default 'assegnato'
    check (stato in ('assegnato', 'prelievo_confermato', 'completato', 'annullato')),
  creato_da uuid not null references utenti (id),
  creato_il timestamptz not null default now(),
  note text
);

-- Allocazione dei lotti materie prime proposta in FEFO e confermata/modificata
-- dal responsabile produzione.
create table ordini_produzione_prelievi (
  id uuid primary key default gen_random_uuid(),
  ordine_produzione_id uuid not null references ordini_produzione (id) on delete cascade,
  lotto_materia_prima_id uuid not null references lotti_materie_prime (id),
  quantita_prelevata numeric not null check (quantita_prelevata > 0),
  confermato_da uuid not null references utenti (id),
  confermato_il timestamptz not null default now()
);

-- Lotto di prodotto finito creato dal responsabile confezionamento a valle
-- della produzione (collegato all'ordine di produzione che lo ha generato).
create table lotti_prodotti_finiti (
  id uuid primary key default gen_random_uuid(),
  prodotto_finito_id uuid not null references prodotti_finiti (id),
  ordine_produzione_id uuid references ordini_produzione (id),
  numero_lotto text not null, -- assegnato manualmente dal responsabile confezionamento
  quantita numeric not null check (quantita >= 0), -- espressa in unita_misura_base del prodotto
  data_produzione date not null default current_date,
  data_scadenza date,
  creato_il timestamptz not null default now()
);

-- =========================================================================
-- FLUSSO ORDINI DI VENDITA
-- =========================================================================
create table ordini_vendita (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clienti (id),
  stato text not null default 'bozza'
    check (stato in ('bozza', 'confermato', 'evaso', 'annullato')),
  creato_da uuid not null references utenti (id),
  creato_il timestamptz not null default now(),
  note text
);

create table ordini_vendita_righe (
  id uuid primary key default gen_random_uuid(),
  ordine_vendita_id uuid not null references ordini_vendita (id) on delete cascade,
  prodotto_finito_id uuid not null references prodotti_finiti (id),
  quantita_richiesta numeric not null check (quantita_richiesta > 0),
  unita_misura_id uuid not null references unita_misura (id)
);

-- Allocazione dei lotti prodotto finito proposta in FEFO e confermata/modificata
-- dal direttore.
create table ordini_vendita_allocazioni (
  id uuid primary key default gen_random_uuid(),
  ordine_vendita_riga_id uuid not null references ordini_vendita_righe (id) on delete cascade,
  lotto_prodotto_finito_id uuid not null references lotti_prodotti_finiti (id),
  quantita_allocata numeric not null check (quantita_allocata > 0),
  confermato_da uuid not null references utenti (id),
  confermato_il timestamptz not null default now()
);
