import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

const SESSION_COOKIE = "tote_session";
const ENTITY_COOKIE = "tote_entity";
const SESSION_TTL_DAYS = 30;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Create a DB-backed session for a user and set the httpOnly cookie. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { userId, tokenHash: sha256(token), expiresAt },
  });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
    cookies().delete(SESSION_COOKIE);
  }
}

export interface SessionUser {
  id: string;
  email: string;
  role: string;
  orgId: string;
  partyId: string | null;
}

/** Resolve the current authenticated user from the session cookie, or null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;

  const u = session.user;
  return { id: u.id, email: u.email, role: u.role, orgId: u.orgId, partyId: u.partyId };
}

export function getSelectedEntityId(): string | null {
  return cookies().get(ENTITY_COOKIE)?.value ?? null;
}

export function setSelectedEntityId(legalEntityId: string): void {
  cookies().set(ENTITY_COOKIE, legalEntityId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}
