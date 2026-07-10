export const siteConfig = {
  name: 'Clark Peng',
  wordmark: 'CLARK PENG',
  title: 'CTO at Catapult Games, CS at UCLA.',
  bio: 'I like building systems, games, and model-evaluation projects.',
  location: 'Los Angeles, CA / San Jose, CA',
  email: 'cipeng@ucla.edu',
  website: 'https://clarkipeng.github.io',
  resumeUrl: '/files/ClarkPengResume.pdf',
  avatarUrl: '/images/clark-peng-profile.jpg',
};

export const socialLinks = [
  {
    type: 'x',
    label: 'X',
    href: 'https://x.com/clarkipeng',
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
    type: 'github',
    label: 'GitHub',
    href: 'https://github.com/clarkipeng',
    username: 'clarkipeng',
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
  { label: 'Resume', href: '/resume' },
];

export const aboutParagraphs = [
  'I am the CTO of Catapult Games and study CS at UCLA.',
  'Before Catapult Games, I worked at Camfer on text-to-CAD models, LLM post-training and mid-training, and CAD tools.',
  'My research is about understanding generative models. I have worked on VideoPhy-2 for video generation evaluation and DialectGen for dialect robustness.',
  'Outside of that, I lead ACM AI at UCLA, compete on Kaggle, and build graphics and simulation projects.',
];

export const highlights = [
  {
    label: 'Catapult Games',
    text: 'Building the product and systems behind Catapult Games.',
  },
  {
    label: 'Research',
    text: 'Work on how models see, generate, and reason about the world.',
  },
  {
    label: 'Gadgets',
    text: 'Games, renderers, simulations, and a hidden Smoke page.',
  },
];

export const portfolioProjects = [
  {
    id: 1,
    title: '3D Slime Simulation',
    description: 'A real-time 3D slime mold simulation that grows dense, branching organic patterns.',
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
    description: 'A playable 4D puzzle game that makes impossible geometry feel tangible.',
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
    id: 4,
    title: 'Event Detection via PDF Regression',
    description: 'A smoother way to find clean event boundaries in noisy time-series data.',
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
    description: 'A small physics scene where a learned arm picks up objects and throws them at targets.',
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
    description: 'A from-scratch renderer for experimenting with light, sound, and noisy physical scenes.',
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
    abstract: 'A benchmark for whether generated videos obey everyday physical cause and effect.',
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
    abstract: 'A study of how image and video models handle English dialects, plus ways to make them fairer.',
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
    abstract: 'A way to find event boundaries by predicting where changes are most likely to happen.',
  },
];

export const experience = [
  {
    id: 1,
    role: 'CTO',
    company: 'Catapult Games (YC S26)',
    companyUrl: 'https://playcatapult.io/',
    location: 'San Francisco, CA',
    period: '2026 - Present',
    description: 'Building the product and systems behind Catapult Games.',
    tags: ['Product Engineering', 'Games', 'Systems'],
  },
  {
    id: 2,
    role: 'Software Engineering Intern',
    company: 'Camfer (YC S24)',
    companyUrl: 'https://camfer.dev',
    location: 'San Francisco, CA',
    period: 'Aug 2025 - Dec 2025',
    description: 'Worked on text-to-CAD models, LLM post-training and mid-training, and tools for replaying CAD designs.',
    tags: ['Multimodal ML', 'CAD', 'Infrastructure'],
  },
  {
    id: 3,
    role: 'Student Researcher',
    company: 'UCLA NLP Group',
    companyUrl: 'https://web.cs.ucla.edu/~kwchang/members/',
    location: 'Los Angeles, CA',
    period: 'Oct 2024 - Present',
    description: 'Worked on benchmarks that ask whether generative models understand what they create.',
    tags: ['MoE Training', 'FlashAttention', 'Evaluation'],
  },
  {
    id: 4,
    role: 'Technical Intern',
    company: 'Scale AI',
    location: 'Los Angeles, CA',
    period: 'Nov 2024 - Aug 2025',
    description: 'Built reliable test environments and expert solutions for evaluating coding agents.',
    tags: ['LLM Data', 'Competitive Programming', 'Docker'],
  },
  {
    id: 5,
    role: 'Research Intern',
    company: 'HMC Music Retrieval Lab',
    companyUrl: 'https://sites.google.com/g.hmc.edu/hmc-mir',
    location: 'Claremont, CA',
    period: 'Jun 2025 - Aug 2025',
    description: 'Explored ways to steer music models and compare generations.',
    tags: ['Music AI', 'DPO', 'Mechanistic Interpretability'],
  },
];

export const education = [
  {
    id: 1,
    school: 'University of California, Los Angeles',
    degree: 'B.S. Computer Science',
    period: '2024 - 2028',
    description: 'CS at UCLA. I lead ACM AI and spend a lot of time around research and technical projects.',
  },
];

export const leadership = [
  {
    id: 1,
    title: 'UCLA ACM AI',
    role: 'President',
    period: 'Nov 2025 - Present',
    description: 'Running UCLA\'s AI community across projects, events, and student-led research.',
  },
  {
    id: 2,
    title: 'Kaggle Competitions',
    role: 'Top 1% Competitor, Top 100 Notebooks',
    period: '2023 - 2025',
    description: 'Published notebooks and methods that other competitors used.',
  },
  {
    id: 3,
    title: 'ICPC',
    role: 'SoCal Regional Top 10',
    period: 'Nov 2024',
    description: 'Competed in ICPC and USACO with a focus on algorithms and problem solving.',
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
