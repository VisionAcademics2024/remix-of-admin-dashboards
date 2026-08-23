/**
 * Domain vocabulary for Vision Admin.
 *
 * Entity shapes, enums and human labels live here so that screens depend on
 * the domain rather than on a data-access module. The definitions currently
 * live in `src/lib/vision/types.ts` (written against the spec schema) and are
 * re-exported unchanged — this keeps one source of truth while the import path
 * moves. Later checkpoints add value objects and view-model types here.
 */
export * from "@/lib/vision/types";
