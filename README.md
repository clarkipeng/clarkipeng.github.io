# Clark Peng - Portfolio

This is my personal portfolio website built with **React**, **TypeScript**, **Tailwind CSS**, and **Vite**.

## Only 2 Steps to Run Locally

You can run this project on your local machine with just two commands:

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to view it in the browser.

## Deployment

This site is set up to deploy via **GitHub Actions** to GitHub Pages.
Pushing to the `main` branch will trigger the build and deployment workflow defined in `.github/workflows/deploy-portfolio.yml`.

Ensure your repository Settings > Pages > Source is set to **GitHub Actions**.

## Project Structure

- `src/` - Source code
  - `components/` - Reusable UI components (Sidebar, Headers, etc.)
  - `pages/` - Page layouts (Home, Portfolio, CV, Publications)
  - `data/` - Configuration files
    - `siteData.ts` - **Edit this file to update content!** (Bio, Projects, Links)
    - `theme.ts` - Design system and colors
- `public/` - Static assets (images, PDFs)
