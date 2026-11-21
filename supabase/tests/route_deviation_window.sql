-- Trigger regressions for the disposable database in route_deviation_window.mjs.
begin;
create temp table probe as select gen_random_uuid() as driver, gen_random_uuid() as route, gen_random_uuid() as vehicle;
insert into public.profiles(id) select driver from probe;
insert into public.routes(id, name, coordinates, geometry_verified_at, geometry_source_url)
select route, 'Test line', '[{"latitude":14,"longitude":121},{"latitude":14,"longitude":121.02}]',
  now() - interval '1 hour', 'https://example.invalid/test-line' from probe;
insert into public.vehicles(id, driver_id, route_id, body_number, is_active, created_at)
select vehicle, driver, route, 'Test unit', true, now() - interval '1 hour' from probe;

create function pg_temp.fix(seconds numeric, lat float8 default 14.002, uncertainty float8 default 5,
  sample boolean default false, capture_offset interval default interval '0')
returns void language sql as $$
  insert into public.vehicle_positions(vehicle_id, timestamp, captured_at, latitude, longitude, accuracy, is_sample)
  select vehicle, t, t + capture_offset, lat, 121.01, uncertainty, sample
  from probe cross join (select now() + seconds * interval '1 second' as t) fix_time;
$$;
create function pg_temp.events(expected_total int, expected_open int, scenario text)
returns void language plpgsql as $$
declare total int; still_open int;
begin
  select count(*), count(*) filter (where closed_at is null) into total, still_open
  from public.route_deviation_events where vehicle_id = (select vehicle from probe);
  if (total, still_open) <> (expected_total, expected_open) then
    raise exception '%: expected % total / % open, got % / %', scenario, expected_total, expected_open, total, still_open;
  end if;
end $$;

do $$
declare n int; scenario text;
begin
  -- Every insert fires separately, as it would for GPS updates arriving on a shift.
  for n in 0..23 loop perform pg_temp.fix(-16 + 0.5 * n); end loop;
  perform pg_temp.events(0, 0, '11.5 seconds is insufficient');
  perform pg_temp.fix(-4);
  perform pg_temp.events(1, 1, '12 seconds at 2 Hz');
  perform pg_temp.fix(-3);
  perform pg_temp.fix(-3, 14); -- duplicate
  perform pg_temp.fix(-3.5, 14); -- out of order
  perform pg_temp.fix(-2, 14.00066); -- uncertainty straddles the corridor
  perform pg_temp.events(1, 1, 'one open event through duplicate, late and ambiguous fixes');
  perform pg_temp.fix(-1, 14);
  perform pg_temp.events(1, 0, 'confident return closes the event');

  delete from public.vehicle_positions where vehicle_id = (select vehicle from probe);
  -- These historical fixes have aged since receipt. The new fix is still just within the arrival limit.
  perform pg_temp.fix(-42);
  perform pg_temp.fix(-36);
  perform pg_temp.fix(-30);
  perform pg_temp.events(2, 1, '30-second device lag at normal cadence');

  foreach scenario in array array['weak accuracy','unknown accuracy','sample','legacy','mismatched capture','gap',
    'jump','on line','uncertain','stale current','future current','pre-shift','pre-verification']
  loop
    delete from public.vehicle_positions where vehicle_id = (select vehicle from probe);
    delete from public.route_deviation_events where vehicle_id = (select vehicle from probe);
    update public.vehicles set created_at = now() - interval '1 hour' where id = (select vehicle from probe);
    update public.routes set geometry_verified_at = now() - interval '1 hour' where id = (select route from probe);
    if scenario = 'stale current' then
      perform pg_temp.fix(-43); perform pg_temp.fix(-37); perform pg_temp.fix(-31);
    elsif scenario = 'future current' then
      perform pg_temp.fix(-6); perform pg_temp.fix(0); perform pg_temp.fix(6);
    else
      if scenario = 'pre-shift' then
        update public.vehicles set created_at = now() - interval '11 seconds' where id = (select vehicle from probe);
      elsif scenario = 'pre-verification' then
        update public.routes set geometry_verified_at = now() - interval '11 seconds' where id = (select route from probe);
      end if;
      perform pg_temp.fix(-12);
      if scenario <> 'gap' then perform pg_temp.fix(-9); end if;
      case scenario
        when 'weak accuracy' then perform pg_temp.fix(-6, 14.002, 31);
        when 'unknown accuracy' then perform pg_temp.fix(-6, 14.002, null);
        when 'sample' then perform pg_temp.fix(-6, sample => true);
        when 'legacy' then perform pg_temp.fix(-6, capture_offset => null);
        when 'mismatched capture' then perform pg_temp.fix(-6, capture_offset => interval '1 second');
        when 'gap' then perform pg_temp.fix(-1);
        when 'jump' then perform pg_temp.fix(-6, 14.02);
        when 'on line' then perform pg_temp.fix(-6, 14);
        when 'uncertain' then perform pg_temp.fix(-6, 14.0007);
        else perform pg_temp.fix(-6);
      end case;
      if scenario <> 'gap' then perform pg_temp.fix(-3); end if;
      perform pg_temp.fix(0);
    end if;
    perform pg_temp.events(0, 0, scenario);
  end loop;
end $$;
rollback;
