import { NextResponse } from "next/server";
import { jsonError } from "@/app/api/api-helpers";
import { verifyPin } from "@/lib/db/pin-auth";
import { createSessionCookie, createStaffSessionToken } from "@/lib/staff-session";
import { z } from "zod";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000;
const BLOCK_DURATION_MS = 5 * 60 * 1000;

// Zod schema for input validation
const pinLoginSchema = z.object({
  pin: z.string()
    .min(4, "PIN 4 digits ka hona chahiye")
    .max(8, "PIN 8 digits se bada nahi ho sakta")
    .regex(/^\d+$/, "PIN sirf numbers hona chahiye")
});

// Basic memory-based rate limiting fallback (since Vercel functions might be stateless, 
// a proper Redis store is recommended in production. For now, we avoid CREATE TABLE on every hit)
// Note: This relies on the database schema `login_attempts` being pre-created.
import { getDb } from "@/lib/supabase/db";

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfConnectingIp = request.headers.get("cf-connecting-ip");

  const ipStr = forwarded?.split(",")[0] || realIp || cfConnectingIp || "unknown";
  return ipStr.trim().split(":")[0]; 
}

async function checkRateLimit(ip: string): Promise<{ allowed: boolean; retryAfterSec?: number; remaining?: number }> {
  try {
    const sql = getDb();
    const now = new Date();

    // We assume login_attempts is pre-created by migrations now, no CREATE TABLE IF NOT EXISTS here.
    const records = await sql`SELECT * FROM login_attempts WHERE ip_address = ${ip} LIMIT 1`;
    const record = records[0];

    if (!record) return { allowed: true, remaining: MAX_ATTEMPTS };

    const blockedUntil = record.blocked_until ? new Date(record.blocked_until) : new Date(0);
    const firstAttempt = new Date(record.first_attempt);

    if (blockedUntil > now) {
      return {
        allowed: false,
        retryAfterSec: Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000),
      };
    }

    if (now.getTime() - firstAttempt.getTime() > WINDOW_MS) {
      await sql`DELETE FROM login_attempts WHERE ip_address = ${ip}`;
      return { allowed: true, remaining: MAX_ATTEMPTS };
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      const newBlockedUntil = new Date(now.getTime() + BLOCK_DURATION_MS);
      await sql`UPDATE login_attempts SET blocked_until = ${newBlockedUntil.toISOString()} WHERE ip_address = ${ip}`;
        
      return {
        allowed: false,
        retryAfterSec: Math.ceil(BLOCK_DURATION_MS / 1000),
      };
    }

    return { allowed: true, remaining: MAX_ATTEMPTS - record.attempts };
  } catch (err) {
    // If table doesn't exist yet, fail open to allow logins (progressive enhancement)
    return { allowed: true, remaining: MAX_ATTEMPTS };
  }
}

async function recordFailedAttempt(ip: string) {
  try {
    const sql = getDb();
    const now = new Date().toISOString();
    const records = await sql`SELECT attempts FROM login_attempts WHERE ip_address = ${ip} LIMIT 1`;
    const record = records[0];

    if (!record) {
      await sql`INSERT INTO login_attempts (ip_address, attempts, first_attempt) VALUES (${ip}, 1, ${now})`;
    } else {
      await sql`UPDATE login_attempts SET attempts = ${record.attempts + 1} WHERE ip_address = ${ip}`;
    }
  } catch(e) {}
}

async function clearAttempts(ip: string) {
  try {
    const sql = getDb();
    await sql`DELETE FROM login_attempts WHERE ip_address = ${ip}`;
  } catch(e) {}
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rateCheck = await checkRateLimit(ip);

    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          message: `Bahut zyada koshishe hui hain. ${rateCheck.retryAfterSec} second baad phir try karein.`,
          retryAfter: rateCheck.retryAfterSec,
        },
        { status: 429, headers: { "Retry-After": String(rateCheck.retryAfterSec) } },
      );
    }

    const body = await request.json();
    
    // Zod validation
    const parsed = pinLoginSchema.safeParse(body);
    if (!parsed.success) {
      const errorMessage = parsed.error.issues[0]?.message || "Invalid input";
      return NextResponse.json({ message: errorMessage }, { status: 400 });
    }

    const pin = parsed.data.pin;
    const result = await verifyPin(pin);

    if (!result) {
      await recordFailedAttempt(ip);
      const remaining = Math.max((rateCheck.remaining ?? MAX_ATTEMPTS) - 1, 0);
      return NextResponse.json(
        {
          message: remaining > 0 ? `Galat PIN. ${remaining} koshishe baaki hain.` : "Galat PIN. Kripya 5 minute baad dobara koshish karein.",
          attemptsRemaining: remaining,
        },
        { status: 401 },
      );
    }

    await clearAttempts(ip);

    const sessionToken = createStaffSessionToken({
      id: result.member.id,
      name: result.member.name,
      role: result.member.role,
      designation: result.member.designation,
      clinicAccess: result.member.clinicAccess,
    });

    const response = NextResponse.json({
      success: true,
      sessionToken,
      member: {
        id: result.member.id,
        name: result.member.name,
        role: result.member.role,
        designation: result.member.designation,
        clinicAccess: result.member.clinicAccess,
        status: result.member.status,
      },
    });

    response.headers.append("Set-Cookie", createSessionCookie(sessionToken));
    return response;
  } catch (error) {
    return jsonError(error);
  }
}

