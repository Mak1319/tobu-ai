import FileUpload05 from "@/components/file-upload-05";
import type { NavigationPayload, NavigationResult } from "@stepperize/react";

import { useParams } from "next/navigation";

interface Step1PageProps {
    next: (
        payload?: NavigationPayload | undefined,
    ) => Promise<NavigationResult>;
}

export default function Step1Page({ next }: Step1PageProps) {
    const params = useParams();
    const chatId = params.chatId as string;
    return (
        <div className="flex items-center justify-center flex-1">
            <FileUpload05 chatId={chatId} onUploadComplete={() => next()} />
        </div>
    );
}
