import { Ditify } from './ditify.js'

const STORAGE_KEY = 'DTClass.sets'
const OPEN_DEPTH = 2 // tree levels expanded on first render; deeper levels render when opened
const MAX_RULES = 100

const EXAMPLE = {
  name: 'Play tennis?',
  raw_train: `outlook,temp,humidity,wind,play
sunny,85,high,weak,no
sunny,80,high,strong,no
overcast,83,high,weak,yes
rain,70,high,weak,yes
rain,68,normal,weak,yes
rain,65,normal,strong,no
overcast,64,normal,strong,yes
sunny,72,high,weak,no
sunny,69,normal,weak,yes
rain,75,normal,weak,yes
sunny,75,normal,strong,yes
overcast,72,high,strong,yes
overcast,81,normal,weak,yes
rain,71,high,strong,no`,
}

const $ = (id) => document.getElementById(id)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const pct = (p) => `${Math.round(p * 100)}%`
const count = (n) => (Math.round(n * 10) / 10).toLocaleString()
const bar = (name, p) =>
  `<span title="${esc(name)}">${esc(name)}</span><span class="meter"><i style="width:${(p * 100).toFixed(1)}%"></i></span><span class="pct">${pct(p)}</span>`

let state = null // { attributes, rows, numeric, target, model, tree, scores }
let worker = null

// ---------------------------------------------------------------- CSV

function detectDelimiter(text) {
  const header = text.split(/\r?\n/, 1)[0]
  const counts = [',', '\t', ';', '|'].map((d) => [d, header.split(d).length])
  return counts.sort((a, b) => b[1] - a[1])[0][0]
}

function parseCSV(text, d) {
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
  const [header, ...body] = parseCSV(text, detectDelimiter(text))
  if (!header || body.length === 0) throw new Error('Add a header row and at least one data row.')
  if (new Set(header).size !== header.length || header.some((h) => !h)) throw new Error('Every column needs a unique name.')
  const rows = body.map((r, i) => {
    if (r.length > header.length) throw new Error(`Row ${i + 2} has ${r.length} values; the header has ${header.length}.`)
    return header.map((_, j) => r[j] ?? '')
  })
  // Columns where every non-blank value is a number become numeric.
  const numeric = new Set()
  header.forEach((_, j) => {
    const vals = rows.map((r) => r[j]).filter((v) => v !== '')
    if (vals.length && vals.every((v) => Number.isFinite(Number(v)))) {
      numeric.add(j)
      for (const r of rows) r[j] = r[j] === '' ? null : Number(r[j])
    }
  })
  return { attributes: header, rows, numeric }
}

// ---------------------------------------------------------------- build

function setStatus(text, error = false) {
  $('status').textContent = text
  $('status').classList.toggle('error', error)
}

function build() {
  const text = $('csv').value
  if (!text.trim()) {
    state = null
    $('model').hidden = true
    setStatus('')
    return
  }
  try {
    const { attributes, rows, numeric } = toTable(text)
    const categorical = attributes.filter((_, j) => !numeric.has(j))
    if (!categorical.length) throw new Error('Every column is numeric. Add a text column to predict.')
    const same = state?.attributes.join('\u0000') === attributes.join('\u0000')
    const target = same && categorical.includes(state.target) ? state.target : categorical.at(-1)
    const query = same ? readQuery() : {}
    state = { attributes, rows, numeric, scores: new Map() }
    const t0 = performance.now()
    selectTarget(target, query)
    setStatus(`${rows.length.toLocaleString()} rows · ${attributes.length} columns · ${Math.max(1, Math.round(performance.now() - t0))} ms`)
    $('model').hidden = false
    scoreColumns(categorical)
  } catch (err) {
    setStatus(err.message, true)
  }
}

let buildTimer
const buildSoon = () => {
  clearTimeout(buildTimer)
  buildTimer = setTimeout(build, 300)
}

function selectTarget(target, query = readQuery()) {
  state.target = target
  state.model = new Ditify({ attributes: state.attributes, target }).train(state.rows)
  state.tree = state.model.tree()
  renderPicker()
  renderQuery(query)
  renderTree()
  renderImportance()
  resetRules()
  answer()
}

// Cross-validation runs in a worker so large tables never freeze the page.
function scoreColumns(columns) {
  worker?.terminate()
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
  worker.onmessage = ({ data }) => {
    state.scores.set(data.target, data)
    renderScore(data.target)
  }
  worker.postMessage({ attributes: state.attributes, rows: state.rows, columns })
}

// ---------------------------------------------------------------- predict picker

function renderPicker() {
  $('picker').innerHTML = state.attributes
    .filter((_, j) => !state.numeric.has(j))
    .map(
      (a) => `<button type="button" class="chip" role="radio" data-col="${esc(a)}" aria-checked="${a === state.target}">
        ${esc(a)} <span class="score">…</span></button>`
    )
    .join('')
  for (const a of state.scores.keys()) renderScore(a)
}

