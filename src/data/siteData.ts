// ============================================
// SITE CONFIGURATION
// Edit this file to update your portfolio!
// ============================================

// === PERSONAL INFO ===
export const siteConfig = {
    name: "Clark Peng",
    title: "CS @ UCLA | AI Engineer @ camfer (YC S24) | ML Researcher",
    bio: "CS @ UCLA",
    location: "San Jose, CA",
    email: "cipeng@ucla.edu",
    employer: "camfer (YC S24)",
    employerUrl: "https://camfer.dev",
    avatarUrl: "/images/profile_img1.jpg", // Add your profile image to public/images/
};

// === SOCIAL LINKS ===
export const socialLinks = [
    {
        type: 'github',
        label: 'Github',
        href: 'https://github.com/clarkipeng',
        username: 'clarkipeng'
    },
    {
        type: 'scholar',
        label: 'Google Scholar',
        href: 'https://scholar.google.com/citations?user=H2pCsDkAAAAJ&hl=en',
    },
    {
        type: 'itch',
        label: 'Itchio',
        href: 'https://werus23.itch.io',
        username: 'werus23'
    },
    {
        type: 'kaggle',
        label: 'Kaggle',
        href: 'https://kaggle.com/werus23',
        username: 'werus23'
    },
    {
        type: 'linkedin',
        label: 'LinkedIn',
        href: 'https://www.linkedin.com/in/clarkpeng',
        username: 'clarkipeng'
    },
];

// === NAVIGATION ===
export const navigation = [
    { label: 'Home', href: '/' },
    { label: 'Portfolio', href: '/portfolio' },
    { label: 'CV', href: '/cv' },
    { label: 'Publications', href: '/publications' },
];

// === ABOUT / BIO TEXT ===
export const aboutText = `Hello! I'm Clark, a Computer Science student at UCLA. I am passionate about AI, specifically about creating novel architectures and algos.

Currently, I'm an intern at Camfer, where I am helping build the world's first text-to-CAD foundation model. As a generalist on a small team, my work spans the entire stack—from product engineering to the core challenges of model training and evaluation.

This role builds on my background in research, where I focused on controlling and understanding generative models. At the UCLA NLP Group, I benchmarked physical commonsense in video generation, and at the HMC Music Retrieval Lab, I explored steering music models using techniques like DPO and self-distillation.

On campus, I lead the competitive ML team as an ACM AI Projects Officer, where we tackle Kaggle competitions and build projects together. Outside of AI, I also enjoy creating games!`;

// === PORTFOLIO PROJECTS ===
export const portfolioProjects = [
    {
        id: 1,
        title: "4D Fruit Merging Game",
        description: "Interactive 4D fruit merging game with custom graphics engine built from scratch using OpenGL and C++.",
        image: "/images/gameImage.png",
        tags: ["OpenGL", "C++", "Game Dev"],
        year: "2025",
        links: [
            { label: "Repository", href: "https://github.com/clarkipeng/4dsuika" },
            { label: "Itch.io", href: "https://werus23.itch.io/4d-suika" },
        ],
        videoEmbed: "https://www.youtube.com/embed/5Bj0ZGDzans",
    },
    {
        id: 2,
        title: "VideoPhy-2",
        description: "Benchmark for evaluating physical commonsense in AI-generated videos with UCLA NLP and Google Research.",
        image: "/images/videophy2_long.png",
        tags: ["Research", "AI", "Video Gen"],
        year: "2025",
        links: [
            { label: "Repository", href: "https://github.com/Hritikbansal/videophy" },
            { label: "Paper", href: "https://arxiv.org/abs/2503.07248" },
            { label: "Project Website", href: "https://videophy2.github.io/" },
        ],
    },
    {
        id: 3,
        title: "Arm Agent RL Project",
        description: "Robotic hand trained with PPO reinforcement learning to grasp objects. Built with Unity MLAgents and Blender.",
        image: "/images/RLHandTarget.png",
        tags: ["RL", "Unity", "MLAgents"],
        year: "2024",
        links: [
            { label: "Repository", href: "https://github.com/clarkipeng/RLHandTargetProject" },
        ],
        videoEmbed: "https://www.youtube.com/embed/_yNpbxOqKTU?list=PLvzAuMPAVywO6-RWFGfXoudk62ZEKDIuk",
    },
    {
        id: 4,
        title: "Event Detection via PDF Regression",
        description: "Novel regression approach for time series event detection using probability density functions.",
        image: "/images/PDFR.gif",
        tags: ["Research", "ML", "Time Series"],
        year: "2024",
        links: [
            { label: "Repository", href: "https://github.com/clarkipeng/EventDetectionPDF" },
            { label: "Paper", href: "/files/EDPDFR.pdf" },
        ],
    },
    {
        id: 5,
        title: "Optimized Raytracer from Scratch",
        description: "Optimized raytracing renderer with reflections, refractions, and global illumination. Built in C++.",
        image: "/images/raytracer.jpeg",
        tags: ["C++", "Graphics", "Raytracing"],
        year: "2022",
        links: [
            { label: "Repository", href: "https://github.com/clarkipeng/RayTraceModel" },
        ],
    },
];

