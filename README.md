# portfolio
# Azman Ansari Portfolio

Two portfolio versions, built with plain HTML, CSS and JavaScript. No build step and no frameworks.

```
azman-portfolio/
├── advanced/        Advanced version: ML lab, case studies, command palette
│   ├── index.html
│   ├── style.css
│   └── script.js
└── basic/           First version: animated ledger and shop checkout demo
    ├── index.html
    ├── style.css
    └── script.js
```

## Run it

Open `advanced/index.html` (or `basic/index.html`) in any modern browser. Fonts load from Google Fonts, so the first load needs internet. Without it the page falls back to system fonts and still works.

## Make it yours

Search for these in the files and replace them:

| What | Where |
| --- | --- |
| Email, GitHub and LinkedIn placeholders | `index.html`, in the Contact section (`your-email@example.com` and so on) |
| Project cards and case studies | `advanced/script.js`, the `PROJECTS` list (and the project cards in `basic/index.html`) |
| Skill levels (1 to 5) | `advanced/script.js`, the `SK` list |
| Colours, fonts, spacing | `style.css`, the variables at the top of the file |
| Demo products and prices | `script.js`, the `PRODS` / `PRODUCTS` list |

All demo data (sales, customers, stock) is sample data generated in the browser.

## Advanced version features

- Interactive network hero. Click or tap the hero section to make a sale.
- Command palette: Ctrl K (or ⌘ K on Mac).
- Project case studies with filters.
- ML lab with four demos: demand forecast, customer segments (k-means), go-hybrid calculator, shop checkout.
- Skills radar chart, scroll-driven timeline, contact form that writes a message to copy.
- Light and dark themes, and reduced-motion support.

## Put it online

The advanced version deploys to GitHub Pages from `azman-portfolio/advanced/` whenever `main` is updated. Set the repository's Pages source to **GitHub Actions** in Settings → Pages. The deployment workflow is `.github/workflows/deploy-pages.yml`.
