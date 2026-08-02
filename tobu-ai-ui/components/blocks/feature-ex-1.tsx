"use client";

import { motion, Variants } from "framer-motion";

const containerVariants: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.1 } },
};

const cardVariants: Variants = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};

/* ══════════════════════════════════════════
   SVG ILLUSTRATIONS — Black & White only
   Light mode is the existing black-on-white.
   Dark mode inverts: white-on-near-black.
   Using currentColor + CSS variables keeps
   SVGs in sync with the theme tokens below.
══════════════════════════════════════════ */

const STROKE_LIGHT = "#000000";
const STROKE_MUTED_LIGHT = "#888888";
const FILL_LIGHT = "#ffffff";
const FILL_SOFT_LIGHT = "#e8e8e8";
const FILL_SOFT2_LIGHT = "#f0f0f0";
const FILL_BAR_LIGHT = "#e0e0e0";
const FILL_DOT_LIGHT = "#000000";

const STROKE_DARK = "#e5e5e5";
const STROKE_MUTED_DARK = "#525252";
const FILL_DARK = "#0a0a0a";
const FILL_SOFT_DARK = "#1f1f1f";
const FILL_SOFT2_DARK = "#171717";
const FILL_BAR_DARK = "#2a2a2a";
const FILL_DOT_DARK = "#e5e5e5";

function AiSvg() {
    return (
        <svg viewBox="0 0 240 170" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <polygon points="120,18 210,72 120,126 30,72" className="fill-[var(--svg-fill)] stroke-[var(--svg-stroke)]" strokeWidth="1.4"/>
            <polygon points="120,30 200,76 120,112 40,76" className="fill-[var(--svg-soft)] stroke-[var(--svg-stroke-muted)]" strokeWidth="1"/>
            <rect x="76" y="44" width="88" height="70" rx="14" className="fill-[var(--svg-fill)] stroke-[var(--svg-stroke)]" strokeWidth="1.6"/>
            <rect x="88" y="56" width="64" height="46" rx="9" className="fill-[var(--svg-soft2)] stroke-[var(--svg-stroke-muted)]" strokeWidth="1.2"/>
            <circle cx="105" cy="73" r="6" className="fill-[var(--svg-stroke)]" opacity=".15"/>
            <circle cx="127" cy="73" r="6" className="fill-[var(--svg-stroke)]" opacity=".15"/>
            <circle cx="105" cy="73" r="2.5" className="fill-[var(--svg-stroke)]"/>
            <circle cx="127" cy="73" r="2.5" className="fill-[var(--svg-stroke)]"/>
            <path d="M100 87 Q116 95 132 87" className="stroke-[var(--svg-stroke)]" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            <line x1="120" y1="56" x2="120" y2="44" className="stroke-[var(--svg-stroke)]" strokeWidth="1.3"/>
            <circle cx="120" cy="42" r="3" className="fill-[var(--svg-stroke)]"/>
            <path d="M34 28 L37 22 L40 28 L37 34 Z" className="fill-[var(--svg-stroke)]" opacity=".2"/>
            <path d="M196 30 L199 24 L202 30 L199 36 Z" className="fill-[var(--svg-stroke)]" opacity=".2"/>
        </svg>
    );
}

function FrontEndSvg() {
    return (
        <svg viewBox="0 0 240 170" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <rect x="30" y="54" width="152" height="98" rx="12" className="fill-[var(--svg-soft)] stroke-[var(--svg-stroke-muted)]" strokeWidth="1.2" transform="rotate(-5 30 54)"/>
            <rect x="40" y="42" width="152" height="98" rx="12" className="fill-[var(--svg-soft2)] stroke-[var(--svg-stroke-muted)]" strokeWidth="1.2" transform="rotate(-1.5 40 42)"/>
            <rect x="46" y="30" width="152" height="98" rx="12" className="fill-[var(--svg-fill)] stroke-[var(--svg-stroke)]" strokeWidth="1.6"/>
            <circle cx="64" cy="46" r="3.5" className="fill-[var(--svg-stroke)]" opacity=".2"/>
            <circle cx="75" cy="46" r="3.5" className="fill-[var(--svg-stroke)]" opacity=".4"/>
            <circle cx="86" cy="46" r="3.5" className="fill-[var(--svg-stroke)]" opacity=".7"/>
            <rect x="96" y="41" width="86" height="10" rx="4" className="fill-[var(--svg-soft2)]"/>
            <rect x="62" y="60" width="118" height="7" rx="3.5" className="fill-[var(--svg-bar)]"/>
            <rect x="62" y="74" width="86" height="6" rx="3" className="fill-[var(--svg-bar)]"/>
            <rect x="62" y="86" width="104" height="6" rx="3" className="fill-[var(--svg-bar)]"/>
            <rect x="62" y="98" width="68" height="6" rx="3" className="fill-[var(--svg-bar)]"/>
            <rect x="172" y="14" width="30" height="22" rx="6" className="fill-[var(--svg-stroke)]" opacity=".08"/>
            <text x="179" y="29" fontSize="11" className="fill-[var(--svg-stroke)]" fontWeight="800" fontFamily="monospace">{"<>"}</text>
        </svg>
    );
}

