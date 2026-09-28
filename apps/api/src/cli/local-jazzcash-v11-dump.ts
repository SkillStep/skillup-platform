import { readApiConfig } from "../config.js";
import { buildJazzCashWalletLinkForm } from "../jazzcash-v11.js";

const config = readApiConfig();
const form = buildJazzCashWalletLinkForm(config, {
  msisdn: "03123456789",
  requestId: `ReqId${Date.now()}`,
});

console.log("=== METHOD / URL ===");
console.log("POST", form.actionUrl);
console.log("=== HOSTED FORM FIELDS (password redacted in logs if needed) ===");
console.log(
  JSON.stringify(
    {
      ...form.fields,
      pp_Password: "[redacted]",
      pp_SecureHash: form.fields.pp_SecureHash,
    },
    null,
    2,
  ),
);
console.log("=== NOTE ===");
console.log(
  "Browser must POST these fields to the LinkWallet portal. After MPIN, JazzCash returns to",
  config.JAZZCASH_V11_RETURN_URL,
);
