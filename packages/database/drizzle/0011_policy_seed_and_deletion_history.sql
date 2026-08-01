-- Allow a learner to make multiple historical deletion requests while keeping one active request.
alter table account_deletion_requests
  drop constraint if exists account_deletion_requests_user_id_status_key;

create index account_deletion_requests_user_history_idx
  on account_deletion_requests(user_id, requested_at desc);

-- Provisional launch policy records. Final legally approved copy may replace these through versioned publication.
insert into policy_documents
  (policy_key, version, locale, title, summary, body_markdown, status, effective_at)
values
  (
    'terms',
    '2026-08-01',
    'en',
    'SkillUp Terms of Use',
    'These terms explain acceptable use, account responsibilities, learning-content limits and service availability.',
    '# SkillUp Terms of Use\n\nUse SkillUp lawfully and keep your account secure. Learning content is educational guidance rather than professional certification or guaranteed employment advice. Do not abuse, scrape, disrupt or attempt to bypass access, payment, safety or moderation controls. SkillUp may suspend abusive accounts and may update these terms through a new version that requires acknowledgement where appropriate.',
    'active',
    '2026-08-01T00:00:00Z'
  ),
  (
    'privacy',
    '2026-08-01',
    'en',
    'SkillUp Privacy Notice',
    'This notice explains the learner information SkillUp uses, why it is needed and the controls available to learners.',
    '# SkillUp Privacy Notice\n\nSkillUp uses the minimum account, learning, security and commercial information required to operate the platform. Sensitive challenge responses, authentication codes and payment credentials are not used for advertising. Learners can inspect sessions, control optional analytics, request an export and request account deletion. Required payment, fraud-prevention and audit records may be retained for legitimate legal, financial and security purposes after account deletion.',
    'active',
    '2026-08-01T00:00:00Z'
  ),
  (
    'refund',
    '2026-08-01',
    'en',
    'SkillUp Refund and Cancellation Policy',
    'This policy describes manual renewal, payment review, refunds and how premium access changes after a refund.',
    '# SkillUp Refund and Cancellation Policy\n\nSkillUp launch plans use manual renewal unless a future recurring-payment feature is separately approved. Payment disputes and refund requests are reviewed against JazzCash and SkillUp transaction evidence. An approved refund revokes future premium access without deleting completed learning history. Provider processing and settlement timing may affect when a refund appears.',
    'active',
    '2026-08-01T00:00:00Z'
  ),
  (
    'ai_disclosure',
    '2026-08-01',
    'en',
    'SkillUp AI Use Disclosure',
    'This disclosure explains where AI assists SkillUp and the human-review and safety controls applied to generated content.',
    '# SkillUp AI Use Disclosure\n\nSkillUp may use approved AI models to draft explanations, practice material, translations and recommendations. AI output cannot grant premium access, change authoritative scores or publish itself. Generated learning content passes validation and human review before publication. Learners should not submit confidential, financial, medical or highly sensitive personal information to AI-assisted features.',
    'active',
    '2026-08-01T00:00:00Z'
  ),
  (
    'leaderboard_sharing',
    '2026-08-01',
    'en',
    'Leaderboard and Achievement Sharing',
    'Sharing is optional and uses an approved public alias rather than exposing a learner email or private profile by default.',
    '# Leaderboard and Achievement Sharing\n\nLeaderboard participation and achievement sharing are optional. SkillUp displays only an approved alias and public achievement information. Email addresses, authentication details, private responses and payment information are never included. Learners can disable sharing, and moderators may suspend abusive aliases or misleading share content.',
    'active',
    '2026-08-01T00:00:00Z'
  ),
  (
    'fair_use',
    '2026-08-01',
    'en',
    'SkillUp Fair Use Policy',
    'This policy protects service quality by limiting automation, abuse and attempts to evade learning or commercial controls.',
    '# SkillUp Fair Use Policy\n\nDo not automate excessive requests, share authentication sessions, manipulate scores, replay payment callbacks, evade mission limits, scrape unpublished content or use SkillUp to generate harmful or unlawful material. Rate limits and capability controls apply equally to browser and API access. Security testing requires written authorization and a bounded test scope.',
    'active',
    '2026-08-01T00:00:00Z'
  )
on conflict (policy_key, version, locale) do nothing;
