"use client";

import { Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Card } from "@marlow/ui";

export function ProfileSettingsForm({
  settings,
}: {
  settings: { fullName: string; jobTitle: string; email: string };
}) {
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/settings/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: form.get("fullName"), jobTitle: form.get("jobTitle") }),
    });
    const result = (await response.json()) as {
      data?: { message?: string };
      error?: { message: string };
    };
    setNotice(
      response.ok
        ? (result.data?.message ?? "Profile saved.")
        : (result.error?.message ?? "Could not save profile."),
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
          <h2>Personal details</h2>
          <p>These details never give the model permission to send.</p>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="fullName">Full name</label>
              <input
                className="input"
                id="fullName"
                name="fullName"
                defaultValue={settings.fullName}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="jobTitle">Job title</label>
              <input
                className="input"
                id="jobTitle"
                name="jobTitle"
                defaultValue={settings.jobTitle}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="profileEmail">Account email</label>
            <input className="input" id="profileEmail" value={settings.email} readOnly />
          </div>
        </section>
        <div className="settings-actions">
          <Button type="submit" disabled={saving}>
            <Save size={14} />
            {saving ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
