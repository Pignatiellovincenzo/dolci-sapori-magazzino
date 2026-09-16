-- Toglie il versionamento delle ricette: una ricetta sola per prodotto,
-- creata/modificata nella stessa schermata del prodotto. La tracciabilita'
-- storica di un lotto non dipende piu' dalla ricetta ma dai movimenti
-- materie prime realmente registrati per il suo ordine di produzione (vedi
-- la nuova v_lotti_prodotti_finiti_allergeni), quindi modificare la ricetta
-- in futuro resta sicuro anche senza versioni.

-- Le viste dipendono da "ricette" e dalla vecchia colonna ricetta_id: vanno
-- tolte prima di modificare le tabelle sotto.
drop view if exists v_lotti_prodotti_finiti_allergeni;
drop view if exists v_prodotti_finiti_allergeni;

-- ricette_ingredienti: da "per versione di ricetta" a "per prodotto".
alter table ricette_ingredienti add column prodotto_finito_id integer;

update ricette_ingredienti ri
  set prodotto_finito_id = r.prodotto_finito_id
  from ricette r
  where r.id = ri.ricetta_id and r.valido_a is null;

-- Righe di versioni gia' superate (non piu' attive): non servono piu'.
delete from ricette_ingredienti where prodotto_finito_id is null;

alter table ricette_ingredienti alter column prodotto_finito_id set not null;
alter table ricette_ingredienti drop column ricetta_id;
alter table ricette_ingredienti add constraint ricette_ingredienti_prodotto_finito_id_fkey
  foreign key (prodotto_finito_id) references prodotti_finiti (id) on delete cascade;
alter table ricette_ingredienti add constraint ricette_ingredienti_prodotto_materia_key
  unique (prodotto_finito_id, materia_prima_id);

-- prodotti_finiti: codice prodotto + resa (ex campi della ricetta).
alter table prodotti_finiti add column codice text;
alter table prodotti_finiti add column resa_quantita numeric check (resa_quantita > 0);
alter table prodotti_finiti add column resa_unita_misura_id integer references unita_misura (id);

update prodotti_finiti pf
  set resa_quantita = r.resa_quantita, resa_unita_misura_id = r.resa_unita_misura_id
  from ricette r
  where r.prodotto_finito_id = pf.id and r.valido_a is null;

alter table prodotti_finiti add constraint prodotti_finiti_resa_check
  check ((resa_quantita is null) = (resa_unita_misura_id is null));

-- ordini_produzione non ha piu' bisogno di puntare a una versione di ricetta.
alter table ordini_produzione drop column ricetta_id;

drop table ricette cascade;

create index on ricette_ingredienti (materia_prima_id);

-- Allergeni della ricetta attuale (anteprima).
create view v_prodotti_finiti_allergeni as
select distinct ri.prodotto_finito_id, mpa.allergene_id
from ricette_ingredienti ri
join materie_prime_allergeni mpa on mpa.materia_prima_id = ri.materia_prima_id;

-- Allergeni storici REALI di un lotto: dai movimenti effettivamente
-- registrati per il suo ordine di produzione, non dalla ricetta.
create view v_lotti_prodotti_finiti_allergeni as
select distinct lpf.id as lotto_prodotto_finito_id, mpa.allergene_id
from lotti_prodotti_finiti lpf
join movimenti_materie_prime mmp on mmp.ordine_produzione_id = lpf.ordine_produzione_id
join lotti_materie_prime lmp on lmp.id = mmp.lotto_id
join materie_prime_allergeni mpa on mpa.materia_prima_id = lmp.materia_prima_id;
