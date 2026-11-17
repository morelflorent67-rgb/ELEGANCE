import { handle } from "../../../_lib";

export async function POST(request: Request, ctx: RouteContext<"/api/mobile/v1/appointments/[id]/reschedule">) {
  const { id } = await ctx.params;
  return handle(request, async (call) => call.api.reschedule(id, await call.body()));
}