function renderScore(target) {
  const el = [...$('picker').children].find((b) => b.dataset.col === target)?.querySelector('.score')
  const s = state.scores.get(target)
  if (!el || !s) return
  if (s.accuracy === null) {
    el.textContent = '–'
    el.title = 'Too few rows to score'
    return
  }
  el.textContent = pct(s.accuracy)
  el.title = `Cross-validated accuracy ${pct(s.accuracy)}; always guessing the most common value gets ${pct(s.baseline)}`
  el.classList.toggle('good', s.accuracy > s.baseline + 0.05)
}

$('picker').addEventListener('click', (e) => {
  const col = e.target.closest('[data-col]')?.dataset.col
  if (col && col !== state.target) selectTarget(col)
})

// ---------------------------------------------------------------- ask

function renderQuery(query) {
  $('query').innerHTML = state.attributes
    .map((a, j) => {
      if (a === state.target) return ''
      const value = esc(query[a] ?? '')
      if (state.numeric.has(j)) return `<label>${esc(a)}<input name="${esc(a)}" type="number" step="any" value="${value}" placeholder="any"></label>`
      const options = [...new Set(state.rows.map((r) => r[j]).filter((v) => v !== ''))].slice(0, 200)
      return `<label>${esc(a)}<input name="${esc(a)}" list="dl-${j}" value="${value}" placeholder="any">
        <datalist id="dl-${j}">${options.map((v) => `<option value="${esc(v)}">`).join('')}</datalist></label>`
    })
    .join('')
}

function readQuery() {
  const query = {}
  for (const input of $('query').querySelectorAll('input')) {
    const v = input.value.trim()
    query[input.name] = v === '' ? null : input.type === 'number' ? Number(v) : v
  }
  return query
}

function answer() {
  const query = readQuery()
  const r = state.model.explain(query, { target: state.target })
  const blank = Object.values(query).every((v) => v === null)
  const known = r.path.filter((s) => !s.test.startsWith('unknown'))
  const unknown = r.path.find((s) => s.test.startsWith('unknown'))
  let why = known.length ? `because <b>${esc(known.map((s) => `${s.attribute} ${s.test}`).join(' and '))}</b>` : ''
  if (unknown) why += `${why ? ', then ' : ''}averaged over every <b>${esc(unknown.attribute)}</b> branch, since it's blank`
  if (blank) why = 'Fill in what you know to narrow it down.'
  else if (!why) why = 'No split applies, so this is the overall mix.'
  const probs = Object.entries(r.probabilities).sort((a, b) => b[1] - a[1]).slice(0, 6)
  $('answer').innerHTML = `
    <div class="label">${esc(r.label)} <span class="chance">${pct(r.chance)}</span></div>
    <div class="why">${why}</div>
    <div class="bars">${probs.map(([k, p]) => bar(k, p)).join('')}</div>`
  highlight(blank ? [] : r.path)
}

let answerFrame = 0
$('query').addEventListener('input', () => {
  cancelAnimationFrame(answerFrame)
  answerFrame = requestAnimationFrame(answer)
})
$('query').addEventListener('submit', (e) => e.preventDefault())

// ---------------------------------------------------------------- tree

function nodeAt(key) {
  return key.split('.').slice(1).reduce((node, i) => node.children[+i].node, state.tree)
}

function nodeHTML(node, test, key, depth) {
  const head = `<span class="test">${esc(test)}</span><span class="pred">${esc(node.label)}</span>
    <span class="meta">${pct(node.chance)} · ${count(node.samples)}</span>`
  if (!node.children) return `<li data-key="${key}"><div class="leaf">${head}</div></li>`
  const open = depth < OPEN_DEPTH
  return `<li data-key="${key}"><details${open ? ' open' : ''}><summary>${head}</summary><ul>${open ? childrenHTML(node, key, depth) : ''}</ul></details></li>`
}

function childrenHTML(node, key, depth) {
  return node.children.map((c, i) => nodeHTML(c.node, `${node.attribute} ${c.test}`, `${key}.${i}`, depth + 1)).join('')
}

// Fill a collapsed branch the first time it opens.
function ensureChildren(li) {
  const ul = li.querySelector(':scope > details > ul')
  if (ul && !ul.childElementCount) {
    const key = li.dataset.key
    ul.innerHTML = childrenHTML(nodeAt(key), key, key.split('.').length - 1)
  }
}

function renderTree() {
  $('tree').innerHTML = nodeHTML(state.tree, 'all rows', 'r', 0)
}

$('tree').addEventListener('toggle', (e) => e.target.open && ensureChildren(e.target.parentElement), true)

