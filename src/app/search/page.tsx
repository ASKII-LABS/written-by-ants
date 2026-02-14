import { SearchResultsTabs } from "@/components/search-results-tabs";
import { sanitizePoemHtml } from "@/lib/sanitize";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SearchPageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

type SearchPoem = {
  id: string;
  title: string;
  content_html: string;
  author_id: string;
  created_at: string;
};

type SearchPoet = {
  id: string;
  display_name: string;
  bio: string | null;
  public_profile: boolean;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let poemResults: SearchPoem[] = [];
  let poetResults: SearchPoet[] = [];

  if (query.length > 0) {
    const [titleResult, contentResult, profileResult] = await Promise.all([
      supabase
        .from("poems")
        .select("id, title, content_html, author_id, created_at")
        .eq("is_published", true)
        .ilike("title", `%${query}%`),
      supabase
        .from("poems")
        .select("id, title, content_html, author_id, created_at")
        .eq("is_published", true)
        .ilike("content_html", `%${query}%`),
      supabase
        .from("profiles")
        .select("id, display_name, bio, public_profile")
        .ilike("display_name", `%${query}%`),
    ]);

    const poemMap = new Map<string, SearchPoem>();
    [...(titleResult.data ?? []), ...(contentResult.data ?? [])].forEach((poem) => {
      poemMap.set(poem.id, poem as SearchPoem);
    });

    poemResults = Array.from(poemMap.values()).sort(
      (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    );

    poetResults = ((profileResult.data ?? []) as SearchPoet[])
      .filter((poet) => poet.public_profile || poet.id === user?.id)
      .sort((left, right) => left.display_name.localeCompare(right.display_name));
  }

  const authorIds = Array.from(new Set(poemResults.map((poem) => poem.author_id)));
  const authorMap = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", authorIds);

    (profiles ?? []).forEach((profile) => {
      authorMap.set(profile.id, profile.display_name);
    });
  }

  const normalizedPoemResults = poemResults.map((poem) => ({
    ...poem,
    safe_content_html: sanitizePoemHtml(poem.content_html),
    author_name: authorMap.get(poem.author_id) ?? "Unknown Poet",
  }));

  const normalizedPoetResults = poetResults.map((poet) => ({
    id: poet.id,
    display_name: poet.display_name ?? "Poet",
    bio: poet.bio,
  }));

  return (
    <section className="space-y-6">
      <div className="rounded border border-ant-border bg-ant-paper-2 p-5">
        <h1 className="font-serif text-3xl text-ant-primary">Search</h1>
        <p className="mt-1 text-sm text-ant-ink/80">
          {query.length > 0 ? `Results for "${query}"` : "Search by poem title, content, or poet name."}
        </p>
      </div>

      {query.length === 0 ? (
        <div className="rounded border border-ant-border bg-ant-paper-2 p-5 text-sm text-ant-ink/80">
          Enter a search term in the header.
        </div>
      ) : null}

      {query.length > 0 ? (
        <SearchResultsTabs
          poemResults={normalizedPoemResults}
          poetResults={normalizedPoetResults}
          currentUserId={user?.id}
        />
      ) : null}
    </section>
  );
}
