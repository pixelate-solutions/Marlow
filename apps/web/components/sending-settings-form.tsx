"use client";

import { Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@marlow/ui";
import type { demoSendingSettings } from "@/lib/demo-data";

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function SendingSettingsForm({ settings }: { settings: typeof demoSendingSettings }) {
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const data = new FormData(event.currentTarget);
    const payload = {
      senderName: data.get("senderName"),
      senderTitle: data.get("senderTitle"),
      postalAddress: data.get("postalAddress"),
      unsubscribeText: data.get("unsubscribeText"),
      unsubscribeUrl: data.get("unsubscribeUrl"),
      dailyLimit: Number(data.get("dailyLimit")),
      organizationDailyLimit: Number(data.get("organizationDailyLimit")),
      quietHoursStart: data.get("quietHoursStart"),
      quietHoursEnd: data.get("quietHoursEnd"),
      timezone: data.get("timezone"),
      allowedDays: days
        .map((_, index) => index)
        .filter((index) => data.get(`day-${index}`) === "on"),
    };
    const response = await fetch("/api/settings/sending", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as { error?: { message: string } };
    setNotice(
      response.ok
        ? "Sending guardrails saved."
        : (result.error?.message ?? "Could not save settings."),
    );
    setSaving(false);
  }
  return (
    <form className="card settings-card" onSubmit={save}>
      {notice ? (
        <div className="status-banner" role="status" style={{ margin: 16 }}>
          {notice}
        </div>
      ) : null}
      <section className="settings-section">
        <h2>Sender identity</h2>
        <p>This identity and postal address appear in every approved message.</p>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="senderName">Sender name</label>
            <input
              className="input"
              id="senderName"
              name="senderName"
              defaultValue={settings.senderName}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="senderTitle">Job title</label>
            <input
              className="input"
              id="senderTitle"
              name="senderTitle"
              defaultValue={settings.senderTitle}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="postalAddress">Valid postal address</label>
          <input
            className="input"
            id="postalAddress"
            name="postalAddress"
            defaultValue={settings.postalAddress}
            required
          />
        </div>
      </section>
      <section className="settings-section">
        <h2>Opt-out footer</h2>
        <p>Use a plain-language reply opt-out, a URL, or both.</p>
        <div className="field">
          <label htmlFor="unsubscribeText">Unsubscribe text</label>
          <input
            className="input"
            id="unsubscribeText"
            name="unsubscribeText"
            defaultValue={settings.unsubscribeText}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="unsubscribeUrl">
            Unsubscribe URL <span className="field__hint">optional</span>
          </label>
          <input
            className="input"
            id="unsubscribeUrl"
            name="unsubscribeUrl"
            type="url"
            defaultValue={settings.unsubscribeUrl}
            placeholder="https://example.com/unsubscribe"
          />
        </div>
      </section>
      <section className="settings-section">
        <h2>Volume limits</h2>
        <p>The lower campaign, mailbox, and organization limit always wins.</p>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="dailyLimit">Per-mailbox daily limit</label>
            <input
              className="input"
              id="dailyLimit"
              name="dailyLimit"
              type="number"
              min="1"
              max="500"
              defaultValue={settings.dailyLimit}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="organizationDailyLimit">Organization daily limit</label>
            <input
              className="input"
              id="organizationDailyLimit"
              name="organizationDailyLimit"
              type="number"
              min="1"
              max="5000"
              defaultValue={settings.organizationDailyLimit}
              required
            />
          </div>
        </div>
      </section>
      <section className="settings-section">
        <h2>Sending schedule</h2>
        <p>
          Marlow blocks sends outside these allowed windows and asks the reviewer to try again
          later.
        </p>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="quietHoursStart">Quiet hours start</label>
            <input
              className="input"
              id="quietHoursStart"
              name="quietHoursStart"
              type="time"
              defaultValue={settings.quietHoursStart}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="quietHoursEnd">Quiet hours end</label>
            <input
              className="input"
              id="quietHoursEnd"
              name="quietHoursEnd"
              type="time"
              defaultValue={settings.quietHoursEnd}
              required
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="timezone">Timezone</label>
          <select className="select" id="timezone" name="timezone" defaultValue={settings.timezone}>
            <option value="America/Detroit">America/Detroit</option>
            <option value="America/New_York">America/New_York</option>
            <option value="America/Chicago">America/Chicago</option>
            <option value="America/Los_Angeles">America/Los_Angeles</option>
            <option value="UTC">UTC</option>
          </select>
        </div>
        <div className="field">
          <label>Allowed sending days</label>
          <div className="checkboxes">
            {days.map((day, index) => (
              <label className="check-chip" key={day}>
                <input
                  type="checkbox"
                  name={`day-${index}`}
                  defaultChecked={settings.allowedDays.includes(index)}
                />
                <span>{day}</span>
              </label>
            ))}
          </div>
        </div>
      </section>
      <div className="settings-actions">
        <Button type="submit" disabled={saving}>
          <Save size={14} />
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
