import "reflect-metadata";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Logger } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asset } from "../dist/notify/assets.js";
import { EmailAssetsController } from "../dist/notify/email-assets.controller.js";
import { LEGAL_PLACEHOLDER, SUPPORT_PLACEHOLDER } from "../dist/notify/email-config.js";
import { composeMail } from "../dist/notify/kinds/registry.js";
import { NotifyService } from "../dist/notify/notify.service.js";
import {
  RecordingMailerAdapter,
  recordedMails,
  resetRecordedMails,
} from "../dist/notify/recording-mailer.adapter.js";
import { renderMail } from "../dist/notify/template/render.js";
import type { BodyPart, MailDefinition } from "../dist/notify/template/types.js";

const CONFIG = {
  assetBaseUrl: "https://assets.test/email",
  supportAddress: "hjaelp@example.test",
  legalLine: "Eksempel ApS, Eksempelvej 1, CVR 00000000",
};

/** Visible text only: the style block, tags and images are dropped, as with images blocked. */
function visibleText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<img[^>]*>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&zwnj;/g, " ")
    .replace(/\s+/g, " ");
}

describe("Notify, login code mail (01)", () => {
  const env = { ...process.env };

  beforeEach(() => {
    resetRecordedMails();
    process.env.EMAIL_ASSET_BASE_URL = CONFIG.assetBaseUrl;
    delete process.env.EMAIL_SUPPORT_ADDRESS;
    delete process.env.EMAIL_LEGAL_LINE;
    process.env.IDENTITY_CODE_EXPIRY_MINUTES = "10";
  });

  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  async function sendCode(code = "483920") {
    await new NotifyService(new RecordingMailerAdapter()).send({
      kind: "code",
      to: "collector@example.com",
      data: { code },
    });
    const mail = recordedMails.at(-1);
    if (!mail) {
      throw new Error("no mail was recorded");
    }
    return mail;
  }

  it("hands the mailer one finished mail", async () => {
    const mail = await sendCode();
    expect(Object.keys(mail).sort()).toEqual(["html", "preheader", "subject", "text", "to"]);
    expect(recordedMails).toHaveLength(1);
    expect(mail.to).toBe("collector@example.com");
  });

  it("leads the subject with the code and keeps the preheader free of it", async () => {
    const mail = await sendCode();
    expect(mail.subject).toBe("483920 er din kode");
    expect(mail.preheader.length).toBeGreaterThan(0);
    expect(mail.preheader).not.toContain("483920");
  });

  it("carries the same facts in the text body and the HTML", async () => {
    const mail = await sendCode();
    const shown = visibleText(mail.html);
    for (const fact of [
      "483920",
      "Din kode",
      "Gælder i 10 minutter.",
      "Skriv koden i appen for at fortsætte.",
      "Har du ikke bedt om en kode? Så kan du se bort fra mailen.",
      "Du får denne mail, fordi nogen bad om en kode til denne adresse.",
      "Den kan ikke slås fra.",
    ]) {
      expect(mail.text).toContain(fact);
      expect(shown).toContain(fact);
    }
  });

  it("uses board 2, in both schemes and at phone size, with alt text and no button", async () => {
    const { html } = await sendCode();
    for (const scheme of ["light", "dark"] as const) {
      for (const phone of [false, true]) {
        expect(html).toContain(`${CONFIG.assetBaseUrl}/${asset.board(2, scheme, phone)}`);
      }
    }
    expect(html).not.toContain("/board-1-");
    expect(html).not.toContain("/board-3-");
    expect(html).toContain('alt="KitCollective"');
    expect(html).toContain('alt="Taktisk tavle: midtbane"');
    expect(html).not.toContain(`class="btn-link"`);
  });

  it("styles dark through prefers-color-scheme and the phone through a width query", async () => {
    const { html } = await sendCode();
    expect(html).toMatch(/@media \(prefers-color-scheme: dark\)/);
    expect(html).toMatch(/@media \(max-width:600px\)/);
    expect(html).toContain("#1F1F1F");
  });

  it("still shows the headline and the code when every image is blocked", async () => {
    const shown = visibleText((await sendCode()).html);
    expect(shown).toContain("Din kode");
    expect(shown).toContain("483920");
  });

  it("shows flagged placeholders for the legal line and the support address until supplied", async () => {
    const mail = await sendCode();
    for (const body of [mail.html, mail.text]) {
      expect(body).toContain(LEGAL_PLACEHOLDER);
      expect(body).toContain(SUPPORT_PLACEHOLDER);
    }
  });

  it("takes the legal line and the support address from configuration", async () => {
    process.env.EMAIL_LEGAL_LINE = CONFIG.legalLine;
    process.env.EMAIL_SUPPORT_ADDRESS = CONFIG.supportAddress;
    const mail = await sendCode();
    expect(mail.text).toContain(CONFIG.legalLine);
    expect(mail.html).toContain(CONFIG.supportAddress);
    expect(mail.html).not.toContain(LEGAL_PLACEHOLDER);
  });

  it("states the validity from the configured expiry", async () => {
    process.env.IDENTITY_CODE_EXPIRY_MINUTES = "15";
    expect((await sendCode()).text).toContain("15 minutter");
  });

  it("writes no code and no mail body to any log", async () => {
    const lines: string[] = [];
    const capture = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    for (const level of ["log", "warn", "error", "debug", "info"] as const) {
      vi.spyOn(console, level).mockImplementation(capture);
    }
    for (const level of ["log", "warn", "error", "debug", "verbose"] as const) {
      vi.spyOn(Logger.prototype, level).mockImplementation(capture);
      vi.spyOn(Logger, level).mockImplementation(capture);
    }
    const mail = await sendCode("951357");
    expect(lines.join("\n")).not.toContain("951357");
    expect(lines.join("\n")).not.toContain(mail.text);
  });
});

