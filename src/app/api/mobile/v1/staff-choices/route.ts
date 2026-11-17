import { handle } from "../_lib";

export function POST(request: Request) {
  return handle(request, async (call) => call.api.staffChoices(await call.body()));
}
