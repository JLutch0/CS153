import axios from 'axios'
import { load as cheerioLoad } from 'cheerio'
import pdfParse from 'pdf-parse'
import Anthropic from '@anthropic-ai/sdk'

// ── Constants ────────────────────────────────────────────────────────────────

const MODEL = 'claude-sonnet-4-6'
const MAX_SOURCE_CHARS = 32_000   // ~8 000 tokens per source
const FETCH_TIMEOUT_MS = 10_000
const MAX_INTERNAL_LINKS = 30
const TOOL_USE_MAX_ITERS = 12     // guard against infinite tool loops

// ── Utilities ────────────────────────────────────────────────────────────────

export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

function truncate(text, max) {
  return text.length <= max ? text : text.slice(0, max) + '\n[…truncated]'
}

export function hostname(urlStr) {
  try { return new URL(urlStr).hostname } catch { return urlStr }
}

function parseJsonArray(text) {
  const match = text.match(/\[[\s\S]*?\]/)
  if (!match) throw new Error('No JSON array in response')
  return JSON.parse(match[0])
}

function parseJsonObject(text) {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON object in response')
  return JSON.parse(match[0])
}

// ── Token estimation ─────────────────────────────────────────────────────────

export function estimateTokens(urlCount, fileCount) {
  const approxInputChars = urlCount * 32_000 + fileCount * 24_000
  const inputTokens = Math.ceil(approxInputChars * 0.25)
  const outputTokens = 3 * 3_000
  const total = (inputTokens + outputTokens) * 3 + 1_000
  const clampedTotal = Math.max(total, 15_000)
  const costUSD = (inputTokens * 3 * 0.000_003) + (outputTokens * 3 * 0.000_015)
  return {
    estimatedTokens: clampedTotal,
    estimatedCostUSD: Math.round(costUSD * 100) / 100
  }
}

// ── Prompt construction ───────────────────────────────────────────────────────

const ANALYST_SYSTEM =
  'You are a rigorous financial analyst. You identify consequential real-world scenarios ' +
  'that could materially affect a publicly traded company. ' +
  'You do not speculate beyond the provided sources.'

export function buildSystemPrompt(knowledgeHorizon) {
  if (!knowledgeHorizon) return ANALYST_SYSTEM
  const dateStr = new Date(knowledgeHorizon).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  })
  return (
    `${ANALYST_SYSTEM}\n\n` +
    `Today is ${dateStr}. Reason only from information available on or before this date. ` +
    `Do not reference or infer events that occurred after this date.`
  )
}

// ── Retry wrapper (handles 429 rate limits per spec §13) ─────────────────────

async function withRetry(fn, retries = 3) {
  let delay = 1_000
  for (let i = 0; i <= retries; i++) {
    try { return await fn() } catch (e) {
      if (e.status === 429 && i < retries) { await sleep(delay); delay *= 2; continue }
      throw e
    }
  }
}

// ── URL fetching ─────────────────────────────────────────────────────────────

async function fetchHtml(url) {
  const res = await axios.get(url, {
    timeout: FETCH_TIMEOUT_MS,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Lens/1.0)',
      'Accept': 'text/html,application/xhtml+xml'
    },
    maxContentLength: 5 * 1024 * 1024
  })
  return String(res.data)
}

function extractTextAndLinks(html, baseUrl) {
  const $ = cheerioLoad(html)
  $(
    'script, style, noscript, iframe, nav, header, footer, aside, ' +
    '[role="navigation"], [role="banner"], [role="contentinfo"], ' +
    '.nav, .navbar, .menu, .footer, .header, .sidebar, ' +
    '.ad, .advertisement, .cookie-banner, .popup'
  ).remove()
  const text = $('body').text().replace(/\s+/g, ' ').trim()
  const base = new URL(baseUrl)
  const links = []
  const seen = new Set([baseUrl])
  $('a[href]').each((_, el) => {
    if (links.length >= MAX_INTERNAL_LINKS) return false
    try {
      const resolved = new URL($(el).attr('href'), baseUrl)
      if (resolved.hostname === base.hostname && !seen.has(resolved.href)) {
        seen.add(resolved.href); links.push(resolved.href)
      }
    } catch { /* malformed href */ }
  })
  return { text: truncate(text, MAX_SOURCE_CHARS), links }
}

