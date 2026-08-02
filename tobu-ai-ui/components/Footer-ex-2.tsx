"use client";

import Link from "next/link";
import { motion, Variants } from "framer-motion";
import Image from "next/image";
import { TobuLogo } from "@/components/tobu-logo";

const AVATARS = [
    {
        id: 1,
        src: "https://api.dicebear.com/9.x/notionists/svg?seed=JK&backgroundColor=b6e3f4",
    },
    {
        id: 2,
        src: "https://api.dicebear.com/9.x/notionists/svg?seed=AM&backgroundColor=c0aede",
    },
    {
        id: 3,
        src: "https://api.dicebear.com/9.x/notionists/svg?seed=SL&backgroundColor=ffdfbf",
    },
    {
        id: 4,
        src: "https://api.dicebear.com/9.x/notionists/svg?seed=TR&backgroundColor=d1d4f9",
    },
    {
        id: 5,
        src: "https://api.dicebear.com/9.x/notionists/svg?seed=PW&backgroundColor=ffd5dc",
    },
];

const stagger: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.1, delayChildren: 0.05 },
    },
};

const slide: Variants = {
    hidden: { opacity: 0, y: 16 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.45, ease: "easeOut" },
    },
};

const panelVariant: Variants = {
    hidden: { opacity: 0, scale: 0.975 },
    visible: {
        opacity: 1,
        scale: 1,
        transition: { duration: 0.55, ease: "easeOut", delay: 0.1 },
    },
};

const currentYear = new Date().getFullYear();

function AvatarStack() {
    return (
        <motion.div variants={slide} className="flex items-center">
            <div className="flex -space-x-2.5">
                {AVATARS.map((a) => (
                    <div
                        key={a.id}
                        className="flex h-10 w-10 flex-shrink-0 select-none overflow-hidden rounded-sm border-2 border-white bg-neutral-100 dark:border-neutral-950 dark:bg-neutral-800"
                    >
                        <Image
                            src={a.src}
                            alt="student"
                            width={40}
                            height={40}
                            className="h-full w-full object-cover"
                            unoptimized
                        />
                    </div>
                ))}
            </div>
        </motion.div>
    );
}

