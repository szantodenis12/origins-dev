-- Origins platform — Transactional Postgres RPCs (Faza 3 Supabase)
-- Run this in Supabase SQL Editor after 0002_seed.sql

-- 1. ATOMIC SEASONAL PRODUCT SWITCH
create or replace function set_seasonal_product(
  p_product_id text,
  p_seasonal boolean
)
returns void
language plpgsql
security definer
as $$
begin
  if p_seasonal then
    update products set seasonal = false where id <> p_product_id;
  end if;

  update products set seasonal = p_seasonal where id = p_product_id;
end;
$$;

-- 2. ATOMIC STAMP ADDITION WITH 2H ANTI-ABUSE WINDOW
create or replace function add_stamp(
  p_member_id uuid,
  p_location_slug text,
  p_staff_id uuid default null,
  p_kind text default 'normal',
  p_stamp_window_hours int default 2
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_blocked_at timestamptz;
  v_review_given boolean;
  v_last_stamp timestamptz;
  v_next_allowed timestamptz;
  v_event_id bigint;
  v_now timestamptz := now();
begin
  -- Check member exists & not blocked
  select blocked_at, review_bonus_given
  into v_blocked_at, v_review_given
  from members
  where id = p_member_id;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_blocked_at is not null then
    return jsonb_build_object('status', 'blocked');
  end if;

  -- Window check for normal and double_tuesday scan kinds
  if p_kind in ('normal', 'double_tuesday') then
    select created_at into v_last_stamp
    from stamp_events
    where member_id = p_member_id
      and location_slug = p_location_slug
      and kind in ('normal', 'double_tuesday')
    order by created_at desc
    limit 1;

    if v_last_stamp is not null then
      v_next_allowed := v_last_stamp + (p_stamp_window_hours || ' hours')::interval;
      if v_now < v_next_allowed then
        return jsonb_build_object(
          'status', 'already_stamped',
          'last_stamp_at', to_jsonb(v_last_stamp),
          'next_allowed_at', to_jsonb(v_next_allowed)
        );
      end if;
    end if;
  end if;

  -- Review bonus uniqueness
  if p_kind = 'review_bonus' and v_review_given then
    return jsonb_build_object('status', 'bonus_used');
  end if;

  -- Perform insert
  insert into stamp_events (member_id, location_slug, staff_id, kind, created_at)
  values (p_member_id, p_location_slug, p_staff_id, p_kind, v_now)
  returning id into v_event_id;

  if p_kind = 'review_bonus' then
    update members set review_bonus_given = true where id = p_member_id;
  end if;

  return jsonb_build_object(
    'status', 'added',
    'event', jsonb_build_object(
      'id', v_event_id,
      'memberId', p_member_id,
      'locationSlug', p_location_slug,
      'staffId', p_staff_id,
      'kind', p_kind,
      'createdAt', to_jsonb(v_now)
    )
  );
end;
$$;

-- 3. STORAGE BUCKET INITIALIZATION (origins-photos)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('origins-photos', 'origins-photos', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage Policy: Public Read
create policy "Public Access Read" on storage.objects for select using (bucket_id = 'origins-photos');
-- Storage Policy: Service Role Upload
create policy "Service Role Upload" on storage.objects for insert with check (bucket_id = 'origins-photos');
