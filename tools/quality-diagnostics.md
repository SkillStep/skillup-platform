# Branch quality diagnostics

## foundation: PASS

## deployment: PASS

## production: PASS

## secrets: PASS

## format: PASS

## lint: PASS

## typecheck: FAIL (2)

```text
$ pnpm shared:build && pnpm -r --if-present typecheck
$ pnpm --filter @skillup/contracts --filter @skillup/content-schema --filter @skillup/gameplay-engine --filter @skillup/discoverability --filter @skillup/analytics --filter @skillup/ui --filter @skillup/database build
Scope: 7 of 10 workspace projects
packages/contracts build$ tsc -p tsconfig.json
packages/analytics build$ tsc -p tsconfig.json
packages/analytics build: Done
packages/ui build$ tsc -p tsconfig.json
packages/contracts build: Done
packages/database build$ tsc -p tsconfig.json
packages/ui build: Done
packages/database build: Done
packages/content-schema build$ tsc -p tsconfig.json
packages/discoverability build$ tsc -p tsconfig.json
packages/discoverability build: Done
packages/content-schema build: Done
packages/gameplay-engine build$ tsc -p tsconfig.json
packages/gameplay-engine build: Done
Scope: 9 of 10 workspace projects
packages/analytics typecheck$ tsc -p tsconfig.json --noEmit
packages/contracts typecheck$ tsc -p tsconfig.json --noEmit
packages/analytics typecheck: Done
packages/database typecheck$ tsc -p tsconfig.json --noEmit
packages/contracts typecheck: Done
packages/ui typecheck$ tsc -p tsconfig.json --noEmit
packages/ui typecheck: Done
packages/database typecheck: Done
packages/content-schema typecheck$ tsc -p tsconfig.json --noEmit
packages/discoverability typecheck$ tsc -p tsconfig.json --noEmit
packages/discoverability typecheck: Done
packages/content-schema typecheck: Done
apps/web typecheck$ tsc --noEmit
packages/gameplay-engine typecheck$ tsc -p tsconfig.json --noEmit
packages/gameplay-engine typecheck: Done
apps/web typecheck: Done
apps/api typecheck$ tsc -p tsconfig.json --noEmit
apps/api typecheck: src/ai-job-status.test.ts(4,42): error TS2835: Relative import paths need explicit file extensions in ECMAScript imports when '--moduleResolution' is 'node16' or 'nodenext'. Did you mean './ai-job-status.js'?
apps/api typecheck: src/app-hardening.test.ts(9,7): error TS2741: Property 'MAINTENANCE_INTERVAL_SECONDS' is missing in type '{ APP_ENV: "test"; API_HOST: string; API_PORT: number; PUBLIC_APP_URL: string; DATABASE_URL: string; DATABASE_MAX_CONNECTIONS: number; SESSION_COOKIE_NAME: string; SESSION_SECRET: string; ... 16 more ...; LOG_LEVEL: "silent"; }' but required in type '{ APP_ENV: "local" | "test" | "staging" | "production"; API_HOST: string; API_PORT: number; PUBLIC_APP_URL: string; DATABASE_URL: string; DATABASE_MAX_CONNECTIONS: number; MAINTENANCE_INTERVAL_SECONDS: number; ... 27 more ...; JAZZCASH_RETURN_URL?: string | undefined; }'.
apps/api typecheck: src/app.test.ts(9,7): error TS2741: Property 'MAINTENANCE_INTERVAL_SECONDS' is missing in type '{ APP_ENV: "test"; API_HOST: string; API_PORT: number; PUBLIC_APP_URL: string; DATABASE_URL: string; DATABASE_MAX_CONNECTIONS: number; SESSION_COOKIE_NAME: string; SESSION_SECRET: string; ... 16 more ...; LOG_LEVEL: "silent"; }' but required in type '{ APP_ENV: "local" | "test" | "staging" | "production"; API_HOST: string; API_PORT: number; PUBLIC_APP_URL: string; DATABASE_URL: string; DATABASE_MAX_CONNECTIONS: number; MAINTENANCE_INTERVAL_SECONDS: number; ... 27 more ...; JAZZCASH_RETURN_URL?: string | undefined; }'.
apps/api typecheck: src/gameplay.test.ts(10,7): error TS2741: Property 'MAINTENANCE_INTERVAL_SECONDS' is missing in type '{ APP_ENV: "test"; API_HOST: string; API_PORT: number; PUBLIC_APP_URL: string; DATABASE_URL: string; DATABASE_MAX_CONNECTIONS: number; SESSION_COOKIE_NAME: string; SESSION_SECRET: string; ... 16 more ...; LOG_LEVEL: "silent"; }' but required in type '{ APP_ENV: "local" | "test" | "staging" | "production"; API_HOST: string; API_PORT: number; PUBLIC_APP_URL: string; DATABASE_URL: string; DATABASE_MAX_CONNECTIONS: number; MAINTENANCE_INTERVAL_SECONDS: number; ... 27 more ...; JAZZCASH_RETURN_URL?: string | undefined; }'.
apps/api typecheck: src/maintenance.test.ts(3,41): error TS2835: Relative import paths need explicit file extensions in ECMAScript imports when '--moduleResolution' is 'node16' or 'nodenext'. Did you mean './maintenance.js'?
apps/api typecheck: src/progress.test.ts(10,7): error TS2741: Property 'MAINTENANCE_INTERVAL_SECONDS' is missing in type '{ APP_ENV: "test"; API_HOST: string; API_PORT: number; PUBLIC_APP_URL: string; DATABASE_URL: string; DATABASE_MAX_CONNECTIONS: number; SESSION_COOKIE_NAME: string; SESSION_SECRET: string; ... 16 more ...; LOG_LEVEL: "silent"; }' but required in type '{ APP_ENV: "local" | "test" | "staging" | "production"; API_HOST: string; API_PORT: number; PUBLIC_APP_URL: string; DATABASE_URL: string; DATABASE_MAX_CONNECTIONS: number; MAINTENANCE_INTERVAL_SECONDS: number; ... 27 more ...; JAZZCASH_RETURN_URL?: string | undefined; }'.
apps/api typecheck: Failed
/home/runner/work/skillup-platform/skillup-platform/apps/api:
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @skillup/api@0.0.0 typecheck: `tsc -p tsconfig.json --noEmit`
Exit status 2
[ELIFECYCLE] Command failed with exit code 2.
```