function BackEndSvg() {
    return (
        <svg viewBox="0 0 240 170" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <polygon points="120,128 186,92 186,108 120,144 54,108 54,92" fill="#333"/>
            <polygon points="54,92 120,128 186,92 120,56" fill="#555"/>
            <polygon points="54,92 54,108 120,144 120,128" fill="#777"/>
            <polygon points="120,100 186,64 186,80 120,116 54,80 54,64" fill="#555"/>
            <polygon points="54,64 120,100 186,64 120,28" fill="#777"/>
            <polygon points="54,64 54,80 120,116 120,100" fill="#999"/>
            <polygon points="120,72 186,36 186,52 120,88 54,52 54,36" fill="#777"/>
            <polygon points="54,36 120,72 186,36 120,0" fill="#999"/>
            <polygon points="54,36 54,52 120,88 120,72" fill="#bbb"/>
            <line x1="54" y1="92" x2="186" y2="92" stroke="white" strokeWidth="0.8" strokeDasharray="5 4" opacity=".4"/>
            <line x1="54" y1="64" x2="186" y2="64" stroke="white" strokeWidth="0.8" strokeDasharray="5 4" opacity=".4"/>
        </svg>
    );
}

function MobileSvg() {
    return (
        <svg viewBox="0 0 240 170" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <rect x="78" y="6" width="84" height="152" rx="18" className="fill-[var(--svg-fill)] stroke-[var(--svg-stroke)]" strokeWidth="1.6"/>
            <rect x="84" y="22" width="72" height="118" rx="7" className="fill-[var(--svg-soft2)]"/>
            <rect x="104" y="10" width="32" height="8" rx="4" fill="#ccc"/>
            <circle cx="120" cy="60" r="8" className="fill-[var(--svg-stroke)]" opacity=".12"/>
            <ellipse cx="120" cy="60" rx="20" ry="7" className="stroke-[var(--svg-stroke)]" strokeWidth="1.3" fill="none"/>
            <ellipse cx="120" cy="60" rx="20" ry="7" className="stroke-[var(--svg-stroke)]" strokeWidth="1.3" fill="none" transform="rotate(60 120 60)"/>
            <ellipse cx="120" cy="60" rx="20" ry="7" className="stroke-[var(--svg-stroke)]" strokeWidth="1.3" fill="none" transform="rotate(-60 120 60)"/>
            <text x="102" y="96" fontSize="10" fontWeight="800" className="fill-[var(--svg-stroke)]" fontFamily="Inter,sans-serif">NEXT.js</text>
            <rect x="90" y="104" width="60" height="5" rx="2.5" fill="#ccc"/>
            <rect x="90" y="114" width="44" height="5" rx="2.5" fill="#ccc"/>
            <rect x="90" y="124" width="52" height="5" rx="2.5" fill="#ccc"/>
            <rect x="106" y="148" width="28" height="3" rx="1.5" fill="#ccc"/>
        </svg>
    );
}

function CtoSvg() {
    return (
        <svg viewBox="0 0 240 170" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <circle cx="110" cy="88" r="72" className="fill-[var(--svg-soft2)] stroke-[var(--svg-stroke)]" strokeWidth="1.3"/>
            <circle cx="110" cy="88" r="50" className="fill-[var(--svg-bar)] stroke-[var(--svg-stroke-muted)]" strokeWidth="1.1"/>
            <circle cx="110" cy="88" r="30" className="fill-[var(--svg-fill)] stroke-[var(--svg-stroke)]" strokeWidth="1.3"/>
            <circle cx="104" cy="80" r="7" className="fill-[var(--svg-stroke)]" opacity=".5"/>
            <path d="M86 102 Q104 94 122 102" className="stroke-[var(--svg-stroke)]" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity=".6"/>
            <circle cx="56" cy="38" r="13" className="fill-[var(--svg-fill)] stroke-[var(--svg-stroke)]" strokeWidth="1.2"/>
            <circle cx="56" cy="38" r="5.5" className="fill-[var(--svg-stroke)]" opacity=".12"/>
            <path d="M56 29v-4 M56 51v4 M47 38h-4 M69 38h4" className="stroke-[var(--svg-stroke)]" strokeWidth="1.6" strokeLinecap="round"/>
            <path d="M49.5 31.5l-2.8-2.8 M65.3 47.3l2.8 2.8 M49.5 44.5l-2.8 2.8 M65.3 30.7l2.8-2.8" className="stroke-[var(--svg-stroke)]" strokeWidth="1.2" strokeLinecap="round"/>
            <circle cx="166" cy="52" r="13" className="fill-[var(--svg-fill)] stroke-[var(--svg-stroke)]" strokeWidth="1.2"/>
            <path d="M170 43 L163 54 L167 54 L162 63 L170 51 L165 51 Z" className="fill-[var(--svg-stroke)]" opacity=".5"/>
            <rect x="142" y="126" width="86" height="22" rx="7" className="fill-[var(--svg-stroke)]" opacity=".88" transform="rotate(-14 142 126)"/>
            <text x="148" y="141" fontSize="7.5" fill="white" fontWeight="600" fontFamily="Inter,sans-serif" transform="rotate(-14 148 141)">Technical Training</text>
        </svg>
    );
}

