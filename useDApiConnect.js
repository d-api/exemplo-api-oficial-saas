/**
 * useDApiConnect — hook React para o connect hospedado da D-API, feito "na mão"
 * (sem o pacote `d-api-sdk`). É o mesmo handshake do `index.html`, só que em
 * React. Use isto como referência se você mantém a sua própria implementação.
 *
 * O PONTO QUE MAIS DÁ PROBLEMA: quando o onboarding falha, a página hospedada
 * manda `{ type, ok: false, error, errorLabel }` — SEM `data`. Quem lê
 * `event.data.data.connectionId` nesse caso vê `undefined` e costuma lançar um
 * erro genérico do tipo "não veio o identificador da conexão", jogando fora o
 * motivo real (`error` / `errorLabel`), que é a única informação útil ali.
 *
 * Trate o `ok` ANTES de olhar para o `data`.
 */

import { useCallback, useRef } from "react";

const CONNECT_ORIGIN_DEFAULT = "https://connect.d-api.cloud";
// Sandbox: https://connect-c2.d-api.cloud

export function useDApiConnect({ publishableKey, connectBaseUrl }) {
  const connectOrigin = (connectBaseUrl || CONNECT_ORIGIN_DEFAULT).replace(/\/$/, "");
  const runningRef = useRef(false);

  const start = useCallback(
    (options = {}) => {
      if (runningRef.current) return Promise.reject(new Error("Conexão já em andamento."));

      // window.open PRECISA sair de um gesto do usuário (o clique). Não coloque
      // um await antes desta linha, ou o browser bloqueia o popup.
      const popup = window.open(
        `${connectOrigin}/connect`,
        "dapi-connect",
        "width=600,height=760"
      );
      if (!popup) return Promise.reject(new Error("Popup bloqueado — permita popups."));

      runningRef.current = true;

      return new Promise((resolve, reject) => {
        let settled = false;

        const finish = (fn) => {
          if (settled) return;
          settled = true;
          runningRef.current = false;
          window.removeEventListener("message", handleMessage);
          clearInterval(poll);
          try {
            popup.close();
          } catch {
            /* ignore */
          }
          fn();
        };

        function handleMessage(event) {
          // Só confie na página hospedada da D-API. `event.origin` é verificado
          // pelo browser — nunca use um campo do payload para isso.
          if (event.origin !== connectOrigin || event.source !== popup) return;

          const msg = event.data || {};

          if (msg.type === "dapi-connect-ready") {
            popup.postMessage(
              {
                type: "dapi-connect-init",
                pk: publishableKey,
                mode: options.mode || "standard", // "standard" | "coexistence"
                webhookUrl: options.webhookUrl,
                webhookMode: options.webhookMode, // "normalized" (padrão) | "meta_passthrough"
              },
              connectOrigin
            );
            return;
          }

          if (msg.type !== "dapi-connect-result") return;

          // ---- 1º: o resultado deu certo? ----
          if (!msg.ok) {
            // `errorLabel` é a explicação em português; `error` é o código
            // estável (trial_required, number_in_use, invalid_key, …). Mostre a
            // label ao usuário e registre o código no seu log/suporte.
            const err = new Error(msg.errorLabel || msg.error || "Onboarding falhou");
            err.code = msg.error || "onboarding_failed";
            return finish(() => reject(err));
          }

          // ---- 2º: só agora leia o data ----
          const data = msg.data || {};
          if (!data.connectionId) {
            return finish(() =>
              reject(new Error("Resposta sem connectionId — reporte ao suporte da D-API."))
            );
          }

          // data: { connectionId, phoneNumber, status,
          //         accessToken, accessTokenKind, accessTokenLabel, accessTokenExpiresAt }
          //
          // ⚠️ accessToken é SEGREDO (envia mensagem e administra a WABA):
          // mande para o SEU backend, não logue e não salve no navegador.
          finish(() => resolve(data));
        }

        const poll = setInterval(() => {
          if (popup.closed && !settled) {
            finish(() => reject(new Error("Conexão cancelada (popup fechado).")));
          }
        }, 500);

        window.addEventListener("message", handleMessage);
      });
    },
    [connectOrigin, publishableKey]
  );

  return { start };
}
