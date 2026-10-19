import { z } from "zod";
import { DOCUMENT_TYPES as DOCS, DRIVETRAINS, SITUATIONS, TICKET_CATEGORIES, TRUCK_TYPES, VEHICLE_TYPES } from "./constants";

type NonEmpty = [string, ...string[]];
const values = <T extends readonly { value: string }[]>(list: T) => list.map((x) => x.value) as unknown as NonEmpty;

export const SITUATION_VALUES = values(SITUATIONS);
export const VEHICLE_TYPE_VALUES = values(VEHICLE_TYPES);
export const TRUCK_TYPE_VALUES = values(TRUCK_TYPES);
export const DOCUMENT_TYPES = values(DOCS);
export const TICKET_CATEGORY_VALUES = values(TICKET_CATEGORIES);
export const DRIVERS_OR_NULL = z
  .enum(DRIVETRAINS)
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null))
  .transform((v) => v ?? null);
