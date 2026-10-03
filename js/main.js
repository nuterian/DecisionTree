import { Ditify } from './ditify.js'
import { DATASETS } from './datasets.js'

const PALETTE = ['#14b8a6', '#f43f5e', '#f59e0b', '#6366f1', '#84cc16', '#d946ef', '#0ea5e9', '#f97316']
const W = 248 // node width
const H = 30 // node height
const COL = 290 // horizontal distance between depths
const ROW = 40 // vertical distance between leaves
const PAD = 4
const MAX_NODES = 1500 // beyond this a drawing stops being readable
const DEPTH_UNLIMITED = 12 // depth slider position meaning "no limit"
const CUSTOM_KEY = 'ditify-demo.csv'

const $ = (id) => document.getElementById(id)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
// Never claim certainty the model doesn't have: 99.6% shows as ">99%", not "100%".
const pct = (p) => (p < 1 && p >= 0.995 ? '>99%' : p > 0 && p < 0.005 ? '<1%' : `${Math.round(p * 100)}%`)
const rowsOf = (n) => Math.max(1, Math.round(n)).toLocaleString()
const pct1 = (p) => `${(p * 100).toFixed(1)}%`
const fmtMs = (t) => (t < 1 ? `${Math.max(1, Math.round(t * 1000))} µs` : t < 10 ? `${t.toFixed(1)} ms` : `${Math.round(t)} ms`)
const fmtNum = (v) => String(+(+v).toFixed(2))
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const blank = (v) => v === null || v === undefined || v === ''

const S = {
  source: null,
  data: null, // { attributes, rows, columns }
  target: null,
  opts: { maxDepth: Infinity, minSamplesLeaf: 1, shrinkage: 1 },
  query: {},
  model: null,
  tree: null,
  nodes: new Map(), // key -> laid-out node
  colors: new Map(),
}

// ---------------------------------------------------------------- data

function niceStep(x) {
  const p = 10 ** Math.floor(Math.log10(x || 1))
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= x)
}

function prepare({ attributes, rows }) {
  const columns = attributes.map((name, j) => {
    const vals = rows.map((r) => r[j]).filter((v) => !blank(v))
    if (vals.length && vals.every((v) => typeof v === 'number')) {
      let min = Infinity
      let max = -Infinity
      for (const v of vals) {
        if (v < min) min = v
        if (v > max) max = v
      }
      const step = vals.every(Number.isInteger) ? 1 : niceStep((max - min) / 200)
      return { name, numeric: true, min, max, step }
    }
    const freq = new Map()
    for (const v of vals) freq.set(String(v), (freq.get(String(v)) ?? 0) + 1)
    return { name, numeric: false, values: [...freq].sort((a, b) => b[1] - a[1]).map(([v]) => v) }
  })
  return { attributes, rows, columns }
}

const column = (name) => S.data.columns.find((c) => c.name === name)

function detectDelimiter(text) {
  const header = text.split(/\r?\n/, 1)[0]
  return [',', '\t', ';', '|'].map((d) => [d, header.split(d).length]).sort((a, b) => b[1] - a[1])[0][0]
}

function parseCSV(text) {
  const d = detectDelimiter(text)
  const rows = [[]]
  const re = new RegExp(`(\\${d}|\\r?\\n|\\r|^)(?:"([^"]*(?:""[^"]*)*)"|([^"\\${d}\\r\\n]*))`, 'g')
  let m
  while ((m = re.exec(text))) {
    if (m[1].length && m[1] !== d) rows.push([])
    rows[rows.length - 1].push((m[2] !== undefined ? m[2].replace(/""/g, '"') : m[3]).trim())
    if (m[0].length === 0) re.lastIndex++
  }
  return rows.filter((r) => r.some((v) => v !== ''))
}

