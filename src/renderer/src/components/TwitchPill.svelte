<script lang="ts">
  import type { TwitchState } from '../../../shared/ipc'
  import { clock } from '../lib/clock.svelte'
  import { summarize } from '../lib/twitch'
  import { openSettings } from '../lib/ui.svelte'

  let { twitch }: { twitch: TwitchState } = $props()

  const summary = $derived(summarize(twitch, clock.now))

  const view = $derived.by(() => {
    const auth = twitch.auth.state
    if (auth === 'disconnected') return { text: 'Twitch: conectar', tone: 'off' }
    if (auth === 'pending') return { text: 'Twitch: aguardando código', tone: 'wait' }
    if (auth === 'reauth') return { text: 'Twitch: conectar de novo', tone: 'err' }
    if (twitch.connection !== 'connected') return { text: 'Twitch: reconectando…', tone: 'wait' }
    return {
      text: `Twitch ${summary.live}/${summary.total} ao vivo · ${summary.bonus} bônus`,
      tone: summary.bonus > 0 ? 'ok' : 'idle',
    }
  })
</script>

<button class="pill" title="Configurações da Twitch" onclick={() => openSettings('twitch')}>
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
