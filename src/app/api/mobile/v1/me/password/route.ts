import { handle } from "../../_lib";

export function POST(request: Request) {
  return handle(request, async (call) => call.api.changePassword(await call.body()));
}
