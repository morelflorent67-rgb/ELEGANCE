import { handle } from "../_lib";

export function GET(request: Request) {
  return handle(request, async (call) => call.api.vitrine());
}
