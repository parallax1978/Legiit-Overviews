import { handler } from "../_shared/http.ts";
import { handle } from "./handler.ts";

Deno.serve(handler(handle));
