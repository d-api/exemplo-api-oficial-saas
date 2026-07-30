# Exemplo — Conectar WhatsApp API Oficial (D-API)

Exemplo mínimo, em **HTML puro** (sem framework, sem build), de como um SaaS conecta
o número oficial do WhatsApp (Cloud API) de um cliente usando a **D-API como provedor**.

É um único arquivo (`index.html`), com a lógica inline e comentada.

## Como funciona (modelo hospedado)

O Embedded Signup da Meta **não roda no seu domínio** — a Meta exige que o domínio
esteja cadastrado no app dela, e não dá pra cadastrar o domínio de todo parceiro. Por
isso o fluxo roda numa **página hospedada pela D-API** (`https://connect.d-api.cloud/connect`),
que você abre num **popup**. São 3 passos:

1. **Popup** — você abre `connect.d-api.cloud/connect` (`window.open`).
2. **Handshake** — a página avisa `dapi-connect-ready`; você responde com a sua
   **publishable key** (`postMessage`). A origem do seu site é verificada pelo browser.
3. **Resultado** — a D-API roda o Embedded Signup, provisiona a conexão e devolve
   `{ connectionId, phoneNumber, status, accessToken, accessTokenKind, accessTokenLabel,
   accessTokenExpiresAt }` por `postMessage`.

> O **seu domínio não precisa ser cadastrado na Meta** — quem é cadastrado é o
> domínio da D-API. Você só precisa de uma **publishable key**.

A publishable key é **pública de propósito**: ela só inicia o onboarding (não envia
mensagens nem lê dados) e é limitada por rate limit. A sua API key **secreta** nunca
vai para o navegador.

## Pré-requisitos

Uma **publishable key** (criada com a sua API key secreta, no seu backend):
```bash
curl -X POST https://api.d-api.cloud/api/v1/connections/cloud-api/publishable-keys \
  -H "Authorization: <SUA_API_KEY_SECRETA>" \
  -H "content-type: application/json" \
  -d '{}'
```
A resposta traz o `key` (`pk_live_...`) **uma única vez** — copie.

## Como rodar

Sirva a pasta por HTTP (não `file://` — precisa de uma origem estável):

```bash
cd official-api-connect-example
python3 -m http.server 8000    # ou: npx serve -l 8000
```

Abra <http://localhost:8000>, cole a publishable key e clique em **Conectar**.
Para testar contra o **sandbox**, troque o campo "Base do connect hospedado" para
`https://connect-c2.d-api.cloud`.

## Dois exemplos neste repo

| Arquivo | O que mostra |
|---|---|
| **`index.html`** | O fluxo "na mão" (popup + `postMessage`), em HTML puro — didático. |
| **`sdk.html`** | O mesmo, mas com o pacote **`d-api-sdk`** — o fluxo inteiro vira uma chamada `connect.start()`. |

Ambos rodam servindo a pasta por HTTP (ex.: `python3 -m http.server 8000`).

### Com o SDK

```js
import { DApiConnect } from "d-api-sdk/connect";

const connect = new DApiConnect({ publishableKey: "pk_live_…" });
const { connectionId } = await connect.start({ webhookUrl: "https://seu-saas.com/hooks/dapi" });
```

Em produção você instala o pacote (`npm i d-api-sdk`). O `sdk.html` importa direto
por ESM (esm.sh) só para rodar sem build. Ele requer **`d-api-sdk@1.1.0`** (a versão
que adiciona o entry `connect`) — os **tipos** de `webhookMode` e do `accessToken` no
resultado chegam na `1.2.0`; em runtime o `1.1.0` já repassa os dois.

### Formato do webhook (`webhookMode`)

Os eventos da conexão chegam, por padrão, no **formato canônico da D-API**
(`normalized`) — o mesmo de uma conexão não-oficial, então um único handler serve
as duas. Se você já tem um parser do payload cru da Meta, peça `meta_passthrough`:

```js
await connect.start({
  webhookUrl: "https://seu-saas.com/hooks/dapi",
  webhookMode: "meta_passthrough", // padrão: "normalized"
});
```

Dá pra trocar depois em `PATCH /api/v1/connections/cloud-api/:id` (`webhookMode`).

### Access token da Meta

O resultado traz o **access token da Meta** dessa conexão, já descriptografado:

```js
const { connectionId, accessToken, accessTokenKind, accessTokenExpiresAt } = await connect.start({...});
// accessTokenKind: "permanent" | "long_lived" | "short_lived" | "unknown"
```

No Embedded Signup a Meta emite um **token permanente** (`permanent`,
`accessTokenExpiresAt: null`) — é o caso normal aqui.

> ⚠️ O `accessToken` é **segredo**: com ele dá pra enviar mensagens e administrar a
> WABA. Mande direto para o **seu backend**; não logue, não salve no `localStorage`.
> Se preferir não trafegar pelo navegador, ignore o campo e busque quando precisar em
> `GET /api/v1/connections/cloud-api/:id/access-token` (com a sua API key secreta).

### Coexistência

Para manter o app WhatsApp Business no mesmo número, marque a caixa
**"Coexistência"** nos exemplos (ou passe `mode: "coexistence"` no `connect.start()`).
Nesse modo o cliente escaneia um QR para vincular o app; você recebe o `connectionId`
do mesmo jeito.

> Nota: nenhuma configuração da Meta (App ID / config_id) fica no seu código — isso
> tudo vive na página hospedada da D-API.
