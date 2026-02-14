import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const nextPathParam = requestUrl.searchParams.get("next");

  const safeNextPath = nextPathParam && nextPathParam.startsWith("/") ? nextPathParam : "/";
  const loginRedirect = new URL("/login?error=invalid_link", requestUrl.origin);

  const supabase = await createClient();

  let authError = null;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    authError = error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    authError = error;
  } else {
    return NextResponse.redirect(loginRedirect);
  }

  if (authError) {
    return NextResponse.redirect(new URL("/login?error=auth_failed", requestUrl.origin));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?error=auth_failed", requestUrl.origin));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.redirect(new URL("/onboarding", requestUrl.origin));
  }

  return NextResponse.redirect(new URL(safeNextPath, requestUrl.origin));
}
