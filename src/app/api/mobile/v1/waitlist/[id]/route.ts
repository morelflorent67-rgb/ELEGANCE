import { handle } from "../../_lib";

export async function DELETE(request: Request, ctx: RouteContext<"/api/mobile/v1/waitlist/[id]">) {
  const { id } = await ctx.params;
  return handle(request, async (call) => call.api.leaveWaitlist(id));
}
