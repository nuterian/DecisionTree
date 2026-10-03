// Trains a random forest off the main thread so the page stays responsive.
import { Forest } from './ditify.js'

const TREES = 100

self.onmessage = ({ data: { attributes, rows, target } }) => {
  // Same 80/20 split as the single tree, so the numbers are comparable.
  const train = rows.filter((_, i) => i % 5 !== 0)
  const test = rows.filter((_, i) => i % 5 === 0)
  const t0 = performance.now()
  const forest = new Forest({ attributes, target, trees: TREES }).train(train)
  forest.importance() // training is lazy; this triggers the fit
  const ms = performance.now() - t0
  const { accuracy } = forest.evaluate(test)
  self.postMessage({ accuracy, ms, trees: TREES })
}
