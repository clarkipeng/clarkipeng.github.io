# AGENTS.md

Taste, verified facts, and workflow rules for Clark's personal site and resume. Apply these to every edit.

## Voice

- Short and sweet. Results first, implementation details second. This is not a resume; never use buzzword stuffing (agent counts, GPU models, "H100").
- No redundancy: if info is already visible elsewhere on the page, do not repeat it.
- No self-evaluation ("strong research footprint", "novel", "award-winning"). Let facts establish it. Prefer plain verbs: built, developed, ran - not discovered.
- Company is "Catapult", not "Catapult Games", except where the full name is already established.
- Numbers need denominators and context or they get cut (e.g., "10x throughput" only with like-for-like framing). Phrase them in plain words, never consulting-speak ("like-for-like workload", "end-to-end throughput", "gameplay evidence").
- Never cite code volume: no LOC, file, package, or test counts ("10,000+ line replay layer" is out; describe what it does instead).
- Write like a human, not a spec sheet. Drop parenthetical jargon piles and model-size asides ("30B MoE (3B active)", "(ICLR 2026; Best Paper, ICML 2025 World Models Workshop)"). State the thing in plain words; venues and awards go in their own clause. Name models by their real shorthand ("Qwen3.5-VL-30B") the way researchers actually say them - never spell out "30B-parameter mixture-of-experts language model".
- Every factual claim must survive an interviewer probing it. If a claim invites verification that would embarrass (aggregate citations from 1000+ author papers, "validated when Meta published the same thing"), delete it.
- Never invent or infer facts. If the source material does not state something, ask Clark instead of guessing. Mixing details between projects (e.g., attaching Harvey Mudd's batch packing to UCLA NLP) is the worst failure mode.
- Check local repos and existing records before asking Clark for technical details. A dependency establishes the project stack, not personal proficiency in every library.
- Facts live in this file. When Clark corrects a fact, update the Verified facts section immediately so no future edit repeats the mistake.
- No redundancy at any scale: not just page-level ("already in my header, don't repeat it") but line-level - headings already carry context ("UCLA ACM AI" heading means the bullet says "Run ACM AI's...", not "Run UCLA ACM AI's...").
- Jargon piles are out even when accurate. "with BVHs, Verlet sphere physics, and a custom shader" is bloat; name what it is and what it did, not its ingredient list.
- Skills listed on a resume are interview promises: only list tools Clark has actually used enough to defend (Mojo/JAX/vLLM-style keyword padding is a liability).
- Do not dress responsibilities as accomplishments, and do not invent outcomes ("managed 30 students", downstream metrics that were never measured). If there is no result, state the activity plainly.
- One accomplishment per slot; supporting honors compress into headings or footers.
- Before finishing any writing pass, reread every line asking "would a human write this?" - if it reads like an LLM produced it (parallel clause stacking, qualifier stacks, "reproducible auditable X"), rewrite shorter.

## Verified facts

- Co-founder and former CTO of Catapult (Y Combinator S26), https://playcatapult.io. Clark returned to UCLA in fall 2026 but is still technically working on Catapult (stated 2026-11-14), so "Co-founder & CTO, Jun 2026 - Present" is accurate on resumes.
- Catapult pivoted from multiplayer games (the first part) to Music Arena (https://musicarena.io), where AI models produce music in FL Studio and people vote. Clark built the first version (producer-arena), the FL Studio plugin/MCP engine, and flpkit (on PyPI); Alan Song wrote most of the current musicarena.io app - do not claim it.
- Catapult benchmark: 19 frontier LLMs from 7 labs, ~1K agent games, 257M tokens of reproducible gameplay data; Clark started June 2026
- Catapult multiplayer platform: 30 games; idempotent moves for safe retries and reconnection. Clark started and wrote most of the core packages (room runtime, Cloudflare Durable Objects hosting, Postgres hosting, game test harness) and built the CI pipeline himself (runs only the checks a change affects: sharded unit, Postgres, per-game simulation, Playwright browser tests) plus the reviewed squash-merge flow. No production usage numbers available locally; musicarena.io votes (250) and flpkit downloads are not resume-worthy.
- Catapult platform stack: TypeScript, React, Bun/Node.js, PostgreSQL, Cloudflare Workers/Durable Objects. Verified from local `catapult-games` manifests and `docs/ARCHITECTURE.md`. The current platform focuses on human multiplayer games; model research lives separately in `catapult-research`. Present the benchmark as past work, not the current product definition.
- UCLA CS B.S., expected June 2028, GPA 3.95/4.00 (per transcript, 2026-11-14)
- Work authorization: U.S. citizen (per the July 2026 YC application).
- Camfer (YC S24) intern: goal was getting information into the model via mid-training and post-training of Qwen2.5-VL / Qwen3-VL for instruction following; the 10x training throughput came from multimodal sequence packing and data preparation, with further real gains from kernel swaps (FlashAttention-3, Triton), quantization, and FSDP tuning; 600M+ synthetic tokens from 800K CAD parts (60% pre-training, 100% SFT); adding Onshape support doubled the addressable user base; async EC2 rollouts; SolidWorks/Onshape replay layer
- VideoPhy-2: ICLR 2026, Best Paper at ICML 2025 World Models Workshop; Clark is co-first author (equal contribution with Hritik Bansal and Yonatan Bitton, per the ICLR talk slides); benchmark of ~3,940 prompts across 197 physical actions; Clark personally built the data-generation pipeline (expanded it 6x) and automated evaluator; he generated all 6,800 videos (open models via cloned, quantized, Ray-parallelized repos with Ring/Ulysses sequence parallelism; Sora and Ray2 by hand), ran VLM captioning, and trained VideoPhy-2-AutoEval (paper: outperforms Gemini-2.0-Flash-Exp; 81%/236% relative correlation gains); 7 models evaluated (5 open, 2 closed); paper-specific citations OK to cite: 175 per Semantic Scholar (Nov 2026), unlike Clark's total
- Kaggle: Top 1% competitor, top-100 notebooks, 5+ gold notebooks with 20k+ forks; probability-density regression framework adopted by nearly all top-scoring solutions in the CMI competition (Child Mind Institute, sleep detection, 1,877 teams); Silver Medal; first-author paper
- ICPC SoCal Regional Top 10, USACO Platinum, USAPhO Silver
- ACM AI at UCLA: Co-President; 800+ members, 40 officers, events with thousands of participants, secured club sponsors (do not claim "largest AI organization")
- UCLA NLP: all three are separate projects under the same advisor, each led by a different PhD student: (1) routing-alignment training across many MoE models (small and large, including Phi, Granite, Qwen3.5-VL-30B) - interventions for robustness to new languages with better sample efficiency; Clark packed teacher and student batches here; now a paper, "Cross-Lingual Alignment for Decoder-Only Models using MoE Routers" (Lucas Bandarkar, Clark Peng, ..., Nanyun Peng; Clark is second author); the batch packing made training 2.1x faster on the same GPU (measured; Clark confirmed 2026-11-14) and the team adopted it as default; (2) DialectGen (dialect robustness in image and video generation; ResponsibleFM workshop, NeurIPS 2025); (3) VideoPhy-2. Harvey Mudd's packing is a separate, different technique - do not merge details between them.
- Harvey Mudd Music Retrieval Lab: MusicGen steering research across 1M+ audio datapoints. Clark proposed self-distillation and DPO adaptations for mechanistic steering - novel at the time, not just benchmarking existing methods. Both HMC and UCLA NLP routing work involved packing, but they are different techniques on different projects - never merge their details or numbers.- Scale AI intern (Nov 2024 - Aug 2025): authored 100+ expert competitive-programming solutions used as training data for LLMs at frontier labs (not coding-only); later designed judges and rubrics for RL evaluation of coding agents; built deterministic Docker environments; small contribution to Humanity's Last Exam
- Graphics projects: C++/OpenGL 4D game engine with BVHs, Verlet physics, custom shaders; GPU slime simulation with 1M agents at 120 FPS; C++ raytracers for image and audio propagation
- Codeforces: werus23, Expert, max 1720 (as of June 2026)
- Camfer internship dates: Aug - Dec 2025.
- Skills section: Clark chooses to list Mojo, vLLM/SGLang, CUDA/Mojo, C#, and Azure (decided 2026-11-14); keep them.
- Was about to join Modular before Catapult; wrote practice GPU kernels in Mojo/CUDA (familiarity signal only)
- X handle: clarkipeng (x.com/clarkipeng may 404 externally; keep as-is)

### Do not claim

- Total citation counts (inflated by Humanity's Last Exam co-authorship)
- "Largest AI organization" for ACM AI - say Co-President without size claims unless re-verified
- Meta/priority comparisons to justify originality
- SAT score, valedictorian, test-file/package/LOC counts
- Production handwritten CUDA kernels (Mojo/CUDA practice kernels are a familiarity signal only)
- Name-drops without formal prizes (e.g., Riot recognition)
- Frame Catapult as tooling for AI researchers

## Site

- Minimal, inspired by https://thinkingmachines.ai; standardized on Space Grotesk.
- Hero shows only Catapult; socials are icon-only in the footer.
- Theme transition: WebGPU slime-agent diffusion shader (agents steer toward target color, monotonic scalar field, toroidal wrapping), WebGL fallback; theme icon sits mid-right, borderless.
- Smoke nav link is white/transparent and non-clickable in light mode; visible only once the shader field reaches it in dark mode.
- Resume page (`/resume`) embeds only the PDF from `siteConfig.resumeUrl`, no text.

## Visual quality bar

- Smoothness over cleverness. Choppy trails, flicker, dark bars, mistimed transitions, cursor-aligned artifacts = broken; fix or revert.
- One invariant per behavior when possible (e.g., Smoke appears iff its local area is sufficiently dark). Hysteresis over threshold-flicker logic.
- The shader field is monotonic toward the target color; text/background derive from the same scalar field.
- React owns theme state sparsely; the shader owns continuous simulation state. Shader-driven UI elements emit low-frequency events; they must never restart the simulation.
- Pixel-perfect check desktop + mobile, light + dark, before finishing.

## Engineering workflow

- Benchmark every optimization against the committed baseline; revert anything slower even if architecturally nicer. Record results in a table.
- Commit one improvement per commit; prefer negative diffs; keep code minimal.
- Experiments live on `experiment/*` branches off main; archive old main before major swaps.
- Do not push or commit to main without explicit approval.
- Failed experiments get reverted cleanly, not layered over.
- Build (`npm run build`) and lint (`npm run lint`) must pass; known baseline: two pre-existing Smoke.tsx hook warnings.
