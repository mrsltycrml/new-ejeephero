-- The existing insert policy checks shift ownership and GPS quality.
create policy positions_require_in_service_route on public.vehicle_positions
as restrictive for insert to authenticated
with check (exists (
  select 1 from public.vehicles v
  join public.routes r on r.id = v.route_id
  where v.id = vehicle_positions.vehicle_id and not r.is_coming_soon and not r.is_archived
));
