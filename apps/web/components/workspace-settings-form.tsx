"use client";

import { Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Card } from "@marlow/ui";

export function WorkspaceSettingsForm({ settings }: { settings: { name: string; slug: string } }) {
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/settings/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.get("name"), slug: form.get("slug") }),
    });
    const result = (await response.json()) as {
      data?: { message?: string };
      error?: { message: string };
    };
    setNotice(
      response.ok
        ? (result.data?.message ?? "Workspace saved.")
        : (result.error?.message ?? "Could not save workspace."),
    );
    setSaving(false);
  }
  return (
    <Card className="settings-card">
      <form onSubmit={save}>
        {notice ? (
          <div className="status-banner" role="status" style={{ margin: 16 }}>
            {notice}
          </div>
        ) : null}
        <section className="settings-section">
          <h2>Organization</h2>
          <p>All campaign data, integrations, and suppressions are isolated to this workspace.</p>
          <div className="field">
            <label htmlFor="workspaceName">Workspace name</label>
            <input
              className="input"
              id="workspaceName"
              name="name"
              defaultValue={settings.name}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="workspaceSlug">Workspace slug</label>
            <input
              className="input"
              id="workspaceSlug"
              name="slug"
              defaultValue={settings.slug}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              required
            />
          </div>
        </section>
        <div className="settings-actions">
          <Button type="submit" disabled={saving}>
            <Save size={14} />
            {saving ? "Saving…" : "Save workspace"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
