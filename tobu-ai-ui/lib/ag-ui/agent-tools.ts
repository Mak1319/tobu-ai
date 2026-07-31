// lib/agui-tools.ts
import { Tool } from "@ag-ui/client";
export const createGoToTool: (value?: () => unknown) => Tool = function (
    callback,
) {
    return {
        name: "goToStep",
        description: "Move the wizard to a specific step",
        parameters: {
            type: "object",
            properties: {
                step: {
                    type: "enum",
                    description:
                        "Step id, e.g. subject_extraction, review, done",
                    enum: [
                        "extract-syllabus",
                        "extract-topics",
                        "expand-topics",
                        "generate-topic-graph",
                        "select-subject",
                        "select-topics",
                    ],
                },
            },
            execute: callback,
            required: ["step"],
        },
    };
};