describe("Notify, confirm new e-mail mail (02)", () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.EMAIL_ASSET_BASE_URL = CONFIG.assetBaseUrl;
    process.env.IDENTITY_CODE_EXPIRY_MINUTES = "10";
  });

  afterEach(() => {
    process.env = { ...env };
  });

  const compose = () =>
    composeMail({ kind: "email-change-code", to: "new@example.com", data: { code: "620417" } });

  it("leads the subject with the code and keeps the preheader free of it", () => {
    const mail = compose();
    expect(mail.subject).toBe("620417 bekræfter din nye e-mail");
    expect(mail.preheader).not.toContain("620417");
  });

  it("shows the locked headline, the code and the expiry in the text and the HTML, with no button", () => {
    const mail = compose();
    const shown = visibleText(mail.html);
    for (const fact of ["Bekræft din nye e-mail", "620417", "Gælder i 10 minutter."]) {
      expect(mail.text).toContain(fact);
      expect(shown).toContain(fact);
    }
    expect(mail.html).toContain(`${CONFIG.assetBaseUrl}/${asset.board(2, "light", false)}`);
    expect(mail.html).not.toContain(`class="btn-link"`);
  });
});

describe("Notify, legacy verify and reset mails", () => {
  it("keep the old subject and carry the link as the text body", () => {
    const url = "https://api.test/verify?token=abc";
    const verify = composeMail({ kind: "verify", to: "a@example.com", data: { url } });
    const reset = composeMail({ kind: "reset", to: "a@example.com", data: { url } });
    expect(verify.subject).toBe("Bekræft din e-mail");
    expect(reset.subject).toBe("Nulstil adgangskode");
    for (const mail of [verify, reset]) {
      expect(mail.text).toBe(url);
      expect(mail.html).toContain(url);
    }
  });
});

