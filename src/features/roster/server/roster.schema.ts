import { z } from "zod";

export const classIdSchema = z.object({ classId: z.string().min(1) });
export type TClassIdInput = z.infer<typeof classIdSchema>;
