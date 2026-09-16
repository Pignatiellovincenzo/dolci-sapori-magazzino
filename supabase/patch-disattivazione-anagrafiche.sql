-- Aggiunge la possibilita' di disattivare un'anagrafica invece di doverla
-- eliminare per forza quando ha gia' storico collegato (lotti, ricette,
-- ordini...). Le liste a tendina per le nuove operazioni mostrano solo gli
-- elementi attivi; quelle gia' esistenti restano leggibili comunque.

alter table fornitori add column attivo boolean not null default true;
alter table clienti add column attivo boolean not null default true;
alter table materie_prime add column attivo boolean not null default true;
alter table prodotti_finiti add column attivo boolean not null default true;
