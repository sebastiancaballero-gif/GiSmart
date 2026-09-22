-- Permisos que necesita GISmart en Supabase.
--
-- Lo ejecuta quien administra la base, en el editor SQL de Supabase (que corre
-- como `postgres`). Se puede ejecutar las veces que haga falta: cada GRANT es
-- idempotente.
--
-- Por qué hace falta: la aplicación consulta la base desde su servidor con la
-- secret key, que actúa como el rol `service_role`. Cuando una tabla se borra y
-- se vuelve a crear, pierde los permisos que tenía, y la aplicación deja de
-- poder leerla. Pasó con usuario_app (nadie puede iniciar sesión), con
-- tab_fiber (la conectividad de las mufas no se puede consultar) y antes con
-- las vistas de las capas del mapa.
--
-- Revisado contra la base el 21 de septiembre de 2026.


-- 1. Inicio de sesión ----------------------------------------------------------
-- Sin esto, el login responde «El servidor no tiene permiso para leer los
-- usuarios» (error 42501 sobre public.usuario_app).

grant select on public.usuario_app to service_role;

-- La aplicación sustituye las contraseñas en texto plano por su hash la primera
-- vez que cada persona entra. Solo necesita tocar esa columna.
grant update (clave) on public.usuario_app to service_role;


-- 2. Conectividad de las mufas -------------------------------------------------
-- La función get_json_conectividad_cubierta lee del esquema tab_fiber. Sin esto
-- falla con «permission denied for schema tab_fiber» (42501).

grant usage on schema tab_fiber to service_role;
grant select on all tables in schema tab_fiber to service_role;
grant execute on function public.get_json_conectividad_cubierta(uuid) to service_role;


-- 3. Capas del mapa ------------------------------------------------------------
-- Hoy cargan por un respaldo que lee las tablas directamente, porque las vistas
-- *_geojson se borraron junto con sus tablas. Estos permisos mantienen ese
-- respaldo funcionando.

grant usage on schema geo_fiber to service_role;
grant usage on schema geo_infra to service_role;
grant select on all tables in schema geo_fiber to service_role;
grant select on all tables in schema geo_infra to service_role;


-- 4. Que no vuelva a pasar -----------------------------------------------------
-- Los GRANT anteriores solo cubren las tablas que existen hoy. Esto hace que
-- toda tabla que `postgres` cree en el futuro en estos esquemas nazca ya con
-- permiso de lectura para service_role, así que recrear una tabla deja de
-- romper la aplicación.

alter default privileges for role postgres in schema public    grant select on tables to service_role;
alter default privileges for role postgres in schema tab_fiber grant select on tables to service_role;
alter default privileges for role postgres in schema geo_fiber grant select on tables to service_role;
alter default privileges for role postgres in schema geo_infra grant select on tables to service_role;