describe("Template body parts", () => {
  type Data = { value: string };
  const base: MailDefinition<Data> = {
    board: 1,
    subject: () => "Emne",
    preheader: () => "Forhåndsvisning",
    headline: "Overskrift",
    supportingLine: () => "Støttelinje",
    parts: () => [],
    footerReason: "Fordi.",
  };
  const render = (definition: Partial<MailDefinition<Data>>) =>
    renderMail({ ...base, ...definition }, { value: "x" }, CONFIG);

  it("renders Code", () => {
    const mail = render({ parts: () => [{ part: "code", code: "123456" }] });
    expect(visibleText(mail.html)).toContain("123456");
    expect(mail.text).toContain("123456");
  });

  it("renders Jersey with club, meta and a photo when there is one", () => {
    const mail = render({
      parts: () => [
        {
          part: "jersey",
          club: "FC København",
          meta: "Hjemme · 2024/25",
          photoUrl: "https://p.test/1.jpg",
        },
      ],
    });
    expect(visibleText(mail.html)).toContain("FC København");
    expect(visibleText(mail.html)).toContain("Hjemme · 2024/25");
    expect(mail.html).toContain("https://p.test/1.jpg");
    expect(mail.text).toContain("FC København\nHjemme · 2024/25");
  });

  it("opens with a 28 gap after a Jersey and 24 otherwise", () => {
    const jersey = render({ parts: () => [{ part: "jersey", club: "A", meta: "B" }] });
    const text = render({ parts: () => [{ part: "text", text: "T" }] });
    expect(jersey.html).toContain('<td style="padding-top:28px;">');
    expect(text.html).toContain('<td style="padding-top:24px;">');
    expect(text.html).not.toContain('<td style="padding-top:28px;">');
  });

  it("renders Fact rows, with the amount in mono", () => {
    const mail = render({
      parts: () => [
        {
          part: "factRows",
          rows: [
            { label: "Bud", value: "1.250 kr", mono: true },
            { label: "Fra", value: "samler42" },
          ],
        },
      ],
    });
    const shown = visibleText(mail.html);
    for (const fact of ["Bud", "1.250 kr", "Fra", "samler42"]) {
      expect(shown).toContain(fact);
    }
    expect(mail.text).toContain("Bud: 1.250 kr\nFra: samler42");
    expect(mail.html).toMatch(/SF Mono[^"]*font-size:20px[^"]*">1\.250 kr/);
  });

  it("renders Message, Text and Note", () => {
    const mail = render({
      parts: () => [
        { part: "message", text: "Er den stadig til salg?" },
        { part: "text", text: "En almindelig linje." },
        { part: "note", text: "En lille note." },
      ],
    });
    for (const line of ["Er den stadig til salg?", "En almindelig linje.", "En lille note."]) {
      expect(visibleText(mail.html)).toContain(line);
      expect(mail.text).toContain(line);
    }
  });

  it("renders the one Button as a full-width link", () => {
    const mail = render({ button: { label: "Se buddet", target: () => "https://app.test/bud/1" } });
    expect(mail.html).toMatch(/<a [^>]*href="https:\/\/app\.test\/bud\/1"[^>]*>Se buddet<\/a>/);
    expect(mail.text).toContain("Se buddet: https://app.test/bud/1");
  });

  it("rejects a definition that carries a button among its parts", () => {
    // Parsed JSON is untyped, which is how a stray button would reach a definition at runtime.
    const stray: BodyPart[] = JSON.parse(
      '[{"part":"button","label":"Ét","url":"https://app.test/1"}]',
    );
    expect(() =>
      render({ parts: () => stray, button: { label: "To", target: () => "https://app.test/2" } }),
    ).toThrow(/Unsupported body part/);
  });

  it("escapes what a caller supplies", () => {
    const mail = render({ parts: () => [{ part: "text", text: "<script>alert(1)</script>" }] });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});

describe("Email asset controller", () => {
  let app: NestFastifyApplication;
  let directory: string;
  const env = { ...process.env };

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "email-assets-"));
    await writeFile(
      path.join(directory, asset.lockup("light")),
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
    await writeFile(path.join(directory, "secret.png"), "not for mail");
    process.env.EMAIL_ASSET_DIR = directory;
    const moduleRef = await Test.createTestingModule({
      controllers: [EmailAssetsController],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix("v1");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
    process.env = { ...env };
  });

  const get = (file: string) => app.inject({ method: "GET", url: `/v1/email/assets/${file}` });

  it("serves a known file as a public, immutable PNG", async () => {
    const response = await get(asset.lockup("light"));
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("image/png");
    expect(response.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  it("answers 404 for a manifest name with no file, an unknown name and a traversal", async () => {
    expect((await get(asset.lockup("dark"))).statusCode).toBe(404);
    expect((await get("secret.png")).statusCode).toBe(404);
    expect((await get("..%2F..%2Fpackage.json")).statusCode).toBe(404);
    expect((await get("..%2Fsecret.png")).statusCode).toBe(404);
  });
});
