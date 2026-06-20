export const siteConfig = {
  name: 'Clark Peng',
  wordmark: 'CLARK PENG',
  title: 'CTO at Origami, CS at UCLA, building tools for AI researchers.',
  bio: 'I work on ML systems, generative model evaluation, cloud GPU orchestration, and small graphics/game experiments.',
  location: 'Los Angeles, CA / San Jose, CA',
  email: 'cipeng@ucla.edu',
  website: 'https://clarkipeng.github.io',
  resumeUrl: '/files/ClarkPengResume.pdf',
  avatarUrl: '/images/profile_img1.jpg',
};

export const socialLinks = [
  {
    type: 'github',
    label: 'GitHub',
    href: 'https://github.com/clarkipeng',
    username: 'clarkipeng',
  },
  {
    type: 'linkedin',
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/in/clarkpeng',
    username: 'clarkpeng',
  },
  {
    type: 'scholar',
    label: 'Scholar',
    href: 'https://scholar.google.com/citations?user=H2pCsDkAAAAJ&hl=en',
  },
  {
    type: 'kaggle',
    label: 'Kaggle',
    href: 'https://kaggle.com/werus23',
    username: 'werus23',
  },
  {
    type: 'itch',
    label: 'Itch.io',
    href: 'https://werus23.itch.io',
    username: 'werus23',
  },
];

export const navigation = [
  { label: 'Home', href: '/' },
  { label: 'Gadgets', href: '/portfolio' },
  { label: 'Papers', href: '/publications' },
  { label: 'CV', href: '/cv' },
];

export const aboutParagraphs = [
  'I am the CTO of Origami, a YC S26 startup building infrastructure for AI researchers: cloud GPU training, experiment tracking, observability, artifact storage, and run lifecycle management across providers.',
  'Before Origami, I worked at Camfer on text-to-CAD foundation models, spanning 8-H100 training, synthetic data pipelines over 800K CAD parts, asynchronous rollout systems, and CAD replay infrastructure.',
  'My research centers on understanding and controlling generative models. At UCLA NLP, I co-authored VideoPhy-2, an ICLR 2026 benchmark for physical commonsense in video generation, and contributed to DialectGen for dialect robustness in multimodal generation.',
  'Outside of research and infrastructure work, I lead ACM AI at UCLA, have competed on Kaggle, and build graphics and simulation projects.',
];

export const highlights = [
  {
    label: 'Origami',
    text: 'Cloud GPU orchestration, experiment tracking, and research workflow management.',
  },
  {
    label: 'Research',
    text: 'VideoPhy-2 at ICLR 2026, DialectGen at ResponsibleFM @ NeurIPS 2025, and event-boundary detection work.',
  },
  {
    label: 'Gadgets',
    text: '4D games, raytracers, small simulations, and the hidden Smoke page.',
  },
];

