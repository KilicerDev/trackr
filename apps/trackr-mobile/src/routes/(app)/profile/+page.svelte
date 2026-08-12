<script lang="ts">
  import LogOut from "@lucide/svelte/icons/log-out";
  import { Avatar, Card, ScreenHeader } from "$lib/components/ui";
  import { session } from "$lib/session.svelte";
  import { m } from "$lib/paraglide/messages";

  /* Profile — who am I, where am I signed in, sign out. Preference editing
     stays on the desktop until /api/v1 grows a settings surface. */

  // Same deterministic avatar color the server derives for other users
  // (web/src/routes/(app)/+layout.server.ts).
  function avatarColor(id: string): string {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return `hsl(${h} 55% 60%)`;
  }

  const user = $derived(session.user);
  const orgs = $derived(session.me?.orgs ?? []);
</script>

<main class="mx-auto max-w-lg px-4">
  <ScreenHeader title={m.profile_title()} />

  {#if user}
    <div class="mt-6 flex items-center gap-4">
      <Avatar name={user.name} color={avatarColor(user.id)} size={56} />
      <div class="min-w-0">
        <p class="truncate text-[17px] font-semibold text-(--color-text)">{user.name}</p>
        <p class="truncate text-[14px] text-(--color-text-muted)">{user.email}</p>
      </div>
    </div>
  {/if}

  <p class="mt-7 mb-2 text-[12px] tracking-[0.08em] text-(--color-text-light) uppercase">
    {m.profile_server()}
  </p>
  <Card padding="none">
    <p class="truncate px-4 py-3 font-mono text-[13px] text-(--color-text-muted)">
      {session.serverUrl}
    </p>
  </Card>

  {#if orgs.length}
    <p class="mt-5 mb-2 text-[12px] tracking-[0.08em] text-(--color-text-light) uppercase">
      {m.profile_orgs()}
    </p>
    <Card padding="none" class="divide-y divide-(--color-border-subtle)">
      {#each orgs as org (org.id)}
        <div class="flex h-12 items-center gap-3 px-4 text-[14px] text-(--color-text)">
          <span class="h-2 w-2 shrink-0 rounded-full" style="background: {org.color}"></span>
          <span class="min-w-0 flex-1 truncate">{org.name}</span>
        </div>
      {/each}
    </Card>
  {/if}

  <button
    type="button"
    class="mt-7 mb-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-(--color-border) bg-(--color-bg-subtle) text-[14px] font-medium text-(--color-status-error-text) transition-colors active:bg-[#ef4f5e]/10"
    onclick={() => void session.signOut()}
  >
    <LogOut size={16} strokeWidth={1.6} />
    {m.shell_signout()}
  </button>
</main>
