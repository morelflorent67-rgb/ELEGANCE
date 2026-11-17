import { handle } from "../../../../_lib";

export async function POST(request: Request, ctx: RouteContext<"/api/mobile/v1/waitlist/offers/[id]/decline">) {
  const { id } = await ctx.params;
  return handle(request, async (call) => call.api.declineOffer(id));
}