function toTable(text) {
  const [header, ...body] = parseCSV(text)
  if (!header || body.length === 0) throw new Error('Add a header row and at least one data row.')
  if (new Set(header).size !== header.length || header.some((h) => !h)) throw new Error('Every column needs a unique name.')
  const rows = body.map((r, i) => {
    if (r.length > header.length) throw new Error(`Row ${i + 2} has ${r.length} values; the header has ${header.length}.`)
    return header.map((_, j) => (r[j] === undefined || r[j] === '' ? null : r[j]))
  })
  header.forEach((_, j) => {
    const vals = rows.map((r) => r[j]).filter((v) => v !== null)
    if (vals.length && vals.every((v) => Number.isFinite(Number(v)))) for (const r of rows) if (r[j] !== null) r[j] = Number(r[j])
  })
  return { attributes: header, rows }
}

// ---------------------------------------------------------------- sources

function renderTabs() {
  const tabs = [...DATASETS.map((d) => [d.key, d.name]), ['custom', 'Your CSV']]
  $('tabs').innerHTML = tabs
    .map(([k, name]) => `<button type="button" class="tab" role="tab" data-src="${k}" aria-selected="${k === S.source}">${esc(name)}</button>`)
    .join('')
}

$('tabs').addEventListener('click', (e) => {
  const src = e.target.closest('[data-src]')?.dataset.src
  if (src && src !== S.source) {
    history.replaceState(null, '', `#${src}`)
    loadSource(src)
  }
})

function loadSource(key) {
  if (key !== 'custom' && !DATASETS.some((d) => d.key === key)) key = DATASETS[0].key
  S.source = key
  renderTabs()
  $('custom').hidden = key !== 'custom'
  if (key === 'custom') {
    $('blurb').textContent = 'Your own data. Nothing leaves this browser.'
    if (!$('csv').value) $('csv').value = storage.get() ?? ''
    S.data = null
    buildCustom()
    return
  }
  const ds = DATASETS.find((d) => d.key === key)
  $('blurb').textContent = ds.blurb
  ds.prepared ??= prepare(ds.make())
  setData(ds.prepared, ds)
}

function setData(data, preset = {}) {
  S.data = data
  const categorical = data.columns.filter((c) => !c.numeric).map((c) => c.name)
  S.target = categorical.includes(preset.target) ? preset.target : categorical.at(-1)
  S.opts = {
    maxDepth: preset.maxDepth ?? Infinity,
    minSamplesLeaf: preset.minSamplesLeaf ?? 1,
    shrinkage: preset.shrinkage ?? 1,
  }
  S.query = Object.fromEntries(
    Object.entries(preset.example ?? {}).filter(([k]) => k !== S.target && data.attributes.includes(k))
  )
  $('app').hidden = false
  syncKnobs()
  renderTargets()
  renderFields()
  renderPreview()
  retrain(true)
}

// ---------------------------------------------------------------- custom CSV

const storage = {
  get() {
    try {
      return localStorage.getItem(CUSTOM_KEY)
    } catch {
      return null
    }
  },
  set(v) {
    try {
      localStorage.setItem(CUSTOM_KEY, v)
    } catch {}
  },
}

function customStatus(text, error = false) {
  $('csv-status').textContent = text
  $('csv-status').classList.toggle('error', error)
}

function buildCustom() {
  const text = $('csv').value
  storage.set(text)
  if (!text.trim()) {
    $('app').hidden = true
    customStatus('Paste or drop a CSV to begin.')
    return
  }
  try {
    const data = prepare(toTable(text))
    if (data.columns.every((c) => c.numeric)) throw new Error('Every column is numeric. Add a text column to predict.')
    const same = S.data?.attributes.join('\u0000') === data.attributes.join('\u0000')
    const preset = same
      ? { target: S.target, ...S.opts, example: S.query }
      : { maxDepth: data.rows.length > 200 ? 6 : Infinity, minSamplesLeaf: data.rows.length > 200 ? 3 : 1 }
    setData(data, preset)
    customStatus(`${data.rows.length.toLocaleString()} rows · ${data.attributes.length} columns`)
  } catch (err) {
    customStatus(err.message, true)
    $('app').hidden = true
  }
}