// ── Document processing ───────────────────────────────────────────────────────

// Build a heading → full-text section index for the read_section tool.
function indexDocumentSections(text) {
  const sections = new Map()
  let heading = 'introduction'
  let buf = []
  for (const line of text.split('\n')) {
    const t = line.trim()
    const isMarkdownHeading = /^#{1,4}\s+\S/.test(t)
    const isAllCaps = t.length >= 4 && t === t.toUpperCase() && /[A-Z]{3}/.test(t)
    if (isMarkdownHeading || isAllCaps) {
      if (buf.length) sections.set(heading, buf.join('\n').trim())
      heading = t.replace(/^#+\s*/, '').toLowerCase()
      buf = []
    } else {
      buf.push(line)
    }
  }
  if (buf.length) sections.set(heading, buf.join('\n').trim())
  return sections
}

function getSectionText(docIndex, docId, sectionHeading) {
  const doc = docIndex.get(docId)
  if (!doc) {
    return `Document not found. Available documents: ${Array.from(docIndex.keys()).join(', ')}`
  }
  const query = sectionHeading.toLowerCase()
  if (doc.sections.has(query)) return doc.sections.get(query)
  // Fuzzy: find section whose key contains the query or vice-versa
  for (const [key, val] of doc.sections) {
    if (key.includes(query) || query.includes(key)) return val
  }
  return `Section not found. Available sections: ${Array.from(doc.sections.keys()).join(', ')}`
}

async function processDocument(entry) {
  const buf = Buffer.from(entry.buffer)
  const ext = entry.name.split('.').pop().toLowerCase()
  let text = ''
  if (ext === 'pdf') {
    try { const p = await pdfParse(buf); text = truncate(p.text, MAX_SOURCE_CHARS) }
    catch (e) { text = `[PDF parse failed: ${e.message}]` }
  } else {
    text = truncate(buf.toString('utf-8'), MAX_SOURCE_CHARS)
  }
  return { id: entry.id, name: entry.name, text, sections: indexDocumentSections(text) }
}

// ── Context assembly ──────────────────────────────────────────────────────────

// Uses document summaries in context; full text accessible via read_section.
function assembleContext(urlResults, docResults) {
  const parts = []
  for (const r of urlResults) {
    if (r.text) parts.push(`=== SOURCE: ${r.url} ===\n${r.text}`)
  }
  for (const d of docResults) {
    const snippet = d.summary ?? truncate(d.text, 6_000)
    parts.push(`=== DOCUMENT: ${d.name} (doc_id: ${d.id}) ===\n${snippet}`)
  }
  return parts.join('\n\n')
}

// ── Stage 3: Relevance filtering (Claude) ────────────────────────────────────

async function filterRelevantLinks(client, ticker, rootText, links) {
  if (links.length === 0) return []
  const res = await withRetry(() => client.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{
      role: 'user',
      content:
        `Given the ticker ${ticker}, which of these links most likely contain relevant ` +
        `financial analysis or news? Return the top 5 as a JSON array of URL strings. JSON only.\n\n` +
        `PAGE EXCERPT:\n${rootText.slice(0, 2_000)}\n\nLINKS:\n${links.slice(0, 30).join('\n')}`
    }]
  }))
  try {
    const parsed = parseJsonArray(res.content[0].text)
    return parsed.filter(u => typeof u === 'string').slice(0, 5)
  } catch { return links.slice(0, 5) }
}

// ── Stage 4: Document summarization (Claude) ──────────────────────────────────

async function summarizeDocument(client, doc) {
  const res = await withRetry(() => client.messages.create({
    model: MODEL,
    max_tokens: 2_048,
    messages: [{
      role: 'user',
      content:
        `Produce a structured summary of the following document with clearly labeled section ` +
        `headings. For each section, write 2-3 sentences summarizing the key claims.\n\n` +
        `DOCUMENT (${doc.name}):\n${doc.text}`
    }]
  }))
  return res.content[0].text
}

// ── Stage 5.5: Competitor identification (Claude) ────────────────────────────

