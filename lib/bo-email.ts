interface BoEmailAction {
  label: string;
  href: string;
}

interface BoEmailInput {
  name?: string | null;
  preview?: string;
  paragraphs: string[];
  action?: BoEmailAction;
  footer?: string;
  footerAction?: BoEmailAction;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
}

function firstName(value?: string | null): string {
  const name = value?.trim().split(/\s+/)[0]?.slice(0, 60);
  return name || "there";
}

export function renderBoEmail(input: BoEmailInput): { html: string; text: string } {
  const name = firstName(input.name);
  const paragraphs = input.paragraphs.map((paragraph) => paragraph.trim()).filter(Boolean);
  const action = input.action;
  const footer = input.footer?.trim();
  const footerAction = input.footerAction;
  const preview = input.preview?.trim();

  const htmlParagraphs = paragraphs
    .map((paragraph) => `<p style="margin:0 0 18px;font-size:16px;line-height:1.65">${escapeHtml(paragraph)}</p>`)
    .join("");
  const htmlAction = action
    ? `<p style="margin:4px 0 28px;font-size:16px;line-height:1.5"><a href="${escapeHtml(action.href)}" style="color:#1a1a1a;font-weight:650;text-decoration:underline;text-underline-offset:3px">${escapeHtml(action.label)}</a></p>`
    : "";
  const htmlFooter = footer || footerAction
    ? `<p style="margin:30px 0 0;padding-top:18px;border-top:1px solid #ece9e2;color:#77736b;font-size:12px;line-height:1.5">${footer ? escapeHtml(footer) : ""}${footer && footerAction ? " " : ""}${footerAction ? `<a href="${escapeHtml(footerAction.href)}" style="color:#77736b;text-decoration:underline">${escapeHtml(footerAction.label)}</a>` : ""}</p>`
    : "";
  const htmlPreview = preview
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preview)}</div>`
    : "";

  const text = [
    `Hey ${name},`,
    "",
    ...paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...(action ? [action.label, action.href, ""] : []),
    "Bo",
    "Your co-founder at Badger AI",
    ...(footer ? ["", footer] : []),
    ...(footerAction ? [footerAction.label, footerAction.href] : []),
  ].join("\n");

  return {
    html: `<!doctype html><html><body style="margin:0;background:#ffffff;color:#1a1a1a">${htmlPreview}<div style="max-width:560px;margin:0 auto;padding:36px 24px 28px;font-family:Arial,Helvetica,sans-serif"><p style="margin:0 0 18px;font-size:16px;line-height:1.65">Hey ${escapeHtml(name)},</p>${htmlParagraphs}${htmlAction}<p style="margin:0;font-size:16px;line-height:1.55">Bo<br><span style="color:#77736b;font-size:13px">Your co-founder at Badger AI</span></p>${htmlFooter}</div></body></html>`,
    text,
  };
}
