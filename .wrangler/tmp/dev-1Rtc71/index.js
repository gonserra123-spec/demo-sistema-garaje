var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// shared/plates.js
var PROVINCES = new Set("A AB AL AV B BA BI BU C CA CC CE CO CR CS CU GC GE GI GR GU H HU IB J L LE LO LU M MA ML MU NA O OR OU P PM PO S SA SE SG SH SO SS T TE TF TO V VA VI Z ZA".split(" "));
var normalizePlate = /* @__PURE__ */ __name((raw) => String(raw ?? "").toUpperCase().replace(/[\s\-.·]/g, ""), "normalizePlate");
function classifyPlate(plate) {
  if (/^\d{4}[BCDFGHJKLMNPRSTVWXYZ]{3}$/.test(plate)) return "es_current";
  const old = /^([A-Z]{1,2})(\d{4}[A-Z]{1,2}|\d{1,6})$/.exec(plate);
  if (old && PROVINCES.has(old[1])) return "es_old";
  if (/^[A-Z0-9]{4,10}$/.test(plate)) return "generic";
  return null;
}
__name(classifyPlate, "classifyPlate");
function formatPlate(plate) {
  const m = /^(\d{4})([A-Z]{3})$/.exec(plate);
  if (m) return `${m[1]} ${m[2]}`;
  const o = /^([A-Z]{1,2})(\d{4})([A-Z]{1,2})$/.exec(plate);
  return o ? `${o[1]} ${o[2]} ${o[3]}` : plate;
}
__name(formatPlate, "formatPlate");

// shared/validate.js
var MIN_TEXT = 10;
var CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
var cleanText = /* @__PURE__ */ __name((v) => String(v ?? "").replace(/\s+/g, " ").trim(), "cleanText");
var normalizePhone = /* @__PURE__ */ __name((v) => String(v ?? "").replace(/[\s\-().]/g, ""), "normalizePhone");
var isPhone = /* @__PURE__ */ __name((v) => /^\+?\d{9,15}$/.test(v), "isPhone");
var isEmail = /* @__PURE__ */ __name((v) => typeof v === "string" && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), "isEmail");
function freeTextError(value, { required = false, min = MIN_TEXT, max = 500 } = {}) {
  const v = cleanText(value);
  if (!v) return required ? "required" : null;
  if (CONTROL.test(String(value))) return "invalid";
  if (v.length < min) return "too_short";
  if (v.length > max) return "too_long";
  return null;
}
__name(freeTextError, "freeTextError");
function validateContact(input) {
  const errors = {};
  const name = cleanText(input.name);
  const workshop = cleanText(input.workshop);
  if (name.length < 2 || name.length > 80) errors.name = name ? "too_short" : "required";
  if (workshop.length < 2 || workshop.length > 80) errors.workshop = workshop ? "too_short" : "required";
  if (!isEmail(cleanText(input.email))) errors.email = cleanText(input.email) ? "email_format" : "required";
  const phone = normalizePhone(input.phone);
  if (phone && !isPhone(phone)) errors.phone = "phone_format";
  const me = freeTextError(input.message, { required: true, max: 1500 });
  if (me) errors.message = me;
  if (input.consent !== true) errors.consent = "required";
  return { ok: Object.keys(errors).length === 0, errors };
}
__name(validateContact, "validateContact");