// Light up (and open) the branch the current answer followed.
function highlight(path) {
  for (const el of $('tree').querySelectorAll('.on')) el.classList.remove('on')
  if (!path.length) return
  let node = state.tree
  let key = 'r'
  const keys = [key]
  for (const step of path) {
    const i = node.children?.findIndex((c) => node.attribute === step.attribute && c.test === step.test) ?? -1
    if (i < 0) break
    node = node.children[i].node
    key += `.${i}`
    keys.push(key)
  }
  for (const k of keys) {
    const li = $('tree').querySelector(`li[data-key="${k}"]`)
    if (!li) break
    li.classList.add('on')
    const details = li.querySelector(':scope > details')
    if (details && k !== keys.at(-1)) {
      ensureChildren(li)
      details.open = true
    }
  }
}

// ---------------------------------------------------------------- side panel

function renderImportance() {
  const imp = Object.entries(state.model.importance())
    .filter(([, p]) => p > 0.005)
    .sort((a, b) => b[1] - a[1])
  $('importance').innerHTML = imp.length ? imp.map(([a, p]) => bar(a, p)).join('') : '<span class="hint">Nothing yet</span>'
}

function resetRules() {
  $('rules').innerHTML = ''
  if ($('rules-box').open) renderRules()
}

function renderRules() {
  if ($('rules').childElementCount) return
  const leaves = []
  const walk = (node, conds) => {
    if (!node.children) leaves.push({ ...node, conds })
    else for (const c of node.children) walk(c.node, [...conds, `${node.attribute} ${c.test}`])
  }
  walk(state.tree, [])
  leaves.sort((a, b) => b.samples - a.samples)
  const more = leaves.length - MAX_RULES
  $('rules').innerHTML =
    leaves
      .slice(0, MAX_RULES)
      .map(
        (l) => `<li><span class="if">${esc(l.conds.join(' and ') || 'always')}</span> → <b>${esc(l.label)}</b>
          <span class="hint">${pct(l.chance)} · ${count(l.samples)}</span></li>`
      )
      .join('') + (more > 0 ? `<li class="hint">…and ${more.toLocaleString()} smaller rules</li>` : '')
}

$('rules-box').addEventListener('toggle', () => $('rules-box').open && renderRules())

// ---------------------------------------------------------------- data sets

function loadSets() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
  } catch {
    return []
  }
}

function storeSets(sets) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sets))
  } catch {
    setStatus('Could not save: browser storage is unavailable.', true)
  }
  renderSets()
}

function renderSets() {
  $('sets').innerHTML =
    loadSets()
      .map(
        (s, i) => `<span class="chip"><button type="button" class="x-load" data-set="${i}">${esc(s.name || 'Untitled')}</button>
          <button type="button" class="x" data-del="${i}" aria-label="Delete ${esc(s.name)}">×</button></span>`
      )
      .join('') +
    `<button type="button" class="chip ghost" data-set="example">${esc(EXAMPLE.name)}</button>
     <label class="chip ghost">Open CSV…<input type="file" id="file" accept=".csv,.tsv,.txt,text/csv"></label>`
}

function loadText(text, name = '') {
  $('csv').value = text
  $('name').value = name
  build()
}

$('sets').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del]')?.dataset.del
  if (del !== undefined) {
    const sets = loadSets()
    if (confirm(`Delete "${sets[del].name}"?`)) storeSets(sets.filter((_, i) => i !== +del))
    return
  }
  const id = e.target.closest('[data-set]')?.dataset.set
  if (id === 'example') loadText(EXAMPLE.raw_train)
  else if (id !== undefined) loadText(loadSets()[id].raw_train, loadSets()[id].name)
})

$('sets').addEventListener('change', async (e) => {
  const file = e.target.files?.[0]
  if (file) loadText(await file.text(), file.name.replace(/\.\w+$/, ''))
  e.target.value = ''
})

$('save').addEventListener('click', () => {
  const name = $('name').value.trim() || 'Untitled'
  $('name').value = name
  const d = new Date()
  const set = { name, raw_train: $('csv').value, modified: `${d.toLocaleDateString()} ${d.toLocaleTimeString()}` }
  storeSets([...loadSets().filter((s) => s.name !== name), set])
})

// Drag a CSV anywhere onto the data card.
const card = $('data')
card.addEventListener('dragover', (e) => {
  e.preventDefault()
  card.classList.add('drop')
})
card.addEventListener('dragleave', () => card.classList.remove('drop'))
card.addEventListener('drop', async (e) => {
  e.preventDefault()
  card.classList.remove('drop')
  const file = e.dataTransfer.files[0]
  if (file) loadText(await file.text(), file.name.replace(/\.\w+$/, ''))
})

$('csv').addEventListener('input', buildSoon)

// ---------------------------------------------------------------- start

renderSets()
if (!loadSets().length) loadText(EXAMPLE.raw_train)
