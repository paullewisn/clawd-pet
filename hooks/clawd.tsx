import type { ClientModule } from 'claude-code'

const BG = '#141413'
const BODY = '#d97757'
const EYE = '#000000'
const SHADE = '#be684d'

const FAMILY_COLOURS: Record<string, string> = {
  sonnet: BODY,
  haiku: '#4fb8a0',
  opus: '#9b7bd9',
  fable: '#e0b040',
}

const darken = (hex: string) =>
  `#${[1, 3, 5]
    .map(i =>
      Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.875)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`

let ink = BODY
let shadeInk = SHADE

const familyOf = (model: string | undefined) =>
  Object.keys(FAMILY_COLOURS).find(f => (model ?? '').toLowerCase().includes(f)) ?? 'sonnet'

const W = 12
const ROWS = 8
const METER = 2
const RED_AT = 75
const METER_ROWS = ROWS / 2
const METER_GREEN = '#4caf50'
const METER_ORANGE = '#ff9800'
const METER_RED = '#f44336'
const METER_EMPTY = '#3a3a38'

type Pixel = '.' | 'X' | 'E' | 'S'

type Pose = 'front' | 'left' | 'right' | 'happy' | 'crouch' | 'down'

const rows = (r: string[]) => r.map(l => l.split('') as Pixel[])

const front = rows([
  '..XXXXXXXX..',
  '..XEXXXXEX..',
  'XSXXXXXXXXSX',
  'XSXXXXXXXXSX',
  '..XXXXXXXX..',
  '..XXXXXXXX..',
])

const heads: Record<Pose, Pixel[][]> = {
  crouch: front,
  front,
  left: rows([
    '..XXXXXXXS..',
    '..XEXXEXXS..',
    'XSXXXXXXXSSS',
    'XSXXXXXXXSSS',
    '..XXXXXXXS..',
    '..XXXXXXXS..',
  ]),
  right: rows([
    '..SXXXXXXX..',
    '..SXXEXXEX..',
    'SSSXXXXXXXSX',
    'SSSXXXXXXXSX',
    '..SXXXXXXX..',
    '..SXXXXXXX..',
  ]),
  down: rows([
    '..XXXXXXXX..',
    '..XXXXXXXX..',
    'XSXXXXXXXXSX',
    'XSXEXXXXEXSX',
    '..XXXXXXXX..',
    '..XXXXXXXX..',
  ]),
  happy: rows([
    'XSXXXXXXXX..',
    'XSXEXXXXEX..',
    '..EXEXXEXESX',
    '..XXXXXXXXSX',
    '..XXXXXXXX..',
    '..XXXXXXXX..',
  ]),
}

const legRows = (top: string, feet: string) => rows([top, feet])

const TOPS = '..X.X..X.X..'
const gait = [
  legRows(TOPS, '..X.X..X.X..'),
  legRows(TOPS, '....X....X..'),
  legRows(TOPS, '..X.X..X.X..'),
  legRows(TOPS, '..X....X....'),
]

const GAIT_ORDER = [0, 1, 0, 3]

const happyFlip = rows([
  '..XXXXXXXXSX',
  '..XEXXXXEXSX',
  'XSEXEXXEXE..',
  'XSXXXXXXXX..',
  '..XXXXXXXX..',
  '..XXXXXXXX..',
])

const shadeLeg = (pose: Pose, legs: Pixel[][]): Pixel[][] => {
  const col = pose === 'right' ? 2 : pose === 'left' ? 9 : -1
  return col < 0 ? legs : legs.map(r => r.map((p, c) => (c === col && p === 'X' ? 'S' : p)))
}

const sprite = (pose: Pose, step: number, flip: boolean): Pixel[][] =>
  pose === 'crouch'
    ? [...rows(['............']), ...heads.crouch, ...rows([TOPS])]
    : [...(pose === 'happy' && flip ? happyFlip : heads[pose]), ...shadeLeg(pose, gait[GAIT_ORDER[step % 4]!]!)]

