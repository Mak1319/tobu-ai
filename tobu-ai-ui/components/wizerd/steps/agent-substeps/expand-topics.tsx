import { MarkerContent, Marker } from "@/components/ui/marker";
import { Separator } from "@/components/ui/separator";
export default function ExpandTopics() {
    return (
        <div className="flex justify-center items-center my-auto    ">
            <div className="flex w-full max-w-sm flex-col gap-8 py-12">
                <Marker role="status">
                    <MarkerContent className="shimmer">
                        Expanding topics
                    </MarkerContent>
                </Marker>
                {/*<Marker variant={"border"}></Marker>*/}
                <Separator />
                <div className="text-accent-foreground">
                    The system enriches each extracted topic by breaking it down
                    into detailed subtopics, concepts, and learning objectives.
                    It expands the syllabus into a comprehensive knowledge
                    structure while maintaining the original academic context.
                    This process ensures that every topic is covered in
                    sufficient depth, providing a complete roadmap for studying,
                    assessment preparation, and further content generation.
                </div>
            </div>
        </div>
    );
}
