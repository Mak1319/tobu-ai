"use client";

import Link from "next/link";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useState, useRef } from "react";
import { TobuLogo } from "@/components/tobu-logo";

const avatars = [
    "https://i.pravatar.cc/40?img=11",
    "https://i.pravatar.cc/40?img=22",
    "https://i.pravatar.cc/40?img=33",
];

function HoverImage() {
    const ref = useRef<HTMLSpanElement>(null);

    const rawX = useMotionValue(0);
    const rawY = useMotionValue(0);
    const rotateX = useSpring(useTransform(rawY, [-1, 1], [18, -18]), {
        stiffness: 300,
        damping: 25,
    });
    const rotateY = useSpring(useTransform(rawX, [-1, 1], [-18, 18]), {
        stiffness: 300,
        damping: 25,
    });
    const scale = useSpring(1, { stiffness: 300, damping: 22 });

    function handleMouseMove(e: React.MouseEvent<HTMLSpanElement>) {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        rawX.set((e.clientX - cx) / (rect.width / 2));
        rawY.set((e.clientY - cy) / (rect.height / 2));
        scale.set(1.18);
    }

    function handleMouseLeave() {
        rawX.set(0);
        rawY.set(0);
        scale.set(1);
    }

    return (
        <motion.span
            ref={ref}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{
                rotateX,
                rotateY,
                scale,
                transformStyle: "preserve-3d",
                perspective: 600,
            }}
            className="relative -top-1 inline-block h-11 w-11 cursor-pointer overflow-hidden rounded-xl align-middle shadow-lg ring-1 ring-neutral-200 dark:ring-white/10 md:h-13 md:w-13"
            whileHover={{ boxShadow: "0 0 24px 6px rgba(0,0,0,0.15)" }}
        >
            <TobuLogo size={52} className="h-full w-full" />
        </motion.span>
    );
}

function FadeUp({
    children,
    delay = 0,
    className = "",
}: {
    children: React.ReactNode;
    delay?: number;
    className?: string;
}) {
    return (
        <motion.span
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
            className={`inline-block ${className}`}
        >
            {children}
        </motion.span>
    );
}

export default function CTASection1() {
    const [email, setEmail] = useState("");

    return (
        <section className="w-full overflow-hidden px-4 py-28">
            <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
                <h2
                    className="mb-10 text-4xl font-bold leading-[1.15] tracking-tight text-neutral-900 dark:text-neutral-50 md:text-5xl lg:text-[3.5rem]"
                    style={{ perspective: 800 }}
                >
                    <span className="mb-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
                        <FadeUp delay={0}>Study</FadeUp>
                        <FadeUp delay={0.06}>smarter</FadeUp>

                        <FadeUp delay={0.11}>
                            <HoverImage />
                        </FadeUp>

                        <FadeUp delay={0.15}>
                            <em className="font-bold italic text-neutral-900 dark:text-neutral-50">
                                with AI
                            </em>
                        </FadeUp>
                    </span>

                    <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
                        <FadeUp delay={0.23}>built for</FadeUp>

                        <FadeUp delay={0.31}>real</FadeUp>

                        <FadeUp delay={0.35}>
                            <span className="inline-flex items-center rounded-full border-2 border-neutral-900 px-5 py-1 leading-none text-neutral-900 dark:border-neutral-50 dark:text-neutral-50">
                                students
                            </span>
                        </FadeUp>

                        <FadeUp delay={0.39}>.</FadeUp>
                    </span>
                </h2>

                <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{
                        duration: 0.45,
                        delay: 0.44,
                        ease: "easeOut",
                    }}
                    className="mb-8 max-w-md text-sm text-neutral-500 dark:text-neutral-400"
                >
                    Upload notes, chat with Tobu, and practice with quizzes —
                    get product updates in your inbox.
                </motion.p>

                <motion.form
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{
                        duration: 0.5,
                        delay: 0.48,
                        ease: [0.22, 1, 0.36, 1],
                    }}
                    className="mb-5 flex w-full max-w-lg items-center gap-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                    }}
                >
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email"
                        className="flex-1 rounded-full border border-neutral-200 bg-white px-5 py-3.5 text-sm text-neutral-900 outline-none transition-colors placeholder-neutral-400 focus:border-neutral-400 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-50 dark:placeholder-neutral-500 dark:focus:border-white/30"
                    />

                    <motion.div
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                    >
                        <Link
                            href="/auth/signup"
                            className="cursor-pointer whitespace-nowrap rounded-full bg-neutral-900 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
                        >
                            Get started
                        </Link>
                    </motion.div>
                </motion.form>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{
                        duration: 0.4,
                        delay: 0.56,
                        ease: "easeOut",
                    }}
                    className="flex items-center gap-2.5"
                >
                    <div className="flex -space-x-2.5">
                        {avatars.map((src, i) => (
                            <img
                                key={i}
                                src={src}
                                alt=""
                                className="h-7 w-7 rounded-full border-2 border-white object-cover shadow-sm dark:border-neutral-950"
                            />
                        ))}
                    </div>

                    <span className="text-[13px] text-neutral-600 dark:text-neutral-400">
                        Join students already learning with Tobu AI
                    </span>
                </motion.div>
            </div>
        </section>
    );
}
