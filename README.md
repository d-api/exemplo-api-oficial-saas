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

## Exemplos neste repo

| Arquivo | O que mostra |
|---|---|
| **`index.html`** | O fluxo "na mão" (popup + `postMessage`), em HTML puro — didático. |
| **`sdk.html`** | O mesmo, mas com o pacote **`d-api-sdk`** — o fluxo inteiro vira uma chamada `connect.start()`. |
| **`useDApiConnect.js`** | O mesmo handshake como hook React, para quem mantém a própria implementação. |

Os dois HTML rodam servindo a pasta por HTTP (ex.: `python3 -m http.server 8000`).

## Tratando erros (leia se você fez a sua própria implementação)

Quando o onboarding **falha**, a página hospedada manda:

```js
{ type: "dapi-connect-result", ok: false, error: "trial_required", errorLabel: "A conta D-API do parceiro precisa de uma assinatura ativa para criar conexões." }
```

Repare: **não vem `data`**. O erro clássico é ler `event.data.data.connectionId`
direto, ver `undefined` e lançar um "não veio o identificador da conexão" — isso
descarta o `error`/`errorLabel`, que é justamente o motivo da falha. Cheque o `ok`
primeiro:

```js
if (!msg.ok) {
  // errorLabel: texto em português para o usuário
  // error: código estável para o seu log (trial_required, number_in_use, invalid_key, …)
  throw Object.assign(new Error(msg.errorLabel || msg.error), { code: msg.error });
}
const { connectionId } = msg.data;
```

Códigos possíveis em `error`:

| Código | Significa |
|---|---|
| `trial_required` | A conta D-API **do parceiro** não tem assinatura ativa. |
| `number_in_use` | O número já está conectado em outra conta. |
| `invalid_key` | Publishable key inválida, expirada ou revogada. |
| `plan_not_ready` / `billing_not_ready` | Cobrança do parceiro não configurada. |
| `missing_code` / `access_denied` / `user_denied` | A Meta não devolveu o código — normalmente o usuário cancelou o diálogo. A janela volta para a página do connect (que fecha sozinha pelo SDK), nunca para uma tela da D-API. |
| `config_error` | Configuração do app Meta no servidor — falar com o suporte da D-API. |
| `onboarding_failed` | A Meta não concluiu o cadastro do número. |

O mesmo motivo também aparece **escrito na janela do connect**, com o código
embaixo — então um print da janela já basta para o suporte.

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

### No mobile, o resultado só chega por webhook

A conexão é anunciada **duas vezes**, sem nada para configurar: o `start()`
resolve no navegador e um webhook `session.created` vai para o `webhookUrl`
daquela conexão, com todos os dados (inclusive o access token e o seu
`metadata`).

O segundo existe por causa do celular: lá a "popup" abre como **aba**, sem
`window.opener` utilizável, então o `postMessage` de volta nunca acontece. Na
prática o `start()` pode rejeitar com "Conexão cancelada (popup fechado)"
**mesmo com a conexão criada** — em webview de app nativo vale o mesmo.

⚠️ Em fluxo mobile, não trate essa rejeição como falha: confirme pelo
`session.created` (ou pela rota de listagem de conexões) antes de mostrar erro
para o seu cliente.

### Ligar a conexão ao seu cliente (`metadata`)

`metadata` é um JSON livre seu, guardado com a conexão e devolvido intacto em
`data.metadata` do `session.created`. É o que permite achar o tenant certo sem
depender do retorno síncrono:

```js
await connect.start({
  webhookUrl: "https://seu-saas.com/hooks/dapi",
  metadata: { tenantId: "acme-42" },
});
```

O evento chega assim:

```json
{
  "event": "session.created",
  "sessionId": "cloud-9f2c1e5a-…",
  "timestamp": "2026-08-02T12:00:00.000Z",
  "data": {
    "connectionId": "9f2c1e5a-…",
    "connectionType": "cloud_api",
    "status": "connected",
    "wabaId": "123456789",
    "phoneNumberId": "987654321",
    "phoneNumber": "+5511999999999",
    "verifiedName": "Acme Ltda",
    "accessToken": "EAAG…",
    "accessTokenKind": "long_lived",
    "accessTokenExpiresAt": "2026-10-01T00:00:00.000Z",
    "webhookMode": "normalized",
    "metadata": { "tenantId": "acme-42" }
  }
}
```

Limite: **512 bytes** de JSON serializado — o valor viaja na URL do diálogo da
Meta, e acima disso o `start()` lança antes de abrir a janela. Guarde
identificadores ali, não objetos de negócio inteiros.

Como o payload carrega o access token, o evento só é entregue no `webhookUrl`
**da própria conexão** e apenas por **HTTPS**; um endpoint `http://` é recusado.

`metadata` é opcional e novo na versão **1.3.0** do `d-api-sdk` — quem está na
1.2.0 ou anterior continua funcionando igual, e recebe `metadata: {}` no evento.

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
