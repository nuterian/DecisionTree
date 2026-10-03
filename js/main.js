import { Ditify } from './ditify.js'

const STORAGE_KEY = 'DTClass.sets'
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
const meter = (p) => `<span class="meter"><i style="width:${(p * 100).toFixed(1)}%"></i></span>`

let state = null // { attributes, rows, target, model }

// ---------------------------------------------------------------- data

function parseCSV(text, delimiter) {
  const rows = [[]]
  const re = new RegExp(`(\\${delimiter}|\\r?\\n|\\r|^)(?:"([^"]*(?:""[^"]*)*)"|([^"\\${delimiter}\\r\\n]*))`, 'g')
  let m
  while ((m = re.exec(text))) {
    if (m[1].length && m[1] !== delimiter) rows.push([])
    rows[rows.length - 1].push(m[2] !== undefined ? m[2].replace(/""/g, '"') : m[3])
    if (m[0].length === 0) re.lastIndex++
  }
  return rows.map((r) => r.map((v) => v.trim())).filter((r) => r.some((v) => v !== ''))
}

function toTable(text, delimiter) {
  const [header, ...body] = parseCSV(text, delimiter || ',')
  if (!header || body.length === 0) throw new Error('Paste a header row followed by at least one data row.')
  const width = header.length
  if (new Set(header).size !== width || header.some((h) => !h)) throw new Error('Every column needs a unique name in the header row.')
  const rows = body.map((r, i) => {
    if (r.length > width) throw new Error(`Row ${i + 2} has ${r.length} values but the header has ${width}.`)
    return header.map((_, j) => r[j] ?? '')
  })
  // Columns where every non-blank value is a number become numeric.
  header.forEach((_, j) => {
    const vals = rows.map((r) => r[j]).filter((v) => v !== '')
    if (vals.length && vals.every((v) => Number.isFinite(Number(v)))) {
      rows.forEach((r) => (r[j] = r[j] === '' ? null : Number(r[j])))
    }
  })
  return { attributes: header, rows }
}

// ---------------------------------------------------------------- saved sets

function loadSets() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
  } catch {
    return []
  }
}

function renderSets() {
  const sets = loadSets()
  $('sets').innerHTML =
    sets.map((s, i) => `<button data-set="${i}">${esc(s.name || 'Untitled')}</button>`).join('') +
    `<button class="example" data-set="example">Example: ${esc(EXAMPLE.name)}</button>`
}

$('sets').addEventListener('click', (e) => {
  const id = e.target.dataset?.set
  if (id === undefined) return
  const set = id === 'example' ? EXAMPLE : loadSets()[id]
  $('csv').value = set.raw_train
  $('name').value = id === 'example' ? '' : set.name
  build()
})

$('save').addEventListener('click', () => {
  const name = $('name').value.trim() || 'Untitled'
  const sets = loadSets().filter((s) => s.name !== name)
  const d = new Date()
  sets.push({ name, raw_train: $('csv').value, modified: `${d.toLocaleDateString()} ${d.toLocaleTimeString()}` })
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sets))
  } catch {
    showError('Could not save: browser storage is unavailable.')
  }
  renderSets()
})

// ---------------------------------------------------------------- model

function showError(msg) {
  $('error').textContent = msg
  $('error').hidden = !msg
}

const isNumericColumn = (j) => state.rows.some((r) => typeof r[j] === 'number')

function build() {
  showError('')
  try {
    const { attributes, rows } = toTable($('csv').value, $('delimiter').value)
    const keep = state?.attributes.join('\u0000') === attributes.join('\u0000') ? state.target : null
    state = { attributes, rows }
    // Default question: the last categorical column.
    const target = keep ?? [...attributes].reverse().find((_, i) => !isNumericColumn(attributes.length - 1 - i))
    if (!target) throw new Error('Every column is numeric. ditify predicts categories, so add at least one text column.')
    renderColumns()
    selectTarget(target)
    $('model').hidden = false
  } catch (err) {
    showError(err.message)
    $('model').hidden = true
  }
}

$('build').addEventListener('click', build)

// k-fold cross-validated accuracy for predicting `target`, plus the majority baseline.
function predictability(target) {
  const { attributes, rows } = state
  const t = attributes.indexOf(target)
  const labelled = rows.filter((r) => r[t] !== '' && r[t] !== null).slice(0, 2000) // keep the table instant
  const n = labelled.length
  if (n < 4) return null
  const counts = {}
  for (const r of labelled) counts[r[t]] = (counts[r[t]] || 0) + 1
  const baseline = Math.max(...Object.values(counts)) / n
  const k = Math.min(5, n)
  let correct = 0
  for (let f = 0; f < k; f++) {
    const train = labelled.filter((_, i) => i % k !== f)
    const test = labelled.filter((_, i) => i % k === f)
    const r = new Ditify({ attributes, target }).train(train).evaluate(test)
    correct += r.accuracy * r.n
  }
  return { accuracy: correct / n, baseline }
}

