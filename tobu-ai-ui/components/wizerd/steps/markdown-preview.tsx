"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

type MarkdownPreviewProps = {
    content: string;
    className?: string;
};

/**
 * Renders markdown as formatted document content (not raw source).
 */
export function MarkdownPreview({ content, className }: MarkdownPreviewProps) {
    return (
        <div
            className={cn(
                "max-w-none text-sm leading-relaxed text-foreground",
                className,
            )}
        >
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    h1: ({ children }) => (
                        <h1 className="mb-3 mt-6 text-2xl font-semibold tracking-tight first:mt-0">
                            {children}
                        </h1>
                    ),
                    h2: ({ children }) => (
                        <h2 className="mb-2 mt-5 text-xl font-semibold tracking-tight first:mt-0">
                            {children}
                        </h2>
                    ),
                    h3: ({ children }) => (
                        <h3 className="mb-2 mt-4 text-lg font-semibold first:mt-0">
                            {children}
                        </h3>
                    ),
                    h4: ({ children }) => (
                        <h4 className="mb-1.5 mt-3 text-base font-semibold first:mt-0">
                            {children}
                        </h4>
                    ),
                    p: ({ children }) => (
                        <p className="mb-3 text-foreground/90 last:mb-0">
                            {children}
                        </p>
                    ),
                    ul: ({ children }) => (
                        <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">
                            {children}
                        </ul>
                    ),
                    ol: ({ children }) => (
                        <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">
                            {children}
                        </ol>
                    ),
                    li: ({ children }) => (
                        <li className="text-foreground/90">{children}</li>
                    ),
                    blockquote: ({ children }) => (
                        <blockquote className="mb-3 border-l-2 border-border pl-3 text-muted-foreground italic">
                            {children}
                        </blockquote>
                    ),
                    a: ({ href, children }) => (
                        <a
                            href={href}
                            className="font-medium text-primary underline underline-offset-2"
                            target="_blank"
                            rel="noreferrer"
                        >
                            {children}
                        </a>
                    ),
                    strong: ({ children }) => (
                        <strong className="font-semibold text-foreground">
                            {children}
                        </strong>
                    ),
                    em: ({ children }) => (
                        <em className="italic">{children}</em>
                    ),
                    hr: () => <hr className="my-4 border-border" />,
                    table: ({ children }) => (
                        <div className="mb-3 overflow-x-auto last:mb-0">
                            <table className="w-full border-collapse text-left text-sm">
                                {children}
                            </table>
                        </div>
                    ),
                    thead: ({ children }) => (
                        <thead className="border-b border-border bg-muted/40">
                            {children}
                        </thead>
                    ),
                    th: ({ children }) => (
                        <th className="px-3 py-2 font-medium">{children}</th>
                    ),
                    td: ({ children }) => (
                        <td className="border-t border-border px-3 py-2 align-top">
                            {children}
                        </td>
                    ),
                    code: ({ className, children }) => {
                        const isBlock = Boolean(className);
                        if (isBlock) {
                            return (
                                <code className="font-mono text-xs leading-relaxed">
                                    {children}
                                </code>
                            );
                        }
                        return (
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
                                {children}
                            </code>
                        );
                    },
                    pre: ({ children }) => (
                        <pre className="mb-3 overflow-x-auto rounded-lg bg-muted p-3 last:mb-0">
                            {children}
                        </pre>
                    ),
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
