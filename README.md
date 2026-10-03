# Decision Tree

**Paste a table. Leave a blank. Ask why.**

A tiny web app for exploring decision trees, built on
[ditify](https://github.com/nuterian/ditify). There's no build step and no
framework, and your data never leaves the browser.

Demo: http://nuterian.github.io/DecisionTree

- **Drop in data.** Paste, drop or open a CSV. The delimiter and numeric columns
  are detected for you, and the tree rebuilds as you edit.
- **Pick what to predict.** Every text column shows its cross-validated
  accuracy, so you can see at a glance what the data can and can't tell you.
- **Ask.** Fill in what you know and the answer updates as you type, with a
  plain-language reason. The branch it followed lights up in the tree.
- **Read the model.** See the tree, what matters most, and the rules, ordered
  by how many rows they cover.
- **Fast with big tables.** Scoring runs in a Web Worker, and deep branches only
  render when you open them. A 3,000-row table is ready in about 50 ms.

## Run locally

```sh
python3 -m http.server   # then open http://localhost:8000
```

`js/ditify.js` is a copy of the library. To upgrade, copy the latest
`ditify.js` over it.
