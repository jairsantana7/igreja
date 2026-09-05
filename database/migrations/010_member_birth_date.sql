SET LOCAL ROLE igreja_owner;

ALTER TABLE public.member_profiles
  ADD COLUMN birth_date date;
