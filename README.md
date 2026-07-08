# SuperHyre — website

A static, responsive two-page site built from the `superhyre` Figma design (orange variant).
No build step, no dependencies — just HTML, CSS, and a little vanilla JS. Fonts load from Google Fonts.

## Pages

- `index.html` — home: SUPERHYRE hero (Creation-of-Adam hands), then a **pinned
  horizontal-scroll** feature section. As you scroll down, the section locks in place and the
  three cards (Vetting / Speed / People) move sideways; once you reach the end, vertical
  scrolling resumes. On phones the pin is disabled and the cards stack.
- `talent.html` — "we talent engineer": the article content plus a testimonial carousel
  (Steve Jobs / Paul Graham) with arrows and dots.

The two pages link to each other through the header, the hero buttons, and the footer.

## Files

```
superhyre/
├── index.html
├── talent.html
├── .nojekyll
├── README.md
└── assets/
    ├── hero-hands.png      # hands behind the SUPERHYRE wordmark
    ├── card-vetting.png    # "Vetting that goes past the resume"
    ├── card-speed.png      # "Speed that doesn't cut corners"
    └── card-people.png     # "The people are already here"
```

Images are your Figma exports. To refresh any of them, re-export from Figma and overwrite the
file with the same name — the pages pick it up automatically.

## Deploy to GitHub Pages

A git repo is already initialized here (branch `main`). To publish:

1. Create an empty repo named **superhyre** on github.com (no README).
2. From this folder:
   ```bash
   cd ~/Desktop/superhyre
   git remote add origin https://github.com/<your-username>/superhyre.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)` → Save.**

Live at `https://<your-username>.github.io/superhyre/` in about a minute.
The final `git push` needs your GitHub login, so run it yourself.
