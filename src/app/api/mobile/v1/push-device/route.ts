import { handle } from "../_lib";

export function POST(request: Request) {
  return handle(request, async (call) => call.api.registerPushDevice(await call.body()));
}

export function DELETE(request: Request) {
  return handle(request, async (call) => call.api.unregisterPushDevice(await call.body()));
}