export const portfolioProjects = [
  {
    id: 1,
    title: '3D Slime Simulation',
    description: 'A GPU-accelerated Unity slime simulation with 1M agents running at 120 FPS.',
    images: ['/images/Slime3D_Shot.png', '/images/Slime3D_Shot1.png', '/images/Slime3D_Shot2.png'],
    tags: ['Simulation', 'GPU', 'Unity'],
    year: '2025',
    featured: true,
    links: [
      { label: 'Repository', href: 'https://github.com/clarkipeng/SlimeSim3D/' },
      { label: 'Video', href: 'https://youtu.be/nurGFZYDcag' },
    ],
  },
  {
    id: 2,
    title: '4D Fruit Merging Game',
    description: 'A custom OpenGL/C++ engine for a playable 4D fruit merging game, with BVHs, Verlet sphere physics, and a custom 4D shader.',
    images: ['/images/gameImage.png'],
    tags: ['OpenGL', 'C++', 'Game'],
    year: '2025',
    featured: true,
    links: [
      { label: 'Repository', href: 'https://github.com/clarkipeng/4dsuika' },
      { label: 'Itch.io', href: 'https://werus23.itch.io/4d-suika' },
    ],
  },
  {
    id: 3,
    title: 'VideoPhy-2',
    description: 'An action-centric benchmark for evaluating physical commonsense in generated videos.',
    images: ['/images/videophy2_hero.png'],
    tags: ['Research', 'Video Generation', 'Evaluation'],
    year: '2026',
    featured: true,
    links: [
      { label: 'Project', href: 'https://videophy2.github.io/' },
      { label: 'Paper', href: 'https://openreview.net/forum?id=HA8KSQW7SO' },
      { label: 'Code', href: 'https://github.com/Hritikbansal/videophy' },
    ],
  },
  {
    id: 4,
    title: 'Event Detection via PDF Regression',
    description: 'A probability-density regression approach for finding event boundaries in time series.',
    images: ['/images/PDFR.gif'],
    tags: ['Research', 'Time Series', 'ML'],
    year: '2024',
    links: [
      { label: 'Repository', href: 'https://github.com/clarkipeng/EventDetectionPDF' },
      { label: 'Paper', href: 'https://arxiv.org/abs/2408.12792' },
    ],
  },
  {
    id: 5,
    title: 'RL Arm Targeting Agent',
    description: 'A Unity ML-Agents arm trained to grasp objects and throw them at targets.',
    images: ['/images/RLHandTarget.png'],
    tags: ['RL', 'Unity', 'ML-Agents'],
    year: '2022',
    links: [
      { label: 'Repository', href: 'https://github.com/clarkipeng/RLHandTargetProject' },
    ],
  },
  {
    id: 6,
    title: 'Raytracer from Scratch',
    description: 'C++ raytracing experiments spanning image rendering and audio propagation, including runs at 660k rays/min.',
    images: ['/images/raytracer.jpeg'],
    tags: ['C++', 'Graphics', 'Raytracing'],
    year: '2022',
    links: [
      { label: 'Repository', href: 'https://github.com/clarkipeng/RayTraceModel' },
    ],
  },
];

export const publications = [
  {
    id: 1,
    title: 'VideoPhy-2: A Challenging Action-Centric Physical Commonsense Evaluation in Video Generation',
    authors: 'Hritik Bansal, Clark Peng, Yonatan Bitton, Roman Goldenberg, Aditya Grover, Kai-Wei Chang',
    venue: 'ICLR 2026; Best Paper at ICML 2025 WorldModel Workshop',
    date: '2026-04-26',
    paperUrl: 'https://openreview.net/forum?id=HA8KSQW7SO',
    links: [
      { label: 'OpenReview', href: 'https://openreview.net/forum?id=HA8KSQW7SO' },
      { label: 'Project', href: 'https://videophy2.github.io/' },
    ],
    abstract: 'Action-centric evaluation for physical commonsense in text-to-video generation, with human evaluation and an automatic evaluator for model comparison.',
  },
  {
    id: 2,
    title: 'DialectGen: Benchmarking and Improving Dialect Robustness in Multimodal Generation',
    authors: 'Yu Zhou, Sohyun An, Haikang Deng, Da Yin, Clark Peng, Cho-Jui Hsieh, Kai-Wei Chang, Nanyun Peng',
    venue: 'ResponsibleFM @ NeurIPS 2025',
    date: '2025-10-16',
    paperUrl: 'https://arxiv.org/abs/2510.14949',
    links: [
      { label: 'arXiv', href: 'https://arxiv.org/abs/2510.14949' },
      { label: 'OpenReview', href: 'https://openreview.net/forum?id=RxsImkHOYj' },
    ],
    abstract: 'A benchmark and mitigation study for dialect robustness in image and video generation across common English dialects.',
  },
  {
    id: 3,
    title: 'Event Detection via Probability Density Function Regression',
    authors: 'Clark Peng, Tolga Dincer',
    venue: 'arXiv 2024',
    date: '2024-08-23',
    paperUrl: 'https://arxiv.org/abs/2408.12792',
    links: [
      { label: 'arXiv', href: 'https://arxiv.org/abs/2408.12792' },
      { label: 'PDF', href: '/files/EDPDFR.pdf' },
    ],
    abstract: 'A regression-based formulation for time-interval event detection that predicts boundary densities instead of per-timestep class labels.',
  },
];

