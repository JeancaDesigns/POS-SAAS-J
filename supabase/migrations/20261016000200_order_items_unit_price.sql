-- Guarda el precio unitario en cada línea al momento de la venta.
-- El frontend ya lee unit_price con respaldo al precio actual, así que esta migración
-- se puede aplicar antes o después de desplegar el código.

alter table public.order_items add column if not exists unit_price numeric;

create or replace function public.set_order_item_unit_price()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.unit_price is null then
    select p.price into new.unit_price from public.products p where p.id = new.product_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.set_order_item_unit_price() from public, anon, authenticated;

drop trigger if exists order_items_set_unit_price on public.order_items;
create trigger order_items_set_unit_price
  before insert on public.order_items
  for each row execute function public.set_order_item_unit_price();

-- Rellenar líneas existentes con el precio actual (mejor aproximación disponible)
update public.order_items oi
set unit_price = p.price
from public.products p
where oi.product_id = p.id and oi.unit_price is null;
