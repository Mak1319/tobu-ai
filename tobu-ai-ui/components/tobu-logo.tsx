import Image from "next/image";
import { cn } from "@/lib/utils";

type TobuLogoProps = {
    className?: string;
    size?: number;
    priority?: boolean;
};

export function TobuLogo({
    className,
    size = 32,
    priority = false,
}: TobuLogoProps) {
    return (
        <Image
            src="/tobu-ai-logo.svg"
            alt="Tobu AI"
            width={size}
            height={size}
            className={cn("object-contain", className)}
            priority={priority}
        />
    );
}
