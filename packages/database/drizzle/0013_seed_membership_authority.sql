-- The schema permits one active category membership row per skill through the
-- existing skill_id primary key. Expose the natural composite key as well so
-- repeatable curriculum seeds can address the exact category-skill relationship.
create unique index skill_category_memberships_category_skill_unique
  on skill_category_memberships(category_id, skill_id);