let customTimer
$('csv').addEventListener('input', () => {
  clearTimeout(customTimer)
  customTimer = setTimeout(buildCustom, 250)
})

async function loadFile(file) {
  if (!file) return
  $('csv').value = await file.text()
  buildCustom()
}
$('file').addEventListener('change', (e) => loadFile(e.target.files[0]))
$('custom').addEventListener('dragover', (e) => {
  e.preventDefault()
  $('custom').classList.add('drop')
})
$('custom').addEventListener('dragleave', () => $('custom').classList.remove('drop'))
$('custom').addEventListener('drop', (e) => {
  e.preventDefault()
  $('custom').classList.remove('drop')
  loadFile(e.dataTransfer.files[0])
})

// ---------------------------------------------------------------- target

function renderTargets() {
  $('targets').innerHTML = S.data.columns
    .filter((c) => !c.numeric)
    .map((c) => `<button type="button" class="chip" role="radio" data-col="${esc(c.name)}" aria-checked="${c.name === S.target}">${esc(c.name)}</button>`)
    .join('')
}

$('targets').addEventListener('click', (e) => {
  const col = e.target.closest('[data-col]')?.dataset.col
  if (!col || col === S.target) return
  S.target = col
  delete S.query[col]
  renderTargets()
  renderFields()
  retrain(true)
})

// ---------------------------------------------------------------- training

function retrain(fresh = false) {
  const { attributes, rows } = S.data
  const opts = { attributes, target: S.target, ...S.opts }

  const t0 = performance.now()
  const model = new Ditify(opts).train(rows)
  model.importance() // training is lazy; this triggers the fit
  S.trainMs = performance.now() - t0
  S.model = model
  S.tree = model.tree()

  // Honest accuracy: train on 80%, test on the 20% the model never saw.
  const train = rows.filter((_, i) => i % 5 !== 0)
  const test = rows.filter((_, i) => i % 5 === 0)
  S.holdout = test.length >= 3 ? new Ditify(opts).train(train).evaluate(test) : null
  const t = attributes.indexOf(S.target)
  const counts = new Map()
  for (const r of test) if (!blank(r[t])) counts.set(r[t], (counts.get(r[t]) ?? 0) + 1)
  S.baseline = S.holdout?.n ? Math.max(...counts.values()) / S.holdout.n : null

  if (fresh) {
    const classes = Object.entries(S.tree.probabilities).sort((a, b) => b[1] - a[1])
    S.colors = new Map(classes.map(([k], i) => [k, PALETTE[i % PALETTE.length]]))
    S.predictUs = null
    resetForest()
  }

  drawTree()
  renderImportance()
  renderRules()
  answer()
  renderStats()
  scheduleBench()
}

const colorOf = (label) => S.colors.get(String(label)) ?? PALETTE[PALETTE.length - 1]

// Measures real prediction speed on this model, after interaction settles.
let benchTimer
function scheduleBench() {
  clearTimeout(benchTimer)
  benchTimer = setTimeout(() => {
    const { rows } = S.data
    const target = S.target
    let n = 0
    let t
    const t0 = performance.now()
    do {
      for (let i = 0; i < 256; i++) S.model.classify(rows[(n + i) % rows.length], { target })
      n += 256
    } while ((t = performance.now() - t0) < 40)
    S.predictUs = (t * 1000) / n
    renderStats()
    renderAnswerTime()
  }, 150)
}

// ---------------------------------------------------------------- stats

function stat(id, k, v, s, flash) {
  const el = $(id)
  el.innerHTML = `<div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div>`
  if (flash) {
    el.classList.remove('flash')
    void el.offsetWidth
    el.classList.add('flash')
  }
}

