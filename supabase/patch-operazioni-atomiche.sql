-- Le operazioni che toccano più tabelle insieme (crea lotto + registra
-- movimento + aggiorna stato ordine) diventano funzioni del database invece
-- di piu' chiamate separate dal frontend: se un passaggio fallisce, non
-- resta nulla a meta' (es. un lotto senza movimento). Le funzioni girano con
-- i permessi di chi le chiama, quindi le policy RLS restano valide.

create or replace function registra_confezionamento(
  p_ordine_produzione_id bigint,
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
    from ordini_produzione where id = p_ordine_produzione_id;

  select id into v_causale_id from causali_prodotti_finiti where codice = 'confezionamento';

  insert into lotti_prodotti_finiti (prodotto_finito_id, ordine_produzione_id, numero_lotto, data_produzione, data_scadenza, creato_da)
  values (v_prodotto_finito_id, p_ordine_produzione_id, p_numero_lotto, p_data_produzione, p_data_scadenza, auth.uid())
  returning id into v_lotto_id;

  insert into movimenti_prodotti_finiti (lotto_id, causale_id, quantita, ordine_produzione_id, utente_id)
  values (v_lotto_id, v_causale_id, p_quantita, p_ordine_produzione_id, auth.uid());

  update ordini_produzione set stato = 'completato' where id = p_ordine_produzione_id;

  return v_lotto_id;
end;
$$;

grant execute on function registra_confezionamento(bigint, text, numeric, date, date) to authenticated;

create or replace function registra_prelievo_produzione(
  p_ordine_produzione_id bigint,
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

    insert into movimenti_materie_prime (lotto_id, causale_id, unita_misura_id, quantita_originale, ordine_produzione_id, utente_id)
    values (
      v_lotto_id,
      v_causale_id,
      (select mp.unita_misura_base_id from lotti_materie_prime l join materie_prime mp on mp.id = l.materia_prima_id where l.id = v_lotto_id),
      (v_riga ->> 'quantita')::numeric,
      p_ordine_produzione_id,
      auth.uid()
    );
  end loop;

  update ordini_produzione set stato = 'prelievo_confermato' where id = p_ordine_produzione_id;
end;
$$;

grant execute on function registra_prelievo_produzione(bigint, jsonb) to authenticated;
