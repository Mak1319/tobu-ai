import { MarkerContent, Marker } from "@/components/ui/marker";
import { Separator } from "@/components/ui/separator";
export default function GenerateTopicGraph() {
    return (
        <div className="flex justify-center items-center my-auto    ">
            <div className="flex w-full max-w-sm flex-col gap-8 py-12">
                <Marker role="status">
                    <MarkerContent className="shimmer">
                        Generating topic graph
                    </MarkerContent>
                </Marker>
                {/*<Marker variant={"border"}></Marker>*/}
                <Separator />
                <div className="text-accent-foreground">
                    The system transforms the extracted topics into an
                    interconnected knowledge graph. Each topic is linked to
                    related concepts based on their dependencies and academic
                    relationships, creating a visual learning map. This graph
                    helps identify prerequisite topics, concept hierarchies, and
                    the overall structure of the subject, enabling more
                    effective learning and navigation through the syllabus.
                </div>
            </div>
        </div>
    );
}