async function identifyCompetitors(client, ticker) {
  const res = await withRetry(() => client.messages.create({
    model: MODEL,
    max_tokens: 256,
    messages: [{
      role: 'user',
      content:
        `Name the 3–5 most significant publicly traded direct competitors of ${ticker}. ` +
        `Return a JSON array of objects with fields: name (company name, string) and ` +
        `ticker (exchange ticker symbol, string). Return JSON only, no preamble.`
    }]
  }))
  try {
    const parsed = parseJsonArray(res.content[0].text)
    return parsed
      .filter(c => c && typeof c.name === 'string')
      .slice(0, 5)
      .map(c => ({
        name:   String(c.name).trim(),
        ticker: c.ticker ? String(c.ticker).trim().toUpperCase() : null
      }))
  } catch { return [] }
}

// ── Stage 6: Scenario identification (Claude) ─────────────────────────────────

async function identifyScenarios(client, ticker, contextBlock, systemPrompt) {
  const res = await withRetry(() => client.messages.create({
    model: MODEL,
    max_tokens: 1_024,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: [{
        type: 'text',
        text:
          `The ticker is ${ticker}. Using only the sources provided below, identify exactly ` +
          `three independent scenarios that could materially affect this company's stock. ` +
          `Scenarios may share a root cause but must diverge in direction or magnitude.\n\n` +
          `Return a JSON array of exactly 3 objects, each with fields:\n` +
          `  title (string, max 12 words)\n  description (string, one sentence)\n\n` +
          `Return JSON only, no preamble.\n\nSOURCES:\n${contextBlock}`,
        cache_control: { type: 'ephemeral' }
      }]
    }]
  }))
  const scenarios = parseJsonArray(res.content[0].text)
  if (!Array.isArray(scenarios) || scenarios.length !== 3) {
    throw new Error(`Expected 3 scenarios, got ${Array.isArray(scenarios) ? scenarios.length : 'non-array'}`)
  }
  return scenarios.map(s => ({
    title: String(s.title ?? '').trim().slice(0, 100),
    description: String(s.description ?? '').trim()
  }))
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const READ_SECTION_TOOL = {
  name: 'read_section',
  description: 'Read the full text of a specific section from an uploaded document.',
  input_schema: {
    type: 'object',
    properties: {
      doc_id:          { type: 'string', description: 'The document ID (shown in the SOURCES block)' },
      section_heading: { type: 'string', description: 'The section heading to retrieve' }
    },
    required: ['doc_id', 'section_heading']
  }
}

// submit_analysis forces the model to deposit its findings into typed fields
// rather than returning free-form prose, guaranteeing a structured result.
const SUBMIT_ANALYSIS_TOOL = {
  name: 'submit_analysis',
  description:
    'Submit the completed scenario analysis. Call this once you have finished reasoning ' +
    'through all aspects of the scenario. Use read_section first if you need document details.',
  input_schema: {
    type: 'object',
    properties: {
      causal_chain: {
        type: 'string',
        description:
          'Step-by-step causal chain from the scenario trigger to its ultimate impact on the company. ' +
          'Cite specific evidence from the provided sources. Markdown is supported.'
      },
      financial_impact: {
        type: 'string',
        description:
          'Specific effects on revenue, operating margins, cash flow, and/or balance sheet. ' +
          'Reference figures from sources where available. Markdown is supported.'
      },
      competitive_impact: {
        type: 'string',
        description:
          'How this scenario shifts the company\'s position relative to key competitors, ' +
          'customers, or suppliers — market share, pricing power, strategic optionality. ' +
          'Markdown is supported.'
      },
      stock_reaction: {
        type: 'string',
        description:
          'Likely market reaction: direction (bullish/bearish), probable magnitude, ' +
          'and timeframe (immediate, months, longer-term). Note key uncertainties. ' +
          'Markdown is supported.'
      },
      timeline: {
        type: 'array',
        description:
          'Ordered sequence of key events/milestones that would unfold if this scenario materializes. ' +
          'Use 4–6 entries spanning from immediate to multi-year horizons.',
        items: {
          type: 'object',
          properties: {
            timeframe: { type: 'string', description: 'Time horizon, e.g. "0–2 weeks", "1–3 months", "Year 1–2"' },
            event:     { type: 'string', description: 'Key development or market milestone during this period' }
          },
          required: ['timeframe', 'event']
        },
        minItems: 4,
        maxItems: 6
      }
    },
    required: ['causal_chain', 'financial_impact', 'competitive_impact', 'stock_reaction', 'timeline']
  }
}

