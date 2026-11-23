-- Content preparation is draft-only. This expands what the content agent may
-- store, but does not grant any external publishing authority.
update public.company_agents
set mission = 'Turn verified product evidence into specific X posts and TikTok production briefs, while keeping preparation separate from publication.',
    allowed_actions = case
      when 'prepare_social_content' = any(allowed_actions) then allowed_actions
      else array_append(allowed_actions, 'prepare_social_content')
    end,
    updated_at = now()
where id = 'content';
