import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Ref } from '../types'

const branch = atom({ plugin: 'clawd', key: 'branch' } as const, null)
const refs = atom({ plugin: 'clawd', key: 'refs' } as const, [])
const mode = atom({ plugin: 'clawd', key: 'mode' } as const, 'requesting')
const model = atom({ plugin: 'clawd', key: 'model' } as const, '')
const drafting = atom({ plugin: 'clawd', key: 'drafting' } as const, false)
const doneSeq = atom({ plugin: 'clawd', key: 'doneSeq' } as const, 0)
const context = atom({ plugin: 'clawd', key: 'context' } as const, 0)

const MAX_REFS = 20
const adoOrg = (): string =>
  ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.CLAWD_ADO_ORG ?? '').replace(/\/+$/, '')
const URL_CHARS = '[A-Za-z0-9._~%/:+=&?-]'

const find = (text: string): Ref[] => {
  const found: Ref[] = []
  const org = adoOrg()
  const ticket = (id: string, href: string) =>
    found.push({ label: `AB#${id}`, href, kind: 'ticket' })

  for (const m of text.matchAll(new RegExp(`https://dev\\.azure\\.com/${URL_CHARS}*?/_workitems/edit/(\\d+)`, 'g'))) {
    ticket(m[1]!, m[0])
  }
  if (org) {
    for (const m of text.matchAll(/\bAB#(\d+)/g)) {
      ticket(m[1]!, `${org}/_workitems/edit/${m[1]}`)
    }
  }
  for (const m of text.matchAll(new RegExp(`https://dev\\.azure\\.com/${URL_CHARS}*?/pullrequest/(\\d+)`, 'g'))) {
    found.push({ label: `PR#${m[1]}`, href: m[0], kind: 'pr' })
  }
  for (const m of text.matchAll(new RegExp(`https://github\\.com/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+/pull/(\\d+)`, 'g'))) {
    found.push({ label: `PR#${m[1]}`, href: m[0], kind: 'pr' })
  }

  return found
}

const key = (r: Ref) => (r.kind === 'ticket' ? `t:${r.label}` : `p:${r.href}`)

async function refresh($: EngineInterface) {
  let name: string | null = null

  try {
    const { exitCode, stdout } = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
    const out = stdout.trim()
    name = exitCode === 0 && out ? (out === 'HEAD' ? '(detached)' : out) : null
  } catch {
    name = null
  }

  if (name !== (await read($, branch))) {
    await update($, branch, () => name)
  }

  try {
    const pct = Math.round((await $.session.usage()).context.percent ?? 0)

    if (pct !== (await read($, context))) {
      await update($, context, () => pct)
    }
  } catch {}

  const current = (await $.session.model()) ?? ''

  if (current !== (await read($, model))) {
    await update($, model, () => current)
  }
}

async function setMode($: EngineInterface, next: string) {
  if (next !== (await read($, mode))) {
    await update($, mode, () => next)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await refresh($)
    $.clock.every(2000, () => {
      void refresh($)
    })

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const isMain = !e.agentId

    if (isMain) {
      await setMode($, 'requesting')
      await update($, model, () => e.model)
    }

    const stream = next(e)
    let last = ''

    for await (const chunk of stream) {
      if (isMain && chunk.kind !== last) {
        const phase =
          chunk.kind === 'thinking' ? 'thinking'
            : chunk.kind === 'text' ? 'responding'
              : chunk.kind === 'input' ? 'tool-input'
                : ''

        if (phase) {
          last = chunk.kind
          await setMode($, phase)
        }
      }

      yield chunk
    }

    return await stream.result
  })

  on('tool.call', async ($, e, next) => {
    if (!e.agentId) {
      await setMode($, 'tool-use')
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await setMode($, 'requesting')
    await refresh($)
    await update($, doneSeq, n => n + 1)

    return next(e)
  })

  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    const isDraft = r.text.length > 0

    if (isDraft !== (await read($, drafting))) {
      await update($, drafting, () => isDraft)
    }

    return r
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, drafting, () => false)

    return next(e)
  })

  on('session.append', async ($, e, next) => {
    const text = JSON.stringify(e.message.content ?? '')
    const seen = await read($, refs)
    const known = new Set(seen.map(key))
    const fresh: Ref[] = []

    for (const r of find(text)) {
      if (!known.has(key(r))) {
        known.add(key(r))
        fresh.push(r)
      }
    }

    if (fresh.length > 0) {
      await update($, refs, cur => [...cur, ...fresh].slice(0, MAX_REFS))
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Client } = $.ui.resolve(e)
    const all = await read($, refs)
    const ordered = [...all.filter(r => r.kind === 'ticket'), ...all.filter(r => r.kind === 'pr')]

    return (
      <Client
        key="clawd"
        module="./clawd.tsx"
        width="100%"
        height={5}
        props={{
          branch: await read($, branch),
          refs: ordered,
          working: e.props.isWorking,
          model: await read($, model),
          mode: await read($, mode),
          drafting: await read($, drafting),
          doneSeq: await read($, doneSeq),
          context: await read($, context),
        }}
      />
    )
  })
}
