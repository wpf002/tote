import "server-only";
import { SandboxRail } from "@tote/services";

/**
 * The active payment rail. Sandbox by default so the flow runs with no external
 * account or credentials; a real Stripe/Dwolla adapter drops in here when the
 * app is ready to go live. Tote is rails-only — funds settle to the trainer's
 * connected account, never to Tote.
 */
export const rail = new SandboxRail();

export const WEBHOOK_SECRET = process.env.RAIL_WEBHOOK_SECRET ?? "whsec_dev";
