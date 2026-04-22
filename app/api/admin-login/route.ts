import { constants, privateDecrypt, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

const normalizePem = (value: string) => value.replace(/\\n/g, "\n");

export async function POST(request: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const privateKey = process.env.ADMIN_LOGIN_PRIVATE_KEY;

  if (!adminPassword || !privateKey) {
    return NextResponse.json({ ok: false, error: "missing_config" }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as { encryptedPassword?: unknown } | null;
  const encryptedPassword = typeof body?.encryptedPassword === "string" ? body.encryptedPassword : "";

  if (!encryptedPassword) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  let password: string;

  try {
    password = privateDecrypt(
      {
        key: normalizePem(privateKey),
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(encryptedPassword, "base64"),
    ).toString("utf8");
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const submitted = Buffer.from(password);
  const expected = Buffer.from(adminPassword);
  const isMatch = submitted.length === expected.length && timingSafeEqual(submitted, expected);

  if (!isMatch) {
    return NextResponse.json({ ok: false, error: "incorrect_password" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
