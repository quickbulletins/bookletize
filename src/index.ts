/**
 * bookletize — zero-dependency imposition math.
 * The PDF applier lives behind the `bookletize/pdf` subpath so importing
 * these pure mappings costs nothing.
 */
export { imposeSaddle, imposeTrifold } from "./impose.js";
export type { SheetFaces, SlotPage, TrifoldFaces } from "./impose.js";