function renderStats() {
  const { rows, attributes } = S.data
  stat('st-data', 'Data', rows.length.toLocaleString(), `rows × ${attributes.length} columns`)
  stat('st-train', 'Training', fmtMs(S.trainMs), `${S.leaves.toLocaleString()} leaves, ${S.depth} levels deep`)
  stat(
    'st-speed',
    'Per answer',
    S.predictUs ? `${S.predictUs < 10 ? S.predictUs.toFixed(1) : Math.round(S.predictUs)} µs` : '…',
    S.predictUs ? `${compact.format(1e6 / S.predictUs)} answers a second` : 'measuring'
  )
  stat(
    'st-acc',
    'Accuracy',
    S.holdout ? pct1(S.holdout.accuracy) : '–',
    S.holdout ? `${S.holdout.n} unseen rows · baseline ${pct(S.baseline)}` : 'too few rows to test'
  )
}

let forestWorker = null
let forestToken = 0

function resetForest() {
  forestToken++
  forestWorker?.terminate()
  forestWorker = null
  $('st-forest').innerHTML = `<div class="k">Random forest</div>
    <button type="button" class="btn primary" id="forest-go">Train 100 trees</button>
    <div class="s">in a background worker</div>`
}

function runForest() {
  const token = ++forestToken
  const treeAccuracy = S.holdout?.accuracy
  forestWorker?.terminate()
  forestWorker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
  forestWorker.onmessage = ({ data }) => {
    if (token !== forestToken) return
    const delta = treeAccuracy == null ? '' : ` · ${data.accuracy >= treeAccuracy ? '+' : '−'}${Math.abs((data.accuracy - treeAccuracy) * 100).toFixed(1)} pts vs tree`
    stat('st-forest', 'Random forest', pct1(data.accuracy), `${data.trees} trees in ${fmtMs(data.ms)}${delta}`, true)
    forestWorker.terminate()
    forestWorker = null
  }
  forestWorker.postMessage({ attributes: S.data.attributes, rows: S.data.rows, target: S.target })
  stat('st-forest', 'Random forest', '…', 'growing 100 trees')
}

$('stats').addEventListener('click', (e) => e.target.id === 'forest-go' && runForest())

// ---------------------------------------------------------------- knobs

const knobs = {
  depth: {
    read: (v) => (+v >= DEPTH_UNLIMITED ? Infinity : +v),
    write: (o) => (Number.isFinite(o.maxDepth) ? Math.min(o.maxDepth, DEPTH_UNLIMITED - 1) : DEPTH_UNLIMITED),
    show: (o) => (Number.isFinite(o.maxDepth) ? o.maxDepth : '∞'),
    key: 'maxDepth',
  },
  leaf: { read: Number, write: (o) => o.minSamplesLeaf, show: (o) => o.minSamplesLeaf, key: 'minSamplesLeaf' },
  shrink: { read: Number, write: (o) => o.shrinkage, show: (o) => o.shrinkage, key: 'shrinkage' },
}

function syncKnobs() {
  for (const [id, k] of Object.entries(knobs)) {
    $(id).value = k.write(S.opts)
    $(`${id}-out`).textContent = k.show(S.opts)
  }
}

let retrainFrame = 0
for (const [id, k] of Object.entries(knobs)) {
  $(id).addEventListener('input', () => {
    S.opts[k.key] = k.read($(id).value)
    $(`${id}-out`).textContent = k.show(S.opts)
    cancelAnimationFrame(retrainFrame)
    retrainFrame = requestAnimationFrame(() => retrain())
  })
}

// ---------------------------------------------------------------- ask

function fieldHTML(c) {
  const v = S.query[c.name]
  const unset = blank(v)
  const head = (extra = '') => `<div class="field-head"><span class="name">${esc(c.name)}</span>${extra}</div>`
  if (c.numeric) {
    const value = unset ? (c.min + c.max) / 2 : v
    return `<div class="field${unset ? ' unset' : ''}" data-attr="${esc(c.name)}">
      ${head(`<output>${unset ? 'any' : fmtNum(v)}</output><button type="button" class="x" title="Clear"${unset ? ' hidden' : ''}>×</button>`)}
      <input type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${value}" aria-label="${esc(c.name)}"></div>`
  }
  if (c.values.length <= 4 && c.values.every((x) => x.length <= 12)) {
    const btn = (val, label) => `<button type="button" data-value="${esc(val)}" aria-pressed="${(unset ? '' : String(v)) === val}">${esc(label)}</button>`
    return `<div class="field" data-attr="${esc(c.name)}">${head()}<div class="seg">${btn('', 'any')}${c.values.map((x) => btn(x, x)).join('')}</div></div>`
  }
  const opt = (val, label) => `<option value="${esc(val)}"${(unset ? '' : String(v)) === val ? ' selected' : ''}>${esc(label)}</option>`
  return `<div class="field" data-attr="${esc(c.name)}">${head()}<select aria-label="${esc(c.name)}">${opt('', 'any')}${c.values
    .slice(0, 500)
    .map((x) => opt(x, x))
    .join('')}</select></div>`
}

