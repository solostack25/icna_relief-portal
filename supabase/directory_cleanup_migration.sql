-- Directory cleanup: keep Entra's account type and location fields so the
-- portal can hide guests and suggest which office each person belongs to.
alter table it_directory_users add column if not exists user_type text;       -- 'Member' | 'Guest'
alter table it_directory_users add column if not exists mail text;
alter table it_directory_users add column if not exists state text;
alter table it_directory_users add column if not exists city text;
alter table it_directory_users add column if not exists street_address text;
alter table it_directory_users add column if not exists postal_code text;
alter table it_directory_users add column if not exists country text;
alter table it_directory_users add column if not exists usage_location text;
alter table it_directory_users add column if not exists company_name text;
alter table it_directory_users add column if not exists created_at_entra timestamptz;

create index if not exists it_directory_users_user_type_idx on it_directory_users (user_type);
