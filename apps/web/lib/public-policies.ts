export type PublicPolicySection = Readonly<{
  heading: string;
  body: readonly string[];
  list?: readonly string[];
  table?: Readonly<{
    headers: readonly string[];
    rows: readonly (readonly string[])[];
  }>;
}>;

export type PublicPolicy = Readonly<{
  slug: string;
  key: "terms" | "privacy" | "refund" | "ai_disclosure" | "leaderboard_sharing" | "fair_use";
  version: string;
  title: string;
  summary: string;
  layout?: "cards" | "document";
  sections: readonly PublicPolicySection[];
}>;

export const publicPolicies: readonly PublicPolicy[] = [
  {
    slug: "terms",
    key: "terms",
    version: "2026-10-06",
    title: "SkillUp Terms and Conditions",
    summary:
      "These Terms govern your use of SkillUp, its practical-learning platform, free learning experience, Premium subscription, learning content, progress features and related services.",
    layout: "document",
    sections: [
      {
        heading: "1. Key Terms Used in These Terms",
        body: [
          "“SkillUp”, “we”, “us” or “our” means the SkillUp learning platform and the entity legally responsible for providing the Services.",
          "“Platform” means the SkillUp website and related digital learning services.",
          "“Services” means the learning games, skill paths, feedback, progress tracking, account functions, Premium features and related services made available through SkillUp.",
          "“User” or “Learner” means any person who accesses or uses the Platform.",
          "“Subscriber” means a User with a successfully activated paid SkillUp Premium subscription.",
          "“Active Subscriber” means a Subscriber whose paid Premium access is current and has not expired, been cancelled with immediate effect, reversed, suspended or terminated.",
          "“Payment Provider” means JazzCash or another authorized payment or wallet provider used to process subscription fees.",
          "“Learning Content” means lessons, challenges, questions, explanations, examples, scenarios, prompts, feedback, assessments and other educational material made available through SkillUp.",
        ],
      },
      {
        heading: "2. Your Agreement to These Terms",
        body: [
          "By accessing or using SkillUp, creating an account, purchasing Premium or using any learning feature, you agree to these Terms and the applicable Privacy and Refund policies.",
          "If you do not agree, do not use the Platform or Services. Material policy updates may be published as a new version and may require fresh acknowledgement.",
        ],
      },
      {
        heading: "3. Using SkillUp",
        body: [
          "SkillUp is designed to provide practical learning through short, focused games and challenges. Learners can choose a skill path, complete realistic activities, receive explanations and track progress.",
          "The free experience may include reviewed pilot levels, explanations, points and saved progress. Availability of individual skills, levels and features may change as content is reviewed, tested and released.",
          "SkillUp may limit, remove or revise content where necessary for quality, safety, legal, technical or operational reasons.",
        ],
      },
      {
        heading: "4. Accounts and Responsible Use",
        body: [
          "You must provide accurate account information, keep login credentials and verification codes secure, and use your account only for yourself.",
          "You must not share active sessions, manipulate scores, bypass learning or payment controls, scrape unpublished content, interfere with Platform security, or attempt unauthorized security testing.",
          "Where a User is not legally able to agree to these Terms independently, use of the Platform should occur only with the permission and supervision required by applicable law.",
        ],
      },
      {
        heading: "5. SkillUp Premium Membership",
        body: [
          "SkillUp Premium is a paid subscription that expands the free learning experience. Premium benefits are those shown on the Platform for the selected plan at the time of purchase.",
          "Current published plans are:",
        ],
        table: {
          headers: ["Plan", "Billing Cycle", "Subscription Fee"],
          rows: [
            ["SkillUp Premium Monthly", "Monthly", "Rs. 599"],
            ["SkillUp Premium Yearly", "Yearly", "Rs. 4,999"],
          ],
        },
      },
      {
        heading: "6. Premium Features",
        body: [
          "Premium currently expands available learning and personalization features, including:",
          "Premium access is an enhancement to the learning experience. Free learning remains available in accordance with the content and access made available on the Platform.",
        ],
        list: [
          "Expanded learning levels.",
          "Detailed progress insights.",
          "Advanced reviewed AI-assisted challenges.",
          "Premium profile avatars.",
        ],
      },
      {
        heading: "7. Learning Areas",
        body: [
          "SkillUp may provide or develop practical learning across areas such as:",
          "Specific learning paths, availability and publication status may differ. Some paths may be planned, in pilot, under review or released progressively.",
        ],
        list: [
          "Freelancing & Remote Work — practical skills for online work and earning opportunities.",
          "Business & Entrepreneurship — understanding how to build and grow a business.",
          "Marketing, Content & Growth — brand-building, audience development and growth fundamentals.",
          "Career & Employability — job-readiness, professional communication and workplace skills.",
        ],
      },
      {
        heading: "8. Subscription Billing and Renewal",
        body: [
          "When you explicitly link a JazzCash wallet for a Premium plan, you authorize SkillUp and the Payment Provider to charge the applicable subscription fee according to the selected billing cycle until you cancel the subscription or unlink the wallet.",
          "The authoritative plan price, entitlement and billing schedule come from SkillUp and its payment service. Browser redirects, screenshots or client-side values do not activate Premium.",
        ],
      },
      {
        heading: "9. Wallet Security and Payment Credentials",
        body: [
          "Your JazzCash MPIN is entered only on JazzCash’s hosted payment page. SkillUp support will not ask you to provide your MPIN, payment password, one-time payment credential or other secret payment authentication information.",
          "SkillUp may retain a payment token or authorization reference needed to process server-side billing, subject to the Privacy Policy and applicable payment-provider rules.",
        ],
      },
      {
        heading: "10. Cancellation, Wallet Unlinking and Access",
        body: [
          "Cancelling a Premium subscription stops future renewal for that subscription while the linked wallet may remain available on your account.",
          "Unlinking the wallet removes the saved billing authorization for SkillUp and stops future debits for open SkillUp subscriptions associated with that wallet.",
          "Cancellation or wallet unlinking does not normally erase an already-paid period. Premium access continues through the recorded current-period end unless a refund, reversal, fraud or security action requires an earlier entitlement adjustment.",
        ],
      },
      {
        heading: "11. Refunds and Payment Review",
        body: [
          "Payment disputes and refund requests are reviewed against payment-provider evidence and SkillUp’s authoritative entitlement and audit records.",
          "SkillUp does not promise an unsupported refund window, proration or settlement time. Provider processing and settlement timing may affect when an approved refund appears.",
          "An approved refund or reversal may revoke the affected Premium entitlement without deleting completed learning history or records SkillUp is required to retain.",
          "When requesting a payment review, provide the payment reference shown in your private payment history and never send a PIN, one-time code, password or full payment credential.",
        ],
      },
      {
        heading: "12. Learning Content and Educational Limits",
        body: [
          "SkillUp provides educational practice, guidance and feedback. It is not professional certification, guaranteed employment advice, a promise of income, or a guarantee of fluency, business success or career outcomes.",
          "Published content may be reviewed and versioned, but learners should still apply judgment and independently verify information where a decision carries material financial, legal, professional, health, safety or other risk.",
        ],
      },
      {
        heading: "13. Progress, Scores and Learning History",
        body: [
          "SkillUp may record progress, completed activities, points, scores, learning evidence and related account history to provide the learning experience.",
          "Authoritative score, entitlement, publication and payment outcomes are generated by SkillUp’s server-side systems and cannot be replaced by browser analytics or user-submitted screenshots.",
          "Where Premium expires, previously completed learning history may remain available even if Premium-only content becomes inaccessible.",
        ],
      },
      {
        heading: "14. AI-Assisted Learning Features",
        body: [
          "Some Premium or future learning experiences may use reviewed AI-assisted challenges or personalization. Such features are learning aids and may not always be complete, current or error-free.",
          "Users should not rely on AI-assisted output as a substitute for qualified professional advice or independent verification where material decisions are involved.",
        ],
      },
      {
        heading: "15. Intellectual Property and Content Use",
        body: [
          "SkillUp names, branding, interface designs, software, learning games, questions, explanations, content structures and other Platform materials belong to SkillUp or its licensors unless stated otherwise.",
          "Users may use Learning Content for personal learning only. You must not copy, republish, sell, scrape, reverse engineer, systematically extract or commercially exploit SkillUp content without permission.",
        ],
      },
      {
        heading: "16. Activities Not Permitted",
        body: ["You must not:"],
        list: [
          "use SkillUp for unlawful, deceptive, abusive or fraudulent activity;",
          "share or misuse another person’s account, session or verification code;",
          "manipulate scores, progress, entitlements, missions or payment controls;",
          "upload malware, interfere with Platform security or attempt unauthorized access;",
          "scrape unpublished or protected learning content;",
          "misrepresent payments, refunds, achievements or account status; or",
          "use automated methods to abuse, overload or improperly extract data from the Platform.",
        ],
      },
      {
        heading: "17. Communications",
        body: [
          "SkillUp may send account, verification, learning, support, billing, subscription, security and promotional communications through email, SMS, notifications or other permitted channels.",
          "Where promotional communications are optional, available account controls or unsubscribe methods may be used to manage them. Essential account, security and transaction communications may continue.",
        ],
      },
      {
        heading: "18. Privacy and Learner Information",
        body: [
          "SkillUp may use minimized account, session, profile, learning, security, support and commercial records to operate the service and protect its integrity.",
          "Authentication codes, session secrets, payment credentials and protected answer logic are not used for advertising.",
          "Where available, learners may use account controls for optional analytics, marketing contact, leaderboard aliases, achievement sharing and AI-assisted personalization.",
          "Learners may be able to inspect sessions, revoke access, request a bounded data export and schedule account deletion. Certain payment, fraud-prevention, legal and audit records may need to be retained after profile data is deleted or pseudonymized.",
        ],
      },
      {
        heading: "19. Platform Availability and Changes",
        body: [
          "SkillUp may change, suspend, replace or discontinue features, content, learning paths, benefits or technical services. We do not guarantee uninterrupted, error-free or permanently available access.",
          "Planned or pilot learning paths may be delayed, revised or not released after review or learner testing.",
        ],
      },
      {
        heading: "20. Suspension and Termination",
        body: [
          "SkillUp may limit, suspend or revoke access where reasonably necessary to protect learners, payments, content quality, Platform security or legal compliance.",
          "Serious or repeated breaches of these Terms, fraud, payment abuse or unauthorized technical activity may result in account restriction or termination.",
        ],
      },
      {
        heading: "21. Disclaimers and Limits of Responsibility",
        body: [
          "To the fullest extent permitted by applicable law, SkillUp and its Services are provided on an “as is” and “as available” basis.",
          "SkillUp does not guarantee any particular educational, employment, earning, business or career outcome from use of the Platform.",
          "To the fullest extent permitted by law, SkillUp is not liable for indirect, incidental, special, consequential or punitive losses arising from use of the Platform, Learning Content or Premium features, except where liability cannot lawfully be excluded or limited.",
        ],
      },
      {
        heading: "22. Events Outside Our Control",
        body: [
          "SkillUp is not responsible for failure or delay caused by events beyond its reasonable control, including telecommunications or power failures, payment-provider outages, system failures, cyber incidents, government action, natural events or comparable circumstances.",
        ],
      },
      {
        heading: "23. Applicable Law and Dispute Resolution",
        body: [
          "These Terms are governed by the laws of Pakistan.",
          "The parties should first attempt to resolve disputes amicably through written notice and good-faith discussion. Where a dispute cannot be resolved, the parties may use any dispute-resolution process or competent court available under applicable Pakistani law.",
        ],
      },
      {
        heading: "24. Other Legal Provisions",
        body: [
          "If any provision of these Terms is held invalid or unenforceable, the remaining provisions will continue in effect to the extent permitted by law.",
          "These Terms, together with the Privacy Policy, Refund and Cancellation Policy, plan details and any other applicable published policies, govern your use of SkillUp.",
        ],
      },
      {
        heading: "25. SkillUp Customer Support",
        body: [
          "For support with SkillUp accounts, Premium billing or learning access, contact SkillUp Customer Support.",
          "Email: admin@codistan.org",
          "Phone: +92 319 9811263",
          "Website: https://skillupshop.codistan.org/en",
        ],
      },
    ],
  },
  {
    slug: "privacy",
    key: "privacy",
    version: "2026-09-03",
    title: "SkillUp Privacy Notice",
    summary:
      "This notice explains what learner information SkillUp uses, why it is needed and which controls are available.",
    sections: [
      {
        heading: "Information required to operate SkillUp",
        body: [
          "SkillUp uses minimized account, session, profile, learning, security, support and commercial records to provide the service and protect its integrity.",
          "Authentication codes, session secrets, payment credentials and protected answer logic are never used for advertising.",
        ],
      },
      {
        heading: "Optional analytics and sharing",
        body: [
          "Product analytics, marketing contact, leaderboard aliases, achievement sharing and AI-assisted personalization are controlled independently from the account page.",
          "Authoritative payment, entitlement, score and publication outcomes are generated by the server and cannot be replaced by client analytics events.",
        ],
      },
      {
        heading: "Export, deletion and retention",
        body: [
          "Learners can inspect sessions, revoke access, download a bounded data export and schedule account deletion with a seven-day cooldown.",
          "Required payment, fraud-prevention, legal and privileged audit records may remain after personal profile data is deleted or pseudonymized.",
        ],
      },
    ],
  },
  {
    slug: "refund",
    key: "refund",
    version: "2026-09-07",
    title: "SkillUp Refund and Cancellation Policy",
    summary:
      "This policy describes automatic wallet billing, subscription cancellation, wallet unlinking, payment review, refunds and their effect on Premium access.",
    sections: [
      {
        heading: "Automatic billing and consent",
        body: [
          "Linking a JazzCash wallet requires explicit consent to automatic billing for the selected Premium subscription. Charges are created from the server-authoritative plan price and schedule; the browser cannot set the charge amount.",
          "The current launch plans are configured without a free billing trial, so the first charge can be initiated after successful wallet linking. Any billing state or next-due date shown in the private account is based on the authoritative payment-service record.",
        ],
      },
      {
        heading: "Cancel subscription or unlink wallet",
        body: [
          "Cancel subscription (Unsubscribe) stops renewal and locks Premium access immediately. Unlink wallet removes the saved JazzCash authorization for SkillUp and stops future debits for all open SkillUp subscriptions associated with that wallet.",
          "Unsubscribing locks Premium features immediately. An approved refund, reversal, fraud or security action can also revoke Premium earlier than the recorded current-period end.",
        ],
      },
      {
        heading: "Payment and refund review",
        body: [
          "Payment disputes and refund requests are reviewed against the payment service, JazzCash evidence and SkillUp's authoritative entitlement and audit records. SkillUp does not promise an unsupported refund window, proration or settlement time.",
          "To request a payment or refund review, use the SkillUp support page and include the payment reference shown in your private payment history. Never send a JazzCash PIN, one-time code, password or full payment credential.",
          "Provider processing and settlement timing can affect when an approved refund appears.",
        ],
      },
      {
        heading: "Effect on Premium access and learning history",
        body: [
          "An approved refund or reversal may revoke the affected Premium entitlement without deleting completed learning history, earned evidence or required transaction audit records.",
        ],
      },
    ],
  },
  {
    slug: "ai-disclosure",
    key: "ai_disclosure",
    version: "2026-09-03",
    title: "SkillUp AI Use Disclosure",
    summary:
      "This disclosure explains where approved AI models may assist and which human-review, privacy and authority boundaries apply.",
    sections: [
      {
        heading: "Approved uses",
        body: [
          "AI may assist with drafts, explanations, translations, quality review and recommendations through versioned task contracts and strict cost limits.",
          "Public or learner-facing generated content must pass validation and the approved human publication workflow.",
        ],
      },
      {
        heading: "What AI cannot control",
        body: [
          "Model output cannot grant premium access, change authoritative payments, override prerequisites, create administrative privilege or silently rewrite learner scores.",
          "Deterministic rules remain available when the provider is disabled, unavailable or below confidence thresholds.",
        ],
      },
      {
        heading: "Learner safety",
        body: [
          "Do not submit passwords, verification codes, financial credentials, medical details or other highly sensitive information to AI-assisted features.",
          "Short responses use explicit uncertainty and manual-review fallback until an approved rubric and live model evaluation are enabled.",
        ],
      },
    ],
  },
  {
    slug: "sharing",
    key: "leaderboard_sharing",
    version: "2026-09-03",
    title: "Leaderboard and Achievement Sharing",
    summary:
      "Sharing is optional and uses approved public aliases and achievement information rather than private account details.",
    sections: [
      {
        heading: "Private by default",
        body: [
          "Leaderboard and achievement sharing remain disabled unless the learner enables them.",
          "Email, age, authentication data, private responses, learning history and payment information are not included in public sharing.",
        ],
      },
      {
        heading: "Moderation and corrections",
        body: [
          "SkillUp may moderate abusive aliases, misleading share cards or manipulated activity while preserving append-only evidence of decisions and reward corrections.",
        ],
      },
    ],
  },
  {
    slug: "fair-use",
    key: "fair_use",
    version: "2026-09-03",
    title: "SkillUp Fair Use Policy",
    summary:
      "This policy protects learning quality and service availability by limiting automation, manipulation and attempts to bypass controls.",
    sections: [
      {
        heading: "Prohibited activity",
        body: [
          "Do not automate excessive requests, scrape unpublished content, share authentication sessions, replay payment callbacks, manipulate points or evade mission limits.",
          "Do not use SkillUp to create harmful or unlawful material or to probe systems without written authorization and a bounded scope.",
        ],
      },
      {
        heading: "Controls and enforcement",
        body: [
          "Rate limits, provider budgets, capability checks and abuse controls apply to both browser and internal API access.",
          "SkillUp may suspend affected functionality or accounts while investigating security, payment or platform-integrity risks.",
        ],
      },
    ],
  },
] as const;

export function publicPolicy(slug: string): PublicPolicy | null {
  return publicPolicies.find((policy) => policy.slug === slug) ?? null;
}
