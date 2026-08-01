insert into public_content_entries
  (kind, slug, locale, title, summary, direct_answer, body, source_references,
   author_name, reviewer_name, status, version, published_at, reviewed_at,
   freshness_review_at, created_at, updated_at)
values
  (
    'guide',
    'prepare-evidence-based-interview-answer',
    'en',
    'How to prepare an evidence-based interview answer',
    'A practical guide to turning a job requirement into a concise answer supported by a real example and a clear result.',
    'Identify the requirement, choose one relevant example, explain your action and result, then connect the evidence back to the role.',
    '{
      "introduction": "Strong interview answers are specific enough to verify and short enough to follow.",
      "sections": [
        {
          "heading": "Start with the requirement",
          "paragraphs": [
            "Read the question and identify the skill or behavior being tested.",
            "If the wording is unclear, ask one focused clarifying question rather than guessing."
          ]
        },
        {
          "heading": "Choose evidence",
          "paragraphs": [
            "Select one recent example where your own action affected a real outcome.",
            "Avoid combining several unrelated stories or claiming a result you cannot explain."
          ]
        },
        {
          "heading": "Structure the answer",
          "paragraphs": [
            "State the situation briefly, describe the action you personally took, name the result, and explain what the example demonstrates.",
            "Use numbers only when they are accurate and meaningful."
          ]
        },
        {
          "heading": "Check the boundary",
          "paragraphs": [
            "Remove confidential names, credentials and private client information.",
            "Do not present a team result as individual work; state your exact contribution."
          ]
        }
      ],
      "examples": [
        {
          "label": "Vague",
          "text": "I am a great communicator and always solve problems quickly."
        },
        {
          "label": "Evidence-based",
          "text": "When two teams interpreted the handover differently, I documented the acceptance criteria, confirmed ownership in a short call and reduced the unresolved items from eight to one before release."
        }
      ],
      "related": [
        {"kind": "question", "slug": "how-do-i-answer-tell-me-about-yourself"},
        {"kind": "glossary", "slug": "evidence-based-answer"},
        {"kind": "comparison", "slug": "vague-vs-evidence-based-interview-answer"}
      ]
    }'::jsonb,
    '[
      {
        "title": "SkillUp reviewed Interview and Workplace Communication launch curriculum",
        "publisher": "SkillUp Editorial Team",
        "locator": "Interview Evidence module",
        "retrievedAt": "2026-08-01T00:00:00Z"
      }
    ]'::jsonb,
    'SkillUp Editorial Team',
    'SkillUp Launch Reviewer',
    'published',
    1,
    '2026-08-01T00:00:00Z',
    '2026-08-01T00:00:00Z',
    '2027-02-01T00:00:00Z',
    '2026-08-01T00:00:00Z',
    '2026-08-01T00:00:00Z'
  ),
  (
    'question',
    'how-do-i-answer-tell-me-about-yourself',
    'en',
    'How do I answer “Tell me about yourself” in an interview?',
    'A direct framework for giving a relevant professional introduction without repeating an entire CV or making unsupported claims.',
    'Give a 45–90 second summary of your current direction, two relevant strengths supported by evidence, and why the role is the logical next step.',
    '{
      "introduction": "The question tests relevance, clarity and judgment more than biography.",
      "sections": [
        {
          "heading": "A reliable three-part answer",
          "paragraphs": [
            "Start with your current professional or learning direction.",
            "Add one or two relevant strengths with a concrete example.",
            "Finish by connecting your experience and goal to the role."
          ]
        },
        {
          "heading": "What to leave out",
          "paragraphs": [
            "Do not recite every job, disclose sensitive personal history or use generic claims without evidence.",
            "Keep the answer relevant to the role unless the interviewer asks for more detail."
          ]
        }
      ],
      "example": "I am an early-career project coordinator focused on turning unclear requirements into trackable delivery plans. In my last project I introduced a weekly risk review that helped the team close critical dependencies before launch. I am now looking for a role where I can apply that coordination strength on larger cross-functional work.",
      "related": [
        {"kind": "guide", "slug": "prepare-evidence-based-interview-answer"},
        {"kind": "glossary", "slug": "evidence-based-answer"}
      ]
    }'::jsonb,
    '[
      {
        "title": "SkillUp reviewed Interview and Workplace Communication launch curriculum",
        "publisher": "SkillUp Editorial Team",
        "locator": "Professional Introductions module",
        "retrievedAt": "2026-08-01T00:00:00Z"
      }
    ]'::jsonb,
    'SkillUp Editorial Team',
    'SkillUp Launch Reviewer',
    'published',
    1,
    '2026-08-01T00:00:00Z',
    '2026-08-01T00:00:00Z',
    '2027-02-01T00:00:00Z',
    '2026-08-01T00:00:00Z',
    '2026-08-01T00:00:00Z'
  ),
  (
    'glossary',
    'evidence-based-answer',
    'en',
    'Evidence-based answer',
    'A concise definition of an answer that links a claim to a specific action, source or observable result.',
    'An evidence-based answer supports its main claim with a specific example, verifiable source, observable action or measurable result.',
    '{
      "introduction": "Evidence helps another person understand why a claim is credible.",
      "sections": [
        {
          "heading": "In an interview",
          "paragraphs": [
            "Describe the situation briefly, state your own action and name the result or learning.",
            "The evidence should be relevant to the capability being assessed."
          ]
        },
        {
          "heading": "In study or workplace communication",
          "paragraphs": [
            "Cite the requirement, source, decision record or observed outcome rather than relying on confidence alone."
          ]
        }
      ],
      "related": [
        {"kind": "guide", "slug": "prepare-evidence-based-interview-answer"},
        {"kind": "comparison", "slug": "vague-vs-evidence-based-interview-answer"}
      ]
    }'::jsonb,
    '[
      {
        "title": "SkillUp reviewed Interview and Workplace Communication launch curriculum",
        "publisher": "SkillUp Editorial Team",
        "locator": "Evidence and clarity terminology",
        "retrievedAt": "2026-08-01T00:00:00Z"
      }
    ]'::jsonb,
    'SkillUp Editorial Team',
    'SkillUp Launch Reviewer',
    'published',
    1,
    '2026-08-01T00:00:00Z',
    '2026-08-01T00:00:00Z',
    '2027-02-01T00:00:00Z',
    '2026-08-01T00:00:00Z',
    '2026-08-01T00:00:00Z'
  ),
  (
    'comparison',
    'vague-vs-evidence-based-interview-answer',
    'en',
    'Vague vs evidence-based interview answers',
    'A side-by-side comparison of unsupported claims and concise answers that show a relevant action and result.',
    'A vague answer names a strength; an evidence-based answer shows where the strength was used, what action was taken and what changed.',
    '{
      "introduction": "Confidence improves an answer only when the listener can follow the evidence.",
      "comparison": [
        {
          "dimension": "Claim",
          "vague": "I am excellent at solving problems.",
          "evidenceBased": "I separated a recurring support issue into three causes and changed the intake form, reducing incomplete requests during the next release cycle."
        },
        {
          "dimension": "Ownership",
          "vague": "We delivered everything successfully.",
          "evidenceBased": "I owned the dependency tracker, escalated two blocked approvals and confirmed the final handover checklist with the client."
        },
        {
          "dimension": "Result",
          "vague": "The project went very well.",
          "evidenceBased": "The team completed the release with no unresolved critical dependency and documented the remaining low-risk follow-ups."
        }
      ],
      "related": [
        {"kind": "guide", "slug": "prepare-evidence-based-interview-answer"},
        {"kind": "glossary", "slug": "evidence-based-answer"}
      ]
    }'::jsonb,
    '[
      {
        "title": "SkillUp reviewed Interview and Workplace Communication launch curriculum",
        "publisher": "SkillUp Editorial Team",
        "locator": "Interview Evidence module",
        "retrievedAt": "2026-08-01T00:00:00Z"
      }
    ]'::jsonb,
    'SkillUp Editorial Team',
    'SkillUp Launch Reviewer',
    'published',
    1,
    '2026-08-01T00:00:00Z',
    '2026-08-01T00:00:00Z',
    '2027-02-01T00:00:00Z',
    '2026-08-01T00:00:00Z',
    '2026-08-01T00:00:00Z'
  )
on conflict (kind, slug, locale, version) do nothing;