function renderFields() {
  $('fields').innerHTML = S.data.columns.filter((c) => c.name !== S.target).map(fieldHTML).join('')
}

let answerFrame = 0
const answerSoon = () => {
  cancelAnimationFrame(answerFrame)
  answerFrame = requestAnimationFrame(answer)
}

function setNumeric(field, value) {
  const unset = blank(value)
  field.classList.toggle('unset', unset)
  field.querySelector('output').textContent = unset ? 'any' : fmtNum(value)
  field.querySelector('.x').hidden = unset
}

$('fields').addEventListener('input', (e) => {
  const field = e.target.closest('.field')
  if (!field) return
  const attr = field.dataset.attr
  if (e.target.type === 'range') {
    S.query[attr] = Number(e.target.value)
    setNumeric(field, S.query[attr])
  } else if (e.target.tagName === 'SELECT') {
    S.query[attr] = e.target.value || null
  }
  answerSoon()
})

$('fields').addEventListener('click', (e) => {
  const field = e.target.closest('.field')
  if (!field) return
  const attr = field.dataset.attr
  if (e.target.closest('.x')) {
    S.query[attr] = null
    setNumeric(field, null)
  } else if (e.target.closest('.seg button')) {
    const value = e.target.closest('button').dataset.value
    S.query[attr] = value || null
    for (const b of field.querySelectorAll('.seg button')) b.setAttribute('aria-pressed', b.dataset.value === value)
  } else return
  answerSoon()
})

$('reset').addEventListener('click', () => {
  S.query = {}
  renderFields()
  answer()
})

// Merge repeated numeric tests on one attribute into a single range.
function describe(steps) {
  const conds = []
  const ranges = new Map()
  let unknown = null
  for (const s of steps) {
    if (s.test.startsWith('unknown')) {
      unknown = s.attribute
      break
    }
    const m = /^(<=|>) (.+)$/.exec(s.test)
    if (!m) {
      conds.push(`${s.attribute} ${s.test}`)
      continue
    }
    let r = ranges.get(s.attribute)
    if (!r) {
      r = { attr: s.attribute, lo: null, hi: null }
      ranges.set(s.attribute, r)
      conds.push(r)
    }
    if (m[1] === '<=') r.hi = r.hi === null ? +m[2] : Math.min(r.hi, +m[2])
    else r.lo = r.lo === null ? +m[2] : Math.max(r.lo, +m[2])
  }
  const text = conds.map((c) => {
    if (typeof c === 'string') return c
    if (c.lo !== null && c.hi !== null) return `${fmtNum(c.lo)} < ${c.attr} ≤ ${fmtNum(c.hi)}`
    return c.hi !== null ? `${c.attr} ≤ ${fmtNum(c.hi)}` : `${c.attr} > ${fmtNum(c.lo)}`
  })
  return { conds: text, unknown }
}

function currentQuery() {
  return Object.fromEntries(Object.entries(S.query).filter(([k, v]) => k !== S.target && !blank(v)))
}

