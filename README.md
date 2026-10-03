# ditify playground

**Decision trees that explain themselves.** A live demo of
[ditify](https://github.com/nuterian/ditify): train on 1,000 rows in
milliseconds, ask anything, and see exactly why it answered.

**▶ http://nuterian.github.io/DecisionTree**

- **Three ready-made datasets:** customer churn (1,000 rows), loan decisions
  (1,000 rows, three outcomes) and the classic play-tennis set. You can also
  paste or drop your own CSV.
- **A tree you can see.** The answer's path lights up, edges are as thick as the
  rows that flow through them, and clicking any node asks about it.
- **Live knobs.** Depth, minimum leaf size and smoothing retrain the model on
  every move, and held-out accuracy updates as you drag.
- **Real numbers.** Training time, per-answer latency (well under a
  microsecond), and honest accuracy on rows the model never saw. One click
  trains a 100-tree random forest in a Web Worker to compare.
- **The code writes itself.** A snippet shows the exact `ditify` calls behind
  what's on screen.

No build step, no framework, and nothing leaves your browser. Fonts are
self-hosted (Inter and JetBrains Mono, SIL Open Font License).

## Run locally

```sh
python3 -m http.server   # then open http://localhost:8000
```

`js/ditify.js` is a copy of the library. To upgrade, copy the latest
`ditify.js` over it.
