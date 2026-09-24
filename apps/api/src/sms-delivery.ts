import type { ApiConfig } from "./config.js";

export type SmsCodeDelivery = Readonly<{
  sendSignInCode: (
    input: Readonly<{ phone: string; code: string; expiresAt: Date }>,
  ) => Promise<void>;
}>;

function unavailable(): SmsCodeDelivery {
  return {
    sendSignInCode: async () => {
      const error = new Error("Sign-in SMS delivery is temporarily unavailable.");
      Object.assign(error, { statusCode: 503 });
      throw error;
    },
  };
}

export function createConfiguredSmsCodeDelivery(
  config: ApiConfig,
  fetcher: typeof fetch = fetch,
): SmsCodeDelivery {
  if (config.SMS_PROVIDER !== "twilio") return unavailable();

  const accountSid = config.TWILIO_ACCOUNT_SID;
  const authToken = config.TWILIO_AUTH_TOKEN;
  const from = config.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !from) return unavailable();

  return {
    sendSignInCode: async ({ phone, code }) => {
      const body = new URLSearchParams({
        To: phone,
        From: from,
        Body: `Your SkillUp code is ${code}. It expires in ${config.AUTH_CHALLENGE_MINUTES} minutes. Do not share this code.`,
      });
      const response = await fetcher(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
        {
          method: "POST",
          headers: {
            authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
            "content-type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) {
        const error = new Error("Sign-in SMS delivery is temporarily unavailable.");
        Object.assign(error, { statusCode: 503 });
        throw error;
      }
    },
  };
}
