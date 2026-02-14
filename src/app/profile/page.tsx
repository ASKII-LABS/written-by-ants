import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ProfilePageProps = {
  searchParams: Promise<{
    saved?: string;
    error?: string;
  }>;
};

type UserPoem = {
  id: string;
  title: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

function getErrorMessage(error?: string) {
  if (!error) {
    return null;
  }

  switch (error) {
    case "display_name_required":
      return "Poet Name is required.";
    case "save_failed":
      return "Could not save profile changes.";
    default:
      return "Could not save profile changes.";
  }
}

async function updateProfileAction(formData: FormData) {
  "use server";

  const displayName = String(formData.get("display_name") ?? "").trim();
  const bioRaw = String(formData.get("bio") ?? "").trim();
  const publicProfile = formData.get("public_profile") === "on";

  if (!displayName) {
    redirect("/profile?error=display_name_required");
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
    redirect("/profile?error=save_failed");
  }

  revalidatePath("/", "layout");
  revalidatePath("/");
  revalidatePath("/profile");
  redirect("/profile?saved=1");
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
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

  const { data: poems } = await supabase
    .from("poems")
    .select("id, title, is_published, created_at, updated_at")
    .eq("author_id", user.id)
    .order("updated_at", { ascending: false });

  const userPoems = (poems ?? []) as UserPoem[];
  const publishedPoems = userPoems.filter((poem) => poem.is_published);
  const draftPoems = userPoems.filter((poem) => !poem.is_published);

  const { saved, error } = await searchParams;
  const errorMessage = getErrorMessage(error);
  const showSaved = saved === "1";

  return (
    <section className="space-y-6">
      <div className="rounded border border-ant-border bg-ant-paper-2 p-5">
        <h1 className="font-serif text-3xl text-ant-primary">Profile</h1>
        <p className="mt-1 text-sm text-ant-ink/80">Manage your poet identity and your poems.</p>
      </div>

      <div className="rounded border border-ant-border bg-ant-paper-2 p-5">
        <h2 className="font-serif text-2xl text-ant-primary">Poet details</h2>
        {showSaved ? <p className="mt-2 text-sm text-ant-primary">Profile updated.</p> : null}
        {errorMessage ? <p className="mt-2 text-sm text-ant-primary">{errorMessage}</p> : null}
        <form action={updateProfileAction} className="mt-4 space-y-4">
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
            <h3 className="font-medium text-ant-ink">User settings</h3>

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
            Save changes
          </button>
        </form>
      </div>

      <div className="rounded border border-ant-border bg-ant-paper-2 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-2xl text-ant-primary">Your poems</h2>
          <Link
            href="/write"
            className="rounded border border-ant-primary bg-ant-primary px-3 py-2 text-sm font-medium text-ant-paper transition hover:bg-ant-accent"
          >
            New poem
          </Link>
        </div>

        <div className="mt-5 space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-ant-ink/70">Drafts</h3>
            {draftPoems.length === 0 ? (
              <p className="text-sm text-ant-ink/70">No drafts yet.</p>
            ) : (
              <ul className="space-y-2">
                {draftPoems.map((poem) => (
                  <li key={poem.id} className="rounded border border-ant-border bg-ant-paper p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-ant-ink">{poem.title}</p>
                        <p className="text-xs text-ant-ink/70">Updated {formatDate(poem.updated_at)}</p>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Link
                          href={`/poem/${poem.id}`}
                          className="rounded border border-ant-border px-2 py-1 transition hover:border-ant-primary hover:text-ant-primary"
                        >
                          Preview
                        </Link>
                        <Link
                          href={`/write?id=${poem.id}`}
                          className="rounded border border-ant-border px-2 py-1 transition hover:border-ant-primary hover:text-ant-primary"
                        >
                          Edit
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-ant-ink/70">Published</h3>
            {publishedPoems.length === 0 ? (
              <p className="text-sm text-ant-ink/70">No published poems yet.</p>
            ) : (
              <ul className="space-y-2">
                {publishedPoems.map((poem) => (
                  <li key={poem.id} className="rounded border border-ant-border bg-ant-paper p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-ant-ink">{poem.title}</p>
                        <p className="text-xs text-ant-ink/70">Published {formatDate(poem.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Link
                          href={`/poem/${poem.id}`}
                          className="rounded border border-ant-border px-2 py-1 transition hover:border-ant-primary hover:text-ant-primary"
                        >
                          View
                        </Link>
                        <Link
                          href={`/write?id=${poem.id}`}
                          className="rounded border border-ant-border px-2 py-1 transition hover:border-ant-primary hover:text-ant-primary"
                        >
                          Edit
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
