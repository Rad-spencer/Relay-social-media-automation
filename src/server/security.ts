import {
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
  createHmac,
} from "node:crypto";
import { promisify } from "node:util";
import type { Request } from "express";
import type { Role } from "../shared/types.js";
import { AppError } from "./repository.js";
const derive = promisify(scrypt);
export const token = () => randomBytes(32).toString("hex");
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${((await derive(password, salt, 64)) as Buffer).toString("hex")}`;
}
export async function passwordMatches(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const actual = (await derive(password, salt, 64)) as Buffer;
  const expected = Buffer.from(key, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function authorize(
  role: Role,
  scope: "configure" | "reply" | "export" | "read",
) {
  const allowed =
    scope === "read" ||
    (scope === "reply"
      ? ["owner", "admin", "agent"]
      : ["owner", "admin"]
    ).includes(role);
  if (!allowed)
    throw new AppError(
      403,
      "FORBIDDEN",
      "Your workspace role does not allow this action.",
    );
}
export function cookieToken(req: Request) {
  return req.headers.cookie
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("relay_session="))
    ?.slice(14);
}
export function safeUrl(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[|172\.(1[6-9]|2\d|3[01])\.)/i.test(
        u.hostname,
      ) &&
      u.hostname.includes(".")
    );
  } catch {
    return false;
  }
}
export function verifySignature(
  raw: Buffer,
  signature: string | undefined,
  secret: string,
  timestamp: string,
) {
  if (
    !signature ||
    !secret ||
    Math.abs(Date.now() - Number(timestamp) * 1000) > 300000 ||
    !Number.isFinite(Number(timestamp))
  )
    return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(raw)
    .digest("hex");
  const actual = Buffer.from(signature.replace(/^sha256=/, ""), "hex");
  const target = Buffer.from(expected, "hex");
  return actual.length === target.length && timingSafeEqual(actual, target);
}
