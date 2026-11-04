<script lang="ts">
  import type { KickState } from '../../../shared/kick'
  import { openSettings } from '../lib/ui.svelte'

  let { kick }: { kick: KickState } = $props()

  const view = $derived.by(() => {
    if (kick.login !== 'logged-in') return { text: 'Kick: entrar', tone: 'off' }
    if (kick.redeemBlocked || kick.problem) return { text: 'Kick: ver problema', tone: 'err' }
    if (kick.config.lives === 0) return { text: 'Kick: desligado', tone: 'off' }
    const watching = kick.channels.filter((c) => c.watching).length
    return {
      text: `Kick ${watching} ${watching === 1 ? 'live' : 'lives'} · +${kick.gainedTotal} pts`,
      tone: watching > 0 ? 'ok' : 'idle',
    }
  })
</script>

<button class="pill" title="Configurações da Kick" onclick={() => openSettings('kick')}>
  <span class="dot {view.tone}"></span>
  {view.text}
</button>

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    border-radius: 99px;
    padding: 3px 10px;
    border-color: var(--twitch);
    background: var(--twitch-soft);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--off);
  }
  .dot.ok {
    background: var(--ok);
  }
  .dot.idle {
    background: var(--twitch);
  }
  .dot.wait {
    background: var(--warn);
  }
  .dot.err {
    background: var(--err);
  }
</style>
