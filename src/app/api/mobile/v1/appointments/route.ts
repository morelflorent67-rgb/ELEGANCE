import { handle } from "../_lib";

export function GET(request: Request) {
  return handle(request, async (call) => call.api.appointments());
}

export function POST(request: Request) {
  return handle(request, async (call) => call.api.book(await call.body()));
}
