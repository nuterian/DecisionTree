// Built-in demo data. Generated from a fixed seed, so every visitor sees the
// same 1,000 rows. Each set hides a few real rules under noise, missing values
// and columns that don't matter, giving the tree something to find.

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function tools(seed) {
  const r = rng(seed)
  const pick = (items, weights) => {
    let x = r() * (weights ? weights.reduce((a, b) => a + b, 0) : items.length)
    for (let i = 0; i < items.length; i++) {
      x -= weights ? weights[i] : 1
      if (x < 0) return items[i]
    }
    return items[items.length - 1]
  }
  const normal = (mean, sd) => mean + sd * Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
  const maybe = (v, p) => (r() < p ? null : v)
  return { r, pick, normal, clamp, maybe }
}

function churn() {
  const { r, pick, normal, clamp, maybe } = tools(42)
  const rows = []
  for (let i = 0; i < 1000; i++) {
    const plan = pick(['basic', 'plus', 'pro'], [5, 3, 2])
    const contract = pick(['monthly', 'annual'], plan === 'pro' ? [4, 6] : [7, 3])
    const tenure = Math.round(clamp(-Math.log(1 - r()) * 20, 0, 72))
    const spend = Math.round(clamp(normal({ basic: 12, plus: 29, pro: 59 }[plan], 5), 5, 90))
    const tickets = Math.min(12, Math.floor(-Math.log(1 - r()) * 1.6))
    const device = pick(['ios', 'android', 'web'], [4, 3.5, 2.5])
    const region = pick(['north', 'south', 'east', 'west'])
    const z =
      -1.1 +
      (contract === 'monthly' ? 1.5 : -1.2) +
      (tenure < 6 ? 1.4 : tenure < 18 ? 0.4 : -0.8) +
      (tickets >= 4 ? 1.8 : 0) +
      (plan === 'pro' ? -0.7 : 0) +
      (device === 'web' ? 0.3 : 0)
    const churned = r() < 1 / (1 + Math.exp(-z)) ? 'yes' : 'no'
    rows.push([plan, contract, tenure, spend, maybe(tickets, 0.04), maybe(device, 0.03), region, churned])
  }
  return {
    attributes: ['plan', 'contract', 'tenure_months', 'monthly_spend', 'support_tickets', 'device', 'region', 'churned'],
    rows,
  }
}

function loans() {
  const { r, pick, normal, clamp } = tools(7)
  const rows = []
  for (let i = 0; i < 1000; i++) {
    const employment = pick(['salaried', 'self-employed', 'student', 'retired'], [6, 2, 1, 1])
    const income =
      employment === 'student' ? Math.round(12 + r() * 20) : Math.round(clamp(Math.exp(normal(4.1, 0.45)), 18, 250))
    const credit = Math.round(clamp(normal(680, 75), 350, 850))
    const debt = Math.round(clamp(normal(30, 12), 0, 80))
    const years = employment === 'student' ? Math.floor(r() * 3) : Math.floor(r() * 25)
    const purpose = pick(['home', 'car', 'education', 'business'], [3, 3, 2, 2])
    let decision
    if (credit < 580) decision = 'denied'
    else if (debt > 45) decision = credit > 720 ? 'review' : 'denied'
    else if (credit >= 700 && income >= 50) decision = 'approved'
    else if (employment === 'self-employed' && years < 2) decision = 'review'
    else if (purpose === 'business' && credit < 650) decision = 'review'
    else decision = credit >= 640 ? 'approved' : 'review'
    if (r() < 0.06) decision = pick(['approved', 'review', 'denied'])
    rows.push([income, credit, debt, employment, years, purpose, decision])
  }
  return {
    attributes: ['income_k', 'credit_score', 'debt_ratio', 'employment', 'years_employed', 'purpose', 'decision'],
    rows,
  }
}

const TENNIS = `sunny,85,high,weak,no|sunny,80,high,strong,no|overcast,83,high,weak,yes|rain,70,high,weak,yes|rain,68,normal,weak,yes|rain,65,normal,strong,no|overcast,64,normal,strong,yes|sunny,72,high,weak,no|sunny,69,normal,weak,yes|rain,75,normal,weak,yes|sunny,75,normal,strong,yes|overcast,72,high,strong,yes|overcast,81,normal,weak,yes|rain,71,high,strong,no`

function tennis() {
  return {
    attributes: ['outlook', 'temp', 'humidity', 'wind', 'play'],
    rows: TENNIS.split('|').map((line) => line.split(',').map((v, j) => (j === 1 ? Number(v) : v))),
  }
}

export const DATASETS = [
  {
    key: 'churn',
    name: 'Customer churn',
    blurb: '1,000 subscribers. Who is about to cancel, and why?',
    make: churn,
    target: 'churned',
    maxDepth: 4,
    minSamplesLeaf: 5,
    example: { contract: 'monthly', tenure_months: 4, support_tickets: 5 },
  },
  {
    key: 'loans',
    name: 'Loan decisions',
    blurb: '1,000 applications, three outcomes. Can a tree rediscover the policy?',
    make: loans,
    target: 'decision',
    maxDepth: 5,
    minSamplesLeaf: 5,
    example: { credit_score: 690, debt_ratio: 28, employment: 'self-employed', years_employed: 1 },
  },
  {
    key: 'tennis',
    name: 'Play tennis?',
    blurb: "Quinlan's 14-row classic, the dataset decision trees were taught with.",
    make: tennis,
    target: 'play',
    maxDepth: Infinity,
    minSamplesLeaf: 1,
    example: { outlook: 'sunny', humidity: 'high' },
  },
]
