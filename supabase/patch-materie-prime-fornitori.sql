-- Aggiunge: scorta minima (soglia di riordino) su materie_prime, e il
-- collegamento materia prima <-> fornitori abituali (utilizzabile anche
-- senza una conversione definita). Le conversioni ora richiedono che il
-- collegamento fornitore esista gia'.

alter table materie_prime add column scorta_minima numeric not null default 0;

create table materie_prime_fornitori (
  materia_prima_id integer not null references materie_prime (id) on delete cascade,
  fornitore_id integer not null references fornitori (id),
  primary key (materia_prima_id, fornitore_id)
);

create index on materie_prime_fornitori (fornitore_id);

alter table materie_prime_fornitori enable row level security;
create policy "lettura_autenticati" on materie_prime_fornitori for select using (auth.role() = 'authenticated');
create policy "scrittura_direttore" on materie_prime_fornitori for insert with check (ruolo_utente() = 'direttore');
create policy "modifica_direttore" on materie_prime_fornitori for update using (ruolo_utente() = 'direttore');
create policy "eliminazione_direttore" on materie_prime_fornitori for delete using (ruolo_utente() = 'direttore');

-- Popola il collegamento a partire dalle conversioni gia' esistenti (se ce ne
-- sono), cosi' il vincolo che aggiungiamo subito dopo non fallisce.
insert into materie_prime_fornitori (materia_prima_id, fornitore_id)
select distinct materia_prima_id, fornitore_id from materie_prime_conversioni
on conflict do nothing;

alter table materie_prime_conversioni
  add constraint materie_prime_conversioni_link_fkey
  foreign key (materia_prima_id, fornitore_id) references materie_prime_fornitori (materia_prima_id, fornitore_id);
