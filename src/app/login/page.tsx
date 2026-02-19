import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

function getErrorMessage(error?: string) {
  if (!error) {
    return null;
  }

  switch (error) {
    case "invalid_link":
      return "That sign-in link is invalid or expired. Request a fresh code.";
    case "auth_failed":
      return "Could not sign you in. Request a fresh code.";
    default:
      return "Could not sign you in. Try again.";
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (profile) {
      redirect("/");
    }

    redirect("/onboarding");
  }

  const { error } = await searchParams;
  const errorMessage = getErrorMessage(error);

  return (
    <section className="mx-auto max-w-lg rounded border border-ant-border bg-ant-paper-2 p-6">
      <h1 className="font-serif text-3xl text-ant-primary">Login</h1>
      <p className="mt-2 text-sm text-ant-ink/80">
        Passwordless only. Enter your email and we&apos;ll send an 8-digit code.
      </p>

      {errorMessage ? <p className="mt-3 text-sm text-ant-primary">{errorMessage}</p> : null}

      <div className="mt-5">
        <LoginForm />
      </div>
    </section>
  );
}
