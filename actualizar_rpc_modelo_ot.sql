-- Modelo normalizado. Revisar y ejecutar manualmente en Supabase SQL Editor.
-- No contiene cambios destructivos ni ALTER/DROP de tablas.

create or replace function public.ot_catalogos_formulario()
returns jsonb language sql stable security definer set search_path = public
as $function$
  select jsonb_build_object(
    'clientes', coalesce((select jsonb_agg(to_jsonb(x) order by x.nombre_comercial) from (select cod_cliente, nombre_comercial from public.cliente) x), '[]'::jsonb),
    'trabajos', coalesce((select jsonb_agg(to_jsonb(x) order by x.tipo_trabajo) from (select cod_trabajo, tipo_trabajo from public.trabajo) x), '[]'::jsonb),
    'materiales', coalesce((select jsonb_agg(to_jsonb(x) order by x.nombre_material) from (select cod_material, nombre_material, tamano_material, formato from public.material) x), '[]'::jsonb),
    'colores', coalesce((select jsonb_agg(to_jsonb(x) order by x.nombre_color) from (select cod_color, nombre_color from public.colorimetria) x), '[]'::jsonb),
    'impresiones', coalesce((select jsonb_agg(to_jsonb(x) order by x.tipo_impresion) from (select cod_impresion, tipo_impresion from public.impresion) x), '[]'::jsonb),
    'maquinas', coalesce((select jsonb_agg(to_jsonb(x) order by x.nombre_maquina) from (select cod_maquina, nombre_maquina from public.maquina) x), '[]'::jsonb),
    'muestras', coalesce((select jsonb_agg(to_jsonb(x) order by x.tipo_muestra) from (select cod_muestra, tipo_muestra from public.muestrario) x), '[]'::jsonb),
    'acabados', coalesce((select jsonb_agg(to_jsonb(x) order by x.tipo_acabado) from (select cod_acabado, tipo_acabado from public.acabado) x), '[]'::jsonb),
    'estados', coalesce((select jsonb_agg(to_jsonb(x) order by x.tipo_estado) from (select cod_estado, tipo_estado from public.estado) x), '[]'::jsonb)
  );
$function$;

create or replace function public.orden_trabajo_crear_normalizada(p_datos jsonb)
returns bigint language plpgsql security definer set search_path = public
as $function$
declare
  v_cod_ot bigint;
  v_item jsonb;
  v_pos integer;
  v_cara text;
begin
  if nullif(btrim(p_datos->>'nombre_ot'), '') is null then raise exception 'Nombre del trabajo es obligatorio'; end if;
  if p_datos->>'cod_cliente' is null or p_datos->>'cod_trabajo' is null or p_datos->>'cod_estado' is null then raise exception 'Cliente, tipo de trabajo y estado son obligatorios'; end if;
  if coalesce((p_datos->>'cantidad')::numeric, 0) < 0 or coalesce((p_datos->>'cantidad_paginas')::numeric, 0) < 0 then raise exception 'Las cantidades no pueden ser negativas'; end if;
  if jsonb_array_length(coalesce(p_datos->'materiales','[]')) > 3 or jsonb_array_length(coalesce(p_datos->'colorimetrias','[]')) > 3 or jsonb_array_length(coalesce(p_datos->'impresiones','[]')) > 3 or jsonb_array_length(coalesce(p_datos->'maquinas','[]')) > 3 or jsonb_array_length(coalesce(p_datos->'muestras','[]')) > 3 then raise exception 'Una sección excede el máximo de tres posiciones'; end if;

  insert into public.orden_trabajo (nombre_ot, fecha_ot, cantidad, cantidad_paginas, tamano_final, corte, cod_cliente, cod_trabajo, cod_estado)
  values (btrim(p_datos->>'nombre_ot'), nullif(p_datos->>'fecha_ot','')::date, (p_datos->>'cantidad')::numeric, (p_datos->>'cantidad_paginas')::integer, nullif(btrim(p_datos->>'tamano_final'),''), nullif(btrim(p_datos->>'corte'),''), (p_datos->>'cod_cliente')::bigint, (p_datos->>'cod_trabajo')::bigint, (p_datos->>'cod_estado')::bigint)
  returning cod_ot into v_cod_ot;

  for v_item in select value from jsonb_array_elements(coalesce(p_datos->'materiales','[]')) loop
    v_pos := (v_item->>'posicion')::integer;
    if v_pos not between 1 and 3 or coalesce((v_item->>'total_hojas')::numeric, -1) < 0 then raise exception 'Material inválido en posición %', v_pos; end if;
    insert into public.ot_material (cod_ot, posicion, cod_material, tamano_material, formato, total_hojas) values (v_cod_ot, v_pos, (v_item->>'cod_material')::bigint, nullif(btrim(v_item->>'tamano_material'),''), nullif(btrim(v_item->>'formato'),''), (v_item->>'total_hojas')::numeric);
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_datos->'colorimetrias','[]')) loop
    v_pos := (v_item->>'posicion')::integer; v_cara := v_item->>'cara_color';
    if v_pos not between 1 and 3 or v_cara not in ('Anverso','Reverso','Anverso y reverso') then raise exception 'Colorimetría inválida en posición %', v_pos; end if;
    insert into public.ot_colorimetria (cod_ot, posicion, cod_color, cara_color) values (v_cod_ot, v_pos, (v_item->>'cod_color')::bigint, v_cara);
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_datos->'impresiones','[]')) loop v_pos := (v_item->>'posicion')::integer; if v_pos not between 1 and 3 then raise exception 'Impresión inválida'; end if; insert into public.ot_impresion (cod_ot, posicion, cod_impresion) values (v_cod_ot, v_pos, (v_item->>'cod_impresion')::bigint); end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_datos->'maquinas','[]')) loop v_pos := (v_item->>'posicion')::integer; if v_pos not between 1 and 3 then raise exception 'Máquina inválida'; end if; insert into public.ot_maquina (cod_ot, posicion, cod_maquina) values (v_cod_ot, v_pos, (v_item->>'cod_maquina')::bigint); end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_datos->'muestras','[]')) loop v_pos := (v_item->>'posicion')::integer; if v_pos not between 1 and 3 then raise exception 'Muestrario inválido'; end if; insert into public.ot_muestrario (cod_ot, posicion, cod_muestra) values (v_cod_ot, v_pos, (v_item->>'cod_muestra')::bigint); end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_datos->'acabados','[]')) loop
    v_cara := v_item->>'cara_acabado'; if v_cara not in ('Anverso','Reverso','Anverso y reverso') then raise exception 'Cara de acabado no válida'; end if;
    insert into public.ot_acabado (cod_ot, cod_acabado, cara_acabado) values (v_cod_ot, (v_item->>'cod_acabado')::bigint, v_cara);
  end loop;
  return v_cod_ot;
end;
$function$;

revoke all on function public.ot_catalogos_formulario() from public;
revoke all on function public.orden_trabajo_crear_normalizada(jsonb) from public;
grant execute on function public.ot_catalogos_formulario() to anon, authenticated;
grant execute on function public.orden_trabajo_crear_normalizada(jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
