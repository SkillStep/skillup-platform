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
    version: "2026-11-11",
    title: "SkillUp Terms and Conditions",
    summary:
      "These Terms govern access to and use of SkillUp, DigiSphere’s Pakistan-focused practical learning platform, including free learning, Premium subscriptions, JazzCash billing, step charging and related Services.",
    layout: "document",
    sections: [
      {
        heading: "1. Definitions",
        body: [
          "In these Terms and Conditions, unless the context requires otherwise, the following definitions apply:",
          "“Company”, “we”, “us” or “our” means DigiSphere, the operator of the SkillUp Platform and Services. The Company may be contacted at support@digisphere.com.pk.",
          "“Platform” means the SkillUp website at https://skillupshop.com/ and any authorized SkillUp mobile applications or associated digital services.",
          "“Services” means practical skill-learning games, short levels, realistic scenarios, quizzes, matching, ordering, recall, response exercises, explanations, personalized feedback, learning profiles, points, progress tracking, reviewed educational content, optional AI-assisted challenges and Premium features made available on the Platform.",
          "“User” or “Learner” means any person using or accessing SkillUp, whether as a visitor or account holder.",
          "“Premium Content” means reviewed learning levels, advanced challenges, detailed progress insights, profile enhancements and other learning features expressly identified as requiring an eligible paid subscription.",
          "“Subscriber” means a User who subscribes to an eligible paid SkillUp plan through an authorized billing channel.",
          "“Active Subscriber” means a Subscriber with an active paid entitlement, including an account activated following a successful full charge (“ACTIVE_FULL”) or an authorized partial step charge (“ACTIVE_STEP”), until expiry, cancellation, suspension or termination under disclosed terms.",
          "“Billing Provider” or “Payment Provider” means JazzCash or another authorized mobile wallet, payment service or financial institution processing subscription payments.",
          "“Content” means all exercises, questions, answers, explanations, learning-path materials, videos (if offered), text, images, graphics, software, data, code and other material available on the Platform.",
          "“User Content” means a User’s responses, comments, feedback, ratings, submitted text or other inputs where permitted by SkillUp.",
          "“Learning Progress” means completed levels, responses, scores, points, achievements and associated records displayed or maintained by the Platform.",
          "“Promotion” means a contest, discounted plan, voucher campaign, giveaway, special-access offer or other promotional activity expressly announced by SkillUp, if any.",
          "“Reward” means a benefit expressly made available under a published Promotion, if any.",
          "“Privacy Policy” means the privacy policy published at https://skillupshop.codistan.org/en/legal/privacy, as updated from time to time.",
          "“Terms” means these Terms and Conditions, together with any policies or offer-specific terms expressly incorporated by reference.",
        ],
      },
      {
        heading: "2. Acceptance of the Terms and Conditions",
        body: [
          "SkillUp is a Pakistan-focused digital learning platform designed to help learners develop practical skills through short, focused games and realistic challenges. It offers learning paths such as Interview and Workplace Communication, with additional skills introduced following content review and learner testing. Features may include feedback, explanations, points, progress tracking and Premium learning access.",
          "These Terms govern access to and use of SkillUp and its Services. By visiting, creating an account, practicing a skill, purchasing a subscription or otherwise using the Platform, you acknowledge that you have read, understood and agree to be bound by these Terms and the Privacy Policy.",
          "If you disagree with these Terms, do not use the Platform. Continued use following legally effective changes may constitute acceptance, subject to applicable law.",
        ],
      },
      {
        heading: "3. General Terms and Conditions",
        body: [
          "SkillUp may offer free learning levels and optional Premium subscriptions that unlock additional reviewed challenges, expanded levels, detailed progress insights and profile features. Not all skill paths, lessons, AI-assisted challenges or features shown as planned are necessarily available. Content availability, sequencing, learning methods, subscription benefits and eligibility may change over time. Offer-specific terms disclosed before subscription apply to the extent consistent with applicable law.",
        ],
      },
      {
        heading: "4. Eligibility and Age Requirements",
        body: [
          "Users must have the legal capacity required by applicable law to use the Platform and enter paid transactions. Minors may use age-appropriate learning features under the consent and supervision of a parent or legal guardian where required by law. SkillUp may impose additional eligibility, account or payment restrictions for certain services or promotions and may request reasonable verification for security or compliance. Users must not misrepresent their eligibility.",
        ],
      },
      {
        heading: "5. Accessing the Platform and Account Security",
        body: [
          "The Company may withdraw, amend, suspend or restrict access to the Platform or any part of the Services from time to time. The Company does not guarantee that the Platform will be available at all times or free from interruption, delay or technical problems.",
          "Where an account is required, you are responsible for:",
          "Your account is personal to you. You must not share, transfer, sell or otherwise provide access to your account to another person. The Company may suspend or terminate an account that is shared or used in violation of these Terms.",
          "The Company may disable any username, password or other identifier where it reasonably believes that you have violated these Terms or that such action is necessary to protect the Platform, other Users or the Company’s legitimate interests.",
        ],
        list: [
          "Providing accurate, current and complete information and keeping that information up to date;",
          "Maintaining the confidentiality of your username, password and other account credentials;",
          "All activity occurring under your account; and",
          "Promptly notifying the Company of any unauthorized access or other security breach.",
        ],
      },
      {
        heading: "6. Subscriptions and Charges",
        body: [
          "6.1 Subscription Plans. The Services may be offered to eligible customers through monthly subscription plans. Subscriptions may be purchased through the Platform or through advertising links or other channels promoted by the Company.",
          "The above price points will be effective from 1st December 2026.",
          "The Company may introduce, modify, discontinue or replace subscription plans from time to time, subject to applicable law and the terms of the applicable Billing Provider.",
          "Users may select an eligible Premium plan, choose “Subscribe Now” (or the applicable purchase button), review the amount, term and applicable billing consent, and authorize payment to unlock SkillUp Premium Content and features covered by that plan. A successful, server-verified payment (whether a full charge or an authorized step charge) activates the applicable Premium learning entitlement, subject to the disclosed access period and plan limitations. Premium may include expanded reviewed levels, advanced challenges, detailed learning-progress insights and profile enhancements. Free learning and existing completed progress remain subject to SkillUp’s published access rules.",
          "6.2 Automatic Renewal and Subscription Management. Where an eligible recurring subscription is expressly disclosed and authorized, it may renew automatically at the stated billing interval until cancelled or the associated payment authorization is removed. The applicable amount, duration and renewal conditions must be shown before payment. Where SkillUp offers linked-wallet billing, cancellation stops future renewal of the selected subscription; unlinking the wallet stops future charges authorized through that wallet, subject to the payment provider’s process. Paid access continues through its valid period unless a refund, reversal, fraud or security action lawfully requires adjustment.",
          "6.3 Billing, Payment and Failed Charges. Payments are processed through authorized Billing Providers. Where JazzCash wallet linking is offered, the User authorizes the selected plan’s payments in the provider’s secure flow. Users must enter their MPIN or payment credentials only on the provider’s authorized page and must not share an MPIN, PIN, password or OTP with SkillUp support. Browser redirects or payment screenshots alone do not establish payment success. Server-side transaction verification determines subscription status. Failed payments may prevent activation or renewal; any charge retries must follow the disclosed billing consent and provider requirements.",
          "6.4 Cancellation and Refunds. Users may cancel eligible recurring subscriptions using available account controls, the payment provider or SkillUp support. Refund and payment disputes are reviewed in accordance with SkillUp’s published Refund and Cancellation Policy at https://skillupshop.codistan.org/en/legal/refund, the Billing Provider’s records and applicable law. Approved refunds or reversals may revoke associated Premium entitlement without necessarily deleting completed learning progress or required transaction records. No provision excludes statutory rights.",
          "6.5 Free Trials, Discounts and Special Offers. Any free trial, discount or promotional subscription will be governed by the duration, eligibility, conversion and renewal conditions disclosed for the particular offer. No trial or discounted arrangement should be assumed unless expressly advertised and validly authorized.",
          "6.6 Changes to Prices and Premium Benefits. The Company may change prices, benefits, or subscription structures for future purchases or renewal periods in accordance with applicable law and required notices. Any changes affecting an existing paid period will be handled under the applicable disclosed plan terms and mandatory consumer protections.",
        ],
        table: {
          headers: ["Plan", "Billing Cycle", "Subscription Fee", "Notes"],
          rows: [
            ["Elite Value", "Monthly", "Rs. 600", "Incl. Tax · effective from 1st December 2026"],
            ["Platinum", "Monthly", "Rs. 990", "Incl. Tax · effective from 1st December 2026"],
          ],
        },
      },
      {
        heading: "7. Communications and Notifications",
        body: [
          "SkillUp may send messages about registration, account verification, learning progress, subscription activation, payment status, security, updates and essential service notices by email, SMS, in-app notification or supported channels. Promotional communications, if any, are subject to applicable consent and opt-out rules. Billing Providers may independently send payment or authorization messages in accordance with their own policies.",
        ],
      },
      {
        heading: "8. Learning Content and Intellectual Property",
        body: [
          "All SkillUp learning paths, exercises, questions, answers, explanations, illustrations, interfaces, design elements, software, brands and other proprietary materials are owned by the Company or its authorized licensors and protected by applicable intellectual-property laws. The SkillUp name and logo may not be reproduced or used without authorization.",
          "Users receive a limited, personal, revocable, non-exclusive and non-transferable right to use Content only for lawful learning within the Platform. Buying Premium grants access to specified learning features for the applicable entitlement period; it does not transfer ownership of educational material or source code. Third-party resources remain subject to their own licenses.",
        ],
      },
      {
        heading: "9. Content Protection and Fair Learning Use",
        body: [
          "Except where expressly permitted by SkillUp or applicable law, Users must not systematically copy, download, record, scrape, distribute, resell, publish or exploit restricted lessons, proprietary questions, explanations, answer banks, paid challenges or Platform software. Users must not bypass Premium access controls, automate completion of levels, manipulate scores or points, share paid accounts or compromise the integrity of assessments.",
          "Educational outputs and example answers are for personal learning, not for misrepresentation as professional qualifications, certification or independently completed assessment work. The Company may restrict access where it reasonably identifies abuse, subject to applicable law.",
        ],
      },
      {
        heading: "10. Learner Responses and User-Generated Content",
        body: [
          "SkillUp may process learner answers, quiz selections, written responses, feedback and other submissions to provide explanations, assess responses, record progress, improve learning experiences and operate the Platform, consistent with its Privacy Policy.",
          "Users are responsible for content they provide and must not submit unlawful, abusive, misleading or third-party confidential information. To the extent needed to operate the Services, Users grant the Company a non-exclusive, worldwide, royalty-free license to process, store, reproduce and display their submissions within the Platform, subject to applicable law and the Privacy Policy. Users retain ownership of original submissions where applicable.",
          "SkillUp may remove submissions that breach these Terms. AI-supported features, when enabled, may involve additional disclosed processing and usage limitations.",
        ],
      },
      {
        heading: "11. Prohibited Conduct",
        body: [
          "Users must not use SkillUp unlawfully, impersonate another learner, share credentials, interfere with infrastructure, send spam, exploit security vulnerabilities, submit malware, scrape unpublished materials, manipulate achievement scores or rankings, evade payment or mission controls, attempt unauthorized account access, or misuse promotions.",
          "Users must not submit personal or confidential third-party information without permission, use AI-assisted learning to facilitate harmful or unlawful activity, or portray automated feedback or scores as an accredited professional qualification. Reasonable controls may be used to protect the Platform’s fairness, security and integrity.",
        ],
      },
      {
        heading: "12. Copyright Infringement and Takedown Procedure",
        body: [
          "Rights holders who believe material on SkillUp infringes their copyright or other intellectual-property rights may write to support@digisphere.com.pk identifying the protected material, its location on the Platform, the claimed rights and reasonable contact and verification information. The Company will review credible notices and may remove or restrict material, request further information or address repeat infringement in accordance with applicable law.",
        ],
      },
      {
        heading: "13. Step Charging Logic",
        body: [
          "13.1 Purpose and Disclosure. For eligible SkillUp subscription plans and supported Billing Providers, step charging may apply when a User’s wallet balance is insufficient for the full subscription amount. The process first attempts the full plan charge and may then attempt a separately disclosed and authorized partial amount (the “Step Charge”). The full plan price, partial charge, any remaining amount, access duration and future debit conditions must be disclosed in advance and meet applicable provider and legal requirements.",
          "13.2 Charging Sequence:",
          "13.3 Partial Payments and Further Charges. A successful Step Charge represents a partial payment, not settlement of the full plan price. Any outstanding amount, retries, follow-up debits, renewal dates or changes to the Premium access period must comply with the exact terms shown to and authorized by the User and any mandatory legal requirements. SkillUp will not impose undisclosed additional debits. Payment-provider records and server-side reconciliation determine actual status.",
          "13.4 Access, Cancellation and Support. An ACTIVE_STEP Subscriber receives eligible Premium learning access during the applicable disclosed period. Access may expire at the end of that period unless lawfully extended or renewed. Cancellation and refund rights remain governed by Section 6, the provider’s terms and applicable law. Billing questions may be sent to support@digisphere.com.pk.",
        ],
        list: [
          "(a) FULL CHARGE: The system first attempts to charge the FULL plan price.",
          "(b) FULL SUCCESS: If successful, the subscription becomes ACTIVE_FULL immediately, unlocking the Premium learning access included in the plan.",
          "(c) FULL FAILURE: If the full charge fails, the system attempts the agreed STEP CHARGE partial amount only where permitted and authorized.",
          "(d) STEP SUCCESS: If the step charge succeeds, the subscription becomes ACTIVE_STEP and is active for access purposes, unlocking the same Premium learning features covered by the plan for the disclosed step-charge access period.",
          "(e) BOTH FAIL: If neither payment succeeds, no new paid entitlement is activated.",
        ],
      },
      {
        heading: "14. Third-Party Links and Services",
        body: [
          "The Platform may link to third-party educational resources, tools, payment providers and external services. Third parties control their own content, terms and privacy practices. SkillUp does not necessarily endorse third-party services and is not responsible for their independent operations to the extent permitted by law. Users must comply with any relevant third-party requirements.",
        ],
      },
      {
        heading: "15. Educational Use, AI Assistance and Disclaimers",
        body: [
          "SkillUp offers educational practice and general skills guidance, not an accredited qualification, professional certification, guarantee of employment, income, interview success, language fluency or business performance. Learning examples and assessments are designed for practice; Users must independently verify important information before relying on it professionally.",
          "AI-assisted challenges, explanations or feedback, where enabled, may contain errors, omissions or inappropriate suggestions. Users should review such output critically and avoid supplying passwords, financial credentials, sensitive personal information or confidential third-party material. AI-assisted features may be subject to reasonable limits, review and availability conditions.",
        ],
      },
      {
        heading: "16. Changes to the Platform and Service Availability",
        body: [
          "SkillUp may add, revise, retire, delay or reorganize learning paths, challenges, progress features or Premium functionality as it improves the Platform. Planned skills are not a promise of availability or a guaranteed launch date. The Services may be disrupted by maintenance, internet or device issues, payment failures and other circumstances. The Company does not guarantee uninterrupted or error-free access; prepaid rights remain subject to the relevant offer and applicable law.",
        ],
      },
      {
        heading: "17. Disclaimer of Warranties",
        body: [
          "TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, SKILLUP, ITS EDUCATIONAL CONTENT, PRACTICE RESULTS, FEEDBACK, AI-ASSISTED FEATURES AND OTHER SERVICES ARE PROVIDED ON AN “AS IS” AND “AS AVAILABLE” BASIS. THE COMPANY DOES NOT GUARANTEE THAT LEARNING CONTENT WILL ALWAYS BE COMPLETE, ACCURATE, ERROR-FREE OR AVAILABLE OR THAT ANY PARTICULAR SKILL, RESULT, GRADE, CERTIFICATE OR CAREER OUTCOME WILL BE ACHIEVED.",
          "NOTHING IN THESE TERMS LIMITS WARRANTIES OR CONSUMER REMEDIES THAT CANNOT BE EXCLUDED BY LAW.",
        ],
      },
      {
        heading: "18. Limitation of Liability",
        body: [
          "TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, THE COMPANY, ITS AFFILIATES, LICENSORS, SERVICE PROVIDERS, EMPLOYEES, AGENTS, OFFICERS, PARTNERS, AND DIRECTORS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF, OR INABILITY TO USE, THE SERVICES, PLATFORM, CONTENT, THIRD-PARTY SERVICES, OR REWARDS.",
          "This limitation includes, to the extent permitted by law, loss of revenue, profits, business, anticipated savings, use, goodwill, data, or other intangible losses.",
          "Nothing in these Terms shall exclude or limit liability that cannot lawfully be excluded or limited.",
        ],
      },
      {
        heading: "19. Indemnification",
        body: [
          "To the fullest extent permitted by applicable law, you agree to defend, indemnify, and hold harmless the Company, its affiliates, licensors, service providers, officers, directors, employees, contractors, agents, suppliers, successors, and assigns from and against claims, liabilities, damages, judgments, losses, costs, and reasonable expenses arising out of or relating to:",
        ],
        list: [
          "Your violation of these Terms.",
          "Your use of the Services.",
          "User Content submitted by you.",
          "Your unauthorized use of Platform Content.",
          "Your infringement or misappropriation of any third-party intellectual property or other rights.",
          "Any claim that your User Content caused damage to a third party.",
          "Any third-party claim or demand arising out of your use of the Platform.",
          "Your fraudulent, unlawful, or abusive conduct in connection with the Platform or a Promotion.",
        ],
      },
      {
        heading: "20. Termination and Suspension",
        body: [
          "The Company may reasonably restrict, suspend or terminate accounts or Services because of material Terms violations, account abuse, score manipulation, unauthorized content extraction, fraudulent charges, security risks, legal requirements or other legitimate protective reasons. Users may stop using the free Services or cancel eligible subscriptions through available account or provider controls.",
          "Termination may end access to Premium features, subject to existing lawful entitlements, refund rights, retained learning progress and mandatory legal requirements. Clauses that should survive termination, including intellectual property, liability and dispute provisions, remain applicable.",
        ],
      },
      {
        heading: "21. Privacy and Data Protection",
        body: [
          "SkillUp handles personal data in accordance with its Privacy Policy at https://skillupshop.codistan.org/en/legal/privacy. Depending on enabled features, it may process account data, learning goals, answers, quiz results, scores, progress history, subscription status, device and security logs, payment references and support requests.",
          "Payment details are processed through authorized payment providers. Never share MPINs, passwords, one-time codes or complete financial credentials with SkillUp support. Learning records may be retained where necessary for legitimate service delivery, compliance, security and legally required audit purposes. No electronic system can guarantee complete security.",
        ],
      },
      {
        heading: "22. Changes to the Terms and Conditions",
        body: [
          "SkillUp may update these Terms from time to time. Material changes will be communicated where required by applicable law or reasonably practicable. The current version will be made available on the Platform, with an effective or last-updated date. Continued use after an update may constitute acceptance, subject to any legally required notice or consent.",
        ],
      },
      {
        heading: "23. Force Majeure",
        body: [
          "The Company shall not be liable for any failure or delay in performing its obligations to the extent caused by circumstances beyond its reasonable control, including acts of God, war, terrorism, insurrection, civil disorder, national or local emergencies, acts or omissions of government authorities, industrial disputes, fire, lightning, explosion, flood, exceptionally severe weather, epidemic, pandemic, natural disasters, power failures, internet or telecommunications failures, technical failures, cyberattacks, system failures or interruptions required for maintenance.",
        ],
      },
      {
        heading: "24. Governing Law and Dispute Resolution",
        body: [
          "24.1 Governing Law. These Terms shall be governed by the applicable laws of the Islamic Republic of Pakistan, subject to mandatory consumer protections and other applicable rules.",
          "24.2 Good-Faith Resolution. Users should first contact support@digisphere.com.pk to request an amicable resolution of a dispute, with relevant account, transaction or Content references and without sharing confidential payment credentials.",
          "24.3 Courts and Alternative Dispute Resolution. Any applicable dispute-resolution, arbitration or court-jurisdiction mechanism must be consistent with Pakistani law and any binding consumer rights. Any proceedings will be brought before courts of competent jurisdiction in Pakistan, subject to applicable laws and mandatory consumer protections. Parties may agree to another lawful method of dispute resolution in writing.",
        ],
      },
      {
        heading: "25. Waiver and Severability",
        body: [
          "The Company’s failure to enforce any right or provision of these Terms shall not constitute a waiver of that right or provision. Any waiver shall be effective only to the extent expressly stated and shall not constitute a continuing waiver. Any waiver of a provision must be in writing and signed by an authorized representative of the Company to be effective.",
          "If any provision of these Terms is held to be invalid, illegal or unenforceable by a competent court or tribunal, that provision shall be limited or removed only to the minimum extent necessary, and the remaining provisions shall continue in full force and effect.",
        ],
      },
      {
        heading: "26. Entire Agreement",
        body: [
          "These Terms, together with the Privacy Policy and any additional agreements, schedules, promotional terms or policies expressly incorporated by reference, constitute the entire agreement between you and the Company concerning the Services and supersede prior agreements, communications, representations or understandings concerning the Services, except where expressly preserved.",
        ],
      },
      {
        heading: "27. Contact Information",
        body: [
          "For questions, complaints, subscription or payment issues, account access, copyright notices or other enquiries, please contact:",
          "SkillUp",
          "Website: https://skillupshop.codistan.org/en",
          "Email: support@digisphere.com.pk",
          "Operator: DigiSphere",
          "When requesting a payment review, provide an order or transaction reference if available. Never send your MPIN, OTP, password or full payment credentials.",
        ],
      },
      {
        heading: "Schedule A — Promotional Terms and Conditions",
        body: [
          "These provisions apply only when SkillUp expressly launches a Promotion and publishes the relevant offer terms. Promotional offers apply only when expressly announced with specific eligibility, duration and reward terms.",
          "A.1 Promotion-Specific Terms. Each Promotion must identify its promoter, eligibility criteria, geographic and age restrictions (if any), start and end dates, entry method, selection mechanism, number and nature of rewards, redemption rules and notification process. Any paid-subscription requirement must be stated conspicuously before entry.",
          "A.2 Fair Participation and Verification. The Company may take reasonable measures to verify compliance with published rules and prevent fraud, duplicate entries or manipulation. Disqualification must be based on the applicable rules and subject to law.",
          "A.3 Rewards and Third-Party Benefits. Any Reward, voucher, discount or third-party benefit is governed by the published offer and, where applicable, the third party’s terms. Substitution, cash alternatives, fulfillment periods and expiry must be expressly disclosed for each Promotion. SkillUp makes no promise of particular prizes absent a specific announced offer.",
          "A.4 Changes and Cancellation. Any changes, postponements, cancellations or reward substitutions will be handled in accordance with the published Promotion terms and applicable law. Material changes should be communicated where practicable.",
          "A.5 Privacy and Publicity. Personal information collected for a Promotion will be handled under the Privacy Policy and any promotion-specific notice. Public disclosure of winner names, images or testimonials must follow applicable law and consent requirements.",
          "A.6 Support. Questions concerning a Promotion may be sent to support@digisphere.com.pk.",
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