function answer() {
  const query = currentQuery()
  const r = S.model.explain(query, { target: S.target })
  const asked = Object.keys(query).length > 0
  const { conds, unknown } = describe(r.path)
  let why = conds.length ? `because ${conds.map((c) => `<code>${esc(c)}</code>`).join(' and ')}` : ''
  if (unknown) why += `${why ? ', then ' : ''}averaged over every <code>${esc(unknown)}</code> branch, since it's blank`
  if (!asked) why = 'This is the overall mix. Set any field, or click a node in the tree, to narrow it down.'
  else if (!why) why = 'No split applies, so this is the overall mix.'
  const probs = Object.entries(r.probabilities).sort((a, b) => b[1] - a[1])
  $('answer').innerHTML = `
    <div class="top"><span class="big">${esc(r.label)}</span><span class="chance">${pct(r.chance)} sure</span><span class="time" id="answer-time"></span></div>
    <p class="why">${why}</p>
    <div class="mix">${probs.map(([k, p]) => `<i style="flex-grow:${p};background:${colorOf(k)}"></i>`).join('')}</div>
    <div class="legend">${probs
      .slice(0, 6)
      .map(([k, p]) => `<span style="--c:${colorOf(k)}">${esc(k)} <b>${pct(p)}</b></span>`)
      .join('')}</div>`
  renderAnswerTime()
  highlight(r.path, asked)
  renderCode(query, r, conds)
}

function renderAnswerTime() {
  const el = $('answer-time')
  if (el && S.predictUs) el.textContent = `answered in ~${S.predictUs < 10 ? S.predictUs.toFixed(1) : Math.round(S.predictUs)} µs`
}

// ---------------------------------------------------------------- tree

