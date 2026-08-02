"use client";

import Link from "next/link";
import { motion, Variants } from "framer-motion";

export default function CTASection() {
    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.15,
                delayChildren: 0.2,
            },
        },
    };

    const itemVariants: Variants = {
        hidden: { opacity: 0, y: 20 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.6, ease: "easeOut" },
        },
    };

    return (
        <section className="w-full px-4 py-20 sm:px-6 lg:px-8">
            <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.3 }}
                variants={containerVariants}
                className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-3xl border border-neutral-200 bg-white text-neutral-900 dark:border-white/10 dark:bg-black dark:text-white"
            >
                <div className="absolute inset-0">
                    <div className="absolute top-0 left-0 h-full w-1/2 rounded-full bg-gradient-to-r from-emerald-600/30 via-emerald-500/20 to-transparent blur-3xl" />
                    <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-gradient-to-t from-emerald-600/20 to-transparent blur-3xl" />
                </div>

                <div className="relative z-10 flex flex-col items-center px-6 py-24 text-center sm:px-12 sm:py-28 lg:px-20">
                    <motion.h2
                        variants={itemVariants}
                        className="mb-6 text-4xl tracking-tight sm:text-5xl lg:text-6xl"
                    >
                        Ready to study smarter?
                    </motion.h2>

                    <motion.p
                        variants={itemVariants}
                        className="mb-10 max-w-2xl text-xl leading-relaxed text-neutral-600 sm:text-xl dark:text-gray-300"
                    >
                        Stop rereading the same notes. Chat, quiz, and review
                        with Tobu AI — your personal study companion.
                    </motion.p>

                    <motion.div
                        variants={itemVariants}
                        className="mb-6 flex w-full flex-col gap-4 sm:w-auto sm:flex-row sm:gap-6"
                    >
                        <motion.div
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            <Link
                                href="/auth/signup"
                                className="block rounded-lg bg-neutral-900 px-8 py-3.5 font-semibold text-white transition-all duration-200 hover:shadow-2xl dark:bg-white dark:text-black"
                            >
                                Start for free
                            </Link>
                        </motion.div>

                        <motion.div
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            <Link
                                href="/auth/login"
                                className="block rounded-lg border border-neutral-300 px-8 py-3.5 font-semibold text-neutral-900 transition-all duration-200 hover:border-neutral-500 hover:bg-neutral-100 dark:border-gray-700 dark:text-white dark:hover:border-gray-500 dark:hover:bg-white/5"
                            >
                                Sign in
                            </Link>
                        </motion.div>
                    </motion.div>

                    <motion.p
                        variants={itemVariants}
                        className="text-sm text-neutral-500 dark:text-gray-500"
                    >
                        Free to start. No credit card required.
                    </motion.p>
                </div>
            </motion.div>
        </section>
    );
}
