-- Permette anche al responsabile confezionamento di aggiornare lo stato
-- dell'ordine di produzione (serve per portarlo a "completato" dopo aver
-- registrato il lotto di prodotto finito).

drop policy if exists "modifica_direttore_produzione" on ordini_produzione;

create policy "modifica_direttore_produzione_confezionamento" on ordini_produzione
  for update using (ruolo_utente() in ('direttore', 'responsabile_produzione', 'responsabile_confezionamento'));
