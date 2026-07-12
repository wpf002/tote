import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A payment rail — card/ACH processing. Tote is **rails only**: funds settle
 * directly to the trainer's connected account; Tote never holds a balance
 * (invariant #7). This interface is provider-agnostic so a real Stripe/Dwolla
 * adapter drops in behind it; {@link SandboxRail} lets the whole flow run in dev
 * and tests with no external account or credentials.
 */
export interface RailProvider {
  readonly name: string;
  /** Create a payment intent on the provider; returns its id + client secret. */
  createIntent(input: {
    amountCents: bigint;
    reference: string;
    connectedAccountId?: string;
  }): Promise<{ providerIntentId: string; clientSecret: string }>;
  /** Verify a webhook payload's signature against the endpoint secret. */
  verifyWebhook(payload: string, signature: string, secret: string): boolean;
}

export interface RailEvent {
  type: "payment_intent.succeeded" | "payment_intent.failed";
  providerIntentId: string;
  amountCents: string; // stringified bigint (JSON-safe)
}

/** Sign a payload the way {@link SandboxRail} expects (also used by tests). */
export function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * A fully-functional in-process rail for dev and tests. Intent ids are
 * deterministic from their reference so flows are reproducible; webhook
 * signatures are real HMACs so the verification path is exercised for real.
 */
export class SandboxRail implements RailProvider {
  readonly name = "sandbox";

  async createIntent(input: {
    amountCents: bigint;
    reference: string;
  }): Promise<{ providerIntentId: string; clientSecret: string }> {
    const providerIntentId = `pi_sbx_${input.reference}`;
    return { providerIntentId, clientSecret: `cs_${providerIntentId}` };
  }

  verifyWebhook(payload: string, signature: string, secret: string): boolean {
    const expected = signPayload(payload, secret);
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Build a signed webhook event as the provider would post it (dev helper). */
  buildEvent(event: RailEvent, secret: string): { payload: string; signature: string } {
    const payload = JSON.stringify(event);
    return { payload, signature: signPayload(payload, secret) };
  }
}
