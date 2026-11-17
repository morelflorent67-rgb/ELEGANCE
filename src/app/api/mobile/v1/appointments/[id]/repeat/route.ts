import { handle } from "../../../_lib";

export async function GET(request: Request, ctx: RouteContext<"/api/mobile/v1/appointments/[id]/repeat">) {
  const { id } = await ctx.params;
  return handle(request, async (call) => call.api.repeatSource(id));
}
