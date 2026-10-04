// Extract the text to store and announce from a webhook body.
//
// - Plain text is used as-is (TradingView's default).
// - A JSON object with a string "text" field uses that field.
// - A JSON object with exactly one string value uses that value, whatever its key.
//   iOS Shortcuts' "Get Contents of URL" with a JSON body sends e.g.
//   {"":"iPhone is fully charged"}, which would otherwise be stored and spoken raw.
// - Anything else (arrays, multi-field objects, invalid JSON) falls back to the raw body.
//
// JSON is detected from the body itself, not the Content-Type header, because
// Shortcuts and other senders don't always set it.
export function extractAlertText(rawBody: string): string {
    const trimmed = rawBody.trim();
    if (!trimmed.startsWith("{")) return rawBody;

    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch {
        return rawBody;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return rawBody;

    const obj = parsed as Record<string, unknown>;
    if (typeof obj.text === "string" && obj.text.trim()) return obj.text;

    const values = Object.values(obj);
    if (values.length === 1 && typeof values[0] === "string" && values[0].trim()) {
        return values[0];
    }

    return rawBody;
}