function LeftHeading() {
    return (
        <motion.h2
            variants={slide}
            className="text-[1.85rem] leading-[1.18] tracking-[-0.025em] text-neutral-900 sm:text-[2.1rem] dark:text-neutral-50"
            style={{ fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
        >
            Tobu AI helps students
            <br />
            learn faster from their
            <br />
            own study materials.
        </motion.h2>
    );
}

function CTACard() {
    return (
        <motion.div
            variants={slide}
            className="flex w-fit items-center gap-4 rounded-2xl bg-neutral-100 px-5 py-4 dark:bg-neutral-900"
        >
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Link
                    href="/auth/signup"
                    className="whitespace-nowrap rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100 dark:focus-visible:ring-neutral-500"
                >
                    Start free
                </Link>
            </motion.div>
            <div
                className="text-[12px] leading-[1.6] text-neutral-500 dark:text-neutral-400"
                style={{ fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
            >
                <p>Create your account in minutes.</p>
                <p>No credit card required.</p>
            </div>
        </motion.div>
    );
}

function TrustBadges() {
    return (
        <motion.div variants={slide} className="flex flex-wrap items-center gap-6">
            <div className="flex flex-col gap-0.5">
                <p
                    className="text-[9px] font-semibold tracking-widest text-neutral-500 uppercase dark:text-neutral-400"
                    style={{
                        fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
                    }}
                >
                    Built for
                </p>
                <div className="flex items-center gap-1.5">
                    <span
                        className="text-[1.25rem] leading-none font-bold tracking-tight text-neutral-900 dark:text-neutral-50"
                        style={{
                            fontFamily:
                                "'Geist', 'Inter', system-ui, sans-serif",
                        }}
                    >
                        Students
                    </span>
                </div>
                <p
                    className="-mt-0.5 text-[9px] text-neutral-500 dark:text-neutral-400"
                    style={{
                        fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
                    }}
                >
                    Chat · Docs · Quizzes
                </p>
            </div>

            <div className="h-10 w-px bg-neutral-200 dark:bg-neutral-800" />

            <div className="flex flex-col gap-0.5">
                <p
                    className="text-[9px] font-semibold tracking-widest text-neutral-500 uppercase dark:text-neutral-400"
                    style={{
                        fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
                    }}
                >
                    Powered by
                </p>
                <div className="flex items-center gap-1.5">
                    <TobuLogo size={20} className="size-5" />
                    <span
                        className="text-[1.25rem] leading-none font-bold tracking-tight text-neutral-900 dark:text-neutral-50"
                        style={{
                            fontFamily:
                                "'Geist', 'Inter', system-ui, sans-serif",
                        }}
                    >
                        Tobu AI
                    </span>
                </div>
            </div>
        </motion.div>
    );
}

function RightPanel() {
    const footerLinks = [
        { label: "Product", href: "#" },
        { label: "Features", href: "#" },
        { label: "Pricing", href: "#" },
        { label: "Help", href: "#" },
    ];
    const font = { fontFamily: "'Geist', 'Inter', system-ui, sans-serif" };

    return (
        <motion.div
            variants={panelVariant}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            className="flex h-full flex-col justify-between rounded-[2rem] border border-neutral-200 bg-neutral-50 p-10 text-neutral-900 sm:p-12 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-50"
        >
            <div className="space-y-7">
                <div className="space-y-2">
                    <h3
                        className="text-2xl leading-[1.25] font-semibold tracking-[-0.02em] text-neutral-900 sm:text-[1.75rem] dark:text-neutral-50"
                        style={font}
                    >
                        Turn your notes into a
                        <br />
                        tutor that never gets tired.
                    </h3>
                    <p
                        className="text-base font-normal text-neutral-500 dark:text-neutral-400"
                        style={font}
                    >
                        Ready to get started?
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <motion.div
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                    >
                        <Link
                            href="/auth/signup"
                            className="rounded-xl bg-neutral-900 px-6 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:bg-neutral-50 dark:text-neutral-900 dark:hover:bg-white dark:focus-visible:ring-neutral-500"
                            style={font}
                        >
                            Create account
                        </Link>
                    </motion.div>
                    <motion.div
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                    >
                        <Link
                            href="/auth/login"
                            className="rounded-xl bg-neutral-200 px-6 py-3 text-sm font-semibold text-neutral-900 transition-colors duration-200 hover:bg-neutral-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:bg-white/10 dark:text-neutral-50 dark:hover:bg-white/20 dark:focus-visible:ring-neutral-500"
                            style={font}
                        >
                            Sign in
                        </Link>
                    </motion.div>
                </div>
            </div>

            <div className="mt-10 flex flex-col justify-between gap-5 border-t border-neutral-200 pt-8 sm:flex-row sm:items-end dark:border-white/10">
                <div className="space-y-1">
                    <p className="text-sm text-neutral-700 dark:text-neutral-300">
                        support@tobu.ai
                    </p>
                    <p className="text-xs text-neutral-400 dark:text-neutral-600">
                        © {currentYear} Tobu AI. All rights reserved.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-5">
                    {footerLinks.map((link) => (
                        <a
                            key={link.label}
                            href={link.href}
                            className="text-xs capitalize text-neutral-500 transition-colors duration-200 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-50"
                            style={font}
                        >
                            {link.label}
                        </a>
                    ))}
                    <span className="hidden h-3 w-px bg-neutral-300 sm:block dark:bg-neutral-800" />
                    <a
                        href="#"
                        className="text-xs text-neutral-500 transition-colors duration-200 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-50"
                        style={font}
                    >
                        Privacy Policy
                    </a>
                </div>
            </div>
        </motion.div>
    );
}

export default function DivBlockFooter() {
    return (
        <footer className="w-full px-6 py-10 sm:px-10 sm:py-14 lg:px-16">
            <div className="flex flex-col items-stretch gap-6 lg:flex-row lg:gap-8">
                <motion.div
                    className="flex w-full flex-col justify-between gap-6 lg:w-[30%]"
                    variants={stagger}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, amount: 0.3 }}
                >
                    <AvatarStack />
                    <LeftHeading />
                    <CTACard />
                    <TrustBadges />
                </motion.div>

                <div className="flex w-full flex-col lg:w-[70%]">
                    <RightPanel />
                </div>
            </div>
        </footer>
    );
}
