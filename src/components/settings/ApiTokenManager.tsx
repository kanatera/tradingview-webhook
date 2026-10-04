"use client";

import { useState, useEffect } from "react";

export default function ApiTokenManager() {
    const [token, setToken] = useState("");
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);

    const fetchToken = async () => {
        const res = await fetch("/api/settings/api-token");
        if (res.ok) {
            const data = await res.json();
            setToken(data.token);
        }
    };

    const regenerate = async () => {
        if (token && !confirm("Generate a new token? The current one stops working immediately.")) return;
        setBusy(true);
        try {
            const res = await fetch("/api/settings/api-token", { method: "POST" });
            if (res.ok) {
                const data = await res.json();
                setToken(data.token);
            }
        } finally {
            setBusy(false);
        }
    };

    const revoke = async () => {
        if (!confirm("Revoke the token? Dashboards using it will stop working.")) return;
        setBusy(true);
        try {
            await fetch("/api/settings/api-token", { method: "DELETE" });
            setToken("");
        } finally {
            setBusy(false);
        }
    };

    // navigator.clipboard needs a secure context; the app is usually served over
    // plain-HTTP LAN, so fall back to selecting the text via execCommand.
    const copy = async () => {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(token);
            } else {
                const el = document.createElement("textarea");
                el.value = token;
                document.body.appendChild(el);
                el.select();
                document.execCommand("copy");
                document.body.removeChild(el);
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // ignore; the token is visible for manual copy
        }
    };

    useEffect(() => {
        fetchToken();
    }, []);

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-warm-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-warm-200">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                        <span className="text-base">🔑</span>
                    </div>
                    <h2 className="font-semibold text-gray-900">Read-only API Token</h2>
                </div>
            </div>
            <div className="p-5 space-y-3 max-w-2xl">
                <p className="text-xs text-gray-500">
                    Lets external dashboards (e.g. Homepage) read recent alerts without logging in. Send it as the{" "}
                    <code>X-API-Key</code> header. It only works on <code>GET /api/messages</code>.
                </p>
                <div className="flex items-center gap-3">
                    <input
                        type="text"
                        readOnly
                        value={token}
                        placeholder="No token generated"
                        className="flex-1 px-4 py-2.5 rounded-xl border border-warm-200 bg-warm-50 text-sm font-mono focus:outline-none"
                        onFocus={(e) => e.target.select()}
                    />
                    {token && (
                        <button
                            onClick={copy}
                            className="px-3 py-2.5 rounded-xl text-xs font-semibold border border-warm-200 text-gray-600 hover:bg-warm-100 transition-all"
                        >
                            {copied ? "✓ Copied" : "Copy"}
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={regenerate}
                        disabled={busy}
                        className="px-5 py-2 rounded-xl text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 transition-all shadow-sm"
                    >
                        {token ? "Regenerate" : "Generate Token"}
                    </button>
                    {token && (
                        <button
                            onClick={revoke}
                            disabled={busy}
                            className="px-4 py-2 rounded-xl text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-all"
                        >
                            Revoke
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