// Flatten a structured analysis object to plain text for scoring / selection calls.
function serializeAnalysis(analysis) {
  if (!analysis || typeof analysis === 'string') return String(analysis)
  const parts = [
    `CAUSAL CHAIN:\n${analysis.causal_chain}`,
    `FINANCIAL IMPACT:\n${analysis.financial_impact}`,
    `COMPETITIVE IMPACT:\n${analysis.competitive_impact}`,
    `STOCK REACTION:\n${analysis.stock_reaction}`
  ]
  return parts.join('\n\n')
}

// ── Stage 7–15: Deep analysis (Claude, temperature 0.7, with tool use) ────────
// Uses tool_choice:'any' so the model MUST call either read_section or
// submit_analysis on every turn — prevents free-form text responses and
// guarantees a structured result via submit_analysis.

async function runDeepAnalysis(client, ticker, scenario, contextBlock, systemPrompt, docIndex, usageAcc) {
  const messages = [{
    role: 'user',
    content: [
      {
        type: 'text',
        text: `SOURCES:\n${contextBlock}`,
        cache_control: { type: 'ephemeral' }  // cache hit for all 9 ensemble runs
      },
      {
        type: 'text',
        text:
          `Analyze the following scenario for ${ticker}. Use read_section if you need specific ` +
          `sections from uploaded documents. When your analysis is complete, call submit_analysis ` +
          `with your findings.\n\nSCENARIO: ${scenario.title} — ${scenario.description}`
      }
    ]
  }]

  let iters = 0
  while (iters++ < TOOL_USE_MAX_ITERS) {
    // On the last two iterations force submit_analysis so we always get a result
    // even if the model got stuck in a read_section loop.
    const forceSubmit = iters >= TOOL_USE_MAX_ITERS - 1

    const res = await withRetry(() => client.messages.create({
      model: MODEL,
      max_tokens: 4_096,
      temperature: 0.7,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      tools: [READ_SECTION_TOOL, SUBMIT_ANALYSIS_TOOL],
      tool_choice: forceSubmit
        ? { type: 'tool', name: 'submit_analysis' }
        : { type: 'any' },
      messages
    }))

    if (res.usage) {
      usageAcc.input       += res.usage.input_tokens ?? 0
      usageAcc.output      += res.usage.output_tokens ?? 0
      usageAcc.cacheRead   += res.usage.cache_read_input_tokens ?? 0
      usageAcc.cacheWrite  += res.usage.cache_creation_input_tokens ?? 0
    }

    messages.push({ role: 'assistant', content: res.content })

    const toolCalls = res.content.filter(b => b.type === 'tool_use')

    // Check for submit_analysis first — if present we're done
    const submission = toolCalls.find(b => b.name === 'submit_analysis')
    if (submission) return submission.input

    // Fulfill any read_section calls and loop
    const toolResults = []
    for (const block of toolCalls) {
      if (block.name !== 'read_section') continue
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: getSectionText(docIndex, block.input.doc_id, block.input.section_heading)
      })
    }
    if (toolResults.length > 0) {
      messages.push({ role: 'user', content: toolResults })
    } else {
      break // no tool calls at all — shouldn't happen with tool_choice:'any'
    }
  }

  return {
    causal_chain:       '[Analysis incomplete — loop exhausted]',
    financial_impact:   '',
    competitive_impact: '',
    stock_reaction:     ''
  }
}

// ── Stage 16–18: Uncertainty scoring (Claude) ────────────────────────────────

