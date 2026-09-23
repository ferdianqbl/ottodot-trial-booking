import { router } from "@/server/trpc";
import { RosterService } from "./roster.service";

export const rosterRouter = router({
  ...RosterService,
});