/* ─── Features ─── */
const features = [
    {
        id: 1,
        title: "AI Chat Tutor",
        desc: "Ask questions, get clear explanations, and keep context across your whole study session.",
        Illustration: AiSvg,
    },
    {
        id: 2,
        title: "Document Study",
        desc: "Upload notes and PDFs — Tobu turns your materials into a tutor that knows your syllabus.",
        Illustration: FrontEndSvg,
    },
    {
        id: 3,
        title: "Practice Quizzes",
        desc: "Generate quizzes from your topics so you can test yourself before the real exam.",
        Illustration: BackEndSvg,
    },
    {
        id: 4,
        title: "Live Voice",
        desc: "Talk through concepts out loud when reading alone is not enough.",
        Illustration: MobileSvg,
    },
    {
        id: 5,
        title: "Topic Graphs",
        desc: "See how subjects connect and focus on the gaps that matter most.",
        Illustration: CtoSvg,
    },
];

function FeatureCard({ title, desc, Illustration }: { title: string; desc: string; Illustration: React.FC }) {
    return (
        <motion.div
            variants={cardVariants}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.2 }}
            className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm flex flex-col cursor-pointer dark:bg-neutral-950 dark:border-white/10"
        >
            <div className="w-full h-[160px] flex items-center justify-center p-4 bg-neutral-50 border-b border-neutral-200 dark:bg-neutral-900 dark:border-white/5">
                <Illustration />
            </div>
            <div className="p-5 flex flex-col gap-1.5">
                <h3 className="text-[14.5px] font-semibold text-neutral-900 tracking-tight dark:text-white">{title}</h3>
                <p className="text-[13px] text-neutral-500 leading-relaxed dark:text-neutral-400">{desc}</p>
            </div>
        </motion.div>
    );
}

export default function FeaturesSection() {
    return (
        <section
            className="w-full bg-white py-20 px-4 font-[Inter,system-ui,sans-serif] dark:bg-neutral-950"
            style={{
                // CSS variables for SVG color tokens — read by the SVG components above.
                // Light mode is the original black/white palette; dark mode inverts it.
                // Using inline style here keeps the SVGs self-contained without
                // requiring duplicate light/dark classes on every shape.
                ["--svg-stroke" as never]: STROKE_LIGHT,
                ["--svg-stroke-muted" as never]: STROKE_MUTED_LIGHT,
                ["--svg-fill" as never]: FILL_LIGHT,
                ["--svg-soft" as never]: FILL_SOFT_LIGHT,
                ["--svg-soft2" as never]: FILL_SOFT2_LIGHT,
                ["--svg-bar" as never]: FILL_BAR_LIGHT,
                ["--svg-dot" as never]: FILL_DOT_LIGHT,
            }}
        >
            <div
                className="max-w-5xl mx-auto dark:[--svg-stroke:#e5e5e5] dark:[--svg-stroke-muted:#525252] dark:[--svg-fill:#0a0a0a] dark:[--svg-soft:#1f1f1f] dark:[--svg-soft2:#171717] dark:[--svg-bar:#2a2a2a] dark:[--svg-dot:#e5e5e5]"
            >
                <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }} variants={containerVariants}>
                    {/* Row 1 — 2 cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        {features.slice(0, 2).map((f) => <FeatureCard key={f.id} {...f} />)}
                    </div>
                    {/* Row 2 — 3 cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {features.slice(2).map((f) => <FeatureCard key={f.id} {...f} />)}
                    </div>
                </motion.div>
            </div>
        </section>
    );
}
