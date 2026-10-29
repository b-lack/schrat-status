// Automated WCAG 2.1 A/AA audit (axe-core) of the Schrat website and web app,
// in light and dark mode. This is the automatable part of EN 301 549 /
// BITV 2.0; manual checks (keyboard, screen reader, zoom) are not covered.
// Writes accessibility/report.json, which schrat.eco/barrierefreiheit renders.
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import puppeteer from 'puppeteer-core'

const require = createRequire(import.meta.url)
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const axeVersion = JSON.parse(readFileSync(require.resolve('axe-core/package.json'), 'utf8')).version

const TARGETS = [
  ['Website', 'Startseite', 'https://schrat.eco/'],
  ['Website', 'Preise', 'https://schrat.eco/pricing'],
  ['Website', 'Preisblatt', 'https://schrat.eco/preisblatt'],
  ['Website', 'Marktplatz', 'https://schrat.eco/marketplace'],
  ['Website', 'Download', 'https://schrat.eco/download'],
  ['Website', 'Neuigkeiten', 'https://schrat.eco/blog'],
  ['Website', 'Kontakt', 'https://schrat.eco/contact'],
  ['Website', 'Anmeldung (Konto)', 'https://schrat.eco/login'],
  ['Website', 'Loslegen', 'https://schrat.eco/loslegen'],
  ['Website', 'Sicherheit', 'https://schrat.eco/sicherheit'],
  ['Website', 'Betriebsstatus', 'https://schrat.eco/status'],
  ['Website', 'Barrierefreiheit', 'https://schrat.eco/barrierefreiheit'],
  ['Website', 'Datenschutz', 'https://schrat.eco/datenschutz'],
  ['Website', 'Impressum', 'https://schrat.eco/impressum'],
  ['Website', 'Startseite (Englisch)', 'https://schrat.eco/en'],
  ['Web-App', 'Start', 'https://app.schrat.eco/'],
  ['Web-App', 'Anmelden', 'https://app.schrat.eco/auth/login'],
  ['Web-App', 'Registrieren', 'https://app.schrat.eco/auth/signup'],
  ['Web-App', 'Passwort zurücksetzen', 'https://app.schrat.eco/auth/reset-password'],
  ['Web-App', 'Projekte', 'https://app.schrat.eco/home'],
]

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox'],
})

const pages = []
for (const [area, title, url] of TARGETS) {
  const entry = { area, title, url, schemes: {} }
  for (const scheme of ['light', 'dark']) {
    const page = await browser.newPage()
    try {
      await page.setViewport({ width: 1280, height: 900 })
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }])
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 })
      await new Promise(r => setTimeout(r, 1500))
      await page.evaluate(axeSource)
      const res = await page.evaluate(() => axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      }))
      entry.schemes[scheme] = {
        passes: res.passes.length,
        violations: res.violations.map(v => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          helpUrl: v.helpUrl,
          wcag: v.tags.filter(t => /^wcag\d{3,}$/.test(t)).map(t => t.slice(4)).map(d => `${d[0]}.${d[1]}.${d.slice(2)}`),
          count: v.nodes.length,
          examples: v.nodes.slice(0, 3).map(n => n.target.join(' ')),
        })),
      }
    }
    catch (e) {
      entry.schemes[scheme] = { error: String(e.message || e).slice(0, 200) }
    }
    finally {
      await page.close()
    }
  }
  pages.push(entry)
  console.log(`${area} / ${title}: ${['light', 'dark'].map(s => entry.schemes[s].error ? 'error' : entry.schemes[s].violations.length).join(' / ')}`)
}
await browser.close()

const violations = pages.flatMap(p => Object.values(p.schemes).flatMap(s => s.violations ?? []))
const report = {
  generatedAt: new Date().toISOString(),
  standard: 'WCAG 2.1 Level A und AA',
  tool: `axe-core ${axeVersion}`,
  summary: {
    pages: pages.length,
    checks: pages.length * 2,
    violations: violations.length,
    errors: pages.flatMap(p => Object.values(p.schemes)).filter(s => s.error).length,
  },
  pages,
}
writeFileSync(new URL('./report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(`\n${report.summary.violations} rule violations, ${report.summary.errors} load errors`)
