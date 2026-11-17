import { handle } from "../_lib";

export function GET(request: Request) {
  return handle(request, async (call) => call.api.me());
}

export function PATCH(request: Request) {
  return handle(request, async (call) => call.api.updateMe(await call.body()));
}

export function DELETE(request: Request) {
  return handle(request, async (call) => call.api.deleteMe(await call.body()));
}