function drawTree() {
  // Count first: a tree too big to read is described instead of drawn.
  let count = 0
  let leaves = 0
  let depth = 0
  const measure = (node, d) => {
    count++
    depth = Math.max(depth, d)
    if (node.children) for (const c of node.children) measure(c.node, d + 1)
    else leaves++
  }
  measure(S.tree, 0)
  S.leaves = leaves
  S.depth = depth
  $('tree-size').textContent = `· ${count.toLocaleString()} nodes`
  S.nodes = new Map()
  if (count > MAX_NODES) {
    $('tree').innerHTML = `<p class="too-big">${count.toLocaleString()} nodes is too many to draw nicely.<br>Lower the depth or raise the minimum leaf size.</p>`
    return
  }

  const nodes = []
  const links = []
  let slot = 0
  const layout = (node, d, test, key, parent) => {
    const n = { node, test, key, x: PAD + d * COL, y: 0 }
    nodes.push(n)
    S.nodes.set(key, n)
    if (parent) links.push([parent, n])
    if (node.children) {
      const kids = node.children.map((c, i) => layout(c.node, d + 1, `${node.attribute} ${c.test.replace('<=', '≤')}`, `${key}.${i}`, n))
      n.y = (kids[0].y + kids[kids.length - 1].y) / 2
    } else n.y = PAD + slot++ * ROW
    return n
  }
  layout(S.tree, 0, 'all rows', 'r', null)

  const width = PAD * 2 + depth * COL + W
  const height = PAD * 2 + (leaves - 1) * ROW + H
  const total = S.tree.samples
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs><clipPath id="nc"><rect width="${W}" height="${H}" rx="8"/></clipPath></defs>`
  for (const [p, c] of links) {
    const x1 = p.x + W
    const y1 = p.y + H / 2
    const x2 = c.x
    const y2 = c.y + H / 2
    const mx = (x1 + x2) / 2
    const sw = 1 + 10 * (c.node.samples / total)
    svg += `<path class="link-path" data-key="${c.key}" d="M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}" stroke-width="${sw.toFixed(2)}"/>`
  }
  for (const n of nodes) {
    const { label, chance, samples, probabilities } = n.node
    const pred = `${label} ${pct(chance)}`
    const room = Math.max(4, Math.floor((W - 34 - pred.length * 7.2) / 6.95))
    const test = n.test.length > room ? `${n.test.slice(0, room - 1)}…` : n.test
    let x = 0
    const mix = Object.entries(probabilities)
      .map(([k, p]) => {
        const r = `<rect x="${x.toFixed(1)}" y="${H - 3}" width="${(p * W).toFixed(1)}" height="3" fill="${colorOf(k)}"/>`
        x += p * W
        return r
      })
      .join('')
    const tip = [n.test, `${rowsOf(samples)} rows`, ...Object.entries(probabilities).map(([k, p]) => `${k}: ${pct1(p)}`)].join('\n')
    svg += `<g class="node" data-key="${n.key}" transform="translate(${n.x} ${n.y})"><title>${esc(tip)}</title>
      <rect class="box" width="${W}" height="${H}" rx="8"/><g clip-path="url(#nc)">${mix}</g>
      <circle cx="12" cy="${H / 2 - 1}" r="3.5" fill="${colorOf(label)}"/>
      <text class="test" x="22" y="${H / 2 + 3}">${esc(test)}</text>
      <text class="pred" x="${W - 10}" y="${H / 2 + 3}" text-anchor="end" fill="currentColor">${esc(pred)}</text></g>`
  }
  $('tree').innerHTML = `${svg}</svg>`
}

// Light up the branch the answer followed and bring it into view.
function highlight(path, active) {
  const svg = $('tree').querySelector('svg')
  if (!svg) return
  for (const el of svg.querySelectorAll('.on')) el.classList.remove('on')
  svg.classList.toggle('focus', active)
  if (!active) return
  let node = S.tree
  let key = 'r'
  const keys = [key]
  for (const step of path) {
    const i = node.children?.findIndex((c) => node.attribute === step.attribute && c.test === step.test) ?? -1
    if (i < 0) break
    node = node.children[i].node
    key += `.${i}`
    keys.push(key)
  }
  for (const k of keys) for (const el of svg.querySelectorAll(`[data-key="${k}"]`)) el.classList.add('on')
  reveal(S.nodes.get(keys[keys.length - 1]))
}

function reveal(n) {
  if (!n) return
  const box = $('tree-scroll')
  const left = n.x + 18 // container padding
  const top = n.y
  const margin = 24
  const next = { left: box.scrollLeft, top: box.scrollTop }
  // Scroll only as far as needed, so the root keeps as much context as possible.
  if (left + W + margin > box.scrollLeft + box.clientWidth) next.left = left + W + margin - box.clientWidth
  else if (left - margin < box.scrollLeft) next.left = left - margin
  if (top + H + margin > box.scrollTop + box.clientHeight) next.top = top + H + margin - box.clientHeight
  else if (top - margin < box.scrollTop) next.top = top - margin
  if (next.left !== box.scrollLeft || next.top !== box.scrollTop) box.scrollTo({ ...next, behavior: 'smooth' })
}

// Clicking a node fills in the answers that lead there.
$('tree').addEventListener('click', (e) => {
  const key = e.target.closest('.node')?.dataset.key
  if (!key) return
  const query = {}
  const bounds = new Map()
  let node = S.tree
  for (const i of key.split('.').slice(1).map(Number)) {
    const child = node.children[i]
    if (child.threshold !== undefined) {
      const b = bounds.get(node.attribute) ?? { lo: -Infinity, hi: Infinity }
      if (child.test.startsWith('<=')) b.hi = Math.min(b.hi, child.threshold)
      else b.lo = Math.max(b.lo, child.threshold)
      bounds.set(node.attribute, b)
    } else query[node.attribute] = String(child.value)
    node = child.node
  }
  for (const [attr, b] of bounds) query[attr] = valueWithin(column(attr), b)
  S.query = query
  renderFields()
  answer()
})

function valueWithin(c, { lo, hi }) {
  const snap = (x) => +(c.min + Math.floor((x - c.min) / c.step + 1e-9) * c.step).toFixed(6)
  let v
  if (hi < Infinity) {
    v = snap(hi)
    if (v <= lo) v = hi
  } else v = +(snap(lo) + c.step).toFixed(6)
  return Math.min(c.max, Math.max(c.min, v))
}

// ---------------------------------------------------------------- panels

function renderImportance() {
  const all = Object.entries(S.model.importance()).sort((a, b) => b[1] - a[1])
  const used = all.filter(([, p]) => p >= 0.005)
  const ignored = all.filter(([, p]) => p < 0.005).map(([a]) => a)
  $('importance').innerHTML =
    used
      .map(
        ([a, p]) => `<span title="${esc(a)}">${esc(a)}</span><span class="meter"><i style="width:${(p * 100).toFixed(1)}%"></i></span><span class="pct">${pct(p)}</span>`
      )
      .join('') + (ignored.length ? `<p class="hint" style="grid-column:1/-1">Ignored as noise: ${ignored.map(esc).join(', ')}</p>` : '')
}

function renderRules() {
  const leaves = []
  const walk = (node, steps) => {
    if (!node.children) leaves.push({ node, steps })
    else for (const c of node.children) walk(c.node, [...steps, { attribute: node.attribute, test: c.test }])
  }
  walk(S.tree, [])
  leaves.sort((a, b) => b.node.samples - a.node.samples)
  $('rules').innerHTML = leaves
    .slice(0, 6)
    .map(({ node, steps }) => {
      const { conds } = describe(steps)
      return `<li><span class="if">${esc(conds.join(' and ') || 'always')}</span>
        <span class="then">→ ${esc(node.label)} <small>${pct(node.chance)} · ${rowsOf(node.samples)} rows</small></span></li>`
    })
    .join('')
}

const quote = (v) => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
const ident = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : quote(k))

function highlightJS(line) {
  const at = line.indexOf('//')
  const code = at < 0 ? line : line.slice(0, at)
  const comment = at < 0 ? '' : `<span class="tk-c">${esc(line.slice(at))}</span>`
  const html = code.replace(/('(?:[^'\\]|\\.)*')|\b(import|from|const|new)\b|(\b\d+(?:\.\d+)?\b)|([^'\w]+|\w+)/g, (m, s, k, n, other) =>
    s ? `<span class="tk-s">${esc(s)}</span>` : k ? `<span class="tk-k">${k}</span>` : n ? `<span class="tk-n">${n}</span>` : esc(other)
  )
  return html + comment
}

function renderCode(query, r, conds) {
  const opts = [`target: ${quote(S.target)}`]
  if (Number.isFinite(S.opts.maxDepth)) opts.push(`maxDepth: ${S.opts.maxDepth}`)
  if (S.opts.minSamplesLeaf !== 1) opts.push(`minSamplesLeaf: ${S.opts.minSamplesLeaf}`)
  if (S.opts.shrinkage !== 1) opts.push(`shrinkage: ${S.opts.shrinkage}`)
  const q = Object.entries(query).map(([k, v]) => `${ident(k)}: ${typeof v === 'number' ? fmtNum(v) : quote(v)}`)
  const lines = [
    `import Ditify from './ditify.js'`,
    '',
    `const model = new Ditify({ ${opts.join(', ')} })`,
    `model.train(rows) // ${S.data.rows.length.toLocaleString()} rows, ${fmtMs(S.trainMs)}`,
    '',
    `model.explain({ ${q.join(', ')} })`.replace('{  }', '{}'),
    `// → ${r.label}, ${pct(r.chance)} sure`,
    ...(conds.length ? [`//   because ${conds.join(' and ')}`] : []),
  ]
  $('code').innerHTML = lines.map(highlightJS).join('\n')
}

function renderPreview() {
  const { attributes, rows } = S.data
  const cell = (v) => (blank(v) ? '<td class="na">blank</td>' : `<td>${esc(v)}</td>`)
  $('preview').innerHTML =
    `<thead><tr>${attributes.map((a) => `<th>${esc(a)}</th>`).join('')}</tr></thead>` +
    `<tbody>${rows
      .slice(0, 10)
      .map((r) => `<tr>${r.map(cell).join('')}</tr>`)
      .join('')}</tbody>`
}

// ---------------------------------------------------------------- start

loadSource(location.hash.slice(1) || DATASETS[0].key)
