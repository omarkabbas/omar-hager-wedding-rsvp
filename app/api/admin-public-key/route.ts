import { NextResponse } from "next/server";

const normalizePem = (value: string) => value.replace(/\\n/g, "\n");

export async function GET() {
  const publicKey = process.env.ADMIN_LOGIN_PUBLIC_KEY;

  if (!publicKey) {
    return NextResponse.json({ ok: false, error: "missing_config" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, publicKey: normalizePem(publicKey) });
}
