"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, Variants } from "framer-motion";
import {
    BookOpen,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clock,
    FileText,
    MessageSquare,
    Sparkles,
} from "lucide-react";
import { TobuLogo } from "@/components/tobu-logo";

type NavItem = { title: string; description: string };
type NavLink = { label: string; dropdown: boolean; items?: NavItem[] };

const NAV_LINKS: NavLink[] = [
    {
        label: "Product",
        dropdown: true,
        items: [
            {
                title: "AI Chat",
                description: "Study with a tutor that remembers context",
            },
            {
                title: "Document Study",
                description: "Upload notes and learn from your materials",
            },
            {
                title: "Quizzes",
                description: "Auto-generated practice from your topics",
            },
        ],
    },
    { label: "For Students", dropdown: false },
    {
        label: "Features",
        dropdown: true,
        items: [
            {
                title: "Live Voice",
                description: "Talk through concepts in real time",
            },
            {
                title: "Topic Graphs",
                description: "Map subjects from your documents",
            },
            {
                title: "Study Sessions",
                description: "Plan focused review blocks",
            },
        ],
    },
    {
        label: "Resources",
        dropdown: true,
        items: [
            { title: "Guides", description: "How to study smarter with Tobu" },
            { title: "Help Center", description: "Get support fast" },
            { title: "Changelog", description: "See what shipped" },
        ],
    },
    { label: "Pricing", dropdown: false },
];

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];
const WEEKDAY_NAMES = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];
function getToday() {
    const now = new Date();
    return {
        year: now.getFullYear(),
        month: now.getMonth(),
        day: now.getDate(),
    };
}

function daysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
}
function firstWeekday(year: number, month: number) {
    return new Date(year, month, 1).getDay();
}
function isPastDate(
    year: number,
    month: number,
    day: number,
    today: { year: number; month: number; day: number },
) {
    return (
        new Date(year, month, day) <
        new Date(today.year, today.month, today.day)
    );
}
function isAvailable(
    year: number,
    month: number,
    day: number,
    today: { year: number; month: number; day: number },
) {
    const weekday = new Date(year, month, day).getDay();
    const isWeekend = weekday === 0 || weekday === 6;
    return !isWeekend && !isPastDate(year, month, day, today);
}
function getDefaultSelected(today: {
    year: number;
    month: number;
    day: number;
}) {
    const d = new Date(today.year, today.month, today.day);
    for (let i = 0; i < 14; i++) {
        const year = d.getFullYear();
        const month = d.getMonth();
        const day = d.getDate();
        if (isAvailable(year, month, day, today)) {
            return { year, month, day };
        }
        d.setDate(d.getDate() + 1);
    }
    return { ...today };
}

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 24 },
    visible: (i: number = 0) => ({
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.6,
            delay: i * 0.08,
            ease: [0.22, 1, 0.36, 1],
        },
    }),
};

const monthVariants: Variants = {
    enter: (direction: number) => ({ opacity: 0, x: direction > 0 ? 24 : -24 }),
    center: {
        opacity: 1,
        x: 0,
        transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
    },
    exit: (direction: number) => ({
        opacity: 0,
        x: direction > 0 ? -24 : 24,
        transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] },
    }),
};

