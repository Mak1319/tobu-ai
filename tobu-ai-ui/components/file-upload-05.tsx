"use client"

import { FileText, Image as ImageIcon, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { writeWizardHash } from "@/lib/wizard/storage";
import { sha256Hex } from "@/lib/wizard/hash";

interface FileUpload05Props {
  chatId: string;
  disabled?: boolean;
  onUploadComplete?: (info: {
    contentHash: string;
    mdKey: string;
  }) => void;
}

const ACCEPTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "application/pdf",
];

const ACCEPTED_EXTENSIONS = ".png,.jpg,.jpeg,.webp,.gif,.pdf";

const MAX_SIZE_MB = 10;

type UploadStatus = "idle" | "uploading" | "success" | "error";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

export default function FileUpload05({
  chatId,
  disabled = false,
  onUploadComplete,
}: FileUpload05Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  const resetFile = () => {
    setFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setError(null);
    setStatus("idle");
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleFileSelection = (selected: File | null | undefined) => {
    if (!selected) return;

    if (!ACCEPTED_MIME_TYPES.includes(selected.type)) {
      setError("Only image and PDF files are accepted.");
      setFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }

    if (selected.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File is larger than the ${MAX_SIZE_MB} MB limit.`);
      setFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }

    setError(null);
    setStatus("idle");
    setFile(selected);
    setPreviewUrl(
      isImageFile(selected) ? URL.createObjectURL(selected) : null
    );
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelection(e.target.files?.[0]);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelection(e.dataTransfer.files?.[0]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || error) return;

    setStatus("uploading");
    setError(null);

    try {
      // Hash on the client before upload — same digest the worker uses for
      // processed-documents/<sha256>.md
      const contentHash = await sha256Hex(file);
      const mdKey = `${contentHash}.md`;

      const formData = new FormData();
      formData.append("chatId", chatId);
      formData.append("file", file);
      formData.append("contentHash", contentHash);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as
        | {
            ok: true;
            key: string;
            bucket: string;
            size: number;
            contentType: string;
            contentHash: string;
            mdKey: string;
          }
        | { ok: false; error: string }
        | null;

      if (!response.ok || !data || !data.ok) {
        const message =
          data && !data.ok ? data.error : `Upload failed (${response.status})`;
        setStatus("error");
        setError(message);
        return;
      }

      writeWizardHash(chatId, {
        fileHash: data.contentHash || contentHash,
        mdKey: data.mdKey || mdKey,
      });

      setStatus("success");
      if (onUploadComplete) {
        onUploadComplete({
          contentHash: data.contentHash || contentHash,
          mdKey: data.mdKey || mdKey,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setStatus("error");
      setError(message);
    }
  };

  const isUploading = status === "uploading" || disabled;
  const statusLabel =
    status === "uploading"
      ? "Uploading…"
      : status === "success"
        ? "Uploaded"
        : status === "error"
          ? "Failed"
          : "Ready to upload";

  return (
    <div className="flex w-full max-w-lg items-center justify-center p-10 sm:mx-auto sm:max-w-lg">
      <form className="w-full" onSubmit={handleSubmit}>
        <h3 className="text-balance font-semibold text-foreground text-lg">
          File Upload
        </h3>

        <div
          className={`mt-4 flex justify-center rounded-md border border-dashed px-6 py-10 transition-colors ${
            isDragging ? "border-primary bg-primary/5" : "border-input"
          }`}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="sm:flex sm:items-center sm:gap-x-3">
            <Upload
              aria-hidden={true}
              className="mx-auto h-8 w-8 text-muted-foreground sm:mx-0 sm:h-6 sm:w-6"
            />
            <div className="mt-4 flex text-foreground text-sm leading-6 sm:mt-0">
              <p>Drag and drop or</p>
              <Label
                className="relative cursor-pointer rounded-sm pl-1 font-medium text-primary hover:underline hover:underline-offset-4"
                htmlFor="file-upload-4"
              >
                <span>choose file</span>
                <input
                  accept={ACCEPTED_EXTENSIONS}
                  className="sr-only"
                  disabled={isUploading}
                  id="file-upload-4"
                  name="file-upload-4"
                  onChange={handleInputChange}
                  ref={inputRef}
                  type="file"
                />
              </Label>
              <p className="text-pretty pl-1">to upload</p>
            </div>
          </div>
        </div>

        <p className="mt-2 flex items-center justify-between text-pretty text-muted-foreground text-xs leading-5">
          Recommended max. size: {MAX_SIZE_MB} MB, Accepted file types: PNG,
          JPG, WEBP, GIF, PDF.
        </p>

        {error && (
          <p className="mt-3 text-destructive text-xs" role="alert">
            {error}
          </p>
        )}

        {file && !error && (
          <div className="relative mt-8 rounded-lg bg-muted p-3">
            <div className="absolute top-1 right-1">
              <Button
                aria-label="Remove"
                className="rounded-sm p-2 text-muted-foreground hover:text-foreground"
                disabled={isUploading}
                onClick={resetFile}
                size="sm"
                type="button"
                variant="ghost"
              >
                <X aria-hidden={true} className="size-4 shrink-0" />
              </Button>
            </div>
            <div className="flex items-center space-x-2.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-background shadow-sm ring-1 ring-input ring-inset">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={file.name}
                    className="h-10 w-10 rounded-sm object-cover"
                    src={previewUrl}
                  />
                ) : isImageFile(file) ? (
                  <ImageIcon
                    aria-hidden={true}
                    className="size-5 text-foreground"
                  />
                ) : (
                  <FileText
                    aria-hidden={true}
                    className="size-5 text-foreground"
                  />
                )}
              </span>
              <div className="w-full pr-8">
                <p className="truncate font-medium text-foreground text-xs">
                  {file.name}
                </p>
                <p className="mt-0.5 flex justify-between text-pretty text-muted-foreground text-xs">
                  <span>{formatBytes(file.size)}</span>
                  <span>{statusLabel}</span>
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 flex items-center justify-end space-x-3">
          <Button
            className="whitespace-nowrap rounded-sm border border-input px-4 py-2 font-medium text-foreground text-sm shadow-sm hover:bg-accent hover:text-foreground"
            disabled={!file || isUploading}
            onClick={resetFile}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            className="whitespace-nowrap rounded-sm bg-primary px-4 py-2 font-medium text-primary-foreground text-sm shadow-sm hover:bg-primary/90"
            disabled={!file || isUploading}
            type="submit"
            variant="default"
          >
            {isUploading ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </form>
    </div>
  );
}