const colour = (p: Pixel) => (p === 'X' ? ink : p === 'E' ? EYE : p === 'S' ? shadeInk : BG)

type Glyph = { x: number; ch: string; age: number; dx: number }

type S = {
  x: number
  target: number
  pause: number
  steps: number
  pose: Pose
  react: number
  tick: number
  dir: number
  turn: number
  cheer: number
  blink: number
  doneSeq: number
  glyphs: Glyph[]
  family: string
  phase: 'idle' | 'leaving' | 'entering'
}

const GLYPH_STYLES = {
  plain: ['0', '1'],
  doubleStruck: ['\u{1D7D8}', '\u{1D7D9}'],
  bold: ['\u{1D7CE}', '\u{1D7CF}'],
  monospace: ['\u{1D7F6}', '\u{1D7F7}'],
  sansBold: ['\u{1D7EC}', '\u{1D7ED}'],
}
const GLYPH_STYLE: keyof typeof GLYPH_STYLES = 'sansBold'
const GLYPHS = GLYPH_STYLES[GLYPH_STYLE]
const GLYPH_FADE = 8
const GLYPH_MAX = 160
const TURN_TICKS = 5
const CHEER_TICKS = 16

const stepGlyphs = (gs: Glyph[], spawn: boolean, x: number, cols: number): Glyph[] => {
  const next = gs
    .map(g => ({ ...g, x: g.x + g.dx, age: g.age + 1 }))
    .filter(g => g.x >= 0 && g.x < cols)

  if (spawn) {
    next.push({
      x: x >= 8 ? x + 1 : x + W - 2,
      ch: GLYPHS[Math.random() < 0.5 ? 0 : 1]!,
      age: 0,
      dx: x >= 8 ? -1 : 1,
    })
  }

  return next.slice(-GLYPH_MAX)
}

const busyPose = (mode: string, tick: number): Pose =>
  mode === 'thinking'
    ? Math.floor(tick / 12) % 2 === 0 ? 'left' : 'right'
    : mode === 'tool-use' || mode === 'tool-input'
      ? Math.floor(tick / 3) % 2 === 0 ? 'crouch' : 'front'
      : 'front'

const spawnEvery = (mode: string) => (mode === 'tool-use' || mode === 'tool-input' ? 1 : mode === 'thinking' ? 2 : 3)

const idlePoses: Pose[] = ['front', 'happy', 'left', 'right', 'crouch', 'crouch']

type Props = {
  branch: string | null
  refs: { label: string; href: string; kind: string }[]
  working: boolean
  model?: string
  mode: string
  drafting: boolean
  doneSeq: number
  context?: number
}

const LINK = '#6cb6ff'
const TEXT = '#faf9f5'
const MIN_BUBBLE = 24
const MAX_BUBBLE = 60
const MIN_COLS = 40

const MIN_PAUSE = 9
const SPEAK_TICKS = 125
const CROUCH_TICKS = 4

let bubbleSpan: [number, number] | null = null
let latest: Props | null = null