export const experience = [
  {
    id: 1,
    role: 'CTO',
    company: 'Origami (YC S26)',
    companyUrl: 'https://origamiresearch.co',
    location: 'San Francisco, CA',
    period: '2026 - Present',
    description: 'Leading architecture and development for AI research infrastructure: GPU training, experiment tracking, observability, artifact storage, AWS ECS-backed services, and GPU launches across Lambda Cloud, AWS EC2, CoreWeave, and Azure.',
    tags: ['AI Infrastructure', 'Cloud GPUs', 'Reliability'],
  },
  {
    id: 2,
    role: 'Software Engineering Intern',
    company: 'Camfer (YC S24)',
    companyUrl: 'https://camfer.dev',
    location: 'San Francisco, CA',
    period: 'Aug 2025 - Dec 2025',
    description: 'Worked on text-to-CAD foundation models across 8B and 30B Qwen2.5-VL and Qwen3-VL training on 8 H100 GPUs, 600M+ synthetic tokens from 800K CAD parts, 100x faster preprocessing and tokenization, asynchronous EC2 rollouts, and SolidWorks/Onshape CAD replay systems.',
    tags: ['Multimodal ML', 'CAD', 'Infrastructure'],
  },
  {
    id: 3,
    role: 'Student Researcher',
    company: 'UCLA NLP Group',
    companyUrl: 'https://web.cs.ucla.edu/~kwchang/members/',
    location: 'Los Angeles, CA',
    period: 'Oct 2024 - Present',
    description: 'Co-authored benchmarks for multimodal generative models and optimized 30B MoE (3B active) routing-alignment training with packed teacher and student batches, reducing runtime and memory usage while achieving a 2x speedup.',
    tags: ['MoE Training', 'FlashAttention', 'Evaluation'],
  },
  {
    id: 4,
    role: 'Technical Intern',
    company: 'Scale AI',
    location: 'Los Angeles, CA',
    period: 'Nov 2024 - Aug 2025',
    description: 'Built 10+ deterministic Docker test environments for open-source Python repositories used in RLVR rubrics and autonomous coding-agent evaluation; authored 100+ expert solutions to problems rated 2000+.',
    tags: ['LLM Data', 'Competitive Programming', 'Docker'],
  },
  {
    id: 5,
    role: 'Research Intern',
    company: 'HMC Music Retrieval Lab',
    companyUrl: 'https://sites.google.com/g.hmc.edu/hmc-mir',
    location: 'Claremont, CA',
    period: 'Jun 2025 - Aug 2025',
    description: 'Explored music model steering with DPO, prompt distillation, self-distillation, A/B testing, and activation analysis.',
    tags: ['Music AI', 'DPO', 'Mechanistic Interpretability'],
  },
];

export const education = [
  {
    id: 1,
    school: 'University of California, Los Angeles',
    degree: 'B.S. Computer Science',
    period: '2024 - 2027',
    description: 'GPA 4.0. President of ACM AI and former Projects Officer leading competitive ML and technical projects.',
  },
];

export const leadership = [
  {
    id: 1,
    title: 'UCLA ACM AI',
    role: 'President',
    period: 'Nov 2025 - Present',
    description: 'Leading UCLA ACM AI, an 800+ member organization with 30 student leaders across research projects, hackathons, and cross-committee collaborations.',
  },
  {
    id: 2,
    title: 'Kaggle Competitions',
    role: 'Top 1% Competitor, Top 100 Notebooks',
    period: '2023 - 2025',
    description: 'Published gold-medal notebooks and event-boundary detection methods adopted by top competition participants.',
  },
  {
    id: 3,
    title: 'ICPC',
    role: 'SoCal Regional Top 10',
    period: 'Nov 2024',
    description: 'ICPC Southern California Regional Top 10 and USACO Platinum; focus areas include DP, geometry, graph theory, and game theory.',
  },
];

export const skills = {
  languages: ['Python', 'C++17/20', 'SQL', 'Bash', 'TypeScript', 'Mojo', 'C#'],
  systems: ['Linux', 'GDB', 'CMake', 'C++ STL', 'C++ concurrency', 'threads/mutexes', 'Docker', 'PostgreSQL'],
  mlSystems: ['PyTorch', 'JAX', 'FSDP', 'FlashAttention', 'vLLM', 'SGLang', 'MoE Training', 'GPU programming (CUDA/Mojo)'],
  infrastructure: ['AWS ECS', 'AWS EC2', 'Lambda Cloud', 'CoreWeave', 'Azure'],
  data: ['NumPy', 'pandas', 'SciPy'],
  creative: ['Unity', 'OpenGL', 'Blender', 'Physics Integrators', '4D Shaders', 'Emergent Simulation'],
};
