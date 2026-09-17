-- A school's own domain.
--
-- Until now a school was only ever identified by a slug in the URL
-- (/iqra-ifs, or ?org=iqra-ifs). That means the bare domain a parent
-- actually types — iqraifs.com — resolves to nothing, so the root shows
-- the platform app and a WhatsApp preview of the bare link says "ILM
-- Network" rather than the school's name (the exact thing that made
-- parents hesitate on 15 Sep).
--
-- With this, a school's domain IS the school: the root serves their
-- site, sign-in knows who they are without a query string, and link
-- previews carry their name. Configured per school, never hardcoded,
-- so school #2 can bring their own domain without a code change.
--
-- Stored lowercase and bare: "iqraifs.com", never "https://" or "www.".

alter table organizations
  add column if not exists custom_domain text;

create unique index if not exists idx_organizations_custom_domain
  on organizations (custom_domain)
  where custom_domain is not null and deleted_at is null;

comment on column organizations.custom_domain is
  'The school''s own bare domain, lowercase, no scheme and no www '
  '(e.g. "iqraifs.com"). Resolves the root URL and link previews to '
  'this school. Null = the school lives on a platform subdomain.';

notify pgrst, 'reload schema';