function renderColumns() {
  const body = state.attributes
    .map((a, j) => {
      const numeric = isNumericColumn(j)
      const p = numeric ? null : predictability(a)
      const cell = p
        ? `${meter(p.accuracy)}${pct(p.accuracy)} <span class="muted" title="Accuracy of always guessing the most common value">vs ${pct(p.baseline)} baseline</span>`
        : `<span class="muted">${numeric ? 'numeric, used as an input only' : 'too few rows'}</span>`
      return `<tr data-col="${esc(a)}"><td>${esc(a)}</td><td class="num">${cell}</td></tr>`
    })
    .join('')
  $('columns').innerHTML = `<thead><tr><th>Column</th><th>Predictability</th></tr></thead><tbody>${body}</tbody>`
}

$('columns').addEventListener('click', (e) => {
  const row = e.target.closest('tr[data-col]')
  if (row && !isNumericColumn(state.attributes.indexOf(row.dataset.col))) selectTarget(row.dataset.col)
})

function selectTarget(target) {
  state.target = target
  state.model = new Ditify({ attributes: state.attributes, target }).train(state.rows)
  for (const tr of $('columns').querySelectorAll('tr[data-col]')) tr.classList.toggle('selected', tr.dataset.col === target)
  $('target-name').textContent = target
  renderAskForm()
  $('answer').hidden = true
  renderTree([])
  renderImportance()
  $('rules').innerHTML = state.model.rules().map((r) => `<li>${esc(r)}</li>`).join('')
}

// ---------------------------------------------------------------- ask

function renderAskForm() {
  const { attributes, rows, target } = state
  $('ask').innerHTML =
    attributes
      .map((a, j) => {
        if (a === target) return ''
        if (isNumericColumn(j)) return `<label>${esc(a)}<input name="${esc(a)}" type="number" step="any"></label>`
        const values = [...new Set(rows.map((r) => r[j]).filter((v) => v !== ''))].slice(0, 200)
        return `<label>${esc(a)}<input name="${esc(a)}" list="dl-${j}" autocomplete="off">
          <datalist id="dl-${j}">${values.map((v) => `<option value="${esc(v)}">`).join('')}</datalist></label>`
      })
      .join('') + `<button class="primary">Ask</button>`
}

$('ask').addEventListener('submit', (e) => {
  e.preventDefault()
  const query = {}
  state.attributes.forEach((a, j) => {
    if (a === state.target) return
    const v = e.target.elements[a].value.trim()
    query[a] = v === '' ? null : isNumericColumn(j) ? Number(v) : v
  })
  const r = state.model.explain(query, { target: state.target })
  const probs = Object.entries(r.probabilities).sort((a, b) => b[1] - a[1])
  $('answer').innerHTML = `
    <div class="big">${esc(state.target)}: ${esc(r.label)} <span class="muted">${pct(r.chance)}</span></div>
    <div class="because">${r.because ? `because <b>${esc(r.because)}</b>` : 'the tree has no splits, so this is simply the most common value'}</div>
    <div class="probs">${probs.map(([k, p]) => `<span>${esc(k)}</span><span>${meter(p)}${pct(p)}</span>`).join('')}</div>`
  $('answer').hidden = false
  renderTree(r.path)
})

// ---------------------------------------------------------------- tree

// Renders the fitted tree as nested <details>, highlighting the path `explain()` took.
function renderTree(path) {
  const label = (node) =>
    `<span class="pred">${esc(node.label)}</span> <span class="muted">${pct(node.chance)} · n=${Math.round(node.samples * 10) / 10}</span>`
  const render = (node, test, depth, onPath) => {
    const on = onPath ? ' on' : ''
    const head = test ? `<span class="test">${esc(test)}</span> → ` : ''
    if (!node.children) return `<li><span class="leaf${on}">${head}${label(node)}</span></li>`
    const step = onPath ? path[depth] : null
    const kids = node.children
      .map((c) => render(c.node, `${node.attribute} ${c.test}`, depth + 1, !!step && step.attribute === node.attribute && step.test === c.test))
      .join('')
    return `<li><details open class="${on}"><summary>${head}${label(node)} <span class="split">· split on ${esc(node.attribute)}</span></summary><ul>${kids}</ul></details></li>`
  }
  $('tree').innerHTML = render(state.model.tree(), '', 0, path.length > 0)
}

function renderImportance() {
  const imp = Object.entries(state.model.importance()).sort((a, b) => b[1] - a[1])
  $('importance').innerHTML = `<div class="probs">${imp.map(([a, p]) => `<span>${esc(a)}</span><span>${meter(p)}${pct(p)}</span>`).join('')}</div>`
}

// ---------------------------------------------------------------- start

renderSets()
$('csv').value = loadSets().length ? '' : EXAMPLE.raw_train
if ($('csv').value) build()