async function scoreUncertainty(client, ticker, runs, usageAcc) {
  const [r0, r1, r2] = runs.map(serializeAnalysis)
  const res = await withRetry(() => client.messages.create({
    model: MODEL,
    max_tokens: 256,
    messages: [{
      role: 'user',
      content:
        `Below are three independent analyses of the same scenario for ${ticker}. ` +
        `Rate the overall consistency and source-groundedness on a scale from 1 to 10, ` +
        `where 10 = all three strongly agree on causal chain, direction, and evidence; ` +
        `1 = they fundamentally contradict each other or make unsupported claims.\n\n` +
        `Return a JSON object with fields: score (integer 1–10), rationale (string, one sentence). ` +
        `Return JSON only.\n\n` +
        `ANALYSIS 1:\n${r0}\n\nANALYSIS 2:\n${r1}\n\nANALYSIS 3:\n${r2}`
    }]
  }))
  if (res.usage) {
    usageAcc.input  += res.usage.input_tokens ?? 0
    usageAcc.output += res.usage.output_tokens ?? 0
  }
  try {
    const parsed = parseJsonObject(res.content[0].text)
    return {
      score: Math.min(10, Math.max(1, parseInt(parsed.score) || 5)),
      rationale: String(parsed.rationale ?? '')
    }
  } catch {
    return { score: 5, rationale: 'Could not parse scoring response.' }
  }
}

// ── Representative run selection (Claude) ────────────────────────────────────

