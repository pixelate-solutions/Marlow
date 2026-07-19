"use client";

import { Plus, Search, ShieldX, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@marlow/ui";
import type { demoSuppressions } from "@/lib/demo-data";

type Entry = (typeof demoSuppressions)[number];

export function SuppressionManager({ initialEntries }: { initialEntries: Entry[] }) {
  const [entries, setEntries] = useState(initialEntries);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      type: data.get("type"),
      value: data.get("value"),
      reason: data.get("reason"),
    };
    const response = await fetch("/api/settings/suppression", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as { data?: Entry; error?: { message: string } };
    if (response.ok && result.data) {
      setEntries((current) => [result.data!, ...current]);
      setAdding(false);
      setNotice("Suppression added. It applies immediately.");
    } else setNotice(result.error?.message ?? "Could not add suppression.");
  }
  async function remove(entry: Entry) {
    const response = await fetch(`/api/settings/suppression/${encodeURIComponent(entry.id)}`, {
      method: "DELETE",
    });
    const result = (await response.json()) as { error?: { message: string } };
    if (response.ok) {
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      setNotice("Suppression removed.");
    } else setNotice(result.error?.message ?? "Could not remove suppression.");
  }
  const visibleEntries = entries.filter((entry) =>
    `${entry.type} ${entry.value} ${entry.reason} ${entry.source}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="suppression-toolbar">
        <div className="search-box">
          <Search />
          <input
            className="input"
            placeholder="Search suppressions"
            aria-label="Search suppressions"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Button onClick={() => setAdding((value) => !value)}>
          <Plus size={14} />
          Add suppression
        </Button>
      </div>
      {notice ? (
        <div className="status-banner" role="status">
          {notice}
        </div>
      ) : null}
      {adding ? (
        <form className="card settings-section" onSubmit={add} style={{ marginBottom: 15 }}>
          <h2>Block a recipient or account</h2>
          <p>
            Suppression is deterministic and takes effect before enrichment, drafting, and sending.
          </p>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="type">Type</label>
              <select className="select" id="type" name="type" defaultValue="EMAIL">
                <option>EMAIL</option>
                <option>DOMAIN</option>
                <option>APOLLO_PERSON_ID</option>
                <option>APOLLO_CONTACT_ID</option>
                <option>COMPANY</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="value">Value</label>
              <input className="input" id="value" name="value" required />
            </div>
          </div>
          <div className="field">
            <label htmlFor="reason">Reason</label>
            <input className="input" id="reason" name="reason" required />
          </div>
          <Button type="submit">
            <ShieldX size={14} />
            Add block
          </Button>
        </form>
      ) : null}
      <div className="card" style={{ overflow: "hidden" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Value</th>
              <th>Reason</th>
              <th>Source</th>
              <th>Added</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleEntries.map((entry) => (
              <tr key={entry.id}>
                <td>
                  <span className="badge badge--warning">{entry.type}</span>
                </td>
                <td className="code-value">{entry.value}</td>
                <td>{entry.reason}</td>
                <td>{entry.source}</td>
                <td>{entry.createdAt}</td>
                <td>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`Remove suppression for ${entry.value}`}
                    onClick={() => void remove(entry)}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
