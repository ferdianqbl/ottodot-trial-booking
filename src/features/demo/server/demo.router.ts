import { router } from "@/server/trpc";
import { DemoService } from "./demo.service";

export const demoRouter = router({
  ...DemoService,
});
