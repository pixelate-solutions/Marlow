import { isDemoMode, requireAuth } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  const { id } = await params;
  const encoder = new TextEncoder();
  const lastHeader = Number(request.headers.get("last-event-id") ?? 0);
  if (isDemoMode()) {
    const stream = new ReadableStream({
      start(controller) {
        const events = [
          { id: 1, message: "Searching for matching companies." },
          { id: 2, message: "Reviewing 34 potential accounts." },
          { id: 3, message: "Researching Acme Automation." },
          { id: 4, message: "Ready for approval." },
        ];
        events
          .filter((event) => event.id > lastHeader)
          .forEach((event) =>
            controller.enqueue(
              encoder.encode(
                `id: ${event.id}\nevent: progress\ndata: ${JSON.stringify(event)}\n\n`,
              ),
            ),
          );
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }
  const supabase = await createSupabaseServerClient();
  let lastId = lastHeader;
  const stream = new ReadableStream({
    async start(controller) {
      const deadline = Date.now() + 55_000;
      while (Date.now() < deadline && !request.signal.aborted) {
        const { data } = await supabase
          .from("agent_run_events")
          .select("sequence,event_type,public_message,data,created_at")
          .eq("campaign_id", id)
          .eq("organization_id", auth.organizationId)
          .gt("sequence", lastId)
          .order("sequence", { ascending: true })
          .limit(100);
        for (const event of data ?? []) {
          lastId = Number(event.sequence);
          controller.enqueue(
            encoder.encode(
              `id: ${event.sequence}\nevent: ${event.event_type.toLowerCase()}\ndata: ${JSON.stringify({ message: event.public_message, data: event.data, createdAt: event.created_at })}\n\n`,
            ),
          );
        }
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
