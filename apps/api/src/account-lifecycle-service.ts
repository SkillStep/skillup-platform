import { createHmac } from "node:crypto";

import type { DatabaseClient } from "@skillup/database";

import {
  type AccountLifecycleService,
  type AccountSessionView,
  createAccountLifecycleService as createBaseAccountLifecycleService,
  registerAccountLifecycleRoutes,
} from "./account-lifecycle.js";

export { registerAccountLifecycleRoutes };
export type { AccountLifecycleService };

type SessionRow = Readonly<{
  id: string;
  token_digest: string;
  client_label: string | null;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
  idle_expires_at: Date;
  revoked_at: Date | null;
}>;

function sessionDigest(secret: string, token: string): string {
  return createHmac("sha256", secret).update(`session:${token}`).digest("hex");
}

export function createAccountLifecycleService(
  options: Readonly<{
    pool: DatabaseClient["pool"];
    sessionSecret: string;
    now?: () => Date;
  }>,
): AccountLifecycleService {
  const base = createBaseAccountLifecycleService(options);

  return {
    ...base,
    sessions: async (userId, currentToken): Promise<readonly AccountSessionView[]> => {
      const currentDigest = sessionDigest(options.sessionSecret, currentToken);
      const result = await options.pool.query<SessionRow>(
        `select id, token_digest, client_label, created_at, last_seen_at,
                expires_at, idle_expires_at, revoked_at
           from auth_sessions
          where user_id = $1
          order by created_at desc
          limit 50`,
        [userId],
      );

      return result.rows.map((row) => ({
        id: row.id,
        clientLabel: row.client_label,
        createdAt: row.created_at.toISOString(),
        lastSeenAt: row.last_seen_at.toISOString(),
        expiresAt: row.expires_at.toISOString(),
        idleExpiresAt: row.idle_expires_at.toISOString(),
        revokedAt: row.revoked_at?.toISOString() ?? null,
        current: row.token_digest === currentDigest,
      }));
    },
  };
}
