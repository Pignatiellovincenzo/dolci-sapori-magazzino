-- Dati di base — da eseguire dopo schema.sql.
-- Le anagrafiche restano comunque gestibili/aggiungibili da frontend.

insert into unita_misura (codice, nome) values
  ('kg', 'Chilogrammo'),
  ('l', 'Litro'),
  ('pz', 'Pezzo'),
  ('conf', 'Confezione'),
  ('cartone', 'Cartone'),
  ('pedana', 'Pedana');

-- 14 categorie di allergeni, Reg. UE 1169/2011, allegato II.
insert into allergeni (codice, nome) values
  ('glutine', 'Cereali contenenti glutine'),
  ('crostacei', 'Crostacei'),
  ('uova', 'Uova'),
  ('pesce', 'Pesce'),
  ('arachidi', 'Arachidi'),
  ('soia', 'Soia'),
  ('latte', 'Latte'),
  ('frutta_a_guscio', 'Frutta a guscio'),
  ('sedano', 'Sedano'),
  ('senape', 'Senape'),
  ('sesamo', 'Semi di sesamo'),
  ('solfiti', 'Anidride solforosa e solfiti'),
  ('lupini', 'Lupini'),
  ('molluschi', 'Molluschi');
