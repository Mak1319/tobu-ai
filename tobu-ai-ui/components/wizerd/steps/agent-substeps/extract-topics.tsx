import { MarkerContent, Marker } from "@/components/ui/marker";
import { Separator } from "@/components/ui/separator";

export default function ExtractTopics() {
    return (
        <div className="flex justify-center items-center my-auto    ">
            <div className="flex w-full max-w-sm flex-col gap-8 py-12">
                <Marker role="status">
                    <MarkerContent className="shimmer">
                        Extracting topics
                    </MarkerContent>
                </Marker>
                {/*<Marker variant={"border"}></Marker>*/}
                <Separator />
                <div className="text-accent-foreground">
                    Using the extracted syllabus, the system identifies all
                    major topics, subtopics, and key concepts covered in the
                    course. It intelligently organizes the content into a
                    structured hierarchy, ensuring that no important subject is
                    overlooked while preserving the logical flow of the original
                    syllabus.
                </div>
            </div>
        </div>
    );
}
