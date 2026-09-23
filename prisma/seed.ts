import prisma from "../src/lib/db/prisma";
import { DEMO, seedDemoData } from "../src/features/demo/server/demo.seed";

await seedDemoData(prisma);
console.log(`Seeded ${DEMO.parents.length} parents, ${DEMO.students.length} children, ${DEMO.classes.length} classes:`);
console.log("  cls_open       1/4 confirmed; Aisha's payment was declined (not on the roster)");
console.log("  cls_last_seat  3/4 confirmed — the last-seat race; Arjun is the duplicate-booking case");
console.log("  cls_full       4/4 confirmed");
console.log("  cls_puzzle     0/4");
await prisma.$disconnect();
