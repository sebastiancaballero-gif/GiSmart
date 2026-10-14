-- Une a su cubierta de empalme los dos cables que llegan a una sin decir a
-- cuál (14 de octubre de 2026).
--
-- 2100555 (sale de la cabecera) y 2110412 (sale de CO90) tienen
-- tip_elem_to = 'CUBEMP' pero id_elem_to vacío. La función de conectividad
-- arma la lista de cables de una cubierta con id_elem_from / id_elem_to, así
-- que en su cubierta de empalme no aparecen: el esquema dice «Esta cubierta
-- solo tiene cables de salida» e ignora sus fusiones con «el hilo de origen
-- … no existe» (44 en la de 2100555, 2 en la de 2110412).
--
-- La cubierta de cada uno sale de conectividad_fina: todas las fusiones de sus
-- hilos fuera de su otro extremo están en esa cubierta de empalme. Solo se
-- cambia si id_elem_to sigue vacío. Se corre en el editor SQL de Supabase.

update geo_fiber.cable_fibra
   set id_elem_to = '01a0e3ce-a2ef-7cd7-9bdd-981b0dbbf247'
 where id = '01a0e04f-3f6a-730e-9770-f6d01c5c61bb'   -- 2100555
   and id_elem_to is null
   and tip_elem_to = 'CUBEMP';

update geo_fiber.cable_fibra
   set id_elem_to = '01a0e3ce-a2f0-73cf-9718-3286118b896c'
 where id = '01a0e04f-3f6f-74ca-acff-c4b0b3be7bb7'   -- 2110412
   and id_elem_to is null
   and tip_elem_to = 'CUBEMP';

-- Comprobar: los dos con su cubierta.
select codigo, tip_elem_to, id_elem_to
  from geo_fiber.cable_fibra
 where id in ('01a0e04f-3f6a-730e-9770-f6d01c5c61bb', '01a0e04f-3f6f-74ca-acff-c4b0b3be7bb7');
