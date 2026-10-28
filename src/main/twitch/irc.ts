export type IrcMessage = {
  tags: Record<string, string>
  prefix?: string
  command: string
  params: string[]
}

/** Uma linha IRC: `[@tags] [:prefix] COMANDO [params...] [:trailing]`. */
export function parseIrc(line: string): IrcMessage {
  let rest = line
  const tags: Record<string, string> = {}

  if (rest.startsWith('@')) {
    const sp = rest.indexOf(' ')
    for (const kv of rest.slice(1, sp).split(';')) {
      const eq = kv.indexOf('=')
      tags[eq === -1 ? kv : kv.slice(0, eq)] = eq === -1 ? '' : kv.slice(eq + 1)
    }
    rest = rest.slice(sp + 1)
  }

  let prefix: string | undefined
  if (rest.startsWith(':')) {
    const sp = rest.indexOf(' ')
    prefix = rest.slice(1, sp)
    rest = rest.slice(sp + 1)
  }

  const params: string[] = []
  while (rest.length) {
    if (rest.startsWith(':')) {
      params.push(rest.slice(1))
      break
    }
    const sp = rest.indexOf(' ')
    if (sp === -1) {
      params.push(rest)
      break
    }
    params.push(rest.slice(0, sp))
    rest = rest.slice(sp + 1)
  }

  return { tags, prefix, command: params.shift() ?? '', params }
}

export const nickOf = (msg: IrcMessage) => msg.prefix?.split('!')[0]

export const channelOf = (msg: IrcMessage) => msg.params[0]?.replace(/^#/, '')