// shared/emails.js
var EMAIL_KINDS = ["arrived", "ready"];
var T = {
  es: {
    arrived: {
      subject: "Tu coche ya est\xE1 en el taller",
      line: /* @__PURE__ */ __name((shop, plate) => `${shop} te avisa de que tu coche con matr\xEDcula ${plate} ya est\xE1 en el taller.`, "line")
    },
    ready: {
      subject: "Tu coche est\xE1 listo, puedes pasar a recogerlo",
      line: /* @__PURE__ */ __name((shop, plate) => `${shop} te avisa de que tu coche con matr\xEDcula ${plate} ya est\xE1 listo. Puedes pasar a recogerlo.`, "line")
    },
    hello: "Hola:",
    how: "Para ver c\xF3mo va, entra en la consulta del taller e introduce tu matr\xEDcula:",
    why: /* @__PURE__ */ __name((shop) => `Recibes este aviso porque aceptaste recibir avisos sobre tu coche en ${shop}. Es un mensaje autom\xE1tico: no es publicidad.`, "why"),
    stop: "Si no quieres recibir m\xE1s avisos, responde a este correo o d\xEDselo al taller."
  },
  en: {
    arrived: {
      subject: "Your car is now at the workshop",
      line: /* @__PURE__ */ __name((shop, plate) => `${shop} is letting you know that your car with plate ${plate} is now at the workshop.`, "line")
    },
    ready: {
      subject: "Your car is ready to be collected",
      line: /* @__PURE__ */ __name((shop, plate) => `${shop} is letting you know that your car with plate ${plate} is ready. You can come and collect it.`, "line")
    },
    hello: "Hello,",
    how: "To see how it is going, open the workshop\u2019s status page and type your plate:",
    why: /* @__PURE__ */ __name((shop) => `You are receiving this because you agreed to receive updates about your car from ${shop}. This is an automatic message, not advertising.`, "why"),
    stop: "If you do not want any more updates, reply to this email or tell the workshop."
  }
};
var esc = /* @__PURE__ */ __name((s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]), "esc");
function renderEmail({ kind, shop, plate, consultaUrl, lang = "es" }) {
  if (!EMAIL_KINDS.includes(kind)) throw new Error("kind");
  if (/[?&#]/.test(consultaUrl)) throw new Error("url");
  const L = T[lang] || T.es;
  const p = formatPlate(plate);
  const lines = [L.hello, "", L[kind].line(shop, p), "", L.how, consultaUrl, "", "\u2014", L.why(shop), L.stop];
  const text = lines.join("\n");
  const html = `<!doctype html><html lang="${lang}"><body style="margin:0;padding:24px;background:#F4F7FC;font-family:Arial,sans-serif;color:#0E1B2E"><div style="max-width:520px;margin:0 auto;background:#fff;border:1.5px solid #0B2A5B;border-radius:10px;padding:24px"><p style="margin:0 0 16px;font-weight:bold;color:#0B2A5B">${esc(shop)}</p><p style="margin:0 0 12px">${esc(L.hello)}</p><p style="margin:0 0 16px;font-size:17px">${esc(L[kind].line(shop, p))}</p><p style="margin:0 0 8px">${esc(L.how)}</p><p style="margin:0 0 24px"><a href="${esc(consultaUrl)}" style="color:#1F4FB8">${esc(consultaUrl)}</a></p><p style="margin:0;font-size:13px;color:#44567A">${esc(L.why(shop))} ${esc(L.stop)}</p></div></body></html>`;
  return { subject: L[kind].subject, text, html };
}
__name(renderEmail, "renderEmail");

// worker/index.js
var API_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'"
};
var json = /* @__PURE__ */ __name((body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...API_HEADERS, ...extra } }), "json");
function sameOrigin(req, env) {
  const origin = req.headers.get("Origin");
  if (!origin) return false;
  const allowed = /* @__PURE__ */ new Set([new URL(req.url).origin, ...String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean)]);
  return allowed.has(origin) && req.headers.get("X-Requested-With") === "tridom-garage";
}
__name(sameOrigin, "sameOrigin");
async function readJson(req, max = 16384) {
  if (!/^application\/json\b/i.test(req.headers.get("Content-Type") || "")) return null;
  const len = Number(req.headers.get("Content-Length") || 0);
  if (len > max) return null;
  const text = await req.text();
  if (text.length > max) return null;
  try {
    const v = JSON.parse(text || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}
__name(readJson, "readJson");
var mem = /* @__PURE__ */ new Map();
async function allow(binding, key, max, windowMs) {
  if (binding && typeof binding.limit === "function") {
    try {
      const { success } = await binding.limit({ key });
      return success;
    } catch {
    }
  }
  const now = Date.now();
  const list = (mem.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  mem.set(key, list);
  if (mem.size > 5e3) mem.delete(mem.keys().next().value);
  return list.length <= max;
}
__name(allow, "allow");
var ipOf = /* @__PURE__ */ __name((req) => req.headers.get("CF-Connecting-IP") || "unknown", "ipOf");
async function sendResend(env, msg) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(msg)
  });
  return res.ok;
}
__name(sendResend, "sendResend");
var configured = /* @__PURE__ */ __name((v) => typeof v === "string" && v.includes("@") && !/FALTA|example\.(com|invalid|org)/i.test(v), "configured");
async function contact(req, env) {
  if (!await allow(env.CONTACT_LIMITER, `contact:${ipOf(req)}`, 3, 6e4)) return json({ ok: false, error: "rate_limited" }, 429, { "Retry-After": "60" });
  const body = await readJson(req);
  if (!body) return json({ ok: false, error: "invalid" }, 400);
  if (body.website) return json({ ok: true });
  const v = validateContact(body);
  if (!v.ok) return json({ ok: false, error: "validation", errors: v.errors }, 422);
  if (!env.RESEND_API_KEY || !configured(env.CONTACT_TO_EMAIL) || !configured(env.CONTACT_FROM_EMAIL)) return json({ ok: false, error: "not_configured" }, 503);
  const name = cleanText(body.name);
  const shop = cleanText(body.workshop);
  const email = cleanText(body.email).toLowerCase();
  const phone = cleanText(body.phone);
  const message = cleanText(body.message);
  const text = [`Nombre: ${name}`, `Taller: ${shop}`, `Correo: ${email}`, `Tel\xE9fono: ${phone || "\u2014"}`, "", message, "", "\u2014 Enviado desde el formulario de la web de Tridom Automotive. Consentimiento de privacidad: s\xED."].join("\n");
  const ok = await sendResend(env, { from: env.CONTACT_FROM_EMAIL, to: [env.CONTACT_TO_EMAIL], reply_to: email, subject: `Contacto web: ${shop}`.slice(0, 120), text });
  return ok ? json({ ok: true, delivered: true }) : json({ ok: false, error: "generic" }, 502);
}
__name(contact, "contact");
var b64u = /* @__PURE__ */ __name((buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), "b64u");
async function readPanelToken(req, env) {
  const m = /^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(req.headers.get("Authorization") || "");
  if (!m || !env.NOTIFY_TOKEN_SECRET) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.NOTIFY_TOKEN_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = b64u(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(m[1])));
  if (sig.length !== m[2].length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i += 1) diff |= sig.charCodeAt(i) ^ m[2].charCodeAt(i);
  if (diff) return null;
  try {
    const p = JSON.parse(atob(m[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p && typeof p.w === "string" && Number(p.exp) > Date.now() ? p : null;
  } catch {
    return null;
  }
}
__name(readPanelToken, "readPanelToken");
async function notify(req, env) {
  const tok = await readPanelToken(req, env);
  if (!tok) return json({ ok: false, error: "unauthorized" }, 401);
  if (!await allow(env.NOTIFY_LIMITER, `notify:${tok.w}`, 20, 6e4)) return json({ ok: false, error: "rate_limited" }, 429, { "Retry-After": "60" });
  const body = await readJson(req, 4096);
  if (!body) return json({ ok: false, error: "invalid" }, 400);
  const plate = normalizePlate(body.plate);
  const to = cleanText(body.to).toLowerCase();
  if (!EMAIL_KINDS.includes(body.kind) || !isEmail(to) || !classifyPlate(plate) || body.workshopCode !== tok.w) return json({ ok: false, error: "invalid" }, 422);
  let cfg = null;
  try {
    cfg = JSON.parse(env.WORKSHOP_EMAIL_CONFIG || "{}")[tok.w] || null;
  } catch {
    cfg = null;
  }
  if (!env.RESEND_API_KEY || !cfg || !configured(cfg.from)) return json({ ok: false, error: "not_configured" }, 503);
  const mail = renderEmail({ kind: body.kind, shop: cfg.name, plate, consultaUrl: cfg.consultaUrl, lang: body.lang === "en" ? "en" : "es" });
  const ok = await sendResend(env, { from: cfg.from, to: [to], ...configured(cfg.replyTo) ? { reply_to: cfg.replyTo } : {}, subject: mail.subject, text: mail.text, html: mail.html });
  return ok ? json({ ok: true }) : json({ ok: false, error: "generic" }, 502);
}
__name(notify, "notify");
var worker_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    try {
      if (req.method !== "POST") return json({ ok: false, error: "not_found" }, 404);
      if (url.pathname === "/api/contact" || url.pathname === "/api/notify") {
        if (!sameOrigin(req, env)) return json({ ok: false, error: "forbidden" }, 403);
        return url.pathname === "/api/contact" ? await contact(req, env) : await notify(req, env);
      }
      return json({ ok: false, error: "not_found" }, 404);
    } catch {
      return json({ ok: false, error: "server" }, 500);
    }
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-n1Da8p/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-n1Da8p/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
