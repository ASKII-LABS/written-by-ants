import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type OnboardingPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

function getErrorMessage(error?: string) {
  if (!error) {
    return null;
  }

  switch (error) {
    case "display_name_required":
      return "Poet Name is required.";
    case "save_failed":
      return "Could not save your profile. Try again.";
    default:
      return "Something went wrong. Try again.";
  }
}

async function saveOnboardingAction(formData: FormData) {
  "use server";

  const displayName = String(formData.get("display_name") ?? "").trim();
  const bioRaw = String(formData.get("bio") ?? "").trim();

  if (!displayName) {
    redirect("/onboarding?error=display_name_required");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      display_name: displayName,
      bio: bioRaw.length > 0 ? bioRaw : null,
      public_profile: true,
    },
    {
      onConflict: "id",
    },
  );

  if (error) {
    redirect("/onboarding?error=save_failed");
  }

  revalidatePath("/", "layout");
  revalidatePath("/");
  revalidatePath("/profile");
  redirect("/");
}

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfile) {
    redirect("/");
  }

  const { error } = await searchParams;
  const errorMessage = getErrorMessage(error);

  return (
    <section className="mx-auto max-w-2xl rounded border border-ant-border bg-ant-paper-2 p-6">
      <h1 className="font-serif text-3xl text-ant-primary">Welcome, poet</h1>
      <p className="mt-2 text-sm text-ant-ink/80">
        Set your public poet details. You can edit these later in your profile.
      </p>

      {errorMessage ? <p className="mt-3 text-sm text-ant-primary">{errorMessage}</p> : null}

      <form action={saveOnboardingAction} className="mt-6 space-y-4">
        <div className="space-y-2">
          <label htmlFor="display_name" className="text-sm font-medium text-ant-ink">
            Poet Name
          </label>
          <input
            id="display_name"
            name="display_name"
            required
            maxLength={80}
            className="w-full rounded border border-ant-border bg-ant-paper px-3 py-2 outline-none transition focus:border-ant-primary"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="bio" className="text-sm font-medium text-ant-ink">
            Bio (optional)
          </label>
          <textarea
            id="bio"
            name="bio"
            rows={4}
            maxLength={320}
            className="w-full rounded border border-ant-border bg-ant-paper px-3 py-2 outline-none transition focus:border-ant-primary"
          />
        </div>

        <button
          type="submit"
          className="cursor-pointer rounded border border-ant-primary bg-ant-primary px-4 py-2 font-medium text-ant-paper transition hover:bg-ant-accent"
        >
          Save and continue
        </button>
      </form>
    </section>
  );
}
