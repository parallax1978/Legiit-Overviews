-- Reference data. Launch countries with their default language and timezone.
insert into public.locations (code, name, country_iso, default_language, timezone) values
  (2840, 'United States', 'US', 'en', 'America/New_York'),
  (2826, 'United Kingdom', 'GB', 'en', 'Europe/London'),
  (2124, 'Canada', 'CA', 'en', 'America/Toronto'),
  (2036, 'Australia', 'AU', 'en', 'Australia/Sydney'),
  (2276, 'Germany', 'DE', 'de', 'Europe/Berlin'),
  (2250, 'France', 'FR', 'fr', 'Europe/Paris'),
  (2724, 'Spain', 'ES', 'es', 'Europe/Madrid'),
  (2380, 'Italy', 'IT', 'it', 'Europe/Rome'),
  (2528, 'Netherlands', 'NL', 'nl', 'Europe/Amsterdam'),
  (2356, 'India', 'IN', 'en', 'Asia/Kolkata')
on conflict (code) do nothing;

insert into public.platform_domains (reg_domain) values
  ('youtube.com'), ('reddit.com'), ('facebook.com'), ('quora.com'), ('wikipedia.org'),
  ('medium.com'), ('linkedin.com'), ('instagram.com'), ('tiktok.com'), ('x.com'),
  ('twitter.com'), ('pinterest.com'), ('substack.com'), ('github.com')
on conflict do nothing;
