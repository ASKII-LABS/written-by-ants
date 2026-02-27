import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { SettingsSaveControls } from "@/components/settings-save-controls";
import { SettingsThemeSelect } from "@/components/settings-theme-select";
import { FooterFlashBanner } from "@/components/footer-flash-banner";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_THEME,
  isMissingThemeColumnError,
  normalizeTheme,
} from "@/lib/theme";

export const dynamic = "force-dynamic";

type SettingsPageProps = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
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
  const selectedTheme = normalizeTheme(String(formData.get("theme") ?? ""));

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

  const updateWithThemeResult = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      bio: bioRaw.length > 0 ? bioRaw : null,
      public_profile: publicProfile,
      theme: selectedTheme,
    })
    .eq("id", user.id);

  let error = updateWithThemeResult.error;
  if (isMissingThemeColumnError(error)) {
    const legacyUpdateResult = await supabase
      .from("profiles")
      .update({
        display_name: displayName,
        bio: bioRaw.length > 0 ? bioRaw : null,
        public_profile: publicProfile,
      })
      .eq("id", user.id);

    error = legacyUpdateResult.error;
  }

  if (error) {
    redirect("/settings?error=save_failed");
  }

  revalidatePath("/", "layout");
  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath(`/poet/${user.id}`);
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

  const profileWithThemeResult = await supabase
    .from("profiles")
    .select("display_name, bio, public_profile, theme")
    .eq("id", user.id)
    .maybeSingle();

  let profile = profileWithThemeResult.data;
  if (isMissingThemeColumnError(profileWithThemeResult.error)) {
    const legacyProfileResult = await supabase
      .from("profiles")
      .select("display_name, bio, public_profile")
      .eq("id", user.id)
      .maybeSingle();

    if (!legacyProfileResult.data) {
      redirect("/onboarding");
    }

    profile = {
      ...legacyProfileResult.data,
      theme: DEFAULT_THEME,
    };
  } else if (profileWithThemeResult.error) {
    redirect("/settings?error=save_failed");
  }

  if (!profile) {
    redirect("/onboarding");
  }

  const { error, saved } = await searchParams;
  const errorMessage = getErrorMessage(error);
  const showSavedBanner = saved === "1";

  return (
    <section className="space-y-6">
      <div className="rounded border border-ant-border bg-ant-paper-2 p-5">
        <h1 className="font-serif text-3xl text-ant-primary">Settings</h1>
        <p className="mt-1 text-sm text-ant-ink/80">Account profile and visibility controls.</p>
      </div>

      <div className="rounded border border-ant-border bg-ant-paper-2 p-5">
        <h2 className="font-serif text-2xl text-ant-primary">Profile settings</h2>
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
              className="w-full resize-none rounded border border-ant-border bg-ant-paper px-3 py-2 outline-none transition focus:border-ant-primary"
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
          </div>

          <div className="space-y-2">
            <label htmlFor="theme" className="block text-sm font-medium text-ant-ink">
              Theme
            </label>
            <SettingsThemeSelect
              id="theme"
              name="theme"
              defaultValue={normalizeTheme(profile.theme)}
            />
            <p className="text-xs text-ant-ink/70">Choose how the colony looks for you.</p>
          </div>

          <SettingsSaveControls />
        </form>
      </div>
      {showSavedBanner ? <FooterFlashBanner message="Changes saved." clearSearchParam="saved" /> : null}
    </section>
  );
}
