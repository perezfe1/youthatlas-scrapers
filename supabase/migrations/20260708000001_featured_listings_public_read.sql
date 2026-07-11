-- featured_listings (012) enabled RLS but defined only INSERT + service_role
-- policies, so getActiveFeaturedListings() — which runs as the anon role via
-- getPublicSupabaseClient — received 0 rows with no error. Paid featured
-- placements therefore never rendered to any visitor. Add a public read
-- policy scoped to currently-active listings.
CREATE POLICY "Public can read active featured listings"
ON public.featured_listings
FOR SELECT
TO anon, authenticated
USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));
