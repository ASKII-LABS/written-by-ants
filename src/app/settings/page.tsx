import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SettingsPageProps = {
  searchParams: Promise<{
    saved?: string;
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
      return "Could not save settings.";
    default:
      return "Could not save settings.";
  }
}

async function updateSettingsAction(formData: FormData) {
  "use server";

  const displayName = String(formData.get("display_name") ?? "").trim();
  const bioRaw = String(formData.get("bio") ?? "").trim();
  const publicProfile = formData.get("public_profile") === "on";

  if (!displayName) {
    redirect("/settings?error=display_name_required");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      bio: bioRaw.length > 0 ? bioRaw : null,
      public_profile: publicProfile,
    })
    .eq("id", user.id);

  if (error) {
    redirect("/settings?error=save_failed");
  }

  revalidatePath("/", "layout");
  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, bio, public_profile")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/onboarding");
  }

  const { saved, error } = await searchParams;
  const showSaved = saved === "1";
  const errorMessage = getErrorMessage(error);

  return (
    <section className="space-y-6">
      <div className="rounded border border-ant-border bg-ant-paper-2 p-5">
        <h1 className="font-serif text-3xl text-ant-primary">Settings</h1>
        <p className="mt-1 text-sm text-ant-ink/80">Account profile and visibility controls.</p>
      </div>

      <div className="rounded border border-ant-border bg-ant-paper-2 p-5">
        <h2 className="font-serif text-2xl text-ant-primary">Profile settings</h2>
        {showSaved ? <p className="mt-2 text-sm text-ant-primary">Settings updated.</p> : null}
        {errorMessage ? <p className="mt-2 text-sm text-ant-primary">{errorMessage}</p> : null}

        <form action={updateSettingsAction} className="mt-4 space-y-4">
          <div className="space-y-2">
            <label htmlFor="display_name" className="text-sm font-medium text-ant-ink">
              Poet Name
            </label>
            <input
              id="display_name"
              name="display_name"
              required
              defaultValue={profile.display_name}
              className="w-full rounded border border-ant-border bg-ant-paper px-3 py-2 outline-none transition focus:border-ant-primary"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="bio" className="text-sm font-medium text-ant-ink">
              Bio
            </label>
            <textarea
              id="bio"
              name="bio"
              rows={4}
              defaultValue={profile.bio ?? ""}
              className="w-full rounded border border-ant-border bg-ant-paper px-3 py-2 outline-none transition focus:border-ant-primary"
            />
          </div>

          <div className="space-y-3 rounded border border-ant-border bg-ant-paper p-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="public_profile"
                defaultChecked={profile.public_profile}
                className="h-4 w-4 accent-ant-primary"
              />
              <span>Public profile</span>
            </label>

            <label className="flex items-center gap-2 opacity-70">
              <input
                type="checkbox"
                defaultChecked={false}
                disabled
                className="h-4 w-4 accent-ant-primary"
              />
              <span>Show my email publicly (not supported, always off)</span>
            </label>
          </div>

          <button
            type="submit"
            className="cursor-pointer rounded border border-ant-primary bg-ant-primary px-4 py-2 font-medium text-ant-paper transition hover:bg-ant-accent"
          >
            Save settings
          </button>
        </form>
      </div>
    </section>
  );
}
