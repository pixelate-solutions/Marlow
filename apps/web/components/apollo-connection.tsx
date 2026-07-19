"use client";

import { Link2, LoaderCircle, Unplug } from "lucide-react";
import { useState } from "react";
import { Button } from "@marlow/ui";

export function ApolloConnection({ connected = false }: { connected?: boolean }) {
  const [status, setStatus] = useState<"connected" | "disconnected" | "loading">(
    connected ? "connected" : "disconnected",
  );
  const [message, setMessage] = useState("");
  async function connect() {
    setStatus("loading");
    const response = await fetch("/api/integrations/apollo/connect", { method: "POST" });
    const payload = (await response.json()) as {
      data?: { authorizationUrl?: string; demo?: boolean };
      error?: { message: string };
    };
    if (!response.ok) {
      setStatus("disconnected");
      setMessage(payload.error?.message ?? "Connection failed.");
      return;
    }
    if (payload.data?.authorizationUrl) window.location.assign(payload.data.authorizationUrl);
    else {
      setStatus("connected");
      setMessage("Demo Apollo adapter connected. No external account was changed.");
    }
  }
  async function disconnect() {
    setStatus("loading");
    const response = await fetch("/api/integrations/apollo", { method: "DELETE" });
    setStatus(response.ok ? "disconnected" : "connected");
    setMessage(
      response.ok ? "Apollo access was revoked locally." : "Apollo could not be disconnected.",
    );
  }
  return (
    <div>
      {message ? (
        <div className="status-banner" role="status">
          {message}
        </div>
      ) : null}
      {status === "connected" ? (
        <Button variant="secondary" onClick={disconnect}>
          <Unplug size={14} />
          Disconnect
        </Button>
      ) : (
        <Button onClick={connect} disabled={status === "loading"}>
          {status === "loading" ? <LoaderCircle size={14} /> : <Link2 size={14} />}
          {status === "loading" ? "Connecting…" : "Connect Apollo"}
        </Button>
      )}
    </div>
  );
}
