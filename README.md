# Decision Tree

**Paste a table. Leave a blank. Ask why.**

A no-build web app for exploring decision trees, powered by
[ditify](https://github.com/nuterian/ditify).

Demo: http://nuterian.github.io/DecisionTree

- **Paste any CSV.** Columns that are all numbers are detected automatically and
  split on thresholds.
- **See which columns are predictable.** Each column gets a 5-fold
  cross-validated accuracy against a "guess the most common value" baseline.
  Click one to make it the question.
- **Ask.** Fill in what you know and leave the rest blank. You get an answer, a
  confidence, and the reason ("because outlook = sunny AND humidity = high"),
  with that path lit up in the tree.
- **Read the model.** The collapsible tree, IF/THEN rules, and column
  importance are all on the page.
- **Data stays in your browser.** Saved data sets live in `localStorage`.

## Run locally

It's a plain static site, but ES modules need to be served over HTTP:

```sh
python3 -m http.server   # then open http://localhost:8000
```

`js/ditify.js` is a vendored copy of the library. To upgrade, copy the latest
`ditify.js` over it.