## test: FAIL (1)

```text
$ pnpm shared:build && pnpm -r --if-present test && node tools/run-python-tests.mjs
$ pnpm --filter @skillup/contracts --filter @skillup/content-schema --filter @skillup/gameplay-engine --filter @skillup/discoverability --filter @skillup/analytics --filter @skillup/ui --filter @skillup/database build
Scope: 7 of 10 workspace projects
packages/contracts build$ tsc -p tsconfig.json
packages/analytics build$ tsc -p tsconfig.json
packages/contracts build: Done
packages/analytics build: Done
packages/ui build$ tsc -p tsconfig.json
packages/database build$ tsc -p tsconfig.json
packages/ui build: Done
packages/database build: Done
packages/content-schema build$ tsc -p tsconfig.json
packages/discoverability build$ tsc -p tsconfig.json
packages/discoverability build: Done
packages/content-schema build: Done
packages/gameplay-engine build$ tsc -p tsconfig.json
packages/gameplay-engine build: Done
Scope: 9 of 10 workspace projects
packages/analytics test$ vitest run
packages/contracts test$ vitest run
packages/contracts test: [1m[30m[46m RUN [49m[39m[22m [36mv4.1.10 [39m[90m/home/runner/work/skillup-platform/skillup-platform/packages/contracts[39m
packages/analytics test: [1m[30m[46m RUN [49m[39m[22m [36mv4.1.10 [39m[90m/home/runner/work/skillup-platform/skillup-platform/packages/analytics[39m
packages/contracts test:  [32m✓[39m dist/index.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 9[2mms[22m[39m
packages/analytics test:  [32m✓[39m dist/index.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 8[2mms[22m[39m
packages/contracts test:  [32m✓[39m src/index.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 21[2mms[22m[39m
packages/contracts test: [2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
packages/contracts test: [2m      Tests [22m [1m[32m4 passed[39m[22m[90m (4)[39m
packages/contracts test: [2m   Start at [22m 17:17:24
packages/contracts test: [2m   Duration [22m 792ms[2m (transform 60ms, setup 0ms, import 243ms, tests 31ms, environment 0ms)[22m
packages/contracts test: Done
packages/database test$ vitest run
packages/analytics test:  [32m✓[39m src/index.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 7[2mms[22m[39m
packages/analytics test: [2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
packages/analytics test: [2m      Tests [22m [1m[32m4 passed[39m[22m[90m (4)[39m
packages/analytics test: [2m   Start at [22m 17:17:24
packages/analytics test: [2m   Duration [22m 755ms[2m (transform 88ms, setup 0ms, import 132ms, tests 15ms, environment 0ms)[22m
packages/analytics test: Done
packages/ui test$ vitest run
packages/database test: [1m[30m[46m RUN [49m[39m[22m [36mv4.1.10 [39m[90m/home/runner/work/skillup-platform/skillup-platform/packages/database[39m
packages/ui test: [1m[30m[46m RUN [49m[39m[22m [36mv4.1.10 [39m[90m/home/runner/work/skillup-platform/skillup-platform/packages/ui[39m
packages/ui test:  [32m✓[39m dist/index.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 14[2mms[22m[39m
packages/ui test:  [32m✓[39m src/index.test.tsx [2m([22m[2m1 test[22m[2m)[22m[32m 14[2mms[22m[39m
packages/ui test: [2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
packages/ui test: [2m      Tests [22m [1m[32m2 passed[39m[22m[90m (2)[39m
packages/ui test: [2m   Start at [22m 17:17:25
packages/ui test: [2m   Duration [22m 834ms[2m (transform 104ms, setup 0ms, import 210ms, tests 28ms, environment 0ms)[22m
packages/ui test: Done
packages/database test:  [32m✓[39m dist/index.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
packages/database test:  [32m✓[39m src/index.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
packages/database test: [2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
packages/database test: [2m      Tests [22m [1m[32m4 passed[39m[22m[90m (4)[39m
packages/database test: [2m   Start at [22m 17:17:25
packages/database test: [2m   Duration [22m 1.96s[2m (transform 216ms, setup 0ms, import 1.55s, tests 10ms, environment 0ms)[22m
packages/database test: Done
packages/content-schema test$ vitest run
packages/discoverability test$ vitest run
packages/content-schema test: [1m[30m[46m RUN [49m[39m[22m [36mv4.1.10 [39m[90m/home/runner/work/skillup-platform/skillup-platform/packages/content-schema[39m
packages/discoverability test: [1m[30m[46m RUN [49m[39m[22m [36mv4.1.10 [39m[90m/home/runner/work/skillup-platform/skillup-platform/packages/discoverability[39m
packages/discoverability test:  [32m✓[39m dist/index.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 8[2mms[22m[39m
packages/content-schema test:  [32m✓[39m dist/index.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 36[2mms[22m[39m
packages/discoverability test:  [32m✓[39m src/index.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
packages/discoverability test: [2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
packages/discoverability test: [2m      Tests [22m [1m[32m4 passed[39m[22m[90m (4)[39m
packages/discoverability test: [2m   Start at [22m 17:17:28
packages/discoverability test: [2m   Duration [22m 671ms[2m (transform 73ms, setup 0ms, import 120ms, tests 14ms, environment 0ms)[22m
packages/discoverability test: Done
packages/content-schema test:  [32m✓[39m src/index.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 17[2mms[22m[39m
packages/content-schema test: [2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
packages/content-schema test: [2m      Tests [22m [1m[32m18 passed[39m[22m[90m (18)[39m
packages/content-schema test: [2m   Start at [22m 17:17:27
packages/content-schema test: [2m   Duration [22m 968ms[2m (transform 124ms, setup 0ms, import 313ms, tests 53ms, environment 0ms)[22m
packages/content-schema test: Done
apps/web test$ vitest run
packages/gameplay-engine test$ vitest run src
apps/web test: [1m[30m[46m RUN [49m[39m[22m [36mv4.1.10 [39m[90m/home/runner/work/skillup-platform/skillup-platform/apps/web[39m
packages/gameplay-engine test: [1m[30m[46m RUN [49m[39m[22m [36mv4.1.10 [39m[90m/home/runner/work/skillup-platform/skillup-platform/packages/gameplay-engine[39m
apps/web test:  [32m✓[39m app/[locale]/skills/public-discovery-source.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 17[2mms[22m[39m
apps/web test:  [32m✓[39m lib/public-catalog.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 13[2mms[22m[39m
packages/gameplay-engine test:  [32m✓[39m src/index.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 33[2mms[22m[39m
apps/web test:  [32m✓[39m app/pwa-boundary.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
packages/gameplay-engine test:  [32m✓[39m src/short-response-rubric.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 34[2mms[22m[39m
packages/gameplay-engine test: [2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
packages/gameplay-engine test: [2m      Tests [22m [1m[32m14 passed[39m[22m[90m (14)[39m
packages/gameplay-engine test: [2m   Start at [22m 17:17:29
packages/gameplay-engine test: [2m   Duration [22m 1.19s[2m (transform 246ms, setup 0ms, import 567ms, tests 67ms, environment 0ms)[22m
apps/web test:  [32m✓[39m app/production-boundary.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
packages/gameplay-engine test: Done
apps/web test:  [32m✓[39m lib/return-to.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 6[2mms[22m[39m
apps/web test:  [32m✓[39m app/api/v1/[...path]/route.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
apps/web test:  [32m✓[39m lib/locales.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
apps/web test:  [32m✓[39m app/[locale]/progress/progress-dashboard.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
apps/web test:  [31m❯[39m lib/home-content.test.ts [2m([22m[2m3 tests[22m[2m | [22m[31m1 failed[39m[2m)[22m[32m 12[2mms[22m[39m
apps/web test:      [32m✓[39m contains one pilot and stable unique slugs[32m 2[2mms[22m[39m
apps/web test: [31m     [31m×[31m selects the playable interview and workplace communication pilot[39m[32m 8[2mms[22m[39m
apps/web test:      [32m✓[39m exposes only reviewed launch or pilot paths with playable identifiers[32m 0[2mms[22m[39m
apps/web test:  [32m✓[39m app/[locale]/learn/[levelId]/level-player-source.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
apps/web test: [31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m
apps/web test: [41m[1m FAIL [22m[49m lib/home-content.test.ts[2m > [22mlaunch path content[2m > [22mselects the playable interview and workplace communication pilot
apps/web test: [31m[1mAssertionError[22m: expected { …(5) } to match object { …(2) }
apps/web test: (3 matching properties omitted from actual)[39m
apps/web test: [32m- Expected[39m
apps/web test: [31m+ Received[39m
apps/web test: [2m  {[22m
apps/web test: [32m-   "levelId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7",[39m
apps/web test: [31m+   "levelId": "3c315a1a-824a-413e-836d-69a9fc8bad1f",[39m
apps/web test: [2m    "slug": "interview-workplace-communication",[22m
apps/web test: [2m  }[22m
apps/web test: [36m [2m❯[22m lib/home-content.test.ts:[2m12:28[22m[39m
apps/web test:     [90m 10|[39m
apps/web test:     [90m 11|[39m   it("selects the playable interview and workplace communication pilot…
apps/web test:     [90m 12|[39m     [34mexpect[39m([34mfeaturedPath[39m())[33m.[39m[34mtoMatchObject[39m({
apps/web test:     [90m   |[39m                            [31m^[39m
apps/web test:     [90m 13|[39m       slug[33m:[39m [32m"interview-workplace-communication"[39m[33m,[39m
apps/web test:     [90m 14|[39m       levelId[33m:[39m [32m"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7"[39m[33m,[39m
apps/web test: [31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m
apps/web test: [2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m9 passed[39m[22m[90m (10)[39m
apps/web test: [2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m37 passed[39m[22m[90m (38)[39m
apps/web test: [2m   Start at [22m 17:17:29
apps/web test: [2m   Duration [22m 2.21s[2m (transform 171ms, setup 0ms, import 339ms, tests 79ms, environment 1ms)[22m
apps/web test: ::error file=/home/runner/work/skillup-platform/skillup-platform/apps/web/lib/home-content.test.ts,title=lib/home-content.test.ts > launch path content > selects the playable interview and workplace communication pilot,line=12,column=28::AssertionError: expected { …(5) } to match object { …(2) }%0A(3 matching properties omitted from actual)%0A%0A- Expected%0A+ Received%0A%0A  {%0A-   "levelId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7",%0A+   "levelId": "3c315a1a-824a-413e-836d-69a9fc8bad1f",%0A    "slug": "interview-workplace-communication",%0A  }%0A%0A ❯ lib/home-content.test.ts:12:28%0A%0A
apps/web test: Failed
/home/runner/work/skillup-platform/skillup-platform/apps/web:
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @skillup/web@0.0.0 test: `vitest run`
Exit status 1
[ELIFECYCLE] Test failed. See above for more details.
```