async function selectRepresentativeRun(client, runs, usageAcc) {
  const snippets = runs
    .map((r, i) => `ANALYSIS ${i + 1}:\n${serializeAnalysis(r).slice(0, 600)}`)
    .join('\n\n')
  const res = await withRetry(() => client.messages.create({
    model: MODEL,
    max_tokens: 10,
    messages: [{
      role: 'user',
      content:
        `Of these three analyses, which is most representative of the consensus view? ` +
        `Return the number (1, 2, or 3) only.\n\n${snippets}`
    }]
  }))
  if (res.usage) {
    usageAcc.input  += res.usage.input_tokens ?? 0
    usageAcc.output += res.usage.output_tokens ?? 0
  }
  const num = parseInt(res.content[0].text.trim())
  return (num >= 1 && num <= 3) ? num - 1 : 0  // 0-indexed, fallback to first run
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export async function runPipeline(sender, ticker, { store, sessionFiles, waitForConfirmation }) {
  const send = (ch, data) => { if (!sender.isDestroyed()) sender.send(ch, data) }
  const emit = async (msg) => { send('analysis:status', { message: msg }); await sleep(300) }
  const warn = async (msg) => { send('analysis:status', { message: `⚠ ${msg}` }); await sleep(200) }

  const usageAcc = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

  try {
    const apiKey = store.get('apiKey', '')
    if (!apiKey) {
      send('analysis:error', { message: 'No API key set. Add your Anthropic API key in Settings.' })
      return
    }

    const knowledgeHorizon = store.get('knowledgeHorizon', null)
    const systemPrompt = buildSystemPrompt(knowledgeHorizon)
    const client = new Anthropic({ apiKey })

    // ── Stage 1: Token estimate ──────────────────────────────────────────
    const urls = store.get('sources', [])
    const files = Array.from(sessionFiles.values())
    send('analysis:token-estimate', estimateTokens(urls.length, files.length))
    await waitForConfirmation()

    // ── Stage 2: Fetch URL root pages ────────────────────────────────────
    const urlResults = []
    if (urls.length > 0) {
      for (const src of urls) {
        const host = hostname(src.value)
        await emit(`Fetching ${host}...`)
        try {
          const html = await fetchHtml(src.value)
          const { text, links } = extractTextAndLinks(html, src.value)
          urlResults.push({ url: src.value, host, text, links })
        } catch (e) {
          await warn(`Could not fetch ${host} — skipped (${e.code ?? e.message})`)
          urlResults.push({ url: src.value, host, text: '', links: [], failed: true })
        }
      }
    } else {
      await emit('No URL sources — analysis will rely on model training data only')
    }

    // ── Stage 3: Relevance filtering + sub-page fetch ────────────────────
    for (const r of urlResults.filter(r => !r.failed && r.links.length > 0)) {
      await emit(`Filtering relevant articles from ${r.host}...`)
      try {
        const topLinks = await filterRelevantLinks(client, ticker, r.text, r.links)
        const subTexts = []
        for (const link of topLinks) {
          try {
            await emit(`Fetching article: ${hostname(link)}...`)
            const html = await fetchHtml(link)
            const { text } = extractTextAndLinks(html, link)
            subTexts.push(`--- ${link} ---\n${text}`)
          } catch { /* skip silently */ }
        }
        if (subTexts.length > 0) {
          r.text = truncate(r.text + '\n\n' + subTexts.join('\n\n'), MAX_SOURCE_CHARS * 2)
        }
      } catch (e) {
        await warn(`Relevance filtering failed for ${r.host}: ${e.message}`)
      }
    }

    // ── Stage 4: Document processing + summarization ─────────────────────
    const docResults = []
    const docIndex = new Map()
    for (const file of files) {
      await emit(`Processing document: ${file.name}...`)
      const doc = await processDocument(file)
      await emit(`Summarizing document: ${file.name}...`)
      try {
        doc.summary = await summarizeDocument(client, doc)
      } catch (e) {
        await warn(`Could not summarize ${file.name}: ${e.message}`)
      }
      docResults.push(doc)
      docIndex.set(doc.id, doc)
    }

    // ── Stage 5: Context assembly ────────────────────────────────────────
    await emit('Assembling context...')
    const contextBlock = assembleContext(urlResults, docResults)

    // ── Stage 5.5: Competitor identification ────────────────────────────
    await emit(`Identifying competitors for ${ticker}...`)
    let competitors = []
    try { competitors = await identifyCompetitors(client, ticker) }
    catch (e) { await warn(`Could not identify competitors: ${e.message}`) }

    // ── Stage 6: Scenario identification ────────────────────────────────
    await emit(`Identifying scenarios for ${ticker}...`)
    const scenarios = await identifyScenarios(client, ticker, contextBlock, systemPrompt)

    // ── Stages 7–15: Ensemble deep analysis ─────────────────────────────
    const scenarioRuns = []   // 3 arrays of 3 run texts
    for (let s = 0; s < 3; s++) {
      const runs = []
      for (let r = 1; r <= 3; r++) {
        await emit(`Analyzing "${scenarios[s].title}" (run ${r}/3)...`)
        const analysis = await runDeepAnalysis(
          client, ticker, scenarios[s], contextBlock, systemPrompt, docIndex, usageAcc
        )
        runs.push(analysis)
      }
      scenarioRuns.push(runs)
    }

    // ── Stages 16–18: Uncertainty scoring ───────────────────────────────
    await emit('Scoring uncertainty...')
    const scoringResults = []
    for (let s = 0; s < 3; s++) {
      const scored = await scoreUncertainty(client, ticker, scenarioRuns[s], usageAcc)
      const repIdx = await selectRepresentativeRun(client, scenarioRuns[s], usageAcc)
      scoringResults.push({ ...scored, representativeRunIndex: repIdx })
    }

    // ── Stage 19: Result assembly ────────────────────────────────────────
    await emit('Assembling results...')

    const completedScenarios = scenarios.map((s, i) => ({
      title: s.title,
      description: s.description,
      analysis: scenarioRuns[i][scoringResults[i].representativeRunIndex],
      uncertaintyScore: scoringResults[i].score,
      uncertaintyRationale: scoringResults[i].rationale,
      sourcesUsed: urls.map(u => u.value).concat(files.map(f => f.name))
    }))

    const actualTokens = usageAcc.input + usageAcc.output
    const { estimatedTokens, estimatedCostUSD } = estimateTokens(urls.length, files.length)
    const actualCostUSD = Math.round(
      (usageAcc.input * 0.000_003 + usageAcc.output * 0.000_015 -
       usageAcc.cacheRead * 0.0000003) * 100
    ) / 100

    send('analysis:result', {
      ticker,
      generatedAt: new Date().toISOString(),
      knowledgeHorizon,
      competitors,
      scenarios: completedScenarios,
      tokenUsage: { estimated: estimatedTokens, actual: actualTokens },
      estimatedCostUSD,
      actualCostUSD
    })

  } catch (e) {
    if (e.message === 'superseded' || e.message === 'User cancelled') return
    if (!sender.isDestroyed()) sender.send('analysis:error', { message: e.message })
  }
}
