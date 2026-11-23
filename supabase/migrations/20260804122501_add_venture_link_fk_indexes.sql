-- Foreign-key cascade lookups need indexes with the FK column first. The
-- user-scoped composite indexes serve graph queries but do not cover this.
create index venture_links_from_entity_id_idx on public.venture_links (from_entity_id);
create index venture_links_to_entity_id_idx on public.venture_links (to_entity_id);
;