## build: FAIL (1)

```text
$ pnpm -r --if-present build
Scope: 9 of 10 workspace projects
packages/analytics build$ tsc -p tsconfig.json
packages/contracts build$ tsc -p tsconfig.json
packages/analytics build: Done
packages/database build$ tsc -p tsconfig.json
packages/contracts build: Done
packages/ui build$ tsc -p tsconfig.json
packages/ui build: Done
packages/database build: Done
packages/content-schema build$ tsc -p tsconfig.json
packages/discoverability build$ tsc -p tsconfig.json
packages/discoverability build: Done
packages/content-schema build: Done
apps/web build$ next build
packages/gameplay-engine build$ tsc -p tsconfig.json
apps/web build: ⚠ No build cache found. Please configure build caching for faster rebuilds. Read more: https://nextjs.org/docs/messages/no-cache
apps/web build: Attention: Next.js now collects completely anonymous telemetry regarding usage.
apps/web build: This information is used to shape Next.js' roadmap and prioritize features.
apps/web build: You can learn more, including how to opt-out if you'd not like to participate in this anonymous program, by visiting the following URL:
apps/web build: https://nextjs.org/telemetry
apps/web build: ▲ Next.js 16.2.12 (Turbopack)
apps/web build:   Creating an optimized production build ...
packages/gameplay-engine build: Done
apps/web build: ✓ Compiled successfully in 7.4s
apps/web build:   Running TypeScript ...
apps/web build: Failed to type check.
apps/web build: ./app/[locale]/public-content-page.tsx:58:21
apps/web build: Type error: Type 'string' is not assignable to type 'UrlObject | RouteImpl<string>'.
apps/web build:   [90m56 |[0m           [36mreturn[0m (
apps/web build:   [90m57 |[0m             <li key={[32m`[0m${kind[32m}:[0m${slug[32m}`[0m}>
apps/web build: [31m[1m>[0m [90m58 |[0m               <[33mLink[0m href={publicContentPath(kind [36mas[0m [33mPublicContentEntry[0m[[32m"kind"[0m], slug)}>
apps/web build:   [90m   |[0m                     [31m[1m^[0m
apps/web build:   [90m59 |[0m                 {slug.replaceAll([32m"-"[0m, [32m" "[0m)}
apps/web build:   [90m60 |[0m               </[33mLink[0m>
apps/web build:   [90m61 |[0m             </li>
apps/web build: Next.js build worker exited with code: 1 and signal: null
apps/web build: Failed
/home/runner/work/skillup-platform/skillup-platform/apps/web:
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @skillup/web@0.0.0 build: `next build`
Exit status 1
[ELIFECYCLE] Command failed with exit code 1.
```