const Clawd: ClientModule<Props> = (props, surface) => {
  const { Box, Text, Link } = surface.elements
  const cols = Math.max(surface.columns - METER, W)
  const max = cols - W
  const s = surface.state as S | undefined

  if (s === undefined) {
    surface.every(120, () => {
      const L = latest
      const c0 = surface.state as S
      const m = Math.max(surface.columns - METER, W) - W
      const busy = L?.working === true
      const tick = c0.tick + 1
      const spawn = busy && tick % spawnEvery(L!.mode) === 0
      const c: S = {
        ...c0,
        tick,
        turn: Math.max(0, c0.turn - 1),
        blink: c0.blink > 0 ? c0.blink - 1 : Math.random() < (busy && L?.mode === 'thinking' ? 0.07 : 0.03) ? 2 : 0,
        cheer: Math.max(0, c0.cheer - 1),
        glyphs: stepGlyphs(c0.glyphs, spawn, c0.x, Math.max(surface.columns - METER, W)),
      }
      if (c0.phase === 'leaving') {
        surface.setState(
          c0.x <= -W
            ? { ...c, phase: 'entering', family: familyOf(L?.model), x: -W, target: 0, dir: 1 }
            : { ...c, x: c0.x - 1, steps: c0.steps + 1, dir: -1, target: -W, react: 0, pause: 0 },
        )
        return
      }
      if (c0.phase === 'entering') {
        surface.setState(
          c0.x >= c0.target
            ? { ...c, phase: 'idle', pause: MIN_PAUSE }
            : { ...c, x: c0.x + 1, steps: c0.steps + 1, dir: 1, react: 0, pause: 0 },
        )
        return
      }
      if (familyOf(L?.model) !== c0.family) {
        surface.setState({ ...c, phase: 'leaving', react: 0, pause: 0, target: -W })
        return
      }
      if (busy || c0.cheer > 0) {
        surface.setState(c)
        return
      }
      if (L?.drafting === true) {
        surface.setState(
          c.x > 0 ? { ...c, x: c.x - 1, steps: c.steps + 1, dir: -1, target: 0, react: 0, pause: 0 } : c,
        )
        return
      }
      if (c.pause > 0) {
        surface.setState({ ...c, pause: c.pause - 1, react: Math.max(0, c.react - 1) })
        return
      }
      if (c.x === c.target || c.target > m) {
        surface.setState({
          ...c,
          target: Math.floor(Math.random() * (m + 1)),
          pause: MIN_PAUSE + Math.floor(Math.random() * 25),
          pose: idlePoses[Math.floor(Math.random() * idlePoses.length)]!,
        })
        return
      }
      const dir = Math.sign(c.target - c.x)
      surface.setState({
        ...c,
        x: c.x + dir,
        steps: c.steps + 1,
        dir,
        turn: dir !== c.dir ? TURN_TICKS : c.turn,
      })
    })
    surface.onPointer(ev => {
      if (ev.type !== 'down' || ev.button !== 'left') return
      const px = ev.x - METER
      const c = surface.state as S
      if (c.phase !== 'idle') return
      const m = Math.max(surface.columns - METER, W) - W
      if (px >= c.x && px < c.x + W && ev.y >= 1 && ev.y <= ROWS / 2) {
        surface.setState(
          c.react > 0
            ? { ...c, target: c.x, pause: MIN_PAUSE, react: 0, pose: 'front' }
            : { ...c, target: c.x, pause: SPEAK_TICKS, react: SPEAK_TICKS, pose: 'happy' },
        )
      } else if (c.react > 0 && bubbleSpan && px >= bubbleSpan[0] && px < bubbleSpan[1]) {
        return
      } else {
        surface.setState({ ...c, target: Math.max(0, Math.min(m, px - W / 2)), pause: 0, react: 0 })
      }
    })
    surface.setState({
      x: 0,
      target: 0,
      pause: 10,
      steps: 0,
      pose: 'front',
      react: 0,
      tick: 0,
      dir: 0,
      turn: 0,
      cheer: 0,
      blink: 0,
      doneSeq: props.doneSeq,
      glyphs: [],
      family: familyOf(props.model),
      phase: 'idle',
    })
  }

  latest = props
  const family = s?.family ?? familyOf(props.model)
  ink = FAMILY_COLOURS[family]!
  shadeInk = family === 'sonnet' ? SHADE : darken(ink)

  if (s !== undefined && s.doneSeq !== props.doneSeq) {
    surface.setState({ ...s, doneSeq: props.doneSeq, cheer: CHEER_TICKS })
  }

  const x = Math.min(s?.x ?? 0, max)
  const transit = s !== undefined && s.phase !== 'idle'
  const busy = props.working
  const toEdge = !busy && props.drafting && s !== undefined && s.x > 0
  const held = busy || props.drafting || (s !== undefined && s.cheer > 0)
  const walking = s !== undefined && !held && s.pause === 0 && s.x !== s.target
  const idle: Pose = s && s.react > 0 ? (s.react > SPEAK_TICKS - CROUCH_TICKS ? 'crouch' : 'happy') : (s?.pose ?? 'front')
  const pose: Pose = transit
    ? s.phase === 'leaving' ? 'left' : 'right'
    : busy
    ? busyPose(props.mode, s?.tick ?? 0)
    : props.drafting
      ? toEdge || (props.context ?? 0) >= RED_AT ? 'left' : 'down'
      : s && s.cheer > 0
        ? 'happy'
        : walking
          ? s.dir < 0 ? 'left' : 'right'
          : idle
  const raw = sprite(pose, walking || toEdge || transit ? (s?.steps ?? 0) % 4 : 0, Math.floor((s?.tick ?? 0) / 3) % 2 === 1)

  const closed = s !== undefined && s.blink > 0 && pose !== 'happy'
  const px = closed ? raw.map(r => r.map(p => (p === 'E' ? 'X' : p))) : raw

  const stationary = s !== undefined && s.pause > 0 && s.react > 0
  const branchText = props.branch ? `⎇ ${props.branch}` : '⎇ (no git branch)'
  const fullLinks = props.refs.map(r => r.label).join(' ')
  const wanted = Math.min(
    MAX_BUBBLE,
    Math.max(MIN_BUBBLE, branchText.length + 4, fullLinks.length + 4),
  )
  const roomRight = cols - (x + W + 1)
  const roomLeft = x - 1
  const side: 'right' | 'left' | 'none' =
    !stationary || cols < MIN_COLS || Math.max(roomRight, roomLeft) < MIN_BUBBLE
      ? 'none'
      : roomRight >= wanted || roomRight >= roomLeft
        ? 'right'
        : 'left'
  const bw = side === 'none' ? 0 : Math.min(wanted, side === 'right' ? roomRight : roomLeft)
  const inner = bw - 4
  bubbleSpan = side === 'right' ? [x + W + 1, x + W + 1 + bw] : side === 'left' ? [x - 1 - bw, x - 1] : null

  const fit = (t: string) => (t.length > inner ? `${t.slice(0, inner - 1)}…` : t)
  const shown: Props['refs'] = []
  let used = 0
  props.refs.forEach((r, i) => {
    const len = r.label.length + (shown.length ? 1 : 0)
    const reserve = i < props.refs.length - 1 ? 4 : 0
    if (shown.length === i && used + len + reserve <= inner) {
      shown.push(r)
      used += len
    }
  })
  const hidden = props.refs.length - shown.length
  const more = hidden > 0 ? `${shown.length ? ' ' : ''}+${hidden}` : ''
  const empty = props.refs.length === 0 ? 'no PRs or tickets yet' : ''

  const bubble = (t: number) => {
    if (t === 0) return <Text key="b" color={ink}>{`╭${'─'.repeat(bw - 2)}╮`}</Text>
    if (t === 3) return <Text key="b" color={ink}>{`╰${'─'.repeat(bw - 2)}╯`}</Text>
    if (t === 1) {
      const line = fit(branchText)
      return (
        <Text key="b" color={ink}>
          {'│ '}
          <Text color={TEXT}>{line + ' '.repeat(inner - line.length)}</Text>
          {' │'}
        </Text>
      )
    }
    const textLen = empty ? fit(empty).length : used + more.length
    return (
      <Text key="b" color={ink}>
        {'│ '}
        {empty ? (
          <Text color={TEXT} dimColor>{fit(empty)}</Text>
        ) : (
          <Text color={LINK}>
            {shown.map((r, i) => (
              <Text key={r.href}>
                {i > 0 ? ' ' : ''}
                <Link href={r.href}>{r.label}</Link>
              </Text>
            ))}
            {more}
          </Text>
        )}
        <Text>{' '.repeat(Math.max(0, inner - textLen))}</Text>
        {' │'}
      </Text>
    )
  }

  const pad = (n: number, k: string) =>
    n > 0 ? <Text key={k}>{' '.repeat(n)}</Text> : null

  const fill = Math.max(0, Math.min(100, props.context ?? 0)) / 100 * METER_ROWS * 2
  const meter = (row: number) => {
    const level = METER_ROWS - row
    const units = Math.max(0, Math.min(2, fill - level * 2))
    const zone = level < 2 ? METER_GREEN : level < 3 ? METER_ORANGE : METER_RED
    const ch = units >= 1.5 ? '█' : units >= 0.5 ? '▄' : '░'

    return <Text key="meter" color={units >= 0.5 ? zone : METER_EMPTY}>{ch + ' '}</Text>
  }

  const lines = []
  for (let t = 0; t < ROWS / 2; t++) {
    const r = t * 2
    type Cell = { ch: string; fg?: string; bg?: string; dim?: boolean }
    const cellsRow: Cell[] = []
    for (let c = 0; c < W; c++) {
      const top = colour(px[r]![c]!)
      const bot = colour(px[r + 1]![c]!)
      cellsRow.push(
        top === BG && bot === BG
          ? { ch: ' ' }
          : top === BG
            ? { ch: '▄', fg: bot }
            : bot === BG
              ? { ch: '▀', fg: top }
              : { ch: '▀', fg: top, bg: bot },
      )
    }
    const merge = (list: Cell[], k: string) => {
      const runs: (Cell & { n: number })[] = []
      for (const cell of list) {
        const last = runs[runs.length - 1]
        if (last && last.ch === cell.ch && last.fg === cell.fg && last.bg === cell.bg && last.dim === cell.dim) {
          last.n += 1
        } else {
          runs.push({ ...cell, n: 1 })
        }
      }

      return runs.map((u, i) => (
        <Text key={`${k}${i}`} color={u.fg} backgroundColor={u.bg} dimColor={u.dim}>
          {u.ch.repeat(u.n)}
        </Text>
      ))
    }
    const sprite = merge(x < 0 ? cellsRow.slice(-x) : cellsRow, 's')
    const tail = (ch: string) => (
      <Text key="t" color={ink}>{t === 1 ? ch : ' '}</Text>
    )

    let cells
    if (side === 'right') {
      cells = [pad(x, 'p0'), sprite, tail('◀'), bubble(t), pad(cols - x - W - 1 - bw, 'p1')]
    } else if (side === 'left') {
      cells = [pad(x - 1 - bw, 'p0'), bubble(t), tail('▶'), sprite, pad(cols - x - W, 'p1')]
    } else if (t === 0 && (s?.glyphs.length ?? 0) > 0) {
      const full: Cell[] = []
      for (let c = 0; c < cols; c++) full.push({ ch: ' ' })
      for (let c = 0; c < W; c++) if (x + c >= 0 && x + c < cols) full[x + c] = cellsRow[c]!
      for (const g of s!.glyphs) {
        if (g.x >= 0 && g.x < cols && full[g.x]!.ch === ' ') {
          full[g.x] = { ch: g.ch, fg: ink, dim: g.age > GLYPH_FADE }
        }
      }
      cells = [merge(full, 'f')]
    } else {
      cells = [pad(x, 'p0'), sprite, pad(cols - x - W, 'p1')]
    }

    lines.push(<Box key={`r${t}`}>{meter(t + 1)}{cells}</Box>)
  }

  return (
    <Box flexDirection="column">
      <Box key="gap">{pad(METER, 'mgap')}{pad(cols, 'gap')}</Box>
      {lines}
    </Box>
  )
}

export default Clawd
