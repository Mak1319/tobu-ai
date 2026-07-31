import { MarkerContent, Marker } from "@/components/ui/marker";
import { Separator } from "@/components/ui/separator";

export default function ExtractSyllabus() {
    return (
        <div className="flex justify-center items-center my-auto    ">
            <div className="flex w-full max-w-sm flex-col gap-8 py-12">
                <Marker role="status">
                    <MarkerContent className="shimmer">
                        Extracting syllabus
                    </MarkerContent>
                </Marker>
                {/*<Marker variant={"border"}></Marker>*/}
                <Separator />
                <div className="text-accent-foreground">
                    The system analyzes the syllabus document provided by the
                    user and extracts the essential academic content. It removes
                    unnecessary formatting, irrelevant text, and duplicates to
                    create a clean, structured, and accurate representation of
                    the syllabus. This standardized output serves as the
                    foundation for all subsequent processing steps.
                </div>
            </div>
        </div>
    );
}
