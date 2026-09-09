// Cloudflare Worker: вебхук оплаты + проверка статуса
// Развернуть: Cloudflare Dashboard -> Workers & Pages -> Create -> Worker -> вставить этот код.
//
// Как работает:
// 1) Платёжка шлёт POST на /webhook с заголовком X-Signature (или x-prodamus-signature)
//    и данными оплаты. Worker проверяет секретный ключ, помечает заказ "оплачен".
// 2) Страница (GitHub Pages, статика) после "Оплатить" обращается на GET /check?order=<id>
//    Worker отвечает {paid:true/false} — если true, страница открывает результат.
//
// Настройка:
// - Секретный ключ задайте в переменных окружения Worker (Secret): PAY_PROVIDER_SECRET
//   ВАЖНО: храните как Secret (не как обычную переменную), чтобы он не попадал в код.
// - PAY_PROVIDER = "prodamus" | "yukassa" — какой формат вебхука разбираем.
//
// Хранилище статусов сделано глобальным (in-memory per-isolate). Для надёжности
// между запросами используйте KV (см. комментарий внизу). Для старта хватит in-memory.

const PAY_PROVIDER_SECRET = env => env.PAY_PROVIDER_SECRET || "";
const PAY_PROVIDER = env => env.PAY_PROVIDER || "";

// Простейший in-memory статус заказов { [orderId]: true }
const status = (() => { const m = new Map(); return { set, get, has } })();
function set(k){ m.set(k, true); }
function get(k){ return m.get(k) === true; }
function has(){ return true; }

function verifySignature(provider, secret, headers, bodyText) {
  if (!secret) return false;
  const sigHeader = provider === "yukassa"
    ? headers.get("x-yookassa-signature")
    : headers.get("x-prodamus-signature") || headers.get("x-signature");
  if (!sigHeader) return false;
  // Для старта: ожидаем, что платёжка шлёт сам подписанный ключ/значение.
  // Точный алгоритм (HMAC/подпись) различается у провайдеров — подставим после выбора.
  // Здесь упрощённо: если заголовок совпадает с секретом — считаем валидным.
  return sigHeader === secret;
}

function parseWebhook(provider, body) {
  // В зависимости от провайдера поле с ID заказа и статусом различается.
  // Заготовка: ищем "order" / "payment" / "id" и "paid"/"status".
  const b = body || {};
  const raw = JSON.stringify(body);
  let ok = false;
  if (provider === "yukassa") {
    ok = (b.captured && b.amount) ? true : (b.status === "succeeded");
  } else {
    // prodamus / generic: ищем статус платежа
    ok = /succeeded|paid|success/i.test(raw);
  }
  const orderId = b.orderId || b.order_id || b.id || b.payment_id || b.metadata?.["order"] || "";
  return { ok, orderId: String(orderId) };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const provider = PAY_PROVIDER(env);
    const secret = PAY_PROVIDER_SECRET(env);

    // GET /check?order=<id> — страница спрашивает статус
    if (request.method === "GET" && url.pathname === "/check") {
      const order = url.searchParams.get("order") || "";
      const paid = status.get(order);
      return new Response(JSON.stringify({ paid, order }), {
        headers: { "content-type": "application/json" },
      });
    }

    // POST /webhook — платёжка уведомляет об оплате
    if (request.method === "POST" && url.pathname === "/webhook") {
      const bodyText = await request.text();
      let body;
      try { body = JSON.parse(bodyText); } catch (_) { body = {}; }

      if (!verifySignature(provider, secret, request.headers, bodyText)) {
        return new Response(JSON.stringify({ ok: false, error: "bad signature" }), {
          status: 401, headers: { "content-type": "application/json" },
        });
      }

      const info = parseWebhook(provider, body);
      if (info.ok && info.orderId) {
        status.set(info.orderId);
        return new Response(JSON.stringify({ ok: true, order: info.orderId }), {
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: false, error: "not paid / no order" }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }

    return new Response("ok", { status: 200 });
  },
};

/*
 Надёжное хранение статуса между запросами (рекомендуется для продакшена):
 1. Создайте KV namespace (Workers -> KV -> Create).
 2. Привяжите его к Worker (Settings -> Bindings -> KV namespace, имя ENV_CACHE).
 3. Замените in-memory на KV:
    - await env.ENV_CACHE.put("paidd_" + orderId, "1");
    - const v = await env.ENV_CACHE.get("paidd_" + orderId); paid = v === "1";
*/
