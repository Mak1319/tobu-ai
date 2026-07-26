import FileUpload05 from "@/components/file-upload-05"

interface Step1PageProps {
  onUploadComplete?: () => void;
}

export default function Step1Page({ onUploadComplete }: Step1PageProps) {
  return (
    <div className="flex items-center justify-center flex-1">
      <FileUpload05 onUploadComplete={onUploadComplete} />
    </div>
  )
}
