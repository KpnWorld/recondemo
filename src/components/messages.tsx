import { messageAction } from "@/app/actions/customer";
import { LocalTime, SubmitButton } from "./client";
import { Textarea, cx } from "./ui";

type Msg = {
  id: string;
  body: string;
  createdAt: Date;
  sender: { id: string; name: string; role: string };
};

/** In-app messaging between customer and assigned provider (phone numbers stay private). */
export function MessagesPanel({ requestId, messages, viewerId, canSend, back }: { requestId: string; messages: Msg[]; viewerId: string; canSend: boolean; back: string }) {
  return (
    <div id="messages" className="scroll-mt-24">
      {messages.length ? (
        <ol className="max-h-80 space-y-2 overflow-y-auto rounded-2xl bg-soft p-3" aria-label="Messages">
          {messages.map((m) => {
            const mine = m.sender.id === viewerId;
            return (
              <li key={m.id} className={cx("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cx("max-w-[85%] rounded-2xl px-3.5 py-2 text-sm", mine ? "bg-deep text-white" : "bg-white text-ink ring-1 ring-line")}>
                  <p className={cx("text-xs", mine ? "text-white/70" : "text-ink-muted")}>
                    {mine ? "You" : m.sender.role === "ADMIN" ? "Call Recon support" : m.sender.name.split(" ")[0]} · <LocalTime iso={m.createdAt.toISOString()} mode="time" />
                  </p>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-ink-muted">No messages yet.</p>
      )}
      {canSend ? (
        <form action={messageAction} className="mt-3 flex items-end gap-2">
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="back" value={back} />
          <label htmlFor="msg-body" className="sr-only">
            Message
          </label>
          <Textarea id="msg-body" name="body" required maxLength={1000} rows={1} className="min-h-12 flex-1" placeholder="Type a message" />
          <SubmitButton pendingText="Sending">Send</SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
