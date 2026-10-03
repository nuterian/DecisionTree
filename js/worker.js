// Scores how predictable each column is, off the main thread.
import { Ditify } from './ditify.js'

const MAX_ROWS = 2000 // enough for a stable estimate, small enough to stay quick

self.onmessage = ({ data: { attributes, rows, columns } }) => {
  for (const target of columns) {
    const t = attributes.indexOf(target)
    const labelled = rows.filter((r) => r[t] !== '' && r[t] !== null).slice(0, MAX_ROWS)
    const n = labelled.length
    if (n < 4) {
      self.postMessage({ target, accuracy: null })
      continue
    }
    const counts = new Map()
    for (const r of labelled) counts.set(r[t], (counts.get(r[t]) ?? 0) + 1)
    const baseline = Math.max(...counts.values()) / n
    // k-fold cross-validation with interleaved folds.
    const k = Math.min(5, n)
    let correct = 0
    for (let f = 0; f < k; f++) {
      const train = labelled.filter((_, i) => i % k !== f)
      const test = labelled.filter((_, i) => i % k === f)
      const r = new Ditify({ attributes, target }).train(train).evaluate(test)
      correct += r.accuracy * r.n
    }
    self.postMessage({ target, accuracy: correct / n, baseline })
  }
}
