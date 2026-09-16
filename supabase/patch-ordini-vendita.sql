-- Permette al responsabile confezionamento di segnare un ordine di vendita
-- come evaso (senza poter decidere lui i lotti, quello resta al direttore).
drop policy if exists "modifica_direttore" on ordini_vendita;
create policy "modifica_direttore_confezionamento" on ordini_vendita
  for update using (ruolo_utente() in ('direttore', 'responsabile_confezionamento'));

-- Funzione atomica: registra tutti i movimenti di scarico_vendita per un
-- ordine (una o piu' righe, ognuna con i propri lotti allocati in FEFO) e
-- porta l'ordine a "confermato" in un'unica transazione.
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
