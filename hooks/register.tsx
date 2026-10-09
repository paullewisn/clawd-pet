import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Ref } from '../types'

const branch = atom({ plugin: 'clawd', key: 'branch' } as const, null)
const refs = atom({ plugin: 'clawd', key: 'refs' } as const, [])
const mode = atom({ plugin: 'clawd', key: 'mode' } as const, 'requesting')
const model = atom({ plugin: 'clawd', key: 'model' } as const, '')
const drafting = atom({ plugin: 'clawd', key: 'drafting' } as const, false)
const doneSeq = atom({ plugin: 'clawd', key: 'doneSeq' } as const, 0)
const reviews = atom({ plugin: 'clawd', key: 'reviews' } as const, [])
const context = atom({ plugin: 'clawd', key: 'context' } as const, 0)

const MAX_REFS = 20
const REVIEW_POLL_MS = 20 * 60_000
const ADO_RESOURCE = '499b84ac-1321-427f-aa17-267ca6975798'
let adoUserId: string | null = null
let polling = false
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

type AdoPr = {
  id: number
  draft: boolean
  repo: string
  project: string
  by: string
  reviewers: { id: string; vote: number }[]
}

async function githubReviews($: EngineInterface): Promise<Ref[]> {
  const { exitCode, stdout } = await $.process.run([
    'gh', 'search', 'prs', '--review-requested=@me', '--state=open', '--draft=false',
    '--json', 'number,url', '-L', '20',
  ])

  if (exitCode !== 0) return []

  return (JSON.parse(stdout) as { number: number; url: string }[]).map(p => ({
    label: `PR#${p.number}`,
    href: p.url,
    kind: 'pr' as const,
  }))
}

async function adoReviews($: EngineInterface, org: string): Promise<Ref[]> {
  const rest = async (url: string, query?: string) => {
    const args = ['az', 'rest', '--resource', ADO_RESOURCE, '--url', url, '-o', 'json']
    if (query) args.push('--query', query)
    const r = await $.process.run(args)

    return r.exitCode === 0 ? (JSON.parse(r.stdout) as unknown) : null
  }

  if (!adoUserId) {
    adoUserId = (await rest(`${org}/_apis/connectionData`, 'authenticatedUser.id')) as string | null
  }

  if (!adoUserId) return []

  const me = adoUserId
  const prs = (await rest(
    `${org}/_apis/git/pullrequests?searchCriteria.reviewerId=${me}&searchCriteria.status=active&api-version=7.1`,
    'value[].{id:pullRequestId,draft:isDraft,repo:repository.name,project:repository.project.name,by:createdBy.id,reviewers:reviewers[].{id:id,vote:vote}}',
  )) as AdoPr[] | null

  return (prs ?? [])
    .filter(p => !p.draft && p.by !== me && p.reviewers.some(r => r.id === me && r.vote === 0))
    .map(p => ({
      label: `PR#${p.id}`,
      href: `${org}/${encodeURIComponent(p.project)}/_git/${encodeURIComponent(p.repo)}/pullrequest/${p.id}`,
      kind: 'pr' as const,
    }))
}

async function pollReviews($: EngineInterface) {
  if (polling) return
  polling = true

  try {
    const org = adoOrg()
    const [gh, ado] = await Promise.all([
      githubReviews($).catch(() => null),
      org ? adoReviews($, org).catch(() => null) : Promise.resolve([] as Ref[]),
    ])

    if (gh === null && ado === null) return

    const next = [...(gh ?? []), ...(ado ?? [])]
    const cur = await read($, reviews)

    if (next.map(key).join('|') !== cur.map(key).join('|')) {
      await update($, reviews, () => next)
    }
  } finally {
    polling = false
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
    void pollReviews($)
    $.clock.every(REVIEW_POLL_MS, () => {
      void pollReviews($)
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

    const above = await next(e)
    const { Box, Client } = $.ui.resolve(e)
    const all = await read($, refs)
    const ordered = [...all.filter(r => r.kind === 'ticket'), ...all.filter(r => r.kind === 'pr')]

    return (
      <Box flexDirection="column">
        {above}
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
          reviews: await read($, reviews),
          }}
        />
      </Box>
    )
  })
}
