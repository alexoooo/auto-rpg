import { serve, type Port } from "./serve.ts";

/** The world's worker (`serve`): its scope is its port to the page that made it (`openWorld`, `client.ts`). */
serve(self as unknown as Port, () => self.close());
