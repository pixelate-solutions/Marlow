export type DiscoveryHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export function shouldStoreDiscoveryAnswer(
  messages: DiscoveryHistoryMessage[],
  content: string,
): boolean {
  const lastMessage = messages[messages.length - 1];
  return !(lastMessage?.role === "user" && lastMessage.content.trim() === content.trim());
}