export default function Hero2() {
    const [today] = useState(getToday);
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);
    const [viewDate, setViewDate] = useState({
        year: today.year,
        month: today.month,
    });
    const [direction, setDirection] = useState(0);
    const [selectedDate, setSelectedDate] = useState(() =>
        getDefaultSelected(today),
    );

    function changeMonth(offset: number) {
        setDirection(offset);
        setViewDate(({ year, month }) => {
            const d = new Date(year, month + offset, 1);
            return { year: d.getFullYear(), month: d.getMonth() };
        });
    }

    function handleSelectDay(day: number) {
        if (!isAvailable(viewDate.year, viewDate.month, day, today)) return;
        setSelectedDate({ year: viewDate.year, month: viewDate.month, day });
    }

    const leadingBlanks = firstWeekday(viewDate.year, viewDate.month);
    const totalDays = daysInMonth(viewDate.year, viewDate.month);
    const cells: (number | null)[] = [
        ...Array.from({ length: leadingBlanks }, () => null),
        ...Array.from({ length: totalDays }, (_, i) => i + 1),
    ];

    const selectedWeekday =
        WEEKDAY_NAMES[
            new Date(
                selectedDate.year,
                selectedDate.month,
                selectedDate.day,
            ).getDay()
        ];
    const selectedMonthShort = MONTH_NAMES[selectedDate.month].slice(0, 3);

    return (
        <section className="relative w-full overflow-hidden bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
            {openDropdown && (
                <div
                    className="fixed inset-0 z-[5]"
                    onClick={() => setOpenDropdown(null)}
                />
            )}

            <motion.nav
                initial="hidden"
                animate="visible"
                variants={fadeUp}
                className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6"
            >
                <Link
                    href="/"
                    className="flex items-center gap-2.5 text-[19px] font-semibold tracking-tight"
                >
                    <TobuLogo size={32} priority className="size-8" />
                    Tobu AI
                </Link>

                <div className="hidden items-center gap-7 md:flex">
                    {NAV_LINKS.map((link) => (
                        <div key={link.label} className="relative">
                            <button
                                onClick={() =>
                                    link.dropdown &&
                                    setOpenDropdown(
                                        openDropdown === link.label
                                            ? null
                                            : link.label,
                                    )
                                }
                                className="flex cursor-pointer items-center gap-1 text-[14px] font-medium text-neutral-700 transition-colors hover:text-neutral-950 dark:text-neutral-300 dark:hover:text-white"
                            >
                                {link.label}
                                {link.dropdown && (
                                    <motion.span
                                        animate={{
                                            rotate:
                                                openDropdown === link.label
                                                    ? 180
                                                    : 0,
                                        }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <ChevronDown className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
                                    </motion.span>
                                )}
                            </button>

                            <AnimatePresence>
                                {link.dropdown &&
                                    openDropdown === link.label && (
                                        <motion.div
                                            initial={{
                                                opacity: 0,
                                                y: -8,
                                                scale: 0.98,
                                            }}
                                            animate={{
                                                opacity: 1,
                                                y: 0,
                                                scale: 1,
                                            }}
                                            exit={{
                                                opacity: 0,
                                                y: -8,
                                                scale: 0.98,
                                            }}
                                            transition={{
                                                duration: 0.18,
                                                ease: [0.22, 1, 0.36, 1],
                                            }}
                                            className="absolute left-0 top-full z-20 mt-3 w-64 rounded-xl border border-neutral-200 bg-white p-2 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.12)] dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)]"
                                        >
                                            {link.items?.map((item) => (
                                                <button
                                                    key={item.title}
                                                    className="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800"
                                                >
                                                    <span className="text-[13.5px] font-medium text-neutral-900 dark:text-neutral-50">
                                                        {item.title}
                                                    </span>
                                                    <span className="text-[12px] text-neutral-500 dark:text-neutral-400">
                                                        {item.description}
                                                    </span>
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                            </AnimatePresence>
                        </div>
                    ))}
                </div>

                <div className="flex items-center gap-5">
                    <Link
                        href="/auth/login"
                        className="text-[14px] font-medium text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
                    >
                        Login
                    </Link>
                    <motion.div
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                    >
                        <Link
                            href="/auth/signup"
                            className="flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2 text-[14px] font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
                        >
                            <Sparkles size={12} />
                            Start for free
                        </Link>
                    </motion.div>
                </div>
            </motion.nav>

            <div className="relative mx-auto flex max-w-3xl flex-col items-center px-6 pt-10 text-center">
                <motion.div
                    custom={1}
                    initial="hidden"
                    animate="visible"
                    variants={fadeUp}
                    className="mb-6 flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-1.5 text-[13px] font-medium text-neutral-600 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
                >
                    Tobu AI — your study companion
                    <ChevronRight className="h-3.5 w-3.5" />
                </motion.div>

                <motion.h1
                    custom={2}
                    initial="hidden"
                    animate="visible"
                    variants={fadeUp}
                    className="text-[42px] font-semibold leading-[1.08] tracking-tight sm:text-[56px]"
                >
                    The better way to
                    <br />
                    learn with AI
                </motion.h1>

                <motion.p
                    custom={3}
                    initial="hidden"
                    animate="visible"
                    variants={fadeUp}
                    className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-neutral-500 dark:text-neutral-400"
                >
                    Upload your notes, chat through tough topics, and practice
                    with quizzes — Tobu AI turns your study materials into a
                    personal tutor that keeps you moving.
                </motion.p>

                <motion.div
                    custom={4}
                    initial="hidden"
                    animate="visible"
                    variants={fadeUp}
                    className="mt-7 flex flex-col items-center gap-3 sm:flex-row"
                >
                    <motion.div
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                    >
                        <Link
                            href="/auth/signup"
                            className="flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-[14px] font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
                        >
                            <BookOpen className="h-4 w-4" />
                            Start studying free
                        </Link>
                    </motion.div>
                    <motion.div
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                    >
                        <Link
                            href="/auth/login"
                            className="rounded-full border border-neutral-200 bg-white px-5 py-2.5 text-[14px] font-medium text-neutral-800 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200"
                        >
                            Sign in with Email
                        </Link>
                    </motion.div>
                </motion.div>

                <motion.p
                    custom={5}
                    initial="hidden"
                    animate="visible"
                    variants={fadeUp}
                    className="mt-4 text-[13px] text-neutral-400 dark:text-neutral-500"
                >
                    Free to start — no credit card required
                </motion.p>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 60 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                    duration: 0.7,
                    delay: 0.5,
                    ease: [0.22, 1, 0.36, 1],
                }}
                className="relative z-10 mx-auto mt-14 max-w-5xl px-4"
            >
                <div className="relative overflow-hidden rounded-t-2xl border-x-8 border-t-8 border-neutral-200 bg-white shadow-[0_-8px_40px_-12px_rgba(0,0,0,0.08)] dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-[0_-8px_40px_-12px_rgba(0,0,0,0.4)]">
                    <div className="flex flex-col sm:flex-row">
                        <div className="shrink-0 border-b border-neutral-100 p-7 sm:w-[280px] sm:border-b-0 sm:border-r dark:border-neutral-800">
                            <div className="mb-4 size-9 overflow-hidden rounded-full">
                                <TobuLogo size={36} className="size-9" />
                            </div>
                            <p className="text-[13px] text-neutral-400 dark:text-neutral-500">
                                Tobu AI
                            </p>
                            <h3 className="mt-1 text-[18px] font-semibold text-neutral-900 dark:text-neutral-50">
                                Study Session
                            </h3>
                            <p className="mt-2 text-[13.5px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                                Review your uploaded notes with guided chat and
                                practice quizzes.
                            </p>

                            <div className="mt-6 flex flex-col gap-3 text-[13.5px] text-neutral-600 dark:text-neutral-400">
                                <div className="flex items-center gap-2.5">
                                    <Clock className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
                                    45 mins
                                </div>
                                <div className="flex items-center gap-2.5">
                                    <MessageSquare className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
                                    Chat + live voice
                                </div>
                                <div className="flex items-center gap-2.5">
                                    <FileText className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
                                    Biology notes.pdf
                                </div>
                            </div>

                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={`${selectedDate.year}-${selectedDate.month}-${selectedDate.day}`}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -6 }}
                                    transition={{
                                        duration: 0.25,
                                        ease: [0.22, 1, 0.36, 1],
                                    }}
                                    className="mt-6 rounded-xl bg-neutral-50 px-3.5 py-3 dark:bg-neutral-800"
                                >
                                    <p className="text-[13px] font-medium text-neutral-900 dark:text-neutral-50">
                                        {selectedWeekday}, {selectedMonthShort}{" "}
                                        {selectedDate.day}
                                    </p>
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        <div className="flex-1 p-7">
                            <div className="mb-5 flex items-center justify-between">
                                <h4 className="text-[16px] font-semibold text-neutral-900 dark:text-neutral-50">
                                    {MONTH_NAMES[viewDate.month]}{" "}
                                    <span className="font-normal text-neutral-400 dark:text-neutral-500">
                                        {viewDate.year}
                                    </span>
                                </h4>
                                <div className="flex items-center gap-1">
                                    <motion.button
                                        whileTap={{ scale: 0.88 }}
                                        onClick={() => changeMonth(-1)}
                                        className="grid h-7 w-7 cursor-pointer place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:bg-neutral-800"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </motion.button>
                                    <motion.button
                                        whileTap={{ scale: 0.88 }}
                                        onClick={() => changeMonth(1)}
                                        className="grid h-7 w-7 cursor-pointer place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:bg-neutral-800"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </motion.button>
                                </div>
                            </div>

                            <div className="grid grid-cols-7 gap-y-3 text-center">
                                {WEEKDAYS.map((day) => (
                                    <span
                                        key={day}
                                        className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500"
                                    >
                                        {day}
                                    </span>
                                ))}
                            </div>

                            <div className="relative overflow-hidden">
                                <AnimatePresence mode="wait" custom={direction}>
                                    <motion.div
                                        key={`${viewDate.year}-${viewDate.month}`}
                                        custom={direction}
                                        variants={monthVariants}
                                        initial="enter"
                                        animate="center"
                                        exit="exit"
                                        className="grid grid-cols-7 gap-y-3 pt-3 text-center"
                                    >
                                        {cells.map((day, i) => {
                                            if (day === null)
                                                return (
                                                    <span key={`blank-${i}`} />
                                                );

                                            const available = isAvailable(
                                                viewDate.year,
                                                viewDate.month,
                                                day,
                                                today,
                                            );
                                            const selected =
                                                selectedDate.year ===
                                                    viewDate.year &&
                                                selectedDate.month ===
                                                    viewDate.month &&
                                                selectedDate.day === day;
                                            const isToday =
                                                today.year === viewDate.year &&
                                                today.month ===
                                                    viewDate.month &&
                                                today.day === day;

                                            return (
                                                <motion.button
                                                    key={day}
                                                    whileTap={
                                                        available
                                                            ? { scale: 0.9 }
                                                            : undefined
                                                    }
                                                    disabled={!available}
                                                    onClick={() =>
                                                        handleSelectDay(day)
                                                    }
                                                    className={[
                                                        "relative mx-auto flex h-9 w-9 items-center justify-center rounded-xl text-[13.5px] transition-colors",
                                                        available
                                                            ? "cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                                            : "cursor-not-allowed",
                                                    ].join(" ")}
                                                >
                                                    {selected && (
                                                        <motion.span
                                                            layoutId="day-highlight"
                                                            className="absolute inset-0 rounded-xl bg-neutral-900 dark:bg-neutral-100"
                                                            transition={{
                                                                type: "spring",
                                                                stiffness: 380,
                                                                damping: 30,
                                                            }}
                                                        />
                                                    )}
                                                    <span
                                                        className={[
                                                            "relative z-10",
                                                            selected
                                                                ? "text-white dark:text-neutral-900"
                                                                : available
                                                                  ? "text-neutral-900 dark:text-neutral-50"
                                                                  : "text-neutral-300 dark:text-neutral-600",
                                                        ].join(" ")}
                                                    >
                                                        {day}
                                                    </span>
                                                    {isToday && !selected && (
                                                        <span className="absolute -bottom-1 h-1 w-1 rounded-xl bg-neutral-400 dark:bg-neutral-500" />
                                                    )}
                                                </motion.button>
                                            );
                                        })}
                                    </motion.div>
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>

                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-transparent dark:from-neutral-950" />
                </div>
            </motion.div>
        </section>
    );
}