// === PUBLICATIONS ===
export const publications = [
    {
        id: 1,
        title: "VideoPhy-2: A Challenging Action-Centric Physical Commonsense Evaluation in Video Generation",
        authors: "Hritik Bansal, Clark Peng, Yonatan Bitton, et al.",
        venue: "Preprint",
        date: "2025-03-11",
        category: "preprints",
        paperUrl: "https://arxiv.org/abs/2503.06800",
        abstract: "Large-scale video generative models, capable of creating realistic videos of diverse visual concepts, are strong candidates for general-purpose physical world simulators. However, their adherence to physical commonsense across real-world actions remains unclear. We introduce VideoPhy-2, an action-centric dataset for evaluating physical commonsense in generated videos.",
    },
    {
        id: 2,
        title: "Event Detection via Probability Density Function Regression",
        authors: "Clark Peng, Toros Dinçer",
        venue: "ArXiv",
        date: "2024-08-23",
        category: "preprints",
        paperUrl: "https://arxiv.org/pdf/2408.12792",
        abstract: "A novel regression-based approach for predicting probability densities at event locations in time series, offering an alternative to traditional segmentation methods. Our approach outperforms traditional segmentation techniques across various state-of-the-art networks and datasets.",
    },
];

// === CV / EXPERIENCE ===
export const experience = [
    {
        id: 1,
        role: "AI Engineer Intern",
        company: "Camfer",
        companyUrl: "https://camfer.dev",
        location: "Remote",
        period: "2024 - Present",
        description: "Helping build the world's first text-to-CAD foundation model. Work spans product engineering to model training and evaluation.",
        tags: ["AI", "CAD", "Full Stack"],
    },
    {
        id: 2,
        role: "Undergraduate Researcher",
        company: "UCLA NLP Group",
        companyUrl: "https://web.cs.ucla.edu/~kwchang/members/",
        location: "Los Angeles, CA",
        period: "2024 - 2025",
        description: "Benchmarked physical commonsense in video generation, collaborating with Google Research.",
        tags: ["NLP", "Video Generation", "Research"],
    },
    {
        id: 3,
        role: "Research Assistant",
        company: "HMC Music Retrieval Lab",
        companyUrl: "https://sites.google.com/g.hmc.edu/hmc-mir",
        location: "Claremont, CA",
        period: "2024",
        description: "Explored steering music models using techniques like DPO and self-distillation.",
        tags: ["Music AI", "DPO", "LLMs"],
    },
];

export const education = [
    {
        id: 1,
        school: "University of California, Los Angeles (UCLA)",
        degree: "B.S. Computer Science",
        period: "2024 - 2028 (Expected)",
        description: "ACM AI Projects Officer - Leading competitive ML team for Kaggle competitions.",
    },
];

export const skills = {
    languages: ["Python", "C++", "TypeScript", "JavaScript", "C#"],
    frameworks: ["PyTorch", "React", "Next.js", "Unity", "OpenGL"],
    tools: ["Git", "Docker", "Linux", "Blender"],
    areas: ["Machine Learning", "Computer Vision", "NLP", "Game Development", "Graphics"],
};